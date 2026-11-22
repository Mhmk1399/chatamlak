import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";
import { registerSupportRoutes } from "../../api/support.js";

const CONVERSATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAT_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MESSAGE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function fixture(overrides = {}) {
  const session = {
    id: "support-session-1",
    actorKind: "guest",
    subject: "guest-1",
    chatUserId: CHAT_USER_ID,
    conversationId: CONVERSATION_ID,
    allowedActions: ["read", "send", "logout"],
    status: "active",
    expiresAt: "2026-11-21T10:00:00.000Z",
  };
  const supportSessionService = {
    authenticate: vi.fn(async () => session),
    issue: vi.fn(async () => ({
      credential: `ocs_${"A".repeat(43)}`,
      session,
      expiresAt: session.expiresAt,
    })),
    revoke: vi.fn(async () => true),
  };
  const deps = {
    verifyWebServiceRequest: vi.fn(async () => ({ service: "owj-web" })),
    platformIdentityAdapter: {
      authenticate: vi.fn(async () => ({
        kind: "guest",
        provider: "owj-web",
        guestSubject: "guest-1",
        scopes: ["support:conversation:create"],
        issuedAt: 1_795_171_195_000,
        jti: "guest-bootstrap-jti-1",
      })),
    },
    createOrResumeSupportConversation: vi.fn(async () => ({
      conversationId: CONVERSATION_ID,
      chatUserId: CHAT_USER_ID,
      created: true,
      assigned: false,
      supportAvailable: true,
    })),
    supportSessionService,
    listSupportMessages: vi.fn(async () => ({
      messages: [
        {
          id: MESSAGE_ID,
          chat_id: CONVERSATION_ID,
          user_id: CHAT_USER_ID,
          body: "hello",
          created_at: "2026-11-20T10:00:00.000Z",
        },
      ],
      hasMore: false,
    })),
    createOrReuseMessage: vi.fn(async () => ({ id: MESSAGE_ID, deduped: false })),
    authorizeSupportConversation: vi.fn(async () => true),
    emitChatEvent: vi.fn(),
    supportRealtime: { publish: vi.fn() },
    ...overrides,
  };
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  registerSupportRoutes(app, deps);
  return { app, deps, session };
}

describe("support API v1", () => {
  test("bootstraps only an authenticated Web service and returns an opaque credential", async () => {
    const { app, deps } = fixture();
    const response = await request(app)
      .post("/internal/v1/support/bootstrap")
      .set("Idempotency-Key", "web-bootstrap-1")
      .send({ assertion: "signed-web-assertion", locale: "fa-IR" });

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({
      version: 1,
      conversationId: CONVERSATION_ID,
      supportSessionCredential: `ocs_${"A".repeat(43)}`,
      expiresAt: "2026-11-21T10:00:00.000Z",
      created: true,
      assigned: false,
      supportAvailable: true,
    });
    expect(deps.platformIdentityAdapter.authenticate).toHaveBeenCalledWith({
      credential: "signed-web-assertion",
      requiredScopes: ["support:conversation:create"],
      allowGuest: true,
      allowedTokenUses: ["support_registered", "support_guest"],
    });
    expect(deps.createOrResumeSupportConversation).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "web-bootstrap-1" }),
    );
    expect(deps.supportSessionService.issue).toHaveBeenCalledWith(expect.objectContaining({
      bootstrapJti: "guest-bootstrap-jti-1",
      principal: expect.objectContaining({
        issuedAt: 1_795_171_195_000,
        jti: "guest-bootstrap-jti-1",
      }),
    }));
  });

  test("recovers an ambiguous bootstrap with a fresh assertion and credential for the same conversation", async () => {
    const principals = ["fresh-jti-1", "fresh-jti-2"].map((jti) => ({
      kind: "guest",
      provider: "owj-web",
      guestSubject: "guest-recovery",
      scopes: ["support:conversation:create"],
      issuedAt: 1_795_171_195_000,
      jti,
    }));
    const platformIdentityAdapter = {
      authenticate: vi.fn()
        .mockResolvedValueOnce(principals[0])
        .mockResolvedValueOnce(principals[1]),
    };
    const createOrResumeSupportConversation = vi.fn()
      .mockResolvedValueOnce({
        conversationId: CONVERSATION_ID,
        chatUserId: CHAT_USER_ID,
        created: true,
        assigned: false,
        supportAvailable: true,
      })
      .mockResolvedValueOnce({
        conversationId: CONVERSATION_ID,
        chatUserId: CHAT_USER_ID,
        created: false,
        assigned: false,
        supportAvailable: true,
      });
    const setup = fixture({ platformIdentityAdapter, createOrResumeSupportConversation });
    setup.deps.supportSessionService.issue
      .mockResolvedValueOnce({
        credential: `ocs_${"C".repeat(43)}`,
        expiresAt: "2026-11-21T10:00:00.000Z",
      })
      .mockResolvedValueOnce({
        credential: `ocs_${"D".repeat(43)}`,
        expiresAt: "2026-11-21T10:00:00.000Z",
      });

    const first = await request(setup.app)
      .post("/internal/v1/support/bootstrap")
      .set("Idempotency-Key", "logical-bootstrap-1")
      .send({ assertion: "fresh-assertion-1" });
    const recovered = await request(setup.app)
      .post("/internal/v1/support/bootstrap")
      .set("Idempotency-Key", "logical-bootstrap-1")
      .send({ assertion: "fresh-assertion-2" });

    expect(first.status).toBe(201);
    expect(recovered.status).toBe(200);
    expect(recovered.body.conversationId).toBe(first.body.conversationId);
    expect(recovered.body.supportSessionCredential)
      .not.toBe(first.body.supportSessionCredential);
    expect(platformIdentityAdapter.authenticate.mock.calls.map(([input]) => input.credential))
      .toEqual(["fresh-assertion-1", "fresh-assertion-2"]);
    expect(setup.deps.supportSessionService.issue.mock.calls.map(([input]) => input.bootstrapJti))
      .toEqual(["fresh-jti-1", "fresh-jti-2"]);
  });

  test("fails closed when the internal service credential verifier is absent or denies", async () => {
    const missing = fixture({ verifyWebServiceRequest: undefined });
    const missingResponse = await request(missing.app)
      .post("/internal/v1/support/bootstrap")
      .send({ assertion: "assertion" });
    expect(missingResponse.status).toBe(503);
    expect(missingResponse.body.error.code).toBe("SUPPORT_PROVIDER_UNAVAILABLE");

    const denied = fixture({ verifyWebServiceRequest: vi.fn(async () => null) });
    const deniedResponse = await request(denied.app)
      .post("/internal/v1/support/bootstrap")
      .send({ assertion: "assertion" });
    expect(deniedResponse.status).toBe(401);
    expect(deniedResponse.body.error.code).toBe("SUPPORT_SERVICE_UNAUTHORIZED");
  });

  test("returns only the minimal session envelope for the cookie-bound conversation", async () => {
    const { app } = fixture();
    const response = await request(app)
      .get("/support/v1/session")
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      version: 1,
      conversationId: CONVERSATION_ID,
      status: "active",
      identityKind: "guest",
      allowedActions: ["read", "send", "logout"],
      expiresAt: "2026-11-21T10:00:00.000Z",
      supportAvailable: true,
    });
    expect(response.body).not.toHaveProperty("chatUserId");
    expect(response.body).not.toHaveProperty("subject");
  });

  test("uses bounded cursor pagination without accepting an arbitrary conversation", async () => {
    const { app, deps } = fixture();
    const cursor = Buffer.from(JSON.stringify({
      id: MESSAGE_ID,
      createdAt: "2026-11-20T10:00:00.000Z",
    })).toString("base64url");
    const response = await request(app)
      .get(`/support/v1/messages?limit=500&conversationId=attacker-choice&cursor=${cursor}`)
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`);

    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(response.body.conversationId).toBe(CONVERSATION_ID);
    expect(response.body.messages).toHaveLength(1);
    expect(deps.listSupportMessages).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ limit: 100, viewerChatUserId: CHAT_USER_ID }),
    );
  });

  test("persists an idempotent bounded message under the session actor", async () => {
    const { app, deps } = fixture();
    const response = await request(app)
      .post("/support/v1/messages")
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`)
      .send({ body: "Need help", clientRequestId: "widget-request-1" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      version: 1,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      deduped: false,
    });
    expect(deps.createOrReuseMessage).toHaveBeenCalledWith(
      CONVERSATION_ID,
      CHAT_USER_ID,
      "Need help",
      null,
      null,
      "widget-request-1",
    );
    expect(deps.emitChatEvent).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ type: "chat_message", messageId: MESSAGE_ID }),
      { record: false },
    );
  });

  test.each(["guest", "registered"])(
    "normalizes a %s live message notification to the customer actor kind",
    async (actorKind) => {
      const setup = fixture();
      setup.session.actorKind = actorKind;

      const response = await request(setup.app)
        .post("/support/v1/messages")
        .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`)
        .send({ body: "Need help", clientRequestId: `widget-${actorKind}-1` });

      expect(response.status).toBe(201);
      expect(setup.deps.emitChatEvent).toHaveBeenCalledWith(
        CONVERSATION_ID,
        expect.objectContaining({ actorKind: "customer" }),
        { record: false },
      );
      expect(setup.deps.supportRealtime.publish).toHaveBeenCalledWith(
        CONVERSATION_ID,
        expect.objectContaining({ actorKind: "customer" }),
      );
    },
  );

  test("rejects reuse of a message idempotency key with a different body", async () => {
    const { app } = fixture({
      createOrReuseMessage: vi.fn(async () => ({
        id: MESSAGE_ID,
        deduped: true,
        conflict: true,
      })),
    });
    const response = await request(app)
      .post("/support/v1/messages")
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`)
      .send({ body: "Different retry body", clientRequestId: "widget-request-1" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("SUPPORT_IDEMPOTENCY_CONFLICT");
  });

  test("returns the existing acknowledgement without rebroadcasting an exact message retry", async () => {
    const setup = fixture({
      createOrReuseMessage: vi.fn(async () => ({ id: MESSAGE_ID, deduped: true })),
    });
    const response = await request(setup.app)
      .post("/support/v1/messages")
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`)
      .send({ body: "Need help", clientRequestId: "widget-request-1" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ messageId: MESSAGE_ID, deduped: true });
    expect(setup.deps.emitChatEvent).not.toHaveBeenCalled();
  });

  test("advances older-message pagination from the oldest row in the returned page", async () => {
    const olderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const newerId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const { app } = fixture({
      listSupportMessages: vi.fn(async () => ({
        messages: [
          { id: olderId, user_id: CHAT_USER_ID, body: "older", created_at: "2026-11-20T09:00:00.000Z" },
          { id: newerId, user_id: CHAT_USER_ID, body: "newer", created_at: "2026-11-20T10:00:00.000Z" },
        ],
        hasMore: true,
      })),
    });
    const response = await request(app)
      .get("/support/v1/messages?limit=2")
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`);

    expect(response.status).toBe(200);
    const decoded = JSON.parse(Buffer.from(response.body.nextCursor, "base64url").toString("utf8"));
    expect(decoded).toEqual({ id: olderId, createdAt: "2026-11-20T09:00:00.000Z" });
  });

  test("rejects missing idempotency, oversized bodies, and unavailable actor bindings", async () => {
    const { app } = fixture();
    const cookie = `owj_support_sid=ocs_${"B".repeat(43)}`;
    const missing = await request(app)
      .post("/support/v1/messages")
      .set("Cookie", cookie)
      .send({ body: "hello" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("SUPPORT_REQUEST_INVALID");

    const oversized = await request(app)
      .post("/support/v1/messages")
      .set("Cookie", cookie)
      .send({ body: "x".repeat(4001), clientRequestId: "request-2" });
    expect(oversized.status).toBe(400);

    const unbound = fixture();
    unbound.deps.supportSessionService.authenticate.mockResolvedValue({
      ...unbound.session,
      chatUserId: null,
    });
    const unavailable = await request(unbound.app)
      .post("/support/v1/messages")
      .set("Cookie", cookie)
      .send({ body: "hello", clientRequestId: "request-3" });
    expect(unavailable.status).toBe(403);
    expect(unavailable.body.error.code).toBe("SUPPORT_CONVERSATION_DENIED");
  });

  test("revokes logout and clears only the support cookie", async () => {
    const { app, deps } = fixture();
    const credential = `ocs_${"B".repeat(43)}`;
    const response = await request(app)
      .post("/support/v1/logout")
      .set("Cookie", `sid=legacy; owj_support_sid=${credential}`);

    expect(response.status).toBe(200);
    expect(deps.supportSessionService.revoke).toHaveBeenCalledWith(
      credential,
      "user_logout",
    );
    expect(response.headers["set-cookie"][0]).toContain("owj_support_sid=");
    expect(response.headers["set-cookie"][0]).toContain("Max-Age=0");
  });

  test("still revokes locally and clears the cookie while Web status is unavailable", async () => {
    const setup = fixture();
    setup.deps.supportSessionService.authenticate.mockRejectedValue(
      Object.assign(new Error("Web unavailable"), { code: "SUPPORT_PROVIDER_UNAVAILABLE" }),
    );
    const response = await request(setup.app)
      .post("/support/v1/logout")
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`);

    expect(response.status).toBe(200);
    expect(setup.deps.supportSessionService.revoke).toHaveBeenCalled();
    expect(response.headers["set-cookie"][0]).toContain("Max-Age=0");
  });

  test("returns the upgrade contract for a non-WebSocket GET", async () => {
    const { app } = fixture();
    const response = await request(app).get("/support/v1/ws");
    expect(response.status).toBe(426);
    expect(response.headers.upgrade).toBe("websocket");
  });

  test("never grants staff workflow access to an ordinary support customer", async () => {
    const { app } = fixture({
      listSupportConversationsForAgent: vi.fn(async () => ({ conversations: [] })),
    });
    const response = await request(app)
      .get("/support/v1/staff/conversations")
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("SUPPORT_AGENT_REQUIRED");
  });

  test("provides the bounded assigned/available, reply, assignment, and resolution workflow to scoped agents", async () => {
    const listSupportConversationsForAgent = vi.fn(async () => ({
      conversations: [{ id: CONVERSATION_ID, status: "open", assigned: false }],
      nextCursor: null,
    }));
    const authorizeSupportAgentConversation = vi.fn(async () => true);
    const assignSupportConversation = vi.fn(async () => ({
      conversationId: CONVERSATION_ID,
      status: "open",
      assigned: true,
    }));
    const resolveSupportConversation = vi.fn(async () => ({
      conversationId: CONVERSATION_ID,
      status: "resolved",
    }));
    const setup = fixture({
      listSupportConversationsForAgent,
      authorizeSupportAgentConversation,
      assignSupportConversation,
      resolveSupportConversation,
    });
    Object.assign(setup.session, {
      actorKind: "agent",
      scopes: ["support:agent"],
      allowedActions: [
        "read",
        "send",
        "events",
        "logout",
        "staff:list",
        "staff:assign",
        "staff:resolve",
      ],
    });
    const cookie = `owj_support_sid=ocs_${"B".repeat(43)}`;

    const list = await request(setup.app)
      .get("/support/v1/staff/conversations?status=available&limit=500")
      .set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.conversations).toHaveLength(1);
    expect(listSupportConversationsForAgent).toHaveBeenCalledWith(
      setup.session,
      expect.objectContaining({ status: "available", limit: 100 }),
    );

    const reply = await request(setup.app)
      .post(`/support/v1/staff/conversations/${CONVERSATION_ID}/reply`)
      .set("Cookie", cookie)
      .send({ body: "How can I help?", clientRequestId: "agent-reply-1" });
    expect(reply.status).toBe(201);
    expect(authorizeSupportAgentConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID, operation: "reply" }),
    );

    const assigned = await request(setup.app)
      .post(`/support/v1/staff/conversations/${CONVERSATION_ID}/assign`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", "assign-1")
      .send({});
    expect(assigned.status).toBe(200);
    expect(assignSupportConversation).toHaveBeenCalled();

    const resolved = await request(setup.app)
      .post(`/support/v1/staff/conversations/${CONVERSATION_ID}/resolve`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", "resolve-1")
      .send({ resolution: "resolved" });
    expect(resolved.status).toBe(200);
    expect(resolveSupportConversation).toHaveBeenCalled();
  });

  test("normalizes staff detail messages without exposing internal Chat fields", async () => {
    const setup = fixture({
      authorizeSupportAgentConversation: vi.fn(async () => true),
      getSupportConversationForAgent: vi.fn(async () => ({
        conversationId: CONVERSATION_ID,
        status: "assigned",
        assigned: true,
        assignedToCurrentAgent: true,
        identityKind: "guest",
        internalIdentityKey: "must-not-leak",
        messages: [{
          id: MESSAGE_ID,
          body: "customer text",
          authorKind: "customer",
          createdAt: "2026-11-20T10:00:00.000Z",
          storage_key: "private/storage/key",
        }],
        hasMore: false,
      })),
    });
    Object.assign(setup.session, {
      actorKind: "agent",
      scopes: ["support:agent"],
      allowedActions: ["staff:list"],
    });
    const response = await request(setup.app)
      .get(`/support/v1/staff/conversations/${CONVERSATION_ID}`)
      .set("Cookie", `owj_support_sid=ocs_${"B".repeat(43)}`);

    expect(response.status).toBe(200);
    expect(response.body.conversation.messages).toEqual([
      expect.objectContaining({ id: MESSAGE_ID, authorKind: "customer" }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain("must-not-leak");
    expect(JSON.stringify(response.body)).not.toContain("private/storage/key");
  });
});
