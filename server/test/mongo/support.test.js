import crypto from "node:crypto";
import { describe, expect, test } from "vitest";
import { R, db, alice, bob } from "./helpers.js";

describe("support persistence on a real MongoDB replica set", () => {
  test("creates one registered support conversation and preserves the historical Chat id", async () => {
    const principal = {
      kind: "registered",
      provider: "owj-web",
      webUserId: "web-alice",
      chatUserId: alice,
    };
    const first = await R.supportDb.ensureSupportConversation({ principal });
    const second = await R.supportDb.ensureSupportConversation({ principal });

    expect(second).toMatchObject({ conversationId: first.conversationId, created: false });
    expect(await db.collection("support_conversations").countDocuments()).toBe(1);
    expect(await R.isMember(first.conversationId, alice)).toBe(true);
    expect((await R.findChatById(first.conversationId)).support_managed).toBe(1);
  });

  test("isolates guest actors and deduplicates retried messages", async () => {
    const first = await R.supportDb.ensureSupportConversation({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "guest-one" },
    });
    const second = await R.supportDb.ensureSupportConversation({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "guest-two" },
    });
    expect(first.conversationId).not.toBe(second.conversationId);
    expect(first.actorId).not.toBe(second.actorId);

    const request = crypto.randomUUID();
    const created = await Promise.all([
      R.supportDb.createSupportMessage({
        conversationId: first.conversationId,
        actorId: first.actorId,
        body: "help",
        clientRequestId: request,
      }),
      R.supportDb.createSupportMessage({
        conversationId: first.conversationId,
        actorId: first.actorId,
        body: "help",
        clientRequestId: request,
      }),
    ]);
    expect(new Set(created.map((row) => row.id)).size).toBe(1);
    expect(await db.collection("chat_messages").countDocuments({ chat_id: first.conversationId })).toBe(1);

    const replay = await R.supportDb.getSupportEvents({
      conversationId: first.conversationId,
      viewerUserId: first.actorId,
    });
    expect(replay.events).toEqual([
      expect.objectContaining({
        version: 1,
        type: "chat_message",
        conversationId: first.conversationId,
        messageId: created[0].id,
        userId: first.actorId,
        actorKind: "customer",
        cursor: created[0].id,
        eventId: `message:${created[0].id}`,
        occurredAt: expect.any(String),
      }),
    ]);
    await expect(R.supportDb.getSupportEvents({
      conversationId: first.conversationId,
      viewerUserId: first.actorId,
      after: created[0].id,
    })).resolves.toMatchObject({ events: [], gap: false });
  });

  test("stores only digested support sessions and conversion is idempotent", async () => {
    const guest = await R.supportDb.ensureSupportConversation({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "guest-convert" },
    });
    const conversation = await R.supportDb.getSupportConversation(guest.conversationId);
    await R.supportDb.createSupportSession({
      tokenDigest: `sha256:${"a".repeat(64)}`,
      conversationId: guest.conversationId,
      principalKind: "guest",
      actorId: guest.actorId,
      guestSubjectDigest: conversation.guest_subject_digest,
      expiresAt: "2026-11-21T10:00:00.000Z",
      idleExpiresAt: "2026-11-20T11:00:00.000Z",
    });
    const stored = await db.collection("support_sessions").findOne({ conversation_id: guest.conversationId });
    expect(stored.token_digest).toMatch(/^sha256:/);
    expect(stored).not.toHaveProperty("credential");

    const input = {
      conversationId: guest.conversationId,
      guestSubjectDigest: conversation.guest_subject_digest,
      webUserId: "web-alice",
      chatUserId: alice,
      proofId: "conversion-proof-1",
    };
    await R.supportDb.convertGuestConversation(input);
    await expect(R.supportDb.convertGuestConversation(input)).resolves.toMatchObject({
      identity_kind: "registered",
      chat_user_id: alice,
    });
    expect(await R.isMember(guest.conversationId, alice)).toBe(true);

    await expect(R.supportDb.purgeExpiredSupportSessions({
      cutoff: "2099-01-01T00:00:00.000Z",
    })).resolves.toBe(1);
    expect(await db.collection("support_sessions").countDocuments()).toBe(0);
  });

  test("assigns a support request atomically to only one competing agent", async () => {
    const guest = await R.supportDb.ensureSupportConversation({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "guest-assignment" },
    });
    const results = await Promise.allSettled([
      R.supportDb.assignSupportConversation({
        conversationId: guest.conversationId,
        agentChatUserId: alice,
        idempotencyKey: "assign-alice",
      }),
      R.supportDb.assignSupportConversation({
        conversationId: guest.conversationId,
        agentChatUserId: bob,
        idempotencyKey: "assign-bob",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const conversation = await R.supportDb.getSupportConversation(guest.conversationId);
    expect([alice, bob]).toContain(conversation.assigned_chat_user_id);
    expect(await R.isMember(guest.conversationId, conversation.assigned_chat_user_id)).toBe(true);
    const losingAgent = conversation.assigned_chat_user_id === alice ? bob : alice;
    expect(await R.isMember(guest.conversationId, losingAgent)).toBe(false);

    const winnerKey = conversation.assigned_chat_user_id === alice
      ? "assign-alice"
      : "assign-bob";
    await expect(R.supportDb.assignSupportConversation({
      conversationId: guest.conversationId,
      agentChatUserId: conversation.assigned_chat_user_id,
      idempotencyKey: winnerKey,
    })).resolves.toMatchObject({ _deduped: true });

    await expect(R.supportDb.setSupportConversationStatus({
      conversationId: guest.conversationId,
      status: "resolved",
      agentChatUserId: conversation.assigned_chat_user_id,
      idempotencyKey: "resolve-once",
    })).resolves.toMatchObject({ status: "resolved", _deduped: false });
    await expect(R.supportDb.setSupportConversationStatus({
      conversationId: guest.conversationId,
      status: "resolved",
      agentChatUserId: conversation.assigned_chat_user_id,
      idempotencyKey: "resolve-once",
    })).resolves.toMatchObject({ status: "resolved", _deduped: true });
    await expect(R.supportDb.setSupportConversationStatus({
      conversationId: guest.conversationId,
      status: "closed",
      agentChatUserId: conversation.assigned_chat_user_id,
      idempotencyKey: "resolve-once",
    })).rejects.toMatchObject({ code: "SUPPORT_IDEMPOTENCY_CONFLICT", status: 409 });
  });
});
