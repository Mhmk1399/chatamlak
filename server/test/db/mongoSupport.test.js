import crypto from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { createSupportRepository } from "../../db/mongoSupport.js";

function makeHarness() {
  const rows = new Map();
  const key = (name) => {
    if (!rows.has(name)) rows.set(name, []);
    return rows.get(name);
  };
  const matches = (row, filter = {}) =>
    Object.entries(filter).every(([field, value]) => row[field] === value);
  const store = {
    transaction: (callback) => callback(),
    one: async (name, filter) => key(name).find((row) => matches(row, filter)) || null,
    many: async (name, filter = {}, options = {}) => {
      let result = key(name).filter((row) => matches(row, filter));
      if (options.sort?.created_at === -1) {
        result = result.toSorted((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
      return result.slice(0, options.limit || result.length).map((row) => ({ ...row }));
    },
    insert: async (name, value) => {
      const row = { created_at: "2026-11-20T10:00:00.000Z", ...value };
      key(name).push(row);
      return { ...row };
    },
    update: async (name, filter, patch) => {
      let count = 0;
      for (const row of key(name)) {
        if (!matches(row, filter)) continue;
        Object.assign(row, patch);
        count += 1;
      }
      return count;
    },
    remove: async (name, filter) => {
      const before = key(name).length;
      rows.set(name, key(name).filter((row) => !matches(row, filter)));
      return before - key(name).length;
    },
  };
  const chat = {
    addChatMember: vi.fn(async () => 1),
    createOrReuseMessage: vi.fn(async () => ({ id: crypto.randomUUID(), deduped: false })),
    getMessages: vi.fn(async () => ({ messages: [], hasMore: false })),
  };
  const repository = createSupportRepository(store, chat, {
    now: () => "2026-11-20T10:00:00.000Z",
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
  });
  return { repository, rows, chat };
}

describe("Mongo support repository", () => {
  test("creates a private registered support conversation without changing the Chat user id", async () => {
    const { repository, rows, chat } = makeHarness();
    const result = await repository.ensureSupportConversation({
      principal: {
        kind: "registered",
        provider: "owj-web",
        webUserId: "web-user-1",
        chatUserId: "chat-user-1",
      },
      locale: "fa-IR",
      context: { page: "/listing/public-id" },
    });

    expect(result).toMatchObject({
      conversationId: "11111111-1111-4111-8111-111111111111",
      actorId: "chat-user-1",
      created: true,
    });
    expect(rows.get("chats")[0]).toMatchObject({
      id: result.conversationId,
      type: "group",
      group_visibility: "private",
      support_managed: 1,
    });
    expect(rows.get("support_conversations")[0]).toMatchObject({
      web_user_id: "web-user-1",
      chat_user_id: "chat-user-1",
      identity_kind: "registered",
    });
    expect(chat.addChatMember).toHaveBeenCalledWith(result.conversationId, "chat-user-1", "member");
  });

  test("uses a pseudonymous guest actor and never creates a Chat account", async () => {
    const { repository, rows, chat } = makeHarness();
    const result = await repository.ensureSupportConversation({
      principal: {
        kind: "guest",
        provider: "owj-web",
        guestSubject: "web-guest-secret-subject",
      },
    });

    expect(result.actorId).toMatch(/^support-guest:[a-f0-9]{40}$/);
    expect(rows.get("support_conversations")[0]).not.toHaveProperty("guest_subject");
    expect(rows.get("support_conversations")[0].guest_subject_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(chat.addChatMember).not.toHaveBeenCalled();
  });

  test("stores only a support credential digest and revokes it independently", async () => {
    const { repository, rows } = makeHarness();
    await repository.createSupportSession({
      id: "session-1",
      tokenDigest: "sha256:abc",
      conversationId: "conversation-1",
      principalKind: "guest",
      actorId: "support-guest:abc",
      expiresAt: "2026-11-20T10:10:00.000Z",
      idleExpiresAt: "2026-11-20T10:05:00.000Z",
    });

    expect(rows.get("support_sessions")[0]).toMatchObject({ token_digest: "sha256:abc", status: "active" });
    expect(JSON.stringify(rows.get("support_sessions")[0])).not.toContain("raw-support-token");
    expect(await repository.revokeSupportSessionByDigest("sha256:abc", "logout")).toBe(1);
    expect((await repository.findSupportSessionByDigest("sha256:abc")).status).toBe("revoked");
  });

  test("delegates idempotent support messages to the existing Chat persistence path", async () => {
    const { repository, chat } = makeHarness();
    const result = await repository.createSupportMessage({
      conversationId: "conversation-1",
      actorId: "support-guest:abc",
      body: "Need help",
      clientRequestId: "request-1",
    });

    expect(result).toHaveProperty("id");
    expect(chat.createOrReuseMessage).toHaveBeenCalledWith(
      "conversation-1",
      "support-guest:abc",
      "Need help",
      null,
      null,
      "request-1",
    );
  });
});
