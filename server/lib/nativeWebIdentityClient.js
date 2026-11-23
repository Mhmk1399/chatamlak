import { randomUUID } from "node:crypto";

const MAX_RESPONSE_BYTES = 32 * 1024;
const SUBJECT = /^[0-9a-f]{24}$/;
const STATE = /^[A-Za-z0-9_-]{32,128}$/;
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const SCOPES = new Set(["chat:access", "chat:call", "chat:staff", "chat:admin"]);

export class NativeWebAuthError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = "NativeWebAuthError";
    this.code = code;
    this.status = status;
  }
}

const fail = (code, message, status) => {
  throw new NativeWebAuthError(code, message, status);
};

function configuredUrl(value, name, allowHttp) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { fail("WEB_IDENTITY_NOT_CONFIGURED", `${name} is not configured.`, 503); }
  if (
    url.username || url.password || url.hash ||
    !["https:", ...(allowHttp ? ["http:"] : [])].includes(url.protocol)
  ) fail("WEB_IDENTITY_NOT_CONFIGURED", `${name} is not configured securely.`, 503);
  return url.toString();
}

function text(value, code, max = 2048) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) fail(code, "The Web identity response is invalid.", 502);
  return result;
}

function timestamp(value, code) {
  const result = text(value, code, 64);
  if (!Number.isFinite(Date.parse(result))) fail(code, "The Web identity response is invalid.", 502);
  return result;
}

async function boundedBody(response) {
  const declared = Number(response?.headers?.get?.("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) fail("WEB_IDENTITY_RESPONSE_INVALID", "The Web identity response is too large.", 502);
  let raw;
  try { raw = await response.text(); } catch { fail("WEB_IDENTITY_UNAVAILABLE", "The Web identity service is unavailable.", 503); }
  if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
    fail("WEB_IDENTITY_RESPONSE_INVALID", "The Web identity response is too large.", 502);
  }
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    fail("WEB_IDENTITY_RESPONSE_INVALID", "The Web identity response is invalid.", 502);
  }
}

function upstreamError(body, status) {
  const code = typeof body?.error?.code === "string"
    ? body.error.code.slice(0, 100)
    : "WEB_IDENTITY_UNAVAILABLE";
  const definitive = new Set([
    "IDENTITY_NOT_FOUND", "TOKEN_REVOKED", "ACCOUNT_DISABLED",
    "WORKER_DISABLED", "AGENCY_INACTIVE", "CONSULTANT_INACTIVE",
    "CHAT_ACCESS_FORBIDDEN", "ACTOR_AUTHORIZATION_INVALID",
    "CHAT_AUTHORIZATION_CODE_INVALID", "CHAT_AUTHORIZATION_CODE_REPLAYED",
    "CHAT_AUTHORIZATION_CODE_EXPIRED", "CHAT_AUTHORIZATION_STATE_MISMATCH",
    "CHAT_PKCE_VERIFICATION_FAILED", "CHAT_REDIRECT_MISMATCH",
  ]);
  const safeStatus = definitive.has(code)
    ? Math.max(400, Math.min(499, Number(status) || 401))
    : Number(status) === 429 ? 503 : 503;
  fail(code, definitive.has(code)
    ? "Web authorization was denied or expired."
    : "The Web identity service is unavailable.", safeStatus);
}

function parseAuthorization(body, expectedSubject = null) {
  if (body.version !== 1 || body.accountStatus !== "active") {
    fail("WEB_IDENTITY_RESPONSE_INVALID", "The Web identity response is invalid.", 502);
  }
  const subject = text(body.subject, "WEB_IDENTITY_RESPONSE_INVALID", 64);
  if (!SUBJECT.test(subject) || (expectedSubject && subject !== expectedSubject)) {
    fail("WEB_IDENTITY_RESPONSE_INVALID", "The Web identity subject does not match.", 502);
  }
  if (
    !Array.isArray(body.scopes) || body.scopes.length < 1 || body.scopes.length > 4 ||
    body.scopes.some((scope) => typeof scope !== "string" || !SCOPES.has(scope)) ||
    !body.scopes.includes("chat:access")
  ) fail("WEB_IDENTITY_RESPONSE_INVALID", "The Web identity scopes are invalid.", 502);
  const cacheSeconds = Number(body.authorizationCacheMaxAgeSeconds);
  if (!Number.isInteger(cacheSeconds) || cacheSeconds < 0 || cacheSeconds > 60) {
    fail("WEB_IDENTITY_RESPONSE_INVALID", "The Web identity cache policy is invalid.", 502);
  }
  const authorizationEstablishedAt = timestamp(body.authorizationEstablishedAt, "WEB_IDENTITY_RESPONSE_INVALID");
  const sessionExpiresAt = timestamp(body.sessionExpiresAt, "WEB_IDENTITY_RESPONSE_INVALID");
  if (Date.parse(sessionExpiresAt) <= Date.now() - 60_000) {
    fail("WEB_IDENTITY_SESSION_EXPIRED", "The Web authorization has expired.", 401);
  }
  const crmActorAuthorization = body.crmActorAuthorization == null
    ? null
    : text(body.crmActorAuthorization, "WEB_IDENTITY_RESPONSE_INVALID", 8_192);
  return {
    subject,
    accountStatus: "active",
    scopes: [...new Set(body.scopes)],
    authorizationEstablishedAt,
    sessionExpiresAt,
    authorizationCheckedAt: body.authorizationCheckedAt
      ? timestamp(body.authorizationCheckedAt, "WEB_IDENTITY_RESPONSE_INVALID")
      : authorizationEstablishedAt,
    authorizationCacheMaxAgeSeconds: cacheSeconds,
    crmActorAuthorization,
  };
}

export function createNativeWebIdentityClient({
  exchangeUrl,
  statusUrl,
  serviceToken,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 4_000,
  allowHttp = false,
  requestIdFactory = randomUUID,
} = {}) {
  const exchangeEndpoint = configuredUrl(exchangeUrl, "OWJ_CHAT_NATIVE_WEB_EXCHANGE_URL", allowHttp);
  const statusEndpoint = configuredUrl(statusUrl, "OWJ_CHAT_NATIVE_WEB_STATUS_URL", allowHttp);
  const credential = typeof serviceToken === "string" ? serviceToken.trim() : "";
  if (credential.length < 32 || typeof fetchImpl !== "function") {
    fail("WEB_IDENTITY_NOT_CONFIGURED", "The Web identity service is not configured.", 503);
  }

  async function post(url, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(250, Number(requestTimeoutMs) || 4_000));
    timeout.unref?.();
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${credential}`,
          "content-type": "application/json",
          "x-owj-service": "owj-chat-native",
          "x-request-id": requestIdFactory(),
        },
        body: JSON.stringify(body),
      });
    } catch {
      fail("WEB_IDENTITY_UNAVAILABLE", "The Web identity service is unavailable.", 503);
    } finally {
      clearTimeout(timeout);
    }
    const responseBody = await boundedBody(response);
    if (!response.ok) upstreamError(responseBody, response.status);
    return responseBody;
  }

  async function exchange({ code, redirectUri, codeVerifier, state } = {}) {
    if (
      typeof code !== "string" || !code.trim() || code.length > 512 ||
      typeof redirectUri !== "string" || !redirectUri || redirectUri.length > 2048 ||
      !PKCE_VERIFIER.test(String(codeVerifier || "")) || !STATE.test(String(state || ""))
    ) fail("CHAT_AUTHORIZATION_REQUEST_INVALID", "The authorization callback is invalid.", 400);
    return parseAuthorization(await post(exchangeEndpoint, {
      version: 1,
      code: code.trim(),
      redirectUri,
      codeVerifier,
      state,
    }));
  }

  async function status({ subject, authorizationEstablishedAt, crmActorAuthorization = null } = {}) {
    if (!SUBJECT.test(String(subject || "")) || !Number.isFinite(Date.parse(String(authorizationEstablishedAt || "")))) {
      fail("IDENTITY_REFERENCE_INVALID", "The Web identity reference is invalid.", 400);
    }
    return parseAuthorization(await post(statusEndpoint, {
      version: 1,
      subject,
      authorizationEstablishedAt,
      ...(crmActorAuthorization ? { crmActorAuthorization } : {}),
    }), subject);
  }

  return { exchange, status };
}
