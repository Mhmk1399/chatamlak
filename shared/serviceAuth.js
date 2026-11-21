import crypto from "node:crypto";

const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const lower = name.toLowerCase();
  const value = headers[lower] ?? headers[name] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function normalizeMethod(value) {
  const method = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3,12}$/.test(method)) throw new TypeError("A valid service request method is required.");
  return method;
}

function normalizePath(value) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.length > 1024 || /[\r\n]/.test(path)) {
    throw new TypeError("A valid service request path is required.");
  }
  return path;
}

function normalizeSecret(value) {
  const secret = String(value || "");
  if (Buffer.byteLength(secret) < 16 || Buffer.byteLength(secret) > 4096) {
    throw new TypeError("A service authentication secret of at least 16 bytes is required.");
  }
  return secret;
}

function signingInput({ method, path, timestamp, nonce }) {
  return ["ouj-service-auth-v1", timestamp, nonce, method, path].join("\n");
}

function signatureFor(values, secret) {
  return crypto.createHmac("sha256", secret).update(signingInput(values)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createServiceAuthHeaders({
  secret,
  method,
  path,
  timestampMs = Date.now(),
  nonce = crypto.randomBytes(18).toString("base64url"),
} = {}) {
  const normalizedSecret = normalizeSecret(secret);
  const normalizedMethod = normalizeMethod(method);
  const normalizedPath = normalizePath(path);
  const timestamp = String(Math.trunc(Number(timestampMs)));
  if (!/^\d{13}$/.test(timestamp)) throw new TypeError("A millisecond service timestamp is required.");
  const normalizedNonce = String(nonce || "");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalizedNonce)) {
    throw new TypeError("A valid service authentication nonce is required.");
  }
  const signature = signatureFor(
    { method: normalizedMethod, path: normalizedPath, timestamp, nonce: normalizedNonce },
    normalizedSecret,
  );
  return {
    "x-ouj-service-auth-version": "1",
    "x-ouj-service-auth-timestamp": timestamp,
    "x-ouj-service-auth-nonce": normalizedNonce,
    "x-ouj-service-auth-signature": signature,
  };
}

export function createServiceReplayGuard({
  maxEntries = 10_000,
  ttlMs = DEFAULT_MAX_SKEW_MS * 2,
  now = Date.now,
} = {}) {
  const limit = Math.max(1, Math.min(100_000, Number(maxEntries) || 10_000));
  const ttl = Math.max(1_000, Math.min(60 * 60 * 1000, Number(ttlMs) || DEFAULT_MAX_SKEW_MS * 2));
  const entries = new Map();

  function prune(currentTime) {
    for (const [key, expiresAt] of entries) {
      if (expiresAt > currentTime) break;
      entries.delete(key);
    }
    while (entries.size >= limit) entries.delete(entries.keys().next().value);
  }

  return {
    consume(key, currentTime = Number(now())) {
      const normalized = String(key || "");
      if (!normalized) return false;
      prune(currentTime);
      if (entries.has(normalized)) return false;
      entries.set(normalized, currentTime + ttl);
      return true;
    },
    size: () => entries.size,
  };
}

export function verifyServiceAuth({
  headers,
  secret,
  method,
  path,
  now = Date.now,
  maxSkewMs = DEFAULT_MAX_SKEW_MS,
  replayGuard,
} = {}) {
  let normalizedSecret;
  let normalizedMethod;
  let normalizedPath;
  try {
    normalizedSecret = normalizeSecret(secret);
    normalizedMethod = normalizeMethod(method);
    normalizedPath = normalizePath(path);
  } catch {
    return { ok: false, code: "SERVICE_AUTH_UNAVAILABLE" };
  }
  const version = headerValue(headers, "x-ouj-service-auth-version");
  const timestamp = headerValue(headers, "x-ouj-service-auth-timestamp");
  const nonce = headerValue(headers, "x-ouj-service-auth-nonce");
  const providedSignature = headerValue(headers, "x-ouj-service-auth-signature");
  if (version !== "1" || !timestamp || !nonce || !providedSignature) {
    return { ok: false, code: "SERVICE_AUTH_REQUIRED" };
  }
  if (!/^\d{13}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(providedSignature)) {
    return { ok: false, code: "SERVICE_AUTH_MALFORMED" };
  }
  const currentTime = Number(now());
  const requestTime = Number(timestamp);
  const skew = Math.max(1_000, Math.min(15 * 60 * 1000, Number(maxSkewMs) || DEFAULT_MAX_SKEW_MS));
  if (!Number.isFinite(currentTime) || Math.abs(currentTime - requestTime) > skew) {
    return { ok: false, code: "SERVICE_AUTH_EXPIRED" };
  }
  const expected = signatureFor(
    { method: normalizedMethod, path: normalizedPath, timestamp, nonce },
    normalizedSecret,
  );
  if (!safeEqual(providedSignature, expected)) {
    return { ok: false, code: "SERVICE_AUTH_SIGNATURE_INVALID" };
  }
  if (replayGuard && !replayGuard.consume(`${timestamp}:${nonce}`, currentTime)) {
    return { ok: false, code: "SERVICE_AUTH_REPLAYED" };
  }
  return { ok: true };
}
