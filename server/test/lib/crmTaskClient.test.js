import { describe, expect, it, vi } from "vitest";
import { createCrmTaskClient } from "../../lib/crmTaskClient.js";

describe("CRM task Web client", () => {
  it("preserves the real Web flat error code", async () => {
    const client = createCrmTaskClient({
      endpoint: "https://web.example.test/api/internal/v1/crm/tasks",
      serviceToken: "x".repeat(32),
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: "CRM_IDEMPOTENCY_KEY_REUSED",
      }), { status: 409 })),
    });

    await expect(client.createTask({
      command: { version: 1, source: { conversationId: "chat-1" }, task: { title: "Follow up" } },
      actorAuthorization: "delegated-proof",
      idempotencyKey: "chat:crm:test-0001",
    })).rejects.toMatchObject({
      code: "CRM_IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
  });

  it("enforces the Web idempotency-key maximum of 128 characters", async () => {
    const fetchImpl = vi.fn();
    const client = createCrmTaskClient({
      endpoint: "https://web.example.test/api/internal/v1/crm/tasks",
      serviceToken: "x".repeat(32),
      fetchImpl,
    });

    await expect(client.createTask({
      command: { version: 1, source: { conversationId: "chat-1" }, task: {} },
      actorAuthorization: "delegated-proof",
      idempotencyKey: `chat:${"x".repeat(124)}`,
    })).rejects.toMatchObject({ code: "CRM_IDEMPOTENCY_REQUIRED", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
