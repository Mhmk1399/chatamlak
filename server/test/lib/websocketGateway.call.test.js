import { describe, test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createWebSocketGateway } from "../../lib/websocketGateway.js";

describe("WebSocket Gateway Call Signaling", () => {
  const CHAT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  test("handles call_signal messages and delegates to callManager", async () => {
    const callManager = {
      startCall: vi.fn(async () => ({ status: 200, call: {} })),
      acceptCall: vi.fn(async () => ({ status: 200, call: {} })),
      rejectCall: vi.fn(async () => ({ status: 200 })),
      endCall: vi.fn(async () => ({ status: 200 })),
      relaySignal: vi.fn(async () => ({ status: 200 })),
      cleanupUserCalls: vi.fn(),
    };

    const gateway = createWebSocketGateway({ callManager });

    // Mock a websocket client
    const ws = new EventEmitter();
    ws.isAlive = true;
    ws.readyState = 1;
    ws.send = vi.fn();

    const session = { id: "user-1", username: "alice" };

    gateway.wss.emit("connection", ws, {}, session);

    // 1. start call signal
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          action: "call_signal",
          signalType: "start",
          chatId: CHAT_ID,
          data: { type: "video" },
        }),
      ),
    );

    // Wait a tick for async handler
    await new Promise((r) => setTimeout(r, 10));

    expect(callManager.startCall).toHaveBeenCalledWith({
      user: session,
      chatId: CHAT_ID,
      type: "video",
    });

    // 2. relay signal
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          action: "call_signal",
          signalType: "offer",
          chatId: CHAT_ID,
          data: { sdp: "dummy-sdp" },
        }),
      ),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(callManager.relaySignal).toHaveBeenCalledWith({
      user: session,
      chatId: CHAT_ID,
      signalType: "offer",
      payload: { sdp: "dummy-sdp" },
    });

    // 3. on close, cleans up active user calls
    ws.emit("close");

    expect(callManager.cleanupUserCalls).toHaveBeenCalledWith("alice");

    gateway.close();
  });

  // Regression: a camera-less video caller posts camera-state right after
  // start. Both arrive on the same socket, but each message used to spawn its
  // own async job, so the camera-state relay could run while startCall's DB
  // lookups were still in flight — before the call was seeded — and get a
  // "No active call found" 404. The correction was silently swallowed and the
  // callee's call screen kept rendering an empty video box.
  test("processes call signals per socket in arrival order", async () => {
    const order = [];
    const callManager = {
      startCall: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 25));
        order.push("start-done");
        return { status: 200, call: {} };
      }),
      acceptCall: vi.fn(async () => ({ status: 200, call: {} })),
      rejectCall: vi.fn(async () => ({ status: 200 })),
      endCall: vi.fn(async () => ({ status: 200 })),
      relaySignal: vi.fn(async () => {
        order.push("relay-camera-state");
        return { status: 200 };
      }),
      cleanupUserCalls: vi.fn(),
    };

    const gateway = createWebSocketGateway({ callManager });
    const ws = new EventEmitter();
    ws.isAlive = true;
    ws.readyState = 1;
    ws.send = vi.fn();

    gateway.wss.emit("connection", ws, {}, { id: "user-1", username: "alice" });

    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          action: "call_signal",
          signalType: "start",
          chatId: CHAT_ID,
          data: { type: "video" },
        }),
      ),
    );
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          action: "call_signal",
          signalType: "camera-state",
          chatId: CHAT_ID,
          data: { cameraOff: true },
        }),
      ),
    );

    await new Promise((r) => setTimeout(r, 80));

    expect(order.indexOf("start-done")).toBeLessThan(
      order.indexOf("relay-camera-state"),
    );
    expect(callManager.relaySignal).toHaveBeenCalledWith({
      user: { id: "user-1", username: "alice" },
      chatId: CHAT_ID,
      signalType: "camera-state",
      payload: { cameraOff: true },
    });

    ws.emit("close");
    gateway.close();
  });

  test("rejects unknown call signal types instead of silently ignoring them", async () => {
    const callManager = {
      startCall: vi.fn(),
      acceptCall: vi.fn(),
      rejectCall: vi.fn(),
      endCall: vi.fn(),
      relaySignal: vi.fn(),
    };
    const gateway = createWebSocketGateway({ callManager });
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.send = vi.fn();

    gateway.wss.emit("connection", ws, {}, { id: "user-1", username: "alice" });
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          action: "call_signal",
          signalType: "arbitrary-command",
          chatId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          data: {},
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callManager.relaySignal).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"call:error"'),
    );
    gateway.close();
  });
});
