import { randomUUID } from "node:crypto";
import { PlatformIdentityError } from "./platformIdentityAdapter.js";

const MAX_CACHE_TTL_MS = 60_000;
const MAX_RESPONSE_BYTES = 32 * 1_024;
const JTI_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const DEFINITIVE_IDENTITY_ERRORS = new Map([
  ["IDENTITY_NOT_FOUND", "deleted"],
  ["TOKEN_REVOKED", "revoked"],
  ["ACCOUNT_DISABLED", "disabled"],
  ["WORKER_DISABLED", "disabled"],
  ["AGENCY_INACTIVE", "disabled"],
  ["CONSULTANT_INACTIVE", "disabled"],
]);

function fail(code, message, status = 503) {
  throw new PlatformIdentityError(code, message, status);
}

function boundedString(value, code, max = 200) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) {
    fail(code, "The Web identity status request is invalid.", 400);
  }
  return result;
}

function parseJson(raw, code) {
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    fail(code, "The Web identity status response is invalid.");
  }
}

function parseSuccess(raw, expectedWebUserId) {
  const body = parseJson(raw, "IDENTITY_STATUS_RESPONSE_INVALID");
  const cacheMaxAge = body.authorizationCacheMaxAgeSeconds;
  if (
    body.version !== 1 ||
    body.subject !== expectedWebUserId ||
    !["active", "disabled", "revoked", "deleted"].includes(body.status) ||
    typeof body.role !== "string" ||
    !body.role.trim() ||
    body.role.length > 100 ||
    !body.support ||
    typeof body.support !== "object" ||
    Array.isArray(body.support) ||
    typeof body.support.allowed !== "boolean" ||
    typeof body.support.staff !== "boolean" ||
    !Number.isInteger(cacheMaxAge) ||
    cacheMaxAge < 0 ||
    cacheMaxAge > 60 ||
    typeof body.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(body.checkedAt))
  ) {
    fail("IDENTITY_STATUS_RESPONSE_INVALID", "The Web identity status response is invalid.");
  }
  return body;
}

function parseErrorCode(raw) {
  try {
    const body = JSON.parse(raw);
    const code = body?.error?.code;
    return typeof code === "string" && code.length <= 100 ? code : null;
  } catch {
    return null;
  }
}

async function readBoundedResponse(response) {
  if (!response) {
    fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
  }
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    try {
      await response.body?.cancel?.();
    } catch {
      // Rejection is still mandatory even when the peer cannot be cancelled.
    }
    fail("IDENTITY_STATUS_RESPONSE_INVALID", "The Web identity status response is invalid.");
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let raw = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          fail("IDENTITY_STATUS_RESPONSE_INVALID", "The Web identity status response is invalid.");
        }
        raw += decoder.decode(value, { stream: true });
      }
      return raw + decoder.decode();
    } catch (error) {
      if (error instanceof PlatformIdentityError) throw error;
      fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
    }
  }
  if (typeof response.text !== "function") {
    fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
  }
  let raw;
  try {
    raw = await response.text();
  } catch {
    fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
    fail("IDENTITY_STATUS_RESPONSE_INVALID", "The Web identity status response is invalid.");
  }
  return raw;
}

/**
 * Current-state client for the Web-owned identity authority. The request uses
 * the verified assertion's iat/jti so Web can apply account-level token
 * revocation. Successful results are cached for the lower of Chat's local
 * ceiling and Web's advertised maximum, never longer than 60 seconds.
 */
export function createWebIdentityStatusClient({
  endpoint,
  serviceCredential,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  cacheTtlMs = MAX_CACHE_TTL_MS,
  requestTimeoutMs = 3_000,
  maxCacheEntries = 5_000,
  maxConcurrentRequests = 16,
  requestIdFactory = randomUUID,
  onIdentityRevoked,
} = {}) {
  const url = typeof endpoint === "string" ? endpoint.trim() : "";
  const credential = typeof serviceCredential === "string" ? serviceCredential.trim() : "";
  const ttl = Math.min(Math.max(Number(cacheTtlMs) || 0, 0), MAX_CACHE_TTL_MS);
  const maximumEntries = Math.min(Math.max(Number(maxCacheEntries) || 1, 1), 20_000);
  const concurrencyLimit = Math.min(
    Math.max(Number(maxConcurrentRequests) || 1, 1),
    128,
  );
  const cache = new Map();
  const inFlight = new Map();
  let activeRequests = 0;

  function readClock() {
    const value = Number(now());
    if (!Number.isFinite(value)) {
      fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status clock is unavailable.");
    }
    return value;
  }

  function cacheKey(webUserId, operation, tokenIssuedAt, jti, requireStaff) {
    return [webUserId, operation, tokenIssuedAt, jti, requireStaff ? "staff" : "customer"].join("\u0000");
  }

  function put(key, value) {
    if (value.expiresAt <= value.checkedAt) return;
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maximumEntries) cache.delete(cache.keys().next().value);
  }

  async function notifyIdentityRevoked(details) {
    if (typeof onIdentityRevoked !== "function") return;
    try {
      await onIdentityRevoked(details);
    } catch {
      // Authorization remains denied. Session cleanup is safe to retry through
      // the normal authorization/reconciliation path.
    }
  }

  function enforce(result) {
    if (result.status !== "active") {
      fail("IDENTITY_SUBJECT_DISABLED", "The Web identity is not authorized.", 403);
    }
    if (!result.authorized) {
      fail("IDENTITY_SUPPORT_DENIED", "The Web identity is not authorized for support.", 403);
    }
    return result;
  }

  async function authorize({
    kind = "registered",
    webUserId,
    operation,
    tokenIssuedAt,
    jti,
    requireStaff = false,
    forceRefresh = false,
  } = {}) {
    if (!new Set(["registered", "agent"]).has(kind)) {
      fail("IDENTITY_STATUS_SUBJECT_INVALID", "Only a registered Web identity can be checked.", 400);
    }
    const subject = boundedString(webUserId, "IDENTITY_STATUS_SUBJECT_INVALID");
    const requestedOperation = boundedString(operation, "IDENTITY_STATUS_OPERATION_INVALID", 128);
    const assertionIssuedAt = Number(tokenIssuedAt);
    const assertionJti = typeof jti === "string" ? jti.trim() : "";
    const currentTime = readClock();
    const nowSeconds = Math.floor(currentTime / 1_000);
    if (
      !Number.isInteger(assertionIssuedAt) ||
      assertionIssuedAt < 1 ||
      assertionIssuedAt > nowSeconds + 60 ||
      !JTI_PATTERN.test(assertionJti)
    ) {
      fail(
        "IDENTITY_STATUS_REFERENCE_INVALID",
        "The Web identity assertion reference is invalid.",
        400,
      );
    }

    const staffRequired = requireStaff === true;
    const key = cacheKey(
      subject,
      requestedOperation,
      assertionIssuedAt,
      assertionJti,
      staffRequired,
    );
    const cached = cache.get(key);
    if (!forceRefresh && cached && cached.expiresAt > currentTime) {
      cache.delete(key);
      cache.set(key, cached);
      return enforce({ ...cached, cached: true });
    }
    cache.delete(key);

    if (!url || !credential || typeof fetchImpl !== "function") {
      fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
    }
    const pending = inFlight.get(key);
    if (pending) return pending;
    if (activeRequests >= concurrencyLimit) {
      fail("IDENTITY_STATUS_BUSY", "The Web identity status service is busy.");
    }

    activeRequests += 1;
    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(100, Number(requestTimeoutMs) || 3_000),
      );
      timeout.unref?.();
      let response;
      let raw;
      try {
        const correlationId = String(requestIdFactory?.() || randomUUID()).slice(0, 128);
        response = await fetchImpl(url, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${credential}`,
            "content-type": "application/json",
            "x-owj-service": "ouj-chat",
            "x-correlation-id": correlationId,
          },
          body: JSON.stringify({
            subject,
            tokenIssuedAt: assertionIssuedAt,
            jti: assertionJti,
          }),
        });
        raw = await readBoundedResponse(response);
      } catch (error) {
        if (error instanceof PlatformIdentityError) throw error;
        fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
      } finally {
        clearTimeout(timeout);
      }

      if (!response?.ok) {
        const upstreamCode = parseErrorCode(raw);
        const identityStatus = DEFINITIVE_IDENTITY_ERRORS.get(upstreamCode);
        if (identityStatus) {
          await notifyIdentityRevoked({
            webUserId: subject,
            status: identityStatus,
            upstreamCode,
            kind,
          });
          fail("IDENTITY_SUBJECT_DISABLED", "The Web identity is not authorized.", 403);
        }
        fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
      }

      const body = parseSuccess(raw, subject);
      const checkedAt = readClock();
      const authorized = body.status === "active" &&
        body.support.allowed &&
        (!staffRequired || body.support.staff);
      const effectiveTtl = Math.min(ttl, body.authorizationCacheMaxAgeSeconds * 1_000);
      const result = {
        webUserId: subject,
        operation: requestedOperation,
        tokenIssuedAt: assertionIssuedAt,
        jti: assertionJti,
        authorized,
        status: body.status,
        role: body.role,
        staff: body.support.staff,
        checkedAt,
        expiresAt: checkedAt + effectiveTtl,
        cached: false,
      };
      put(key, result);
      if (!authorized) {
        await notifyIdentityRevoked({
          webUserId: subject,
          status: body.status === "active"
            ? body.support.allowed ? "role_denied" : "support_denied"
            : body.status,
          role: body.role,
          kind,
        });
      }
      return enforce(result);
    })();
    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      activeRequests -= 1;
      if (inFlight.get(key) === request) inFlight.delete(key);
    }
  }

  function invalidate(webUserId) {
    const prefix = `${String(webUserId || "").trim()}\u0000`;
    let removed = 0;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  return {
    authorize,
    invalidate,
    clear: () => cache.clear(),
    inspect: () => ({
      cacheSize: cache.size,
      cacheTtlMs: ttl,
      maxCacheEntries: maximumEntries,
      activeRequests,
      inFlightRequests: inFlight.size,
      maxConcurrentRequests: concurrencyLimit,
    }),
  };
}
