import { describe, expect, test, vi } from "vitest";
import {
  SupportSessionError,
  createSupportSessionService,
  supportSessionTokenDigest,
} from "../../lib/supportSessions.js";

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    insert: vi.fn(async (row) => rows.set(row.tokenDigest, { ...row })),
    findByDigest: vi.fn(async (digest) => rows.get(digest) || null),
    touch: vi.fn(async (id, patch) => {
      for (const [digest, row] of rows) {
        if (row.id === id) rows.set(digest, { ...row, ...patch });
      }
    }),
    revoke: vi.fn(async (id, patch) => {
      for (const [digest, row] of rows) {
        if (row.id === id) rows.set(digest, { ...row, status: "revoked", ...patch });
      }
    }),
  };
}

async function expectCode(promise, code) {
  await expect(promise).rejects.toMatchObject({
    name: "SupportSessionError",
    code,
  });
}

describe("support sessions", () => {
  test("issues an opaque credential but persists only its digest", async () => {
    const store = memoryStore();
    const service = createSupportSessionService({
      store,
      randomBytes: () => Buffer.alloc(32, 7),
      randomUuid: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      now: () => 1_700_000_000_000,
      idleTimeoutMs: 30_000,
      absoluteTimeoutMs: 60_000,
    });

    const issued = await service.issue({
      principal: {
        kind: "guest",
        provider: "owj-web",
        guestSubject: "guest-1",
      },
      conversationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      chatUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      allowedActions: ["read", "send", "logout"],
    });

    expect(issued.credential).toMatch(/^ocs_[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt).toBe("2023-11-14T22:14:20.000Z");
    expect(store.insert).toHaveBeenCalledTimes(1);
    const persisted = store.insert.mock.calls[0][0];
    expect(JSON.stringify(persisted)).not.toContain(issued.credential);
    expect(persisted.tokenDigest).toBe(
      supportSessionTokenDigest(issued.credential),
    );
    expect(persisted).toMatchObject({
      actorKind: "guest",
      subject: "guest-1",
      conversationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "active",
    });
  });

  test("authenticates only a bound action and revalidates current authorization", async () => {
    const store = memoryStore();
    const validateAuthorization = vi.fn(async () => true);
    const service = createSupportSessionService({
      store,
      validateAuthorization,
      randomBytes: () => Buffer.alloc(32, 8),
      now: () => 1_700_000_000_000,
      idleTimeoutMs: 60_000,
      absoluteTimeoutMs: 120_000,
    });
    const { credential } = await service.issue({
      principal: {
        kind: "registered",
        provider: "owj-web",
        webUserId: "web-1",
        chatUserId: "chat-1",
      },
      conversationId: "conversation-1",
      chatUserId: "chat-1",
      allowedActions: ["read", "send"],
    });

    await expect(
      service.authenticate(credential, { requiredAction: "send" }),
    ).resolves.toMatchObject({
      actorKind: "registered",
      webUserId: "web-1",
      conversationId: "conversation-1",
    });
    expect(validateAuthorization).toHaveBeenCalledTimes(1);
    await expectCode(
      service.authenticate(credential, { requiredAction: "admin" }),
      "SUPPORT_ACTION_DENIED",
    );
  });

  test("fails closed and revokes sessions when current authorization disappears", async () => {
    const store = memoryStore();
    const service = createSupportSessionService({
      store,
      validateAuthorization: async () => false,
      randomBytes: () => Buffer.alloc(32, 9),
      now: () => 1_700_000_000_000,
    });
    const { credential } = await service.issue({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "g-1" },
      conversationId: "conversation-1",
      chatUserId: "guest-chat-1",
      allowedActions: ["read"],
    });

    await expectCode(
      service.authenticate(credential, { requiredAction: "read" }),
      "SUPPORT_SESSION_REVOKED",
    );
    expect(store.revoke).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ revocationReason: "authorization_removed" }),
    );
  });

  test("rejects malformed, idle-expired, absolute-expired, and revoked credentials", async () => {
    let current = 1_700_000_000_000;
    const store = memoryStore();
    const service = createSupportSessionService({
      store,
      randomBytes: () => Buffer.alloc(32, 10),
      now: () => current,
      idleTimeoutMs: 1_000,
      absoluteTimeoutMs: 2_000,
    });
    const { credential } = await service.issue({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "g-1" },
      conversationId: "conversation-1",
      chatUserId: "guest-chat-1",
      allowedActions: ["read", "logout"],
    });

    await expectCode(service.authenticate("not-a-token"), "SUPPORT_SESSION_REQUIRED");
    current += 1_001;
    await expectCode(service.authenticate(credential), "SUPPORT_SESSION_EXPIRED");
    expect(store.revoke).toHaveBeenCalled();

    const second = await service.issue({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "g-2" },
      conversationId: "conversation-2",
      chatUserId: "guest-chat-2",
      allowedActions: ["read", "logout"],
    });
    await service.revoke(second.credential, "user_logout");
    await expectCode(service.authenticate(second.credential), "SUPPORT_SESSION_REVOKED");

    const third = await service.issue({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "g-3" },
      conversationId: "conversation-3",
      chatUserId: "guest-chat-3",
      allowedActions: ["read"],
    });
    current += 2_001;
    await expectCode(service.authenticate(third.credential), "SUPPORT_SESSION_EXPIRED");
  });

  test("exports stable typed errors without credential data", () => {
    expect(new SupportSessionError("SUPPORT_SESSION_REQUIRED", "Denied", 401))
      .toMatchObject({ name: "SupportSessionError", status: 401 });
  });

  test("persists the explicit support-agent scope for staff authorization", async () => {
    const store = memoryStore();
    const service = createSupportSessionService({
      store,
      randomBytes: () => Buffer.alloc(32, 11),
      now: () => 1_700_000_000_000,
    });
    const { credential } = await service.issue({
      principal: {
        kind: "agent",
        provider: "owj-web",
        webUserId: "web-agent",
        chatUserId: "chat-agent",
        scopes: ["support:agent", "support:conversation:create"],
      },
      conversationId: "support-staff-inbox",
      chatUserId: "chat-agent",
      allowedActions: ["read", "send", "staff:list"],
    });

    await expect(service.authenticate(credential, { requiredAction: "staff:list", revalidate: false }))
      .resolves.toMatchObject({ scopes: ["support:agent", "support:conversation:create"] });
  });
});
