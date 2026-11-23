import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerSupportRoutes } from "../../api/support.js";

const CASE_ONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE_TWO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUPPORT_CREDENTIAL = `ocs_${"B".repeat(43)}`;
const SUPPORT_COOKIE = `owj_support_v2_sid=${SUPPORT_CREDENTIAL}`;

function fixture(overrides = {}) {
  const session = {
    id: "support-session-v2",
    actorKind: "guest",
    subject: `sha256:${"a".repeat(64)}`,
    chatUserId: "support-guest-actor",
    conversationId: CASE_ONE,
    allowedActions: ["read", "send", "events", "logout"],
  };
  const deps = {
    supportSessionService: {
      authenticate: vi.fn(async (credential) => {
        if (!credential) {
          const error = new Error("A support session is required.");
          error.code = "SUPPORT_SESSION_REQUIRED";
          error.status = 401;
          throw error;
        }
        return session;
      }),
      revoke: vi.fn(),
    },
    listSupportCasesV2: vi.fn(async () => ({
      current: null,
      history: [{ conversationId: CASE_ONE, status: "resolved", unreadCount: 0 }],
    })),
    createSupportCaseV2: vi.fn(async () => ({ conversationId: CASE_TWO, status: "open", caseNumber: 2, deduped: false })),
    reopenSupportCaseV2: vi.fn(async () => ({ conversationId: CASE_ONE, status: "open", caseNumber: 1, deduped: false })),
    authorizeSupportCaseV2: vi.fn(async () => true),
    listSupportMessages: vi.fn(async () => ({ messages: [], hasMore: false })),
    markSupportCaseReadV2: vi.fn(async () => true),
    createOrReuseMessage: vi.fn(async () => ({ id: "message-v2", deduped: false })),
    listSupportEventsV2: vi.fn(async () => ({ events: [], cursor: null, hasMore: false, gap: false })),
    emitChatEvent: vi.fn(),
    supportRealtime: { publish: vi.fn() },
    getSessionFromRequest: vi.fn(async () => ({ id: "chat-user", auth_kind: "web_federated", web_subject: "507f1f77bcf86cd799439011" })),
    linkGuestHistoryV2: vi.fn(async () => ({ convertedCount: 2 })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  registerSupportRoutes(app, deps);
  return { app, deps };
}

describe("support lifecycle V2", () => {
  it("exchanges the V1 credential for a V2-scoped HttpOnly cookie", async () => {
    const { app, deps } = fixture();
    const response = await request(app)
      .post("/support/v2/session")
      .send({ supportSessionCredential: SUPPORT_CREDENTIAL })
      .expect(200);
    expect(deps.supportSessionService.authenticate).toHaveBeenCalledWith(
      SUPPORT_CREDENTIAL,
      expect.objectContaining({ requiredAction: "read" }),
    );
    expect(response.headers["set-cookie"][0]).toContain("owj_support_v2_sid=");
    expect(response.headers["set-cookie"][0]).toContain("Path=/support/v2");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  });

  it("lists current and historical cases independently", async () => {
    const { app } = fixture();
    const response = await request(app).get("/support/v2/cases").set("Cookie", SUPPORT_COOKIE).expect(200);
    expect(response.body).toMatchObject({ version: 2, current: null, history: [{ conversationId: CASE_ONE }] });
  });

  it("creates a second case and reopens a selected resolved case idempotently", async () => {
    const { app, deps } = fixture();
    await request(app).post("/support/v2/cases").set("Cookie", SUPPORT_COOKIE).set("Idempotency-Key", "case-create-12345678").send({ locale: "fa-IR" }).expect(201);
    await request(app).post(`/support/v2/cases/${CASE_ONE}/reopen`).set("Cookie", SUPPORT_COOKIE).set("Idempotency-Key", "case-reopen-12345678").send({}).expect(200);
    expect(deps.createSupportCaseV2).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "case-create-12345678" }));
    expect(deps.reopenSupportCaseV2).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CASE_ONE }));
  });

  it("keeps case messages isolated by explicit conversation authorization", async () => {
    const denied = fixture({ authorizeSupportCaseV2: vi.fn(async () => false) });
    await request(denied.app).get(`/support/v2/cases/${CASE_TWO}/messages`).set("Cookie", SUPPORT_COOKIE).expect(403);
    expect(denied.deps.listSupportMessages).not.toHaveBeenCalled();
  });

  it("links guest history only with explicit intent and both live proofs", async () => {
    const { app, deps } = fixture();
    await request(app).post("/support/v2/link-registered")
      .set("Cookie", `${SUPPORT_COOKIE}; sid=native`)
      .set("Idempotency-Key", "guest-link-12345678")
      .send({ intent: "link_guest_history" }).expect(200);
    expect(deps.linkGuestHistoryV2).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "guest-link-12345678",
      nativeSession: expect.objectContaining({ auth_kind: "web_federated" }),
    }));
    await request(app).post("/support/v2/link-registered")
      .set("Cookie", SUPPORT_COOKIE)
      .set("Idempotency-Key", "guest-link-abcdefgh").send({ intent: "silent_merge" }).expect(400);
  });
});
