import crypto from "node:crypto";

const STORAGE_PREFIX = "sha256:";
const STORED_TOKEN_PATTERN = /^sha256:[a-f0-9]{64}$/i;

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function isStoredSessionToken(value) {
  return STORED_TOKEN_PATTERN.test(String(value || ""));
}

export function sessionTokenStorageValue(token) {
  const value = String(token || "");
  if (!value) return "";
  if (isStoredSessionToken(value)) return value.toLowerCase();
  return `${STORAGE_PREFIX}${digest(value)}`;
}

export function sessionTokenLookupValues(token, { acceptStored = false } = {}) {
  const value = String(token || "");
  if (!value) return [];
  if (isStoredSessionToken(value)) {
    return acceptStored ? [value.toLowerCase()] : [];
  }
  return [sessionTokenStorageValue(value), value];
}

export function sessionDeviceId(token) {
  const value = String(token || "");
  if (!value) return "";
  return isStoredSessionToken(value)
    ? value.slice(STORAGE_PREFIX.length).toLowerCase()
    : digest(value);
}

export function sessionTokenMatches(storedToken, presentedToken) {
  if (isStoredSessionToken(presentedToken)) return false;
  const storedId = sessionDeviceId(storedToken);
  const presentedId = sessionDeviceId(presentedToken);
  if (!storedId || !presentedId || storedId.length !== presentedId.length) return false;
  return crypto.timingSafeEqual(Buffer.from(storedId), Buffer.from(presentedId));
}
