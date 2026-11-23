import { describe, expect, it, vi } from "vitest";
import {
  createNativeWebAuthRuntime,
  resolveNativeAuthMode,
} from "../../lib/nativeWebAuthRuntime.js";

const env = {
  APP_ENV: "development",
  OWJ_WEB_ALLOW_INSECURE_HTTP: "true",
  OWJ_CHAT_NATIVE_AUTH_MODE: "federated",
  APP_PUBLIC_URL: "http://chat.example.test",
  OWJ_CHAT_NATIVE_WEB_AUTHORIZE_URL: "http://web.example.test/api/v1/chat/authorize",
  OWJ_CHAT_NATIVE_WEB_EXCHANGE_URL: "http://web.example.test/api/internal/v1/chat/exchange",
  OWJ_CHAT_NATIVE_WEB_STATUS_URL: "http://web.example.test/api/internal/v1/chat/identity/status",
  OWJ_CHAT_NATIVE_TO_WEB_SERVICE_TOKEN: "s".repeat(32),
};

function authorization(extra = {}) {
  return {
    version: 1,
    subject: "507f1f77bcf86cd799439011",
    accountStatus: "active",
    scopes: ["chat:access", "chat:call"],
    authorizationEstablishedAt: "2026-11-23T08:00:00.000Z",
    sessionExpiresAt: "2099-11-23T09:00:00.000Z",
    authorizationCheckedAt: "2026-11-23T08:00:01.000Z",
    authorizationCacheMaxAgeSeconds: 60,
    crmActorAuthorization: "delegated-proof",
    ...extra,
  };
}

function fixture(fetchImpl = vi.fn(async () => new Response(JSON.stringify(authorization()), { status: 200 }))) {
  let transaction = null;
  const repository = {
    createNativeWebAuthTransaction: vi.fn(async (value) => { transaction = value; }),
    consumeNativeWebAuthTransaction: vi.fn(async ({ stateDigest, browserTokenDigest }) => {
      if (!transaction || transaction.stateDigest !== stateDigest || transaction.browserTokenDigest !== browserTokenDigest) return null;
      const result = { redirect_uri: transaction.redirectUri, code_verifier: transaction.codeVerifier };
      transaction = null;
      return result;
    }),
    provisionNativeWebUser: vi.fn(async () => ({
      created: true,
      user: { id: "chat-user-1", username: "w0123456789abcde", role: "user" },
    })),
    messagingDb: { recordDevice: vi.fn() },
  };
  const createSession = vi.fn(async () => {});
  const deleteSession = vi.fn(async () => {});
  const updateNativeWebSession = vi.fn(async () => {});
  const runtime = createNativeWebAuthRuntime({
    env, appEnv: "development", repository, createSession, deleteSession,
    updateNativeWebSession, fetchImpl, now: () => Date.parse("2026-11-23T08:00:02.000Z"),
  });
  return { runtime, repository, createSession, deleteSession, updateNativeWebSession };
}

describe("native Web auth runtime", () => {
  it("rejects local native authentication in production", () => {
    expect(() => resolveNativeAuthMode("local_test", "production"))
      .toThrow(/not allowed in production/);
    expect(resolveNativeAuthMode("local_test", "development")).toBe("local_test");
    expect(resolveNativeAuthMode(undefined, "production")).toBe("federated");
  });

  it("persists PKCE state server-side and consumes it exactly once", async () => {
    const setup = fixture();
    const start = await setup.runtime.startAuthorization();
    expect(start.form).toMatchObject({ codeChallengeMethod: "S256", redirectUri: "http://chat.example.test/auth/web/callback" });
    expect(start).not.toHaveProperty("codeVerifier");
    const completed = await setup.runtime.completeAuthorization({
      code: "one-time-code", state: start.form.state, browserToken: start.browserToken,
    });
    expect(completed.sessionToken).toBeTruthy();
    expect(setup.createSession).toHaveBeenCalledWith("chat-user-1", expect.any(String), expect.objectContaining({
      authKind: "web_federated", webSubject: "507f1f77bcf86cd799439011",
    }));
    await expect(setup.runtime.completeAuthorization({
      code: "one-time-code", state: start.form.state, browserToken: start.browserToken,
    })).rejects.toMatchObject({ code: "CHAT_AUTHORIZATION_TRANSACTION_INVALID" });
  });

  it("rejects a callback whose state or browser transaction does not match", async () => {
    const setup = fixture();
    const start = await setup.runtime.startAuthorization();
    await expect(setup.runtime.completeAuthorization({
      code: "one-time-code",
      state: `${start.form.state}-wrong`,
      browserToken: start.browserToken,
    })).rejects.toMatchObject({ code: "CHAT_AUTHORIZATION_TRANSACTION_INVALID" });
    expect(setup.createSession).not.toHaveBeenCalled();
  });

  it("fails closed after an interrupted exchange and cannot replay the consumed transaction", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "WEB_AUTHORIZATION_UNAVAILABLE", message: "Synthetic interruption" },
    }), { status: 503 }));
    const setup = fixture(fetchImpl);
    const start = await setup.runtime.startAuthorization();
    const callback = {
      code: "one-time-code",
      state: start.form.state,
      browserToken: start.browserToken,
    };
    await expect(setup.runtime.completeAuthorization(callback)).rejects.toMatchObject({
      code: "WEB_AUTHORIZATION_UNAVAILABLE",
    });
    await expect(setup.runtime.completeAuthorization(callback)).rejects.toMatchObject({
      code: "CHAT_AUTHORIZATION_TRANSACTION_INVALID",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(setup.createSession).not.toHaveBeenCalled();
  });

  it("deletes the local session after definitive Web revocation", async () => {
    const response = new Response(JSON.stringify({ error: { code: "TOKEN_REVOKED" } }), { status: 401 });
    const setup = fixture(vi.fn(async () => response));
    await expect(setup.runtime.validateSession({
      id: "chat-user-1", session_id: "session-1", auth_kind: "web_federated",
      web_subject: "507f1f77bcf86cd799439011", web_scopes: ["chat:access"],
      web_authorization_established_at: "2026-11-23T08:00:00.000Z",
      web_session_expires_at: "2099-11-23T09:00:00.000Z",
      web_authorization_checked_at: "2026-11-23T07:00:00.000Z",
      web_authorization_cache_seconds: 60,
    }, { token: "opaque-session", forceRefresh: true })).rejects.toMatchObject({ code: "TOKEN_REVOKED" });
    expect(setup.deleteSession).toHaveBeenCalledWith("opaque-session");
  });

  it("clears a delegated CRM proof when Web no longer returns one", async () => {
    const setup = fixture(vi.fn(async () => new Response(JSON.stringify(authorization({
      crmActorAuthorization: null,
    })), { status: 200 })));
    const refreshed = await setup.runtime.validateSession({
      id: "chat-user-1", session_id: "session-1", auth_kind: "web_federated",
      web_subject: "507f1f77bcf86cd799439011", web_scopes: ["chat:access"],
      web_authorization_established_at: "2026-11-23T08:00:00.000Z",
      web_session_expires_at: "2099-11-23T09:00:00.000Z",
      web_authorization_checked_at: "2026-11-23T07:00:00.000Z",
      web_authorization_cache_seconds: 60,
      crm_actor_authorization: "stale-delegated-proof",
    }, { token: "opaque-session", forceRefresh: true });

    expect(setup.updateNativeWebSession).toHaveBeenCalledWith("session-1", expect.objectContaining({
      crmActorAuthorization: null,
    }));
    expect(refreshed.crm_actor_authorization).toBeNull();
  });
});
