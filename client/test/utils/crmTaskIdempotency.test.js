import { describe, expect, it } from "vitest";
import {
  CRM_TASK_INTENT_STORAGE_KEY,
  clearCrmTaskIntent,
  getCrmTaskIntent,
} from "../../src/utils/crmTaskIdempotency.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("CRM task idempotency intents", () => {
  it("reuses the same key for an ambiguous retry without storing task content", async () => {
    const store = memoryStorage();
    const input = {
      conversationId: "chat-123",
      task: { type: "follow_up", title: "Private follow-up", priority: "normal" },
      store,
      now: 1_000,
    };
    const first = await getCrmTaskIntent(input);
    const retry = await getCrmTaskIntent({ ...input, now: 2_000 });

    expect(retry.key).toBe(first.key);
    expect(store.getItem(CRM_TASK_INTENT_STORAGE_KEY)).not.toContain("Private follow-up");
  });

  it("uses a new key for changed input and removes a completed intent", async () => {
    const store = memoryStorage();
    const first = await getCrmTaskIntent({
      conversationId: "chat-123", task: { title: "First" }, store, now: 1_000,
    });
    const changed = await getCrmTaskIntent({
      conversationId: "chat-123", task: { title: "Changed" }, store, now: 2_000,
    });
    expect(changed.key).not.toBe(first.key);

    clearCrmTaskIntent(first, store);
    const retried = await getCrmTaskIntent({
      conversationId: "chat-123", task: { title: "First" }, store, now: 3_000,
    });
    expect(retried.key).not.toBe(first.key);
  });
});
