import { describe, expect, test, vi } from "vitest";
import { createSupportSessionStore } from "../../lib/supportSessionStore.js";

describe("support session Mongo adapter", () => {
  test("maps session fields without ever accepting a raw credential", async () => {
    const supportDb = {
      createSupportSession: vi.fn(async (record) => ({
        id: record.id,
        token_digest: record.tokenDigest,
        conversation_id: record.conversationId,
        principal_kind: record.principalKind,
        actor_id: record.actorId,
        subject: record.subject,
        allowed_actions: record.allowedActions,
        status: "active",
        created_at: "2026-11-20T10:00:00.000Z",
        last_seen_at: "2026-11-20T10:00:00.000Z",
        idle_expires_at: record.idleExpiresAt,
        expires_at: record.expiresAt,
      })),
    };
    const store = createSupportSessionStore(supportDb);
    const result = await store.insert({
      id: "session-1",
      tokenDigest: "digest-only",
      conversationId: "conversation-1",
      actorKind: "guest",
      subject: "guest-1",
      chatUserId: "support-guest:1",
      allowedActions: ["read"],
      idleExpiresAt: "2026-11-20T10:05:00.000Z",
      expiresAt: "2026-11-20T11:00:00.000Z",
    });

    expect(supportDb.createSupportSession).toHaveBeenCalledWith(expect.objectContaining({
      tokenDigest: "digest-only",
      actorId: "support-guest:1",
      allowedActions: ["read"],
      subject: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      guestSubjectDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    }));
    expect(JSON.stringify(supportDb.createSupportSession.mock.calls[0][0])).not.toContain("credential");
    expect(JSON.stringify(supportDb.createSupportSession.mock.calls[0][0])).not.toContain("guest-1");
    expect(result).toMatchObject({ actorKind: "guest", chatUserId: "support-guest:1" });
  });
});
