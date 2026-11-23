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
      bootstrapJti: "guest-persisted-jti-1",
      identityIssuedAt: 1_795_171_600,
      expiresAt: "2026-11-21T10:00:00.000Z",
      idleExpiresAt: "2026-11-20T11:00:00.000Z",
    });
    const stored = await db.collection("support_sessions").findOne({ conversation_id: guest.conversationId });
    expect(stored.token_digest).toMatch(/^sha256:/);
    expect(stored).toMatchObject({
      bootstrap_jti: "guest-persisted-jti-1",
      identity_issued_at: 1_795_171_600,
    });
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

  test("keeps independent V2 cases with controlled reopen and history", async () => {
    const principal = { kind: "registered", provider: "owj-web", webUserId: "web-cases", chatUserId: alice };
    const first = await R.supportDb.ensureSupportConversation({ principal });
    const firstRow = await R.supportDb.getSupportConversation(first.conversationId);
    const ownerIdentityKey = firstRow.identity_key;
    await expect(R.supportDb.createSupportCase({
      ownerIdentityKey, identityKind: "registered", actorId: alice,
      webUserId: "web-cases", chatUserId: alice, idempotencyKey: "second-case",
    })).rejects.toMatchObject({ code: "SUPPORT_ACTIVE_CASE_EXISTS" });
    await R.supportDb.assignSupportConversation({ conversationId: first.conversationId, agentChatUserId: bob, idempotencyKey: "assign-first" });
    await R.supportDb.setSupportConversationStatus({ conversationId: first.conversationId, status: "resolved", agentChatUserId: bob, idempotencyKey: "resolve-first" });
    const second = await R.supportDb.createSupportCase({
      ownerIdentityKey, identityKind: "registered", actorId: alice,
      webUserId: "web-cases", chatUserId: alice, idempotencyKey: "second-case",
    });
    await expect(R.supportDb.createSupportCase({
      ownerIdentityKey, identityKind: "registered", actorId: alice,
      webUserId: "web-cases", chatUserId: alice, idempotencyKey: "second-case",
    })).resolves.toMatchObject({ id: second.id, _deduped: true });
    expect(await R.supportDb.listSupportCases({ ownerIdentityKey, actorId: alice })).toHaveLength(2);
    await expect(R.supportDb.reopenSupportCase({
      ownerIdentityKey, conversationId: first.conversationId, actorId: alice, idempotencyKey: "reopen-first",
    })).rejects.toMatchObject({ code: "SUPPORT_ACTIVE_CASE_EXISTS" });
  });

  test("converts guest history into a resumable registered primary case idempotently", async () => {
    const guest = await R.supportDb.ensureSupportConversation({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "guest-primary-link" },
    });
    const before = await R.supportDb.getSupportConversation(guest.conversationId);
    const input = {
      guestSubjectDigest: before.guest_subject_digest,
      webUserId: "web-primary-link",
      chatUserId: alice,
      proofId: "guest-primary-proof",
    };
    await expect(R.supportDb.convertGuestHistory(input)).resolves.toMatchObject({
      convertedCount: 1,
      deduped: false,
    });
    await expect(R.supportDb.convertGuestHistory(input)).resolves.toMatchObject({
      convertedCount: 1,
      deduped: true,
    });

    const converted = await R.supportDb.getSupportConversation(guest.conversationId);
    expect(converted).toMatchObject({
      identity_kind: "registered",
      chat_user_id: alice,
      conversion_from_guest_actor_id: guest.actorId,
      conversion_from_guest_case_number: 1,
      case_number: 1,
    });
    expect(converted.identity_key).toMatch(/^registered:sha256:/);
    const resumed = await R.supportDb.ensureSupportConversation({
      principal: {
        kind: "registered",
        provider: "owj-web",
        webUserId: "web-primary-link",
        chatUserId: alice,
      },
    });
    expect(resumed).toMatchObject({
      conversationId: guest.conversationId,
      actorId: alice,
      created: false,
    });
  });

  test("treats preserved guest authorship as the registered customer's own history", async () => {
    const guest = await R.supportDb.ensureSupportConversation({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "guest-linked-history" },
    });
    await R.supportDb.createSupportMessage({
      conversationId: guest.conversationId,
      actorId: guest.actorId,
      body: "Before sign-in",
      clientRequestId: crypto.randomUUID(),
    });
    const before = await R.supportDb.getSupportConversation(guest.conversationId);
    await R.supportDb.convertGuestHistory({
      guestSubjectDigest: before.guest_subject_digest,
      webUserId: "web-linked-history",
      chatUserId: alice,
      proofId: "guest-linked-history-proof",
    });
    const converted = await R.supportDb.getSupportConversation(guest.conversationId);

    await expect(R.supportDb.listSupportCases({
      ownerIdentityKey: converted.owner_identity_key,
      actorId: alice,
    })).resolves.toEqual([
      expect.objectContaining({ id: guest.conversationId, unread_count: 0 }),
    ]);

    await R.supportDb.createSupportMessage({
      conversationId: guest.conversationId,
      actorId: bob,
      body: "Agent reply",
      clientRequestId: crypto.randomUUID(),
    });
    await expect(R.supportDb.listSupportCases({
      ownerIdentityKey: converted.owner_identity_key,
      actorId: alice,
    })).resolves.toEqual([
      expect.objectContaining({ id: guest.conversationId, unread_count: 1 }),
    ]);
    await R.supportDb.markSupportCaseRead(guest.conversationId, alice);
    await expect(R.supportDb.listSupportCases({
      ownerIdentityKey: converted.owner_identity_key,
      actorId: alice,
    })).resolves.toEqual([
      expect.objectContaining({ id: guest.conversationId, unread_count: 0 }),
    ]);

    await R.supportDb.assignSupportConversation({
      conversationId: guest.conversationId,
      agentChatUserId: bob,
      idempotencyKey: "assign-linked-history",
    });
    await R.supportDb.setSupportConversationStatus({
      conversationId: guest.conversationId,
      status: "resolved",
      agentChatUserId: bob,
      idempotencyKey: "resolve-linked-history",
    });
    await expect(R.supportDb.reopenSupportCase({
      ownerIdentityKey: converted.owner_identity_key,
      conversationId: guest.conversationId,
      actorId: alice,
      idempotencyKey: "reopen-linked-history",
    })).resolves.toMatchObject({ status: "open", _deduped: false });
  });

  test("handles existing registered history and rejects two active cases during guest linking", async () => {
    const registered = await R.supportDb.ensureSupportConversation({
      principal: { kind: "registered", provider: "owj-web", webUserId: "web-existing", chatUserId: alice },
    });
    const guest = await R.supportDb.ensureSupportConversation({
      principal: { kind: "guest", provider: "owj-web", guestSubject: "guest-existing" },
    });
    const guestRow = await R.supportDb.getSupportConversation(guest.conversationId);
    const conversion = {
      guestSubjectDigest: guestRow.guest_subject_digest,
      webUserId: "web-existing",
      chatUserId: alice,
      proofId: "guest-existing-proof",
    };
    await expect(R.supportDb.convertGuestHistory(conversion)).rejects.toMatchObject({
      code: "SUPPORT_GUEST_LINK_ACTIVE_CONFLICT",
      status: 409,
    });

    await R.supportDb.assignSupportConversation({
      conversationId: guest.conversationId,
      agentChatUserId: bob,
      idempotencyKey: "assign-guest-existing",
    });
    await R.supportDb.setSupportConversationStatus({
      conversationId: guest.conversationId,
      status: "resolved",
      agentChatUserId: bob,
      idempotencyKey: "resolve-guest-existing",
    });
    await expect(R.supportDb.convertGuestHistory(conversion)).resolves.toMatchObject({
      convertedCount: 1,
      deduped: false,
    });
    const registeredRow = await R.supportDb.getSupportConversation(registered.conversationId);
    const converted = await R.supportDb.getSupportConversation(guest.conversationId);
    expect(converted).toMatchObject({
      owner_identity_key: registeredRow.identity_key,
      identity_kind: "registered",
      case_number: 2,
      conversion_from_guest_case_number: 1,
    });
    expect(await R.supportDb.listSupportCases({
      ownerIdentityKey: registeredRow.identity_key,
      actorId: alice,
    })).toHaveLength(2);
  });
});
