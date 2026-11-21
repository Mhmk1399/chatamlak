import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import {
  createSupportEventHub,
  createSupportRealtime,
  createSupportWebSocketGateway,
  isSupportOriginAllowed,
} from "../../lib/supportRealtime.js";

const CONVERSATION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVERSATION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function responseStub() {
  const res = new EventEmitter();
  res.set = vi.fn();
  res.flushHeaders = vi.fn();
  res.write = vi.fn();
  res.end = vi.fn();
  return res;
}

describe("support realtime", () => {
  test("uses an explicit origin allowlist as the authority even when Host is spoofed", () => {
    expect(isSupportOriginAllowed({
      headers: {
        origin: "https://evil.example.com",
        host: "evil.example.com",
      },
    }, {
      allowedOrigins: ["https://web.example.com"],
    })).toBe(false);
  });

  test("isolates subscribers and bounded replay by exact conversation", () => {
    const hub = createSupportEventHub({ maxReplayEvents: 2 });
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe(CONVERSATION_A, a, { sessionId: "session-a" });
    hub.subscribe(CONVERSATION_B, b, { sessionId: "session-b" });

    const first = hub.publish(CONVERSATION_A, { type: "chat_message", messageId: "1" });
    hub.publish(CONVERSATION_A, { type: "chat_message", messageId: "2" });
    hub.publish(CONVERSATION_A, { type: "chat_message", messageId: "3" });

    expect(a).toHaveBeenCalledTimes(3);
    expect(b).not.toHaveBeenCalled();
    expect(hub.replay(CONVERSATION_A, first.cursor, 50).events.map((event) => event.messageId))
      .toEqual(["2", "3"]);
    expect(hub.replay(CONVERSATION_B, null, 50).events).toEqual([]);
    hub.close();
  });

  test("preserves a supplied durable cursor so reconnect replay can resume without duplicates", () => {
    const hub = createSupportEventHub({ maxReplayEvents: 5 });
    const event = hub.publish(CONVERSATION_A, {
      type: "chat_message",
      messageId: "message-1",
      cursor: "message-1",
      eventId: "message:message-1",
    });

    expect(event.cursor).toBe("message-1");
    expect(hub.replay(CONVERSATION_A, "message-1", 5).events).toEqual([]);
    hub.close();
  });

  test("periodically revalidates an already-open SSE stream and closes it on expiry", async () => {
    vi.useFakeTimers();
    const hub = createSupportEventHub();
    const authenticateToken = vi
      .fn()
      .mockResolvedValueOnce({
        id: "session-a",
        conversationId: CONVERSATION_A,
        expiresAt: "2099-01-01T00:00:00.000Z",
      })
      .mockRejectedValueOnce(Object.assign(new Error("expired"), {
        code: "SUPPORT_SESSION_EXPIRED",
      }));
    const realtime = createSupportRealtime({
      eventHub: hub,
      authenticateToken,
      revalidateIntervalMs: 1_000,
      heartbeatIntervalMs: 10_000,
    });
    const req = new EventEmitter();
    req.headers = { host: "localhost", origin: "http://localhost" };
    req.query = {};
    const res = responseStub();

    await realtime.openSse(req, res, { token: `ocs_${"A".repeat(43)}` });
    await vi.advanceTimersByTimeAsync(1_001);

    expect(authenticateToken).toHaveBeenCalledTimes(2);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("session_revoked"));
    expect(res.end).toHaveBeenCalledTimes(1);
    realtime.close();
    hub.close();
    vi.useRealTimers();
  });

  test("disconnects all SSE connections for a revoked support session", async () => {
    const hub = createSupportEventHub();
    const realtime = createSupportRealtime({
      eventHub: hub,
      authenticateToken: async () => ({
        id: "session-a",
        conversationId: CONVERSATION_A,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      revalidateIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });
    const req = new EventEmitter();
    req.headers = { host: "localhost", origin: "http://localhost" };
    req.query = {};
    const res = responseStub();
    await realtime.openSse(req, res, { token: `ocs_${"A".repeat(43)}` });

    expect(realtime.disconnectSession("session-a", "revoked")).toBe(1);
    expect(res.end).toHaveBeenCalledTimes(1);
    realtime.close();
    hub.close();
  });

  test("buffers live SSE events during replay and suppresses the replay duplicate", async () => {
    const hub = createSupportEventHub();
    const duplicate = {
      type: "chat_message",
      conversationId: CONVERSATION_A,
      cursor: "message-1",
      eventId: "message:message-1",
      messageId: "message-1",
    };
    const realtime = createSupportRealtime({
      eventHub: hub,
      authenticateToken: async () => ({
        id: "session-a",
        conversationId: CONVERSATION_A,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      loadReplayEvents: async () => {
        hub.publish(CONVERSATION_A, duplicate);
        return {
          events: [duplicate],
          cursor: duplicate.cursor,
          hasMore: true,
          gap: true,
        };
      },
      allowedOrigins: ["https://web.example.com"],
      heartbeatIntervalMs: 60_000,
      revalidateIntervalMs: 60_000,
    });
    const req = new EventEmitter();
    req.headers = { host: "chat.example.com", origin: "https://web.example.com" };
    req.query = {};
    const res = responseStub();

    await realtime.openSse(req, res, { token: `ocs_${"A".repeat(43)}` });
    const payloads = res.write.mock.calls.map(([value]) => String(value));
    expect(payloads.filter((value) => value.includes("message:message-1"))).toHaveLength(1);
    expect(payloads).toContainEqual(expect.stringContaining(
      '"type":"connected","conversationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","cursor":"message-1","hasMore":true,"gap":true',
    ));
    realtime.close();
    hub.close();
  });

  test("cleans up the SSE subscription when durable replay fails", async () => {
    const hub = createSupportEventHub();
    const realtime = createSupportRealtime({
      eventHub: hub,
      authenticateToken: async () => ({
        id: "session-a",
        conversationId: CONVERSATION_A,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      loadReplayEvents: async () => { throw new Error("replay unavailable"); },
      allowedOrigins: ["https://web.example.com"],
    });
    const req = new EventEmitter();
    req.headers = { host: "chat.example.com", origin: "https://web.example.com" };
    req.query = {};
    const res = responseStub();

    await expect(realtime.openSse(req, res, {
      token: `ocs_${"A".repeat(43)}`,
    })).rejects.toThrow("replay unavailable");
    expect(res.end).toHaveBeenCalledTimes(1);
    const writes = res.write.mock.calls.length;
    hub.publish(CONVERSATION_A, { type: "chat_message", eventId: "after-failure" });
    expect(res.write).toHaveBeenCalledTimes(writes);
    realtime.close();
    hub.close();
  });

  test("WebSocket upgrade rejects URL credentials and untrusted origins before authentication", async () => {
    const server = new EventEmitter();
    const authenticateToken = vi.fn(async () => ({
      id: "session-a",
      conversationId: CONVERSATION_A,
      expiresAt: "2099-01-01T00:00:00.000Z",
    }));
    const gateway = createSupportWebSocketGateway({
      server,
      authenticateToken,
      allowedOrigins: ["https://web.example.com"],
    });
    const tokenSocket = { write: vi.fn(), destroy: vi.fn() };
    server.emit("upgrade", {
      url: "/support/v1/ws?token=secret",
      headers: { host: "chat.example.com", origin: "https://web.example.com" },
      socket: { remoteAddress: "127.0.0.1" },
    }, tokenSocket, Buffer.alloc(0));
    const originSocket = { write: vi.fn(), destroy: vi.fn() };
    server.emit("upgrade", {
      url: "/support/v1/ws",
      headers: { host: "chat.example.com", origin: "https://evil.example.com" },
      socket: { remoteAddress: "127.0.0.1" },
    }, originSocket, Buffer.alloc(0));
    await Promise.resolve();

    expect(tokenSocket.write).toHaveBeenCalledWith(expect.stringContaining("400 Bad Request"));
    expect(originSocket.write).toHaveBeenCalledWith(expect.stringContaining("403 Forbidden"));
    expect(authenticateToken).not.toHaveBeenCalled();
    gateway.close();
  });

  test("fails closed when browser realtime requests omit Origin", async () => {
    const authenticateToken = vi.fn();
    const realtime = createSupportRealtime({ authenticateToken });
    const request = new EventEmitter();
    request.headers = { host: "localhost" };
    request.query = {};
    await expect(realtime.openSse(request, responseStub(), {
      token: `ocs_${"A".repeat(43)}`,
    })).rejects.toMatchObject({ code: "SUPPORT_ORIGIN_DENIED", status: 403 });
    expect(authenticateToken).not.toHaveBeenCalled();
    realtime.close();

    const server = new EventEmitter();
    const gateway = createSupportWebSocketGateway({ server, authenticateToken });
    const socket = { write: vi.fn(), destroy: vi.fn() };
    server.emit("upgrade", {
      url: "/support/v1/ws",
      headers: {
        host: "localhost",
        cookie: `owj_support_sid=ocs_${"A".repeat(43)}`,
      },
      socket: { remoteAddress: "127.0.0.1" },
    }, socket, Buffer.alloc(0));
    await Promise.resolve();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("403 Forbidden"));
    expect(authenticateToken).not.toHaveBeenCalled();
    gateway.close();
  });

  test("WebSocket connections are periodically revalidated and closed after revocation", async () => {
    vi.useFakeTimers();
    const server = new EventEmitter();
    const authenticateToken = vi
      .fn()
      .mockResolvedValueOnce({
        id: "session-a",
        conversationId: CONVERSATION_A,
        expiresAt: "2099-01-01T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("revoked"));
    const gateway = createSupportWebSocketGateway({
      server,
      authenticateToken,
      revalidateIntervalMs: 1_000,
      heartbeatIntervalMs: 60_000,
    });
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.send = vi.fn();
    ws.close = vi.fn();
    vi.spyOn(gateway.wss, "handleUpgrade").mockImplementation((_req, _socket, _head, callback) => callback(ws));
    server.emit("upgrade", {
      url: "/support/v1/ws",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        cookie: `owj_support_sid=ocs_${"A".repeat(43)}`,
      },
      socket: { remoteAddress: "127.0.0.1" },
    }, { write: vi.fn(), destroy: vi.fn() }, Buffer.alloc(0));
    await vi.advanceTimersByTimeAsync(1_001);

    expect(authenticateToken).toHaveBeenCalledTimes(2);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("session_revoked"));
    expect(ws.close).toHaveBeenCalledWith(1008, "Support session revoked");
    gateway.close();
    vi.useRealTimers();
  });

  test("replays only the authenticated conversation over a credential-free resume control and suppresses duplicates", async () => {
    const server = new EventEmitter();
    const loadReplayEvents = vi.fn(async () => ({
      events: [
        { type: "chat_message", conversationId: CONVERSATION_A, eventId: "event-1", cursor: "41", messageId: "m1" },
        { type: "chat_message", conversationId: CONVERSATION_B, eventId: "event-leak", cursor: "42", messageId: "m2" },
        { type: "chat_message", conversationId: CONVERSATION_A, eventId: "event-1", cursor: "41", messageId: "m1" },
      ],
      cursor: "42",
      hasMore: false,
    }));
    const gateway = createSupportWebSocketGateway({
      server,
      loadReplayEvents,
      authenticateToken: async () => ({
        id: "session-a",
        conversationId: CONVERSATION_A,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      heartbeatIntervalMs: 60_000,
    });
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.send = vi.fn();
    ws.close = vi.fn();
    vi.spyOn(gateway.wss, "handleUpgrade").mockImplementation((_req, _socket, _head, callback) => callback(ws));
    server.emit("upgrade", {
      url: "/support/v1/ws",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        cookie: `owj_support_sid=ocs_${"A".repeat(43)}`,
      },
      socket: { remoteAddress: "127.0.0.1" },
    }, { write: vi.fn(), destroy: vi.fn() }, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));
    ws.emit("message", Buffer.from(JSON.stringify({ type: "resume", cursor: "40" })));
    await new Promise((resolve) => setImmediate(resolve));

    expect(loadReplayEvents).toHaveBeenCalledWith(CONVERSATION_A, {
      after: "40",
      limit: 200,
      session: expect.objectContaining({ id: "session-a" }),
    });
    const sent = ws.send.mock.calls.map(([value]) => JSON.parse(value));
    expect(sent.filter((event) => event.eventId === "event-1")).toHaveLength(1);
    expect(sent.some((event) => event.eventId === "event-leak")).toBe(false);
    expect(sent).toContainEqual(expect.objectContaining({ type: "replay_complete", cursor: "42" }));
    gateway.close();
  });
});
