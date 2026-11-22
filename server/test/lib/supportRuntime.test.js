import { describe, expect, test, vi } from "vitest";
import { createSupportRuntime } from "../../lib/supportRuntime.js";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");
const WEB_USER_ID = "507f1f77bcf86cd799439011";

function webStatusResponse({ staff = false, allowed = true } = {}) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      version: 1,
      subject: WEB_USER_ID,
      status: "active",
      role: staff ? "ADMIN" : "USER",
      support: { allowed, staff },
      authorizationCacheMaxAgeSeconds: 60,
      checkedAt: "2026-11-20T08:00:00.000Z",
      requestId: "web-status-1",
    }),
  };
}

function environment(overrides = {}) {
  return {
    OWJ_SUPPORT_ENABLED: "true",
    OWJ_WEB_ALLOW_INSECURE_HTTP: "true",
    OWJ_WEB_ISSUER: "http://web.local/",
    OWJ_WEB_JWKS_URL: "http://web.local/.well-known/jwks.json",
    OWJ_WEB_STATUS_URL: "http://web.local/api/internal/v1/identity/status",
    OWJ_WEB_TO_CHAT_SERVICE_SECRET: "w".repeat(32),
    OWJ_CHAT_TO_WEB_SERVICE_TOKEN: "c".repeat(32),
    OWJ_SUPPORT_ALLOWED_ORIGINS: "http://web.local",
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    supportDb: {
      revokeSupportSessionsByWebUserId: vi.fn(async () => 0),
      purgeExpiredSupportSessions: vi.fn(async () => 0),
      getSupportEvents: vi.fn(async () => ({ events: [], cursor: null, hasMore: false })),
      ...overrides.supportDb,
    },
    identityRepository: {
      consumePlatformIdentityAssertionJti: vi.fn(async () => true),
      findPlatformIdentityLinkByWebUserId: vi.fn(async () => null),
      ...overrides.identityRepository,
    },
    findChatUserById: vi.fn(async () => null),
    isMember: vi.fn(async () => false),
    createOrReuseMessage: vi.fn(),
    emitChatEvent: vi.fn(),
    ...overrides,
  };
}

describe("support runtime composition", () => {
  test("stays dormant without exposing partially configured dependencies", () => {
    const runtime = createSupportRuntime({ env: { OWJ_SUPPORT_ENABLED: "false" } });
    expect(runtime.enabled).toBe(false);
    expect(runtime.apiDeps).toEqual({});
  });

  test("fails startup when support is enabled without all service credentials", () => {
    expect(() => createSupportRuntime({
      env: environment({ OWJ_WEB_TO_CHAT_SERVICE_SECRET: "" }),
      appEnv: "development",
      ...dependencies(),
    })).toThrow(/OWJ_WEB_TO_CHAT_SERVICE_SECRET/);
  });

  test("rejects malformed or insecure production origins at startup", () => {
    expect(() => createSupportRuntime({
      env: environment({
        OWJ_WEB_ALLOW_INSECURE_HTTP: "false",
        OWJ_WEB_ISSUER: "https://web.example.com/",
        OWJ_WEB_JWKS_URL: "https://web.example.com/.well-known/jwks.json",
        OWJ_WEB_STATUS_URL: "https://web.example.com/api/internal/v1/identity/status",
        OWJ_SUPPORT_ALLOWED_ORIGINS: "http://web.example.com",
      }),
      appEnv: "production",
      ...dependencies(),
    })).toThrow(/invalid origin/);
  });

  test("composes the versioned support dependencies and bounded cleanup", async () => {
    const deps = dependencies();
    const runtime = createSupportRuntime({
      env: environment(),
      appEnv: "development",
      ...deps,
    });

    expect(runtime.enabled).toBe(true);
    expect(runtime.apiDeps).toEqual(expect.objectContaining({
      verifyWebServiceRequest: expect.any(Function),
      platformIdentityAdapter: expect.any(Object),
      supportSessionService: expect.any(Object),
      supportRealtime: expect.any(Object),
      assignSupportConversation: expect.any(Function),
    }));
    await vi.waitFor(() => {
      expect(deps.supportDb.purgeExpiredSupportSessions).toHaveBeenCalledTimes(1);
    });
    await runtime.close();
  });

  test("requires a 32-character Chat-to-Web status credential", () => {
    expect(() => createSupportRuntime({
      env: environment({ OWJ_CHAT_TO_WEB_SERVICE_TOKEN: "c".repeat(31) }),
      appEnv: "development",
      ...dependencies(),
    })).toThrow(/OWJ_CHAT_TO_WEB_SERVICE_TOKEN/);
  });

  test("bypasses status cache at bootstrap and sends the assertion revocation reference", async () => {
    const ensureSupportConversation = vi.fn(async () => ({
      conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actorId: "chat-user-1",
      status: "open",
      created: true,
    }));
    const deps = dependencies({ supportDb: { ensureSupportConversation } });
    const fetchImpl = vi.fn(async () => webStatusResponse());
    const runtime = createSupportRuntime({
      env: environment(),
      appEnv: "development",
      now: () => NOW,
      fetchImpl,
      ...deps,
    });
    const principal = {
      kind: "registered",
      provider: "owj-web",
      webUserId: WEB_USER_ID,
      chatUserId: "chat-user-1",
      issuedAt: NOW - 5_000,
      jti: "registered-bootstrap-1",
      scopes: ["support:conversation:create"],
    };

    await runtime.apiDeps.createOrResumeSupportConversation({ principal });
    await runtime.apiDeps.createOrResumeSupportConversation({ principal });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      subject: WEB_USER_ID,
      tokenIssuedAt: Math.floor((NOW - 5_000) / 1_000),
      jti: "registered-bootstrap-1",
    });
    expect(ensureSupportConversation).toHaveBeenCalledTimes(2);
    await runtime.close();
  });

  test("rejects an agent bootstrap when Web no longer grants a current staff role", async () => {
    const deps = dependencies();
    const runtime = createSupportRuntime({
      env: environment(),
      appEnv: "development",
      now: () => NOW,
      fetchImpl: vi.fn(async () => webStatusResponse({ staff: false })),
      ...deps,
    });

    await expect(runtime.apiDeps.createOrResumeSupportConversation({
      principal: {
        kind: "agent",
        provider: "owj-web",
        webUserId: WEB_USER_ID,
        chatUserId: "chat-agent-1",
        issuedAt: NOW - 5_000,
        jti: "agent-bootstrap-1",
        scopes: ["support:agent", "support:conversation:create"],
      },
    })).rejects.toMatchObject({ code: "IDENTITY_SUBJECT_DISABLED", status: 403 });
    expect(deps.supportDb.revokeSupportSessionsByWebUserId)
      .toHaveBeenCalledWith(WEB_USER_ID, "web_identity_role_denied", "agent");
    await runtime.close();
  });

  test("caches passive staff checks but bypasses the cache for reply, assign, and resolve", async () => {
    let storedSession = null;
    const supportDb = {
      revokeSupportSessionsByWebUserId: vi.fn(async () => 0),
      purgeExpiredSupportSessions: vi.fn(async () => 0),
      getSupportEvents: vi.fn(async () => ({ events: [], cursor: null, hasMore: false })),
      createSupportSession: vi.fn(async (record) => {
        storedSession = {
          id: record.id,
          token_digest: record.tokenDigest,
          conversation_id: record.conversationId,
          principal_kind: record.principalKind,
          actor_id: record.actorId,
          subject: record.subject,
          web_user_id: record.webUserId,
          chat_user_id: record.chatUserId,
          allowed_actions: record.allowedActions,
          scopes: record.scopes,
          bootstrap_jti: record.bootstrapJti,
          identity_issued_at: record.identityIssuedAt,
          status: "active",
          created_at: "2026-11-20T08:00:00.000Z",
          last_seen_at: "2026-11-20T08:00:00.000Z",
          idle_expires_at: record.idleExpiresAt,
          expires_at: record.expiresAt,
          revoked_at: null,
          revocation_reason: null,
        };
        return storedSession;
      }),
      findSupportSessionByDigest: vi.fn(async () => storedSession),
      touchSupportSession: vi.fn(async () => 1),
      revokeSupportSessionById: vi.fn(async () => 1),
    };
    const deps = dependencies({
      supportDb,
      identityRepository: {
        findPlatformIdentityLinkByWebUserId: vi.fn(async () => ({
          provider: "owj-web",
          web_user_id: WEB_USER_ID,
          chat_user_id: "chat-agent-1",
          status: "active",
        })),
      },
    });
    const fetchImpl = vi.fn(async () => webStatusResponse({ staff: true }));
    const runtime = createSupportRuntime({
      env: environment(),
      appEnv: "development",
      now: () => NOW,
      fetchImpl,
      ...deps,
    });
    const issued = await runtime.apiDeps.supportSessionService.issue({
      principal: {
        kind: "agent",
        provider: "owj-web",
        webUserId: WEB_USER_ID,
        chatUserId: "chat-agent-1",
        issuedAt: NOW - 5_000,
        jti: "agent-session-1",
        scopes: ["support:agent", "support:conversation:create"],
      },
      conversationId: "00000000-0000-4000-8000-000000000002",
      chatUserId: "chat-agent-1",
      allowedActions: ["read", "send", "staff:list", "staff:assign", "staff:resolve"],
    });

    await runtime.apiDeps.supportSessionService.authenticate(issued.credential, {
      requiredAction: "staff:list",
    });
    await runtime.apiDeps.supportSessionService.authenticate(issued.credential, {
      requiredAction: "staff:list",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    for (const requiredAction of ["send", "staff:assign", "staff:resolve"]) {
      await runtime.apiDeps.supportSessionService.authenticate(issued.credential, {
        requiredAction,
      });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    delete storedSession.identity_issued_at;
    delete storedSession.bootstrap_jti;
    await expect(runtime.apiDeps.supportSessionService.authenticate(issued.credential, {
      requiredAction: "staff:list",
    })).rejects.toMatchObject({ code: "SUPPORT_SESSION_REVOKED", status: 401 });
    expect(supportDb.revokeSupportSessionById).toHaveBeenCalledWith(
      storedSession.id,
      "authorization_removed",
      expect.any(String),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    await runtime.close();
  });
});
