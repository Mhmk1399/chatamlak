import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CHAT_ID = "22222222-2222-4222-8222-222222222222";
const DUE_AT = "2027-01-02T10:00:00.000Z";

function fixture(overrides = {}) {
  const userStore = makeUserStore([{ id: USER_ID, username: "alice", role: "user", banned: false }]);
  const getSessionFromRequest = vi.fn(async () => ({
    ...userStore.findUserById(USER_ID),
    auth_kind: "web_federated",
    web_subject: "507f1f77bcf86cd799439011",
    crm_actor_authorization: "delegated-human-proof",
  }));
  const createTask = vi.fn(async ({ command, idempotencyKey }) => ({
    version: 1,
    task: { id: "web-task-1", status: "open", dueAt: null, createdAt: "2026-11-23T08:00:00.000Z" },
    deduped: idempotencyKey === "chat:retry:12345678",
    correlationId: "correlation-1",
    command,
  }));
  const app = makeApp({
    userStore,
    deps: {
      getSessionFromRequest,
      isMember: vi.fn(async () => true),
      crmTaskClient: { createTask },
      ...overrides,
    },
  }).app;
  return { app, createTask };
}

describe("CRM task integration", () => {
  it("verifies membership and forwards no message content", async () => {
    const { app, createTask } = fixture();
    const response = await request(app)
      .post("/api/integrations/crm/tasks")
      .set("Idempotency-Key", "chat:create:12345678")
      .send({ conversationId: CHAT_ID, task: {
        title: "Follow up", type: "call", priority: "normal", dueAt: DUE_AT,
        steps: [{ title: "Call the seller", required: true }],
      } })
      .expect(201);
    expect(response.body.task.id).toBe("web-task-1");
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      command: { version: 1, source: { conversationId: CHAT_ID }, task: {
        title: "Follow up", type: "call", priority: "normal", dueAt: DUE_AT,
        steps: [{ title: "Call the seller", required: true }],
      } },
    }));
    expect(JSON.stringify(createTask.mock.calls[0][0])).not.toContain("messageBody");
  });

  it("reuses the caller idempotency key for safe retry", async () => {
    const { app } = fixture();
    const payload = { conversationId: CHAT_ID, task: {
      title: "Follow up", type: "call", dueAt: DUE_AT,
      steps: [{ title: "Call the seller", required: true }],
    } };
    await request(app).post("/api/integrations/crm/tasks").set("Idempotency-Key", "chat:retry:12345678").send(payload).expect(200);
    await request(app).post("/api/integrations/crm/tasks").set("Idempotency-Key", "chat:retry:12345678").send(payload).expect(200);
  });

  it("rejects local sessions and non-members", async () => {
    const local = fixture({ getSessionFromRequest: async () => ({ id: USER_ID, auth_kind: "native_local" }) });
    await request(local.app).post("/api/integrations/crm/tasks").set("Idempotency-Key", "chat:create:12345678")
      .send({ conversationId: CHAT_ID, task: { title: "Follow up" } }).expect(403);
    const denied = fixture({ isMember: async () => false });
    await request(denied.app).post("/api/integrations/crm/tasks").set("Idempotency-Key", "chat:create:12345678")
      .send({ conversationId: CHAT_ID, task: { title: "Follow up" } }).expect(403);
  });
});
