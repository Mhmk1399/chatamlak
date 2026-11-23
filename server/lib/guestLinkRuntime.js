import { createHash, randomBytes } from "node:crypto";
import { createGuestLinkClient } from "./guestLinkClient.js";
import { NativeWebAuthError } from "./nativeWebIdentityClient.js";
import { createWebIdentityVerifier } from "./webIdentityVerifier.js";

const TTL_MS = 5 * 60_000;
const digest = (value) => `sha256:${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const random = (bytes = 32) => randomBytes(bytes).toString("base64url");
const enabled = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

function url(value, name, allowHttp) {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if (parsed.username || parsed.password || parsed.hash || !["https:", ...(allowHttp ? ["http:"] : [])].includes(parsed.protocol)) throw new Error(`${name} must use HTTPS.`);
  return parsed.toString();
}

export function createGuestLinkRuntime({ env = process.env, appEnv = env.APP_ENV || env.NODE_ENV || "development", repository, completeGuestHistoryLink, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const allowHttp = appEnv !== "production" && enabled(env.OWJ_WEB_ALLOW_INSECURE_HTTP);
  const authorizeUrl = url(env.OWJ_CHAT_GUEST_LINK_WEB_AUTHORIZE_URL, "OWJ_CHAT_GUEST_LINK_WEB_AUTHORIZE_URL", allowHttp);
  const redirectUri = url(env.OWJ_CHAT_GUEST_LINK_REDIRECT_URI, "OWJ_CHAT_GUEST_LINK_REDIRECT_URI", allowHttp);
  const client = createGuestLinkClient({
    exchangeUrl: env.OWJ_CHAT_GUEST_LINK_WEB_EXCHANGE_URL,
    serviceToken: env.OWJ_CHAT_GUEST_LINK_TO_WEB_SERVICE_TOKEN,
    fetchImpl,
    allowHttp,
  });
  const verifier = createWebIdentityVerifier({
    expectedIssuer: url(env.OWJ_WEB_ISSUER, "OWJ_WEB_ISSUER", allowHttp),
    expectedAudience: "owj-chat-support-guest-link",
    jwksUrl: env.OWJ_WEB_JWKS_URL,
    fetchImpl,
    consumeJti: repository.consumePlatformIdentityAssertionJti,
    allowInsecureJwks: allowHttp,
    now,
  });

  async function start(nativeSession) {
    if (!nativeSession || nativeSession.auth_kind !== "web_federated" || !nativeSession.web_subject || !nativeSession.id) {
      throw new NativeWebAuthError("GUEST_LINK_NATIVE_SESSION_REQUIRED", "A current Web-backed Chat session is required.", 401);
    }
    const state = random(32);
    const codeVerifier = random(64);
    const browserToken = random(32);
    await repository.createGuestLinkTransaction({
      stateDigest: digest(state), browserTokenDigest: digest(browserToken), codeVerifier,
      redirectUri, webSubject: nativeSession.web_subject, chatUserId: nativeSession.id,
      expiresAt: new Date(Number(now()) + TTL_MS),
    });
    return {
      browserToken,
      authorizationUrl: authorizeUrl,
      form: {
        version: "1", intent: "link_guest_history", redirectUri, state,
        codeChallenge: createHash("sha256").update(codeVerifier, "ascii").digest("base64url"),
        codeChallengeMethod: "S256",
      },
      expiresInSeconds: TTL_MS / 1_000,
    };
  }

  async function complete({ code, state, browserToken, nativeSession }) {
    const transaction = await repository.consumeGuestLinkTransaction({
      stateDigest: digest(state), browserTokenDigest: digest(browserToken), consumedAt: new Date(Number(now())),
    });
    if (!transaction || nativeSession?.auth_kind !== "web_federated" || nativeSession.web_subject !== transaction.web_subject || nativeSession.id !== transaction.chat_user_id) {
      throw new NativeWebAuthError("GUEST_LINK_TRANSACTION_INVALID", "The guest-link request expired or was already used.", 401);
    }
    const proof = await client.exchange({ code, state, redirectUri: transaction.redirect_uri, codeVerifier: transaction.code_verifier, expectedSubject: transaction.web_subject });
    const claims = await verifier.verify(proof, {
      allowedTokenUses: ["support_guest_link"],
      requiredScopes: ["support:guest-history:link"],
      allowedScopes: ["support:guest-history:link"],
    });
    if (claims.subject !== transaction.web_subject) throw new NativeWebAuthError("GUEST_LINK_ACCOUNT_MISMATCH", "The guest-link account does not match.", 403);
    return completeGuestHistoryLink({ claims, nativeSession });
  }

  return { start, complete, authorizeUrl, redirectUri };
}
