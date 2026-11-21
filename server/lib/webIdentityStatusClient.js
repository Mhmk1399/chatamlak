import { randomUUID } from "node:crypto";
import { PlatformIdentityError } from "./platformIdentityAdapter.js";

const MAX_CACHE_TTL_MS = 60_000;

function fail(code, message, status = 503) {
  throw new PlatformIdentityError(code, message, status);
}

function boundedString(value, code, max = 200) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) fail(code, "The Web identity status request is invalid.", 400);
  return result;
}

function parseResponse(raw, expectedWebUserId) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    fail("IDENTITY_STATUS_RESPONSE_INVALID", "The Web identity status response is invalid.");
  }
  if (
    body?.version !== 1 ||
    body?.subject?.webUserId !== expectedWebUserId ||
    !["active", "disabled", "revoked", "deleted"].includes(body?.subject?.status) ||
    typeof body?.authorized !== "boolean"
  ) {
    fail("IDENTITY_STATUS_RESPONSE_INVALID", "The Web identity status response is invalid.");
  }
  return body;
}

/**
 * Current-state client for the Web-owned identity authority. Fresh results are
 * cached for at most 60 seconds; absence, malformed responses, and upstream
 * failures deny new registered-user support operations.
 */
export function createWebIdentityStatusClient({
  endpoint,
  serviceCredential,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  cacheTtlMs = MAX_CACHE_TTL_MS,
  requestTimeoutMs = 3_000,
  maxCacheEntries = 5_000,
  requestIdFactory = randomUUID,
  onIdentityRevoked,
} = {}) {
  const url = typeof endpoint === "string" ? endpoint.trim() : "";
  const credential = typeof serviceCredential === "string" ? serviceCredential.trim() : "";
  const ttl = Math.min(Math.max(Number(cacheTtlMs) || 0, 0), MAX_CACHE_TTL_MS);
  const maximumEntries = Math.min(Math.max(Number(maxCacheEntries) || 1, 1), 20_000);
  const cache = new Map();

  function cacheKey(webUserId, operation) {
    return `${webUserId}\u0000${operation}`;
  }

  function put(key, value) {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maximumEntries) cache.delete(cache.keys().next().value);
  }

  async function authorize({ kind = "registered", webUserId, operation } = {}) {
    if (kind !== "registered") {
      fail("IDENTITY_STATUS_SUBJECT_INVALID", "Only a registered Web identity can be checked.", 400);
    }
    const subject = boundedString(webUserId, "IDENTITY_STATUS_SUBJECT_INVALID");
    const requestedOperation = boundedString(operation, "IDENTITY_STATUS_OPERATION_INVALID", 128);
    const key = cacheKey(subject, requestedOperation);
    const currentTime = Number(now());
    const cached = cache.get(key);
    if (cached && cached.expiresAt > currentTime) {
      cache.delete(key);
      cache.set(key, cached);
      if (!cached.authorized || cached.status !== "active") {
        fail("IDENTITY_SUBJECT_DISABLED", "The Web identity is not authorized.", 403);
      }
      return { ...cached, cached: true };
    }
    cache.delete(key);
    if (!url || !credential || typeof fetchImpl !== "function") {
      fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(100, Number(requestTimeoutMs) || 3_000));
    timeout.unref?.();
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${credential}`,
          "content-type": "application/json",
          "x-owj-service": "ouj-chat",
          "x-request-id": requestIdFactory(),
        },
        body: JSON.stringify({
          version: 1,
          subject: { provider: "owj-web", webUserId: subject },
          operation: requestedOperation,
        }),
      });
    } catch {
      fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
    } finally {
      clearTimeout(timeout);
    }
    if (!response?.ok) {
      fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
    }
    let raw;
    try {
      raw = await response.text();
    } catch {
      fail("IDENTITY_STATUS_UNAVAILABLE", "The Web identity status service is unavailable.");
    }
    if (Buffer.byteLength(raw, "utf8") > 32 * 1024) {
      fail("IDENTITY_STATUS_RESPONSE_INVALID", "The Web identity status response is invalid.");
    }
    const body = parseResponse(raw, subject);
    const result = {
      webUserId: subject,
      operation: requestedOperation,
      authorized: body.authorized,
      status: body.subject.status,
      revision: body.revision ?? null,
      checkedAt: currentTime,
      expiresAt: currentTime + ttl,
      cached: false,
    };
    put(key, result);
    if (!result.authorized || result.status !== "active") {
      if (typeof onIdentityRevoked === "function") {
        try {
          await onIdentityRevoked({
            webUserId: subject,
            status: result.status,
            revision: result.revision,
          });
        } catch {
          // Authorization remains denied even if local session cleanup must be
          // retried by the caller's reconciliation path.
        }
      }
      fail("IDENTITY_SUBJECT_DISABLED", "The Web identity is not authorized.", 403);
    }
    return result;
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
    inspect: () => ({ cacheSize: cache.size, cacheTtlMs: ttl, maxCacheEntries: maximumEntries }),
  };
}
