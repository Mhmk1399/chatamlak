import { describe, expect, test, vi } from "vitest";
import { createSseHub } from "../../lib/sse.js";

describe("SSE membership cache invalidation", () => {
  test("stops routing events to a removed member immediately", () => {
    const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let members = [{ username: "alice" }, { username: "bob" }];
    const hub = createSseHub({ listChatMembers: vi.fn(() => members) });
    const alice = { write: vi.fn() };
    const bob = { write: vi.fn() };
    hub.addSseClient("alice", alice);
    hub.addSseClient("bob", bob);

    hub.emitChatEvent(chatId, { type: "chat_message", chatId });
    members = [{ username: "alice" }];
    hub.emitChatEvent(chatId, { type: "chat_updated", chatId });

    expect(alice.write).toHaveBeenCalledTimes(2);
    expect(bob.write).toHaveBeenCalledTimes(1);
  });
});
