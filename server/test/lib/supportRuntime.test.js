import { describe, expect, test, vi } from "vitest";
import { createSupportRuntime } from "../../lib/supportRuntime.js";

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
});
