import { createHash, randomBytes } from "node:crypto";
import {
  NativeWebAuthError,
  createNativeWebIdentityClient,
} from "./nativeWebIdentityClient.js";

const AUTH_TRANSACTION_TTL_MS = 5 * 60_000;
const digest = (value) => `sha256:${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const base64url = (bytes = 32) => randomBytes(bytes).toString("base64url");
const enabled = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

export function resolveNativeAuthMode(value, appEnv = "development") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "local_test" && appEnv === "production") {
    throw new Error("OWJ_CHAT_NATIVE_AUTH_MODE=local_test is not allowed in production.");
  }
  if (["federated", "local_test"].includes(normalized)) return normalized;
  if (normalized) throw new Error("OWJ_CHAT_NATIVE_AUTH_MODE must be federated or local_test.");
  return appEnv === "test" ? "local_test" : "federated";
}

function url(value, name, allowHttp) {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if (
    parsed.username || parsed.password || parsed.hash ||
    !["https:", ...(allowHttp ? ["http:"] : [])].includes(parsed.protocol)
  ) throw new Error(`${name} must use HTTPS (HTTP is allowed only in local test mode).`);
  return parsed.toString();
}

function safeRedirectUri(env, allowHttp) {
  const configured = String(env.OWJ_CHAT_NATIVE_REDIRECT_URI || "").trim();
  if (configured) return url(configured, "OWJ_CHAT_NATIVE_REDIRECT_URI", allowHttp);
  const publicUrl = url(env.APP_PUBLIC_URL, "APP_PUBLIC_URL", allowHttp);
  return new URL("/auth/web/callback", publicUrl).toString();
}

function authorizationFresh(session, nowMs) {
  const checked = Date.parse(String(session.web_authorization_checked_at || ""));
  const seconds = Math.max(0, Math.min(60, Number(session.web_authorization_cache_seconds || 0)));
  return Number.isFinite(checked) && checked + seconds * 1_000 > nowMs;
}

export function createNativeWebAuthRuntime({
  env = process.env,
  appEnv = env.APP_ENV || env.NODE_ENV || "development",
  repository,
  createSession,
  deleteSession,
  updateNativeWebSession,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const mode = resolveNativeAuthMode(env.OWJ_CHAT_NATIVE_AUTH_MODE, appEnv);
  if (mode === "local_test") {
    return {
      mode,
      enabled: false,
      apiDeps: { nativeAuthMode: mode },
      validateSession: async (session) => session,
    };
  }
  if (!repository || typeof createSession !== "function" || typeof deleteSession !== "function") {
    throw new Error("Native Web authentication persistence is unavailable.");
  }
  const allowHttp = appEnv !== "production" && enabled(env.OWJ_WEB_ALLOW_INSECURE_HTTP);
  const authorizeUrl = url(
    env.OWJ_CHAT_NATIVE_WEB_AUTHORIZE_URL,
    "OWJ_CHAT_NATIVE_WEB_AUTHORIZE_URL",
    allowHttp,
  );
  const redirectUri = safeRedirectUri(env, allowHttp);
  const client = createNativeWebIdentityClient({
    exchangeUrl: env.OWJ_CHAT_NATIVE_WEB_EXCHANGE_URL,
    statusUrl: env.OWJ_CHAT_NATIVE_WEB_STATUS_URL,
    serviceToken: env.OWJ_CHAT_NATIVE_TO_WEB_SERVICE_TOKEN,
    fetchImpl,
    allowHttp,
  });

  async function startAuthorization() {
    const state = base64url(32);
    const codeVerifier = base64url(64);
    const codeChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
    const browserToken = base64url(32);
    await repository.createNativeWebAuthTransaction({
      stateDigest: digest(state),
      browserTokenDigest: digest(browserToken),
      codeVerifier,
      redirectUri,
      expiresAt: new Date(Number(now()) + AUTH_TRANSACTION_TTL_MS),
    });
    return {
      browserToken,
      authorizationUrl: authorizeUrl,
      form: {
        version: "1",
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod: "S256",
      },
      expiresInSeconds: AUTH_TRANSACTION_TTL_MS / 1_000,
    };
  }

  async function completeAuthorization({ code, state, browserToken, userAgent = null } = {}) {
    const transaction = await repository.consumeNativeWebAuthTransaction({
      stateDigest: digest(state),
      browserTokenDigest: digest(browserToken),
      consumedAt: new Date(Number(now())),
    });
    if (!transaction) {
      throw new NativeWebAuthError(
        "CHAT_AUTHORIZATION_TRANSACTION_INVALID",
        "The sign-in request expired or was already used.",
        401,
      );
    }
    const authorization = await client.exchange({
      code,
      state,
      redirectUri: transaction.redirect_uri,
      codeVerifier: transaction.code_verifier,
    });
    const provisioned = await repository.provisionNativeWebUser({
      webUserId: authorization.subject,
    });
    if (!provisioned?.user?.id) {
      throw new NativeWebAuthError("IDENTITY_LINK_REQUIRED", "A Chat account link is required.", 409);
    }
    const sessionToken = base64url(36);
    await createSession(provisioned.user.id, sessionToken, {
      authKind: "web_federated",
      webSubject: authorization.subject,
      webScopes: authorization.scopes,
      authorizationEstablishedAt: authorization.authorizationEstablishedAt,
      sessionExpiresAt: authorization.sessionExpiresAt,
      authorizationCheckedAt: authorization.authorizationCheckedAt,
      authorizationCacheMaxAgeSeconds: authorization.authorizationCacheMaxAgeSeconds,
      crmActorAuthorization: authorization.crmActorAuthorization,
    });
    await repository.messagingDb?.recordDevice?.(sessionToken, userAgent);
    return {
      sessionToken,
      user: provisioned.user,
      provisioned: Boolean(provisioned.created),
      scopes: authorization.scopes,
      crmTaskAllowed: Boolean(authorization.crmActorAuthorization),
    };
  }

  async function validateSession(session, { token, forceRefresh = false } = {}) {
    if (!session || session.auth_kind !== "web_federated") return session;
    const nowMs = Number(now());
    if (
      !session.web_subject || !session.web_scopes?.includes("chat:access") ||
      Date.parse(String(session.web_session_expires_at || "")) <= nowMs
    ) {
      await deleteSession(token).catch?.(() => {});
      throw new NativeWebAuthError("WEB_IDENTITY_SESSION_EXPIRED", "The Web session has expired.", 401);
    }
    if (!forceRefresh && authorizationFresh(session, nowMs)) return session;
    try {
      const authorization = await client.status({
        subject: session.web_subject,
        authorizationEstablishedAt: session.web_authorization_established_at,
        crmActorAuthorization: session.crm_actor_authorization || null,
      });
      await updateNativeWebSession(session.session_id, authorization);
      return {
        ...session,
        web_scopes: authorization.scopes,
        web_session_expires_at: authorization.sessionExpiresAt,
        web_authorization_checked_at: authorization.authorizationCheckedAt,
        web_authorization_cache_seconds: authorization.authorizationCacheMaxAgeSeconds,
        crm_actor_authorization: authorization.crmActorAuthorization || null,
      };
    } catch (error) {
      if (
        error instanceof NativeWebAuthError &&
        [401, 403, 404, 410].includes(error.status)
      ) await deleteSession(token).catch?.(() => {});
      throw error;
    }
  }

  return {
    mode,
    enabled: true,
    authorizeUrl,
    redirectUri,
    client,
    startAuthorization,
    completeAuthorization,
    validateSession,
    apiDeps: {
      nativeAuthMode: mode,
      startNativeWebAuthorization: startAuthorization,
      completeNativeWebAuthorization: completeAuthorization,
    },
  };
}
