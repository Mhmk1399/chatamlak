import { randomUUID } from "node:crypto";
import { NativeWebAuthError } from "./nativeWebIdentityClient.js";

const MAX_RESPONSE_BYTES = 32 * 1024;
const PROOF = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const fail = (code, message, status = 503) => {
  throw new NativeWebAuthError(code, message, status);
};

function endpoint(value, allowHttp) {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); } catch { fail("GUEST_LINK_NOT_CONFIGURED", "Guest linking is unavailable."); }
  if (parsed.username || parsed.password || parsed.hash || !["https:", ...(allowHttp ? ["http:"] : [])].includes(parsed.protocol)) {
    fail("GUEST_LINK_NOT_CONFIGURED", "Guest linking is unavailable.");
  }
  return parsed.toString();
}

export function createGuestLinkClient({ exchangeUrl, serviceToken, fetchImpl = globalThis.fetch, allowHttp = false } = {}) {
  const url = endpoint(exchangeUrl, allowHttp);
  const credential = typeof serviceToken === "string" ? serviceToken.trim() : "";
  if (credential.length < 32 || typeof fetchImpl !== "function") fail("GUEST_LINK_NOT_CONFIGURED", "Guest linking is unavailable.");

  async function exchange(body) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${credential}`,
          "content-type": "application/json",
          "x-owj-service": "owj-chat-support-guest-link",
          "x-request-id": randomUUID(),
        },
        body: JSON.stringify({ version: 1, ...body }),
      });
    } catch {
      fail("GUEST_LINK_WEB_UNAVAILABLE", "The Web guest-link service is unavailable.");
    }
    const raw = await response.text().catch(() => "");
    if (Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) fail("GUEST_LINK_RESPONSE_INVALID", "The Web guest-link response is invalid.", 502);
    let payload;
    try { payload = JSON.parse(raw); } catch { fail("GUEST_LINK_RESPONSE_INVALID", "The Web guest-link response is invalid.", 502); }
    if (!response.ok) {
      const code = typeof payload?.error === "string" ? payload.error : "GUEST_LINK_WEB_UNAVAILABLE";
      const definitive = response.status >= 400 && response.status < 500;
      fail(code.slice(0, 100), definitive ? "Guest linking was denied or expired." : "The Web guest-link service is unavailable.", definitive ? response.status : 503);
    }
    if (payload?.version !== 1 || typeof payload.proof !== "string" || !PROOF.test(payload.proof) || !Number.isInteger(payload.proofExpiresInSeconds) || payload.proofExpiresInSeconds < 1 || payload.proofExpiresInSeconds > 120) {
      fail("GUEST_LINK_RESPONSE_INVALID", "The Web guest-link response is invalid.", 502);
    }
    return payload.proof;
  }

  return { exchange };
}
