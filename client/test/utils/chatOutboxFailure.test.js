import { describe, expect, test, vi } from "vitest";
const storage = vi.hoisted(() => ({ set: vi.fn(async () => null), remove: vi.fn(async () => null) }));
vi.mock("../../src/utils/cacheDb.js", () => ({ CACHE_STORES: { outbox: "outbox" }, idbSet: storage.set, idbDelete: storage.remove, idbGetAllEntries: vi.fn() }));
import { saveOutboxMessage, removeOutboxMessage } from "../../src/utils/chatOutbox.js";

describe("outbox storage failures", () => {
  test("rejects acceptance when the durable write fails", async () => {
    await expect(saveOutboxMessage("alice", { _clientId: "request", _chatId: "chat", body: "Keep me" })).rejects.toThrow("Unable to save this message");
  });
  test("rejects removal when the durable deletion fails", async () => {
    await expect(removeOutboxMessage("alice", "request")).rejects.toThrow("Unable to remove this queued message");
  });
});
