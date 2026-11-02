import { describe, expect, test } from "vitest";
import { readChatDraft, saveChatDraft, clearChatDraft } from "../../src/utils/chatDrafts.js";

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};
describe("chat drafts", () => {
  test("restores text and reply independently for each account and chat", () => {
    const storage = memoryStorage();
    saveChatDraft("Alice", "chat-a", "سلام", { id: "reply-a" }, storage);
    saveChatDraft("alice", "chat-b", "second", null, storage);
    expect(readChatDraft("alice", "chat-a", storage)).toMatchObject({ body: "سلام", replyTo: { id: "reply-a" } });
    expect(readChatDraft("alice", "chat-b", storage).body).toBe("second");
    expect(readChatDraft("bob", "chat-a", storage)).toBeNull();
    clearChatDraft("alice", "chat-a", storage);
    expect(readChatDraft("alice", "chat-a", storage)).toBeNull();
    expect(readChatDraft("alice", "chat-b", storage).body).toBe("second");
  });
  test("handles corrupted and unavailable storage without losing composer input", () => {
    const storage = { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("quota"); } };
    expect(readChatDraft("alice", "chat", storage)).toBeNull();
    expect(saveChatDraft("alice", "chat", "keep this", null, storage)).toBe(false);
  });
});
