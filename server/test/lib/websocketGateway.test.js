import { afterEach, describe, test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  createWebSocketGateway,
  resolveWebSocketClientIp,
} from "../../lib/websocketGateway.js";
import { createSseHub } from "../../lib/sse.js";
import { createRedisClient } from "../../lib/redis.js";

describe("WebSocket Gateway", () => {
  afterEach(() => vi.useRealTimers());
  test("uses forwarded client IPs only when the deployment explicitly trusts its proxy", () => {
    const request = {
      headers: { "x-forwarded-for": "203.0.113.10, 172.18.0.2" },
      socket: { remoteAddress: "172.18.0.2" },
    };

    expect(resolveWebSocketClientIp(request)).toBe("172.18.0.2");
    expect(resolveWebSocketClientIp(request, { trustProxy: true })).toBe(
      "203.0.113.10",
    );
    expect(
      resolveWebSocketClientIp(
        {
          ...request,
          headers: { "x-forwarded-for": "attacker-controlled-value" },
        },
        { trustProxy: true },
      ),
    ).toBe("172.18.0.2");
  });

  test("registers and manages WebSocket gateway structure", () => {
    const sseHub = { getCachedMembers: vi.fn(() => [{ username: "alice" }]) };
    const gateway = createWebSocketGateway({ sseHub });

    expect(gateway.wss).toBeDefined();
    expect(gateway.clientsByUsername).toBeDefined();
    expect(typeof gateway.sendEvent).toBe("function");
    expect(typeof gateway.sendChatEvent).toBe("function");
    expect(typeof gateway.broadcastAll).toBe("function");

    gateway.close();
  });

  test("configures a bounded websocket frame size", () => {
    const gateway = createWebSocketGateway({ maxPayloadBytes: 8192 });

    expect(gateway.wss.options.maxPayload).toBe(8192);

    gateway.close();
  });

  test("dispatches events via Redis Pub/Sub if configured", async () => {
    const redisClient = createRedisClient({ forceInProcess: true });
    const gateway = createWebSocketGateway({ redisClient });

    const publishSpy = vi.spyOn(redisClient, "publish");
    gateway.broadcastAll({ type: "test" });

    expect(publishSpy).toHaveBeenCalledWith(
      "ouj-chat:events",
      expect.stringContaining('"broadcast":true'),
    );

    gateway.close();
  });

  test("sseHub delegates events to registered event listeners like wsGateway", () => {
    const wsAlice = { readyState: 1, send: vi.fn() };
    const getCachedMembers = vi.fn((chatId) => [{ username: "alice" }]);
    const sseHub = { getCachedMembers, emitChatEvent: undefined };

    // Create sseHub via createSseHub
    const realSseHub = createSseHub({ listChatMembers: getCachedMembers });
    const gateway = createWebSocketGateway({ sseHub: realSseHub });

    gateway.clientsByUsername.set("alice", new Set([wsAlice]));

    const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    realSseHub.emitChatEvent(chatId, { type: "chat_message", chatId, text: "hello" });

    expect(wsAlice.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", chatId, text: "hello" }));

    gateway.close();
  });

  test("sends chat events to connected websocket clients when emitChatEvent or wsGateway.sendChatEvent is called", () => {
    const wsAlice = { readyState: 1, send: vi.fn() };
    const wsBob = { readyState: 1, send: vi.fn() };

    const getCachedMembers = vi.fn((chatId) => [
      { username: "alice" },
      { username: "bob" },
    ]);
    const sseHub = { getCachedMembers };
    const gateway = createWebSocketGateway({ sseHub });

    // Manually register connected ws clients
    gateway.clientsByUsername.set("alice", new Set([wsAlice]));
    gateway.clientsByUsername.set("bob", new Set([wsBob]));

    const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    gateway.sendChatEvent(chatId, { type: "chat_message", chatId, text: "hello" });

    expect(getCachedMembers).toHaveBeenCalledWith(chatId);
    expect(wsAlice.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", chatId, text: "hello" }));
    expect(wsBob.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", chatId, text: "hello" }));

    gateway.close();
  });

  test("invokes onUserConnected and onUserDisconnected on connection/close", () => {
    const onUserConnected = vi.fn();
    const onUserDisconnected = vi.fn();
    const gateway = createWebSocketGateway({ onUserConnected, onUserDisconnected });

    const ws = new EventEmitter();
    gateway.wss.emit("connection", ws, {}, { username: "Alice" });

    expect(onUserConnected).toHaveBeenCalledWith("alice", ws);
    expect(gateway.clientsByUsername.get("alice")).toEqual(new Set([ws]));

    ws.emit("close");
    expect(onUserDisconnected).toHaveBeenCalledWith("alice", ws);
    expect(gateway.clientsByUsername.has("alice")).toBe(false);

    gateway.close();
  });

  test("disconnects every socket for a user when account sessions are revoked", () => {
    const gateway = createWebSocketGateway({});
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.send = vi.fn();
    ws.close = vi.fn();
    gateway.wss.emit("connection", ws, {}, { username: "Alice" });

    gateway.disconnectUsername("alice", "banned");

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "session_revoked", reason: "banned" }),
    );
    expect(ws.close).toHaveBeenCalledWith(1008, "Session revoked");
    gateway.close();
  });

  test("periodically closes an already-open socket after its session expires", async () => {
    vi.useFakeTimers();
    const getSessionFromToken = vi.fn(async () => null);
    const gateway = createWebSocketGateway({
      getSessionFromToken,
      sessionRevalidateIntervalMs: 1_000,
      heartbeatIntervalMs: 60_000,
    });
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.send = vi.fn();
    ws.close = vi.fn();
    gateway.wss.emit(
      "connection",
      ws,
      { headers: { cookie: "sid=expiring-token" }, socket: { remoteAddress: "127.0.0.1" } },
      { username: "Alice" },
    );

    await vi.advanceTimersByTimeAsync(1_001);
    expect(getSessionFromToken).toHaveBeenCalledWith("expiring-token", { touch: false });
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("session_revoked"));
    expect(ws.close).toHaveBeenCalledWith(1008, "Session expired or revoked");
    gateway.close();
  });

  test("handles Promise-returning getSessionFromToken during HTTP upgrade", async () => {
    const onUserConnected = vi.fn();
    const server = new EventEmitter();
    const session = { id: "s1", username: "alice" };
    const getSessionFromToken = vi.fn(() => Promise.resolve(session));

    const gateway = createWebSocketGateway({
      server,
      getSessionFromToken,
      onUserConnected,
    });

    vi.spyOn(gateway.wss, "handleUpgrade").mockImplementation((req, socket, head, callback) => {
      callback({ on: () => {} });
    });

    const request = {
      url: "/ws",
      headers: { host: "localhost", cookie: "sid=valid-token" },
    };
    const socket = {};
    const head = Buffer.from([]);

    server.emit("upgrade", request, socket, head);

    // Wait for promise tick
    await new Promise((r) => setTimeout(r, 10));

    expect(onUserConnected).toHaveBeenCalledWith("alice", expect.anything());
    expect(gateway.clientsByUsername.get("alice")).toBeDefined();

    gateway.close();
  });

  test("rejects an upgrade before websocket allocation when the session is invalid", async () => {
    const server = new EventEmitter();
    const getSessionFromToken = vi.fn(async () => null);
    const gateway = createWebSocketGateway({ server, getSessionFromToken });
    const handleUpgrade = vi.spyOn(gateway.wss, "handleUpgrade");
    const socket = { write: vi.fn(), destroy: vi.fn() };

    server.emit(
      "upgrade",
      { url: "/ws", headers: { host: "localhost", cookie: "sid=invalid" } },
      socket,
      Buffer.alloc(0),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handleUpgrade).not.toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("401 Unauthorized"));
    expect(socket.destroy).toHaveBeenCalled();
    gateway.close();
  });

  test("rejects query-string session tokens without looking them up", async () => {
    const server = new EventEmitter();
    const getSessionFromToken = vi.fn(async () => ({ username: "alice" }));
    const gateway = createWebSocketGateway({ server, getSessionFromToken });
    const handleUpgrade = vi.spyOn(gateway.wss, "handleUpgrade");
    const socket = { write: vi.fn(), destroy: vi.fn() };

    server.emit(
      "upgrade",
      { url: "/ws?token=leaky-secret", headers: { host: "localhost" } },
      socket,
      Buffer.alloc(0),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSessionFromToken).not.toHaveBeenCalled();
    expect(handleUpgrade).not.toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("400 Bad Request"));
    gateway.close();
  });

  test("rejects browser upgrades from an untrusted origin", async () => {
    const server = new EventEmitter();
    const getSessionFromToken = vi.fn(async () => ({ username: "alice" }));
    const gateway = createWebSocketGateway({
      server,
      getSessionFromToken,
      allowedOrigins: ["https://chat.example.com"],
    });
    const handleUpgrade = vi.spyOn(gateway.wss, "handleUpgrade");
    const socket = { write: vi.fn(), destroy: vi.fn() };

    server.emit(
      "upgrade",
      {
        url: "/ws",
        headers: {
          host: "chat.example.com",
          origin: "https://evil.example.com",
          cookie: "sid=valid-token",
        },
      },
      socket,
      Buffer.alloc(0),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSessionFromToken).not.toHaveBeenCalled();
    expect(handleUpgrade).not.toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("403 Forbidden"));
    gateway.close();
  });

  test("enforces a per-socket message rate limit", () => {
    const gateway = createWebSocketGateway({
      maxMessagesPerWindow: 1,
      messageRateWindowMs: 60_000,
    });
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.send = vi.fn();
    ws.close = vi.fn();

    gateway.wss.emit("connection", ws, {}, { username: "alice" });
    ws.emit("message", Buffer.from(JSON.stringify({ type: "ping" })));
    ws.emit("message", Buffer.from(JSON.stringify({ type: "ping" })));

    expect(ws.close).toHaveBeenCalledWith(1008, "Message rate limit exceeded");
    gateway.close();
  });

  test("terminates sockets that fail to respond to heartbeat ping", async () => {
    const gateway = createWebSocketGateway({
      heartbeatIntervalMs: 50,
      heartbeatTimeoutMs: 50,
    });
    // Simulate socket connection
    const mockWs = {
      readyState: 1, // OPEN
      isAlive: true,
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    };

    gateway.wss.emit("connection", mockWs, {}, { username: "testuser" });

    // Wait for heartbeat tick
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(mockWs.ping).toHaveBeenCalled();
    expect(mockWs.isAlive).toBe(false);

    // Wait for next heartbeat tick (unresponsive socket)
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(mockWs.terminate).toHaveBeenCalled();

    gateway.close();
  });

  test("terminates sockets after heartbeatTimeoutMs when unresponsive to ping", async () => {
    const gateway = createWebSocketGateway({
      heartbeatIntervalMs: 200,
      heartbeatTimeoutMs: 50,
    });
    const mockWs = {
      readyState: 1,
      isAlive: true,
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    };

    gateway.wss.emit("connection", mockWs, {}, { username: "testuser" });

    // Wait for first heartbeat interval tick (200ms) + small offset (30ms)
    await new Promise((resolve) => setTimeout(resolve, 230));
    expect(mockWs.ping).toHaveBeenCalled();
    expect(mockWs.isAlive).toBe(false);
    expect(mockWs.terminate).not.toHaveBeenCalled();

    // Wait for heartbeatTimeoutMs (50ms) to elapse (total 280ms, well before 2nd interval at 400ms)
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(mockWs.terminate).toHaveBeenCalled();

    gateway.close();
  });

  test("does not terminate socket if pong is received before heartbeatTimeoutMs", async () => {
    let pongHandler;
    const gateway = createWebSocketGateway({
      heartbeatIntervalMs: 200,
      heartbeatTimeoutMs: 100,
    });
    const mockWs = {
      readyState: 1,
      isAlive: true,
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === "pong") pongHandler = handler;
      }),
      send: vi.fn(),
    };

    gateway.wss.emit("connection", mockWs, {}, { username: "testuser" });

    // Wait for ping tick at 200ms
    await new Promise((resolve) => setTimeout(resolve, 230));
    expect(mockWs.ping).toHaveBeenCalled();
    expect(mockWs.isAlive).toBe(false);

    // Simulate pong arriving before timeout
    if (pongHandler) pongHandler();
    expect(mockWs.isAlive).toBe(true);

    // Wait for heartbeatTimeoutMs to elapse
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(mockWs.terminate).not.toHaveBeenCalled();

    gateway.close();
  });

  test("sends broadcast events to all connected websocket clients when gateway.broadcastAll is called", () => {
    const wsAlice = { readyState: 1, send: vi.fn() };
    const wsBob = { readyState: 1, send: vi.fn() };

    const gateway = createWebSocketGateway({});
    gateway.clientsByUsername.set("alice", new Set([wsAlice]));
    gateway.clientsByUsername.set("bob", new Set([wsBob]));

    gateway.broadcastAll({ type: "chat_list_changed" });

    expect(wsAlice.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_list_changed" }));
    expect(wsBob.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_list_changed" }));

    gateway.close();
  });
});
