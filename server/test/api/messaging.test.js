import { beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CHAT = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
const PEER = "55555555-5555-4555-8555-555555555555";
const TARGET = "66666666-6666-4666-8666-666666666666";

describe("messaging tools API boundaries", () => {
  let app, db, deps;
  beforeEach(() => {
    db = {
      preferences: vi.fn(async () => []), setPreference: vi.fn(async (_user, _chat, patch) => patch),
      messageExtras: vi.fn(async () => ({ reactions: [], pins: [], polls: [], topics: [], messageTopics: [] })),
      policy: vi.fn(async () => ({ slow_seconds: 0, members_can_send: 1, members_can_upload: 1 })),
      dueSchedules: vi.fn(async () => []), recordDevice: vi.fn(),
      react: vi.fn(), pin: vi.fn(), schedule: vi.fn(async () => ({ id: MESSAGE })),
      search: vi.fn(async () => ({ messages: [], nextCursor: null })), sync: vi.fn(async () => ({ events: [], cursor: 0, hasMore: false })),
      poll: vi.fn(async () => ({ id: MESSAGE, chat_id: CHAT, message_id: MESSAGE, user_id: USER, closed: 0 })),
      pollOptionCount: vi.fn(async () => 2), vote: vi.fn(), createPoll: vi.fn(),
      devices: vi.fn(async () => []), deviceToken: vi.fn(async () => null),
      groupPeers: vi.fn(async () => []), joinGroupCall: vi.fn(async () => ({ id: PEER })),
      groupPeer: vi.fn(async (id) => ({ id, user_id: id === PEER ? USER : OTHER, chat_id: CHAT })),
      touchGroupPeer: vi.fn(), leaveGroupCall: vi.fn(),
    };
    deps = {
      messagingDb: db, isMember: vi.fn(async () => true),
      findChatById: vi.fn(async () => ({ id: CHAT, type: "group" })),
      getChatMemberRole: vi.fn(async () => "member"),
      findMessageById: vi.fn(async () => ({ id: MESSAGE, user_id: USER, chat_id: CHAT })),
      emitChatEvent: vi.fn(), emitSseEvent: vi.fn(),
    };
    const fixture = makeApp({ userStore: makeUserStore([{ id: USER, username: "alice" }, { id: OTHER, username: "bob" }]), deps });
    fixture.sessionStore.createSession(USER, "session-a");
    app = fixture.app;
  });
  const authenticated = (operation) => operation.set("Cookie", "sid=session-a");
  test("requires authentication before querying search or session data", async () => {
    expect((await request(app).get("/api/messaging/search?q=secret")).status).toBe(401);
    expect((await request(app).get("/api/messaging/devices")).status).toBe(401);
    expect(db.search).not.toHaveBeenCalled();
    expect(db.devices).not.toHaveBeenCalled();
  });
  test("prevents reading another chat's tools", async () => {
    deps.isMember.mockResolvedValue(false);
    expect((await authenticated(request(app).get(`/api/messaging/chats/${CHAT}`))).status).toBe(403);
    expect(db.messageExtras).not.toHaveBeenCalled();
  });
  test("scopes preferences to the authenticated account and emits an invalidation", async () => {
    const response = await authenticated(request(app).put(`/api/messaging/chats/${CHAT}/preference`)).send({ userId: OTHER, pinned: true, folder: "Work" });
    expect(response.status).toBe(200);
    expect(db.setPreference).toHaveBeenCalledWith(USER, CHAT, { pinned: 1, folder: "Work" });
    expect(deps.emitChatEvent).toHaveBeenCalledWith(CHAT, { type: "chat_tools_updated", chatId: CHAT });
  });
  test("rejects malformed preference types", async () => {
    expect((await authenticated(request(app).put(`/api/messaging/chats/${CHAT}/preference`)).send({ archived: "false" })).status).toBe(400);
    expect(db.setPreference).not.toHaveBeenCalled();
  });
  test("rejects reactions to messages from another chat", async () => {
    deps.findMessageById.mockResolvedValue({ id: MESSAGE, chat_id: TARGET });
    expect((await authenticated(request(app).put(`/api/messaging/chats/${CHAT}/reaction`)).send({ messageId: MESSAGE, emoji: "❤️", active: true })).status).toBe(404);
    expect(db.react).not.toHaveBeenCalled();
  });
  test("persists reaction ownership from the session", async () => {
    const response = await authenticated(request(app).put(`/api/messaging/chats/${CHAT}/reaction`)).send({ messageId: MESSAGE, userId: OTHER, emoji: "❤️", active: true });
    expect(response.status).toBe(200);
    expect(db.react).toHaveBeenCalledWith(MESSAGE, USER, "❤️", true);
  });
  test("requires group management permission for pinning", async () => {
    expect((await authenticated(request(app).put(`/api/messaging/chats/${CHAT}/pin`)).send({ messageId: MESSAGE, active: true })).status).toBe(403);
    expect(db.pin).not.toHaveBeenCalled();
  });
  test("rejects invalid search cursors before database access", async () => {
    expect((await authenticated(request(app).get("/api/messaging/search?q=hello&cursor=garbage"))).status).toBe(400);
    expect(db.search).not.toHaveBeenCalled();
  });
  test("enforces publishing policy on existing message endpoints", async () => {
    db.policy.mockResolvedValue({ members_can_send: 0, members_can_upload: 0, slow_seconds: 0 });
    const response = await authenticated(request(app).post("/api/messages")).send({ chatId: CHAT, username: "alice", body: "restricted" });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/administrators/i);
  });
  test("rejects scheduled messages in the past", async () => {
    const response = await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/scheduled`)).send({ body: "hello", dueAt: new Date(Date.now() - 10000).toISOString() });
    expect(response.status).toBe(400);
    expect(db.schedule).not.toHaveBeenCalled();
  });
  test("keeps reply and topic context when scheduling a composer draft", async () => {
    db.topic = vi.fn(async () => ({ id: TARGET, chat_id: CHAT, closed: 0 }));
    const dueAt = new Date(Date.now() + 60000).toISOString();
    const response = await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/scheduled`)).send({ body: "hello", dueAt, replyToMessageId: MESSAGE, topicId: TARGET });
    expect(response.status).toBe(201);
    expect(db.schedule).toHaveBeenCalledWith(USER, CHAT, "hello", dueAt, { replyToMessageId: MESSAGE, topicId: TARGET });
  });
  test("rejects scheduling a reply or topic from another conversation", async () => {
    deps.findMessageById.mockResolvedValue({ id: MESSAGE, chat_id: OTHER });
    expect((await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/scheduled`)).send({ body: "hello", dueAt: new Date(Date.now() + 60000).toISOString(), replyToMessageId: MESSAGE })).status).toBe(404);
    db.topic = vi.fn(async () => ({ id: TARGET, chat_id: OTHER }));
    expect((await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/scheduled`)).send({ body: "hello", dueAt: new Date(Date.now() + 60000).toISOString(), topicId: TARGET })).status).toBe(400);
    expect(db.schedule).not.toHaveBeenCalled();
  });
  test("validates poll choices and blocks voting after closure", async () => {
    expect((await authenticated(request(app).put(`/api/messaging/polls/${MESSAGE}/vote`)).send({ option: 2 })).status).toBe(400);
    db.poll.mockResolvedValue({ id: MESSAGE, chat_id: CHAT, message_id: MESSAGE, closed: 1 });
    expect((await authenticated(request(app).put(`/api/messaging/polls/${MESSAGE}/vote`)).send({ option: 0 })).status).toBe(409);
    expect(db.vote).not.toHaveBeenCalled();
  });
  test("does not revoke sessions belonging to another account", async () => {
    expect((await authenticated(request(app).delete(`/api/messaging/devices/${TARGET}`))).status).toBe(404);
    expect(db.deviceToken).toHaveBeenCalledWith(USER, TARGET);
  });
  test("joins group calls with validated membership and room capacity", async () => {
    expect((await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/call/join`)).send({ video: false })).status).toBe(201);
    expect(db.joinGroupCall).toHaveBeenCalledWith(CHAT, USER, false);
    db.joinGroupCall.mockResolvedValue(null);
    expect((await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/call/join`)).send({ video: false })).status).toBe(409);
  });
  test("rejects spoofed call signals and cross-room targets", async () => {
    db.groupPeer.mockResolvedValue({ id: PEER, user_id: OTHER, chat_id: CHAT });
    expect((await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/call/signal`)).send({ peerId: PEER, targetPeerId: TARGET, kind: "offer", data: { type: "offer", sdp: "test" } })).status).toBe(403);
    expect(deps.emitSseEvent).not.toHaveBeenCalled();
  });
  test("relays call negotiation only to the verified target account", async () => {
    const signal = { peerId: PEER, targetPeerId: TARGET, kind: "ice", data: { candidate: "candidate" } };
    expect((await authenticated(request(app).post(`/api/messaging/chats/${CHAT}/call/signal`)).send(signal)).status).toBe(200);
    expect(deps.emitSseEvent).toHaveBeenCalledWith("bob", expect.objectContaining({ type: "group_call_signal", fromPeerId: PEER, targetPeerId: TARGET }));
  });
});
