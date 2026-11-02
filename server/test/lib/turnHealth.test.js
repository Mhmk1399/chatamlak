import { describe, test, expect } from "vitest";
import net from "node:net";
import dgram from "node:dgram";
import { parseTurnEndpoint, checkTurnHealth } from "../../lib/turnHealth.js";

describe("parseTurnEndpoint", () => {
  test("parses standard UDP TURN url", () => {
    expect(parseTurnEndpoint("turn:turn.example.com:3478")).toEqual({
      host: "turn.example.com",
      port: 3478,
      useTcp: false,
    });
  });

  test("parses default port for turn and turns", () => {
    expect(parseTurnEndpoint("turn:turn.example.com")).toEqual({
      host: "turn.example.com",
      port: 3478,
      useTcp: false,
    });
    expect(parseTurnEndpoint("turns:turn.example.com")).toEqual({
      host: "turn.example.com",
      port: 5349,
      useTcp: true,
    });
  });

  test("detects transport=tcp param", () => {
    expect(
      parseTurnEndpoint("turn:turn.example.com:3478?transport=tcp"),
    ).toEqual({
      host: "turn.example.com",
      port: 3478,
      useTcp: true,
    });
  });

  test("handles credentials in url", () => {
    expect(parseTurnEndpoint("turn:user:pass@127.0.0.1:3478")).toEqual({
      host: "127.0.0.1",
      port: 3478,
      useTcp: false,
    });
  });

  test("handles IPv6 literal host", () => {
    expect(parseTurnEndpoint("turn:[::1]:3478")).toEqual({
      host: "::1",
      port: 3478,
      useTcp: false,
    });
  });

  test("returns null on invalid url", () => {
    expect(parseTurnEndpoint("not-a-turn-url")).toBeNull();
  });
});

describe("checkTurnHealth", () => {
  test("returns unconfigured when env has no TURN config", async () => {
    const res = await checkTurnHealth({});
    expect(res).toEqual({
      configured: false,
      managed: false,
      reachable: null,
      latencyMs: null,
    });
  });

  test("cloudflare managed: healthy when credential generation succeeds", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: "turn:cf.turn.com", username: "u", credential: "p" },
        ],
      }),
    });
    const res = await checkTurnHealth(
      { TURN_TOKEN_ID: "cf-token-id", TURN_API_TOKEN: "cf-api-token" },
      mockFetch,
    );
    expect(res.configured).toBe(true);
    expect(res.managed).toBe(true);
    expect(res.reachable).toBe(true);
    expect(typeof res.latencyMs).toBe("number");
  });

  test("cloudflare managed: unhealthy when credential generation fails", async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const res = await checkTurnHealth(
      { TURN_TOKEN_ID: "cf-token-id", TURN_API_TOKEN: "cf-api-token" },
      mockFetch,
    );
    expect(res.configured).toBe(true);
    expect(res.managed).toBe(true);
    expect(res.reachable).toBe(false);
  });

  test("tcp probe: reachable when listening", async () => {
    const server = net.createServer((socket) => socket.destroy());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const res = await checkTurnHealth({
        TURN_URL: `turn:127.0.0.1:${port}?transport=tcp`,
      });
      expect(res.configured).toBe(true);
      expect(res.reachable).toBe(true);
      expect(typeof res.latencyMs).toBe("number");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("udp STUN probe: reachable when server responds to STUN binding request", async () => {
    const socket = dgram.createSocket("udp4");
    socket.on("message", (msg, rinfo) => {
      // Echo STUN success response with matching transaction ID
      const response = Buffer.alloc(20);
      response.writeUInt16BE(0x0101, 0); // Binding Success Response
      response.writeUInt16BE(0, 2); // Length
      response.writeUInt32BE(0x2112a442, 4); // Magic Cookie
      if (msg.length >= 20) {
        msg.copy(response, 8, 8, 20); // Copy transaction ID
      }
      socket.send(response, rinfo.port, rinfo.address);
    });
    await new Promise((resolve) => socket.bind(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    try {
      const res = await checkTurnHealth({
        TURN_URL: `turn:127.0.0.1:${port}`,
      });
      expect(res.configured).toBe(true);
      expect(res.reachable).toBe(true);
      expect(typeof res.latencyMs).toBe("number");
    } finally {
      await new Promise((resolve) => socket.close(resolve));
    }
  });
});
