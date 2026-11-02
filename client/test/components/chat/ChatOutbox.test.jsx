import { afterEach, describe, expect, test } from "vitest";
import { readOutboxMessages, removeOutboxMessage, saveOutboxMessage } from "../../../src/utils/chatOutbox.js";
import { CACHE_STORES, idbClearStore } from "../../../src/utils/cacheDb.js";

afterEach(() => idbClearStore(CACHE_STORES.outbox));
describe("durable outbox in the browser", () => {
  test("keeps the request identity, reply and file bytes across restoration", async () => {
    const file = new File(["voice bytes"], "voice.webm", { type: "audio/webm" });
    await saveOutboxMessage("Alice", { _clientId: "request-a", _chatId: "chat-a", _queuedAt: 1,
      body: "caption", _delivery: "sending", replyTo: { id: "reply-a" },
      _files: [{ file, name: file.name, mimeType: file.type, url: "blob:expired-document" }],
    });
    const restored = await readOutboxMessages("alice", "chat-a");
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ _clientId: "request-a", body: "caption", replyTo: { id: "reply-a" } });
    expect(await restored[0]._files[0].file.text()).toBe("voice bytes");
    expect(restored[0]._files[0].url).toMatch(/^blob:/);
    expect(restored[0]._files[0].url).not.toBe("blob:expired-document");
    URL.revokeObjectURL(restored[0]._files[0].url);
    expect(await readOutboxMessages("bob", "chat-a")).toEqual([]);
    expect(await readOutboxMessages("alice", "chat-b")).toEqual([]);
    await removeOutboxMessage("alice", "request-a");
    expect(await readOutboxMessages("alice", "chat-a")).toEqual([]);
  });
  test("history-cache eviction does not delete pending work", async () => {
    await saveOutboxMessage("alice", { _clientId: "pending", _chatId: "chat", _queuedAt: 1, _files: [], body: "offline" });
    await idbClearStore(CACHE_STORES.messages);
    expect((await readOutboxMessages("alice", "chat"))[0].body).toBe("offline");
  });
});
