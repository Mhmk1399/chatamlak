import {
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import { PlatformIdentityError } from "./platformIdentityAdapter.js";

const MAX_TOKEN_BYTES = 16 * 1024;
const MAX_JWKS_BYTES = 128 * 1024;
const MAX_SCOPES = 16;
const MAX_AUDIENCES = 4;
const TOKEN_USE_POLICIES = Object.freeze({
  support_registered: Object.freeze({
    kind: "registered",
    maxLifetimeSeconds: 5 * 60,
    requiredScopes: Object.freeze(["support:conversation:create"]),
    allowedScopes: Object.freeze(["support:conversation:create"]),
  }),
  support_guest: Object.freeze({
    kind: "guest",
    maxLifetimeSeconds: 10 * 60,
    requiredScopes: Object.freeze(["support:conversation:create"]),
    allowedScopes: Object.freeze(["support:conversation:create"]),
  }),
  support_agent: Object.freeze({
    kind: "agent",
    maxLifetimeSeconds: 5 * 60,
    requiredScopes: Object.freeze(["support:agent"]),
    allowedScopes: Object.freeze([
      "support:agent",
      "support:conversation:create",
    ]),
  }),
});

function fail(code, message, status = 401) {
  throw new PlatformIdentityError(code, message, status);
}

function requiredString(value, code, max = 200) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) {
    fail(code, "The Web identity assertion is invalid.");
  }
  return result;
}

function decodeJson(segment) {
  if (typeof segment !== "string" || !segment || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    fail("IDENTITY_CREDENTIAL_INVALID", "The Web identity assertion is invalid.");
  }
  let parsed;
  try {
    const raw = Buffer.from(segment, "base64url");
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("IDENTITY_CREDENTIAL_INVALID", "The Web identity assertion is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("IDENTITY_CREDENTIAL_INVALID", "The Web identity assertion is invalid.");
  }
  return parsed;
}

function stringList(value, code, maxItems) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\s+/)
      : [];
  if (source.length > maxItems) {
    fail(code, "The Web identity assertion contains too many values.");
  }
  const result = [];
  for (const item of source) {
    if (typeof item !== "string") fail(code, "The Web identity assertion is invalid.");
    const normalized = item.trim();
    if (!normalized || normalized.length > 128) {
      fail(code, "The Web identity assertion is invalid.");
    }
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function numericDate(value, code) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000_000_000) {
    fail(code, "The Web identity assertion time is invalid.");
  }
  return value;
}

function parseMaxAge(value, fallbackMs, maximumMs) {
  const match = String(value || "").match(/(?:^|,)\s*max-age=(\d+)\b/i);
  const parsed = match ? Number(match[1]) * 1000 : fallbackMs;
  return Math.min(Math.max(parsed, 1_000), maximumMs);
}

function sameString(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateUrl(url, allowInsecureJwks) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity provider is not configured.", 503);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity provider is not configured.", 503);
  }
  if (parsed.protocol !== "https:" && !(allowInsecureJwks && parsed.protocol === "http:")) {
    fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity provider is not configured.", 503);
  }
  return parsed.toString();
}

/**
 * Verify one-time Web bootstrap assertions using only configured RS256 JWKS.
 * The consumeJti hook must persist a unique issuer+jti claim before success;
 * an in-memory replay set is deliberately not used because restarts must not
 * reopen the bootstrap credential.
 */
export function createWebIdentityVerifier({
  expectedIssuer,
  expectedAudience = "owj-chat",
  jwksUrl,
  fetchImpl = globalThis.fetch,
  consumeJti,
  now = Date.now,
  clockToleranceSeconds = 5,
  requestTimeoutMs = 3_000,
  cacheTtlMs = 5 * 60_000,
  maximumCacheTtlMs = 15 * 60_000,
  minimumRefreshIntervalMs = 1_000,
  maxJwksKeys = 8,
  allowInsecureJwks = false,
} = {}) {
  const issuer = typeof expectedIssuer === "string" ? expectedIssuer.trim() : "";
  const audience = typeof expectedAudience === "string" ? expectedAudience.trim() : "";
  const endpoint = validateUrl(jwksUrl, allowInsecureJwks);
  const keyCache = new Map();
  let lastRefreshAt = Number.NEGATIVE_INFINITY;
  let refreshPromise = null;

  if (!issuer || !audience || typeof fetchImpl !== "function") {
    fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity provider is not configured.", 503);
  }

  async function readJwksResponse(response) {
    if (!response?.ok) {
      fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity keys are unavailable.", 503);
    }
    let raw;
    try {
      raw = await response.text();
    } catch {
      fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity keys are unavailable.", 503);
    }
    if (Buffer.byteLength(raw, "utf8") > MAX_JWKS_BYTES) {
      fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity key set is too large.", 503);
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity key set is invalid.", 503);
    }
    if (!Array.isArray(body?.keys) || body.keys.length < 1 || body.keys.length > maxJwksKeys) {
      fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity key set is invalid.", 503);
    }
    return body.keys;
  }

  async function refreshKeys() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(100, requestTimeoutMs));
      timeout.unref?.();
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "GET",
          redirect: "error",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
      } catch {
        fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity keys are unavailable.", 503);
      } finally {
        clearTimeout(timeout);
      }
      const keys = await readJwksResponse(response);
      const expiresAt = Number(now()) + parseMaxAge(
        response.headers?.get?.("cache-control"),
        cacheTtlMs,
        maximumCacheTtlMs,
      );
      const next = new Map();
      for (const jwk of keys) {
        if (
          !jwk ||
          jwk.kty !== "RSA" ||
          (jwk.alg != null && jwk.alg !== "RS256") ||
          (jwk.use != null && jwk.use !== "sig")
        ) continue;
        const kid = requiredString(jwk.kid, "IDENTITY_KEY_INVALID", 128);
        if (next.has(kid)) {
          fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity key set is invalid.", 503);
        }
        try {
          next.set(kid, { key: createPublicKey({ key: jwk, format: "jwk" }), expiresAt });
        } catch {
          fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity key set is invalid.", 503);
        }
      }
      if (next.size < 1) {
        fail("IDENTITY_PROVIDER_UNAVAILABLE", "The Web identity key set has no signing key.", 503);
      }
      keyCache.clear();
      for (const [kid, entry] of next) keyCache.set(kid, entry);
      lastRefreshAt = Number(now());
    })();
    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function getKey(kid) {
    const currentTime = Number(now());
    const cached = keyCache.get(kid);
    if (cached && cached.expiresAt > currentTime) return cached.key;
    const cacheIsEmptyOrExpired = ![...keyCache.values()].some((entry) => entry.expiresAt > currentTime);
    if (cacheIsEmptyOrExpired || currentTime - lastRefreshAt >= minimumRefreshIntervalMs) {
      await refreshKeys();
    }
    const refreshed = keyCache.get(kid);
    if (!refreshed || refreshed.expiresAt <= Number(now())) {
      fail("IDENTITY_KEY_UNKNOWN", "The Web identity signing key is not trusted.");
    }
    return refreshed.key;
  }

  async function verify(credential, {
    requiredScopes = [],
    allowedScopes,
    allowedTokenUses = Object.keys(TOKEN_USE_POLICIES),
  } = {}) {
    if (
      typeof credential !== "string" ||
      !credential ||
      Buffer.byteLength(credential, "utf8") > MAX_TOKEN_BYTES
    ) {
      fail("IDENTITY_CREDENTIAL_INVALID", "The Web identity assertion is invalid.");
    }
    const segments = credential.split(".");
    if (segments.length !== 3 || segments.some((segment) => !segment)) {
      fail("IDENTITY_CREDENTIAL_INVALID", "The Web identity assertion is invalid.");
    }
    const header = decodeJson(segments[0]);
    const payload = decodeJson(segments[1]);
    if (header.alg !== "RS256") {
      fail("IDENTITY_ALGORITHM_INVALID", "Only RS256 Web identity assertions are accepted.");
    }
    if (header.crit != null || (header.typ != null && header.typ !== "JWT")) {
      fail("IDENTITY_CREDENTIAL_INVALID", "The Web identity assertion header is invalid.");
    }
    const kid = requiredString(header.kid, "IDENTITY_KEY_INVALID", 128);
    const key = await getKey(kid);
    let signature;
    try {
      signature = Buffer.from(segments[2], "base64url");
    } catch {
      fail("IDENTITY_SIGNATURE_INVALID", "The Web identity signature is invalid.");
    }
    if (
      signature.length < 1 ||
      !verifySignature(
        "RSA-SHA256",
        Buffer.from(`${segments[0]}.${segments[1]}`),
        key,
        signature,
      )
    ) {
      fail("IDENTITY_SIGNATURE_INVALID", "The Web identity signature is invalid.");
    }

    const tokenIssuer = requiredString(payload.iss, "IDENTITY_ISSUER_INVALID");
    if (!sameString(tokenIssuer, issuer)) {
      fail("IDENTITY_ISSUER_INVALID", "The identity issuer is not trusted for Owj Chat.", 403);
    }
    const subject = requiredString(payload.sub, "IDENTITY_SUBJECT_INVALID");
    const audiences = stringList(payload.aud, "IDENTITY_AUDIENCE_INVALID", MAX_AUDIENCES);
    if (!audiences.includes(audience)) {
      fail("IDENTITY_AUDIENCE_INVALID", "The identity assertion is not intended for Owj Chat.", 403);
    }
    const tokenUse = requiredString(payload.token_use, "IDENTITY_TOKEN_USE_INVALID", 64);
    const policy = TOKEN_USE_POLICIES[tokenUse];
    if (!policy || !Array.isArray(allowedTokenUses) || !allowedTokenUses.includes(tokenUse)) {
      fail("IDENTITY_TOKEN_USE_INVALID", "The identity assertion type is not accepted.", 403);
    }
    if (payload.ver != null && payload.ver !== 1) {
      fail(
        "IDENTITY_CLAIMS_VERSION_INVALID",
        "The Web identity assertion version is not supported.",
      );
    }
    const scopes = stringList(payload.scope, "IDENTITY_SCOPE_DENIED", MAX_SCOPES);
    const required = stringList(
      [...policy.requiredScopes, ...requiredScopes],
      "IDENTITY_SCOPE_DENIED",
      MAX_SCOPES,
    );
    if (required.some((scope) => !scopes.includes(scope))) {
      fail("IDENTITY_SCOPE_DENIED", "Required identity scope is missing.", 403);
    }
    const permitted = Array.isArray(allowedScopes)
      ? stringList(allowedScopes, "IDENTITY_SCOPE_EXCESSIVE", MAX_SCOPES)
      : [...policy.allowedScopes];
    if (scopes.some((scope) => !permitted.includes(scope))) {
      fail("IDENTITY_SCOPE_EXCESSIVE", "The identity assertion contains an excessive scope.", 403);
    }

    const issuedAtSeconds = numericDate(payload.iat, "IDENTITY_ISSUED_AT_INVALID");
    const expiresAtSeconds = numericDate(payload.exp, "IDENTITY_EXPIRY_INVALID");
    const nowSeconds = Math.floor(Number(now()) / 1000);
    const tolerance = Math.max(0, Math.min(Number(clockToleranceSeconds) || 0, 30));
    if (issuedAtSeconds > nowSeconds + tolerance) {
      fail("IDENTITY_NOT_YET_VALID", "The identity assertion is not yet valid.");
    }
    if (expiresAtSeconds <= nowSeconds - tolerance) {
      fail("IDENTITY_EXPIRED", "The identity assertion has expired.");
    }
    if (
      expiresAtSeconds <= issuedAtSeconds ||
      expiresAtSeconds - issuedAtSeconds > policy.maxLifetimeSeconds
    ) {
      fail("IDENTITY_LIFETIME_INVALID", "The identity assertion lifetime is invalid.");
    }
    const jti = requiredString(payload.jti, "IDENTITY_JTI_INVALID", 128);
    if (typeof consumeJti !== "function") {
      fail(
        "IDENTITY_REPLAY_STORE_UNAVAILABLE",
        "The identity replay-protection store is unavailable.",
        503,
      );
    }
    let consumed;
    try {
      consumed = await consumeJti({
        issuer: tokenIssuer,
        jti,
        subject,
        tokenUse,
        expiresAt: new Date(expiresAtSeconds * 1000),
      });
    } catch {
      fail(
        "IDENTITY_REPLAY_STORE_UNAVAILABLE",
        "The identity replay-protection store is unavailable.",
        503,
      );
    }
    if (consumed !== true) {
      fail("IDENTITY_ASSERTION_REPLAYED", "The identity assertion was already used.", 409);
    }

    return {
      issuer: tokenIssuer,
      subject,
      audience: audiences,
      scopes,
      issuedAt: issuedAtSeconds * 1000,
      expiresAt: expiresAtSeconds * 1000,
      jti,
      keyId: kid,
      tokenUse,
      kind: policy.kind,
      status: payload.account_status == null ? "active" : payload.account_status,
      claimsVersion: payload.ver == null ? 1 : payload.ver,
    };
  }

  return {
    verify,
    inspect() {
      return {
        cacheSize: keyCache.size,
        keyIds: [...keyCache.keys()],
        lastRefreshAt: Number.isFinite(lastRefreshAt) ? lastRefreshAt : null,
      };
    },
    clearKeyCache() {
      keyCache.clear();
      lastRefreshAt = Number.NEGATIVE_INFINITY;
    },
  };
}

export { TOKEN_USE_POLICIES };
