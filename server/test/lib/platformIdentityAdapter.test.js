import { describe, expect, test, vi } from "vitest";
import {
  PlatformIdentityError,
  createPlatformIdentityAdapter,
} from "../../lib/platformIdentityAdapter.js";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");
const WEB_ISSUER = "https://identity.ouj.example";

function registeredClaims(overrides = {}) {
  return {
    issuer: WEB_ISSUER,
    subject: "web-user-1",
    audience: ["ouj-chat"],
    scopes: ["chat:access", "support:conversation"],
    expiresAt: "2026-11-20T09:00:00.000Z",
    status: "active",
    kind: "registered",
    ...overrides,
  };
}

function createAdapter(overrides = {}) {
  return createPlatformIdentityAdapter({
    enabled: true,
    expectedIssuer: WEB_ISSUER,
    identityProvider: "owj-web",
    expectedAudience: "ouj-chat",
    now: () => NOW,
    verifyCredential: async () => registeredClaims(),
    findIdentityLinkByWebUserId: async (provider, webUserId) => ({
      provider,
      web_user_id: webUserId,
      chat_user_id: "chat-user-1",
      status: "active",
    }),
    findChatUserById: async (id) => ({
      id,
      username: "historical-chat-user",
      banned: 0,
      status: "online",
    }),
    ...overrides,
  });
}

async function expectCode(promise, code) {
  await expect(promise).rejects.toMatchObject({
    name: "PlatformIdentityError",
    code,
  });
}

describe("platform identity adapter", () => {
  test("fails closed without invoking a provider when federation is disabled", async () => {
    const verifyCredential = vi.fn();
    const adapter = createAdapter({ enabled: false, verifyCredential });

    await expectCode(
      adapter.authenticate({
        credential: "opaque-web-credential",
        requiredScopes: ["chat:access"],
      }),
      "IDENTITY_FEDERATION_DISABLED",
    );
    expect(verifyCredential).not.toHaveBeenCalled();
  });

  test("accepts only a provider-verified registered subject with an active explicit link", async () => {
    const findIdentityLinkByWebUserId = vi.fn(async (provider, webUserId) => ({
      provider,
      web_user_id: webUserId,
      chat_user_id: "chat-user-1",
      status: "active",
    }));
    const adapter = createAdapter({ findIdentityLinkByWebUserId });

    const principal = await adapter.authenticate({
      credential: "opaque-web-credential",
      requiredScopes: ["chat:access"],
    });

    expect(findIdentityLinkByWebUserId).toHaveBeenCalledWith(
      "owj-web",
      "web-user-1",
    );
    expect(principal).toEqual({
      kind: "registered",
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      scopes: ["chat:access", "support:conversation"],
      chatUser: expect.objectContaining({ id: "chat-user-1" }),
    });
  });

  test("never links a registered identity by username when no explicit mapping exists", async () => {
    const adapter = createAdapter({
      findIdentityLinkByWebUserId: async () => null,
      findChatUserById: vi.fn(),
    });

    await expectCode(
      adapter.authenticate({
        credential: "opaque-web-credential",
        requiredScopes: ["chat:access"],
      }),
      "IDENTITY_LINK_REQUIRED",
    );
  });

  test.each([
    ["wrong issuer", registeredClaims({ issuer: "https://untrusted.example" }), "IDENTITY_ISSUER_INVALID"],
    ["wrong audience", registeredClaims({ audience: ["owj-analytics"] }), "IDENTITY_AUDIENCE_INVALID"],
    ["missing scope", registeredClaims({ scopes: ["profile:read"] }), "IDENTITY_SCOPE_DENIED"],
    ["expired credential", registeredClaims({ expiresAt: "2026-11-20T07:59:59.000Z" }), "IDENTITY_EXPIRED"],
    ["disabled Web account", registeredClaims({ status: "disabled" }), "IDENTITY_SUBJECT_DISABLED"],
  ])("rejects %s", async (_label, claims, code) => {
    const adapter = createAdapter({ verifyCredential: async () => claims });
    await expectCode(
      adapter.authenticate({
        credential: "opaque-web-credential",
        requiredScopes: ["chat:access"],
      }),
      code,
    );
  });

  test("rejects revoked mappings and banned historical Chat users", async () => {
    const revoked = createAdapter({
      findIdentityLinkByWebUserId: async () => ({
        provider: "owj-web",
        web_user_id: "web-user-1",
        chat_user_id: "chat-user-1",
        status: "revoked",
      }),
    });
    await expectCode(
      revoked.authenticate({
        credential: "opaque-web-credential",
        requiredScopes: ["chat:access"],
      }),
      "IDENTITY_LINK_REVOKED",
    );

    const banned = createAdapter({
      findChatUserById: async () => ({
        id: "chat-user-1",
        username: "historical-chat-user",
        banned: 1,
      }),
    });
    await expectCode(
      banned.authenticate({
        credential: "opaque-web-credential",
        requiredScopes: ["chat:access"],
      }),
      "CHAT_ACCOUNT_DISABLED",
    );
  });

  test("allows a provider-verified guest capability only when the caller opts into guest access", async () => {
    const verifyCredential = async () => ({
      issuer: WEB_ISSUER,
      subject: "guest-capability-1",
      audience: "ouj-chat",
      scopes: ["support:conversation"],
      expiresAt: "2026-11-20T08:15:00.000Z",
      status: "active",
      kind: "guest",
      conversationIds: ["conversation-1", "conversation-1", "conversation-2"],
    });
    const adapter = createAdapter({
      verifyCredential,
      findIdentityLinkByWebUserId: vi.fn(),
    });

    await expectCode(
      adapter.authenticate({
        credential: "opaque-guest-capability",
        requiredScopes: ["support:conversation"],
      }),
      "GUEST_IDENTITY_NOT_ALLOWED",
    );

    const principal = await adapter.authenticate({
      credential: "opaque-guest-capability",
      requiredScopes: ["support:conversation"],
      allowGuest: true,
    });
    expect(principal).toEqual({
      kind: "guest",
      provider: "owj-web",
      guestSubject: "guest-capability-1",
      scopes: ["support:conversation"],
      conversationIds: ["conversation-1", "conversation-2"],
    });
  });

  test("uses stable typed errors without reflecting credential contents", () => {
    const error = new PlatformIdentityError(
      "IDENTITY_SCOPE_DENIED",
      "Required identity scope is missing.",
      403,
    );
    expect(error).toMatchObject({
      code: "IDENTITY_SCOPE_DENIED",
      status: 403,
    });
    expect(error.message).not.toContain("credential");
  });
});
