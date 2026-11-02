// Health-check for the TURN relay used by WebRTC calls (server/lib/callManager.js).
// TURN can come from static env (TURN_URL) or the Cloudflare credentials API
// (TURN_TOKEN_ID + TURN_API_TOKEN). Probe result drives the admin Services tab.
import dgram from "node:dgram";
import net from "node:net";
import crypto from "node:crypto";

export const TURN_PROBE_TIMEOUT_MS = 3000;

function tcpProbe(host, port, timeoutMs = TURN_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let timer;
    const socket = net.createConnection({ host, port });
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        socket.destroy();
      } catch {}
      resolve(ok ? Date.now() - started : -1);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

// Minimal STUN Binding Request (RFC 5389 header): a turn: relay answers STUN
// by spec, so a matched UDP response proves the endpoint is alive — and a
// plain TCP connect would wrongly fail for UDP-only relays.
function udpStunProbe(host, port, timeoutMs = TURN_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    const isV6 = net.isIPv6(host);
    const socket = dgram.createSocket(isV6 ? "udp6" : "udp4");
    const request = Buffer.alloc(20);
    request.writeUInt16BE(0x0001, 0); // STUN Binding Request
    request.writeUInt32BE(0x2112a442, 4); // rfc5389 magic cookie
    crypto.randomFillSync(request, 8, 12); // transaction id
    let settled = false;
    let timer;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      resolve(ok ? Date.now() - started : -1);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    socket.on("message", (response) => {
      if (
        response.length >= 20 &&
        response.subarray(8, 20).equals(request.subarray(8, 20))
      ) {
        finish(true);
      }
    });
    socket.on("error", () => finish(false));
    try {
      socket.send(request, port, host, (err) => {
        if (err) finish(false);
      });
    } catch {
      finish(false);
    }
  });
}

export function parseTurnEndpoint(raw) {
  // "turn:host:port" lacks the "//" `URL` requires; normalize before parsing.
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : raw.replace(/^([a-z][a-z0-9+.-]*):/i, "$1://");
  let url;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  if (!url.hostname) return null;
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port) || (url.protocol === "turns:" ? 5349 : 3478),
    useTcp:
      url.protocol === "turns:" || url.searchParams.get("transport") === "tcp",
  };
}

/**
 * Probes TURN configuration. Never throws: always resolves a status object.
 * { configured: false } means no relay is set up (STUN fallback only).
 */
export async function checkTurnHealth(env = process.env, fetchImpl = null) {
  if (env.TURN_TOKEN_ID && env.TURN_API_TOKEN) {
    const started = Date.now();
    try {
      const res = await (fetchImpl || fetch)(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_TOKEN_ID}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.TURN_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 86400 }),
        },
      );
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      return {
        configured: true,
        managed: true,
        reachable: Array.isArray(data.iceServers) && data.iceServers.length > 0,
        latencyMs: Date.now() - started,
      };
    } catch {
      return {
        configured: true,
        managed: true,
        reachable: false,
        latencyMs: Date.now() - started,
      };
    }
  }
  const turnUrl = String(env.TURN_URL || "").trim();
  if (!turnUrl) {
    return {
      configured: false,
      managed: false,
      reachable: null,
      latencyMs: null,
    };
  }
  const endpoint = parseTurnEndpoint(turnUrl);
  const started = Date.now();
  if (!endpoint) {
    return {
      configured: true,
      managed: false,
      reachable: false,
      latencyMs: Date.now() - started,
    };
  }
  const latency = await (endpoint.useTcp
    ? tcpProbe(endpoint.host, endpoint.port)
    : udpStunProbe(endpoint.host, endpoint.port));
  return {
    configured: true,
    managed: false,
    reachable: latency >= 0,
    latencyMs: Date.now() - started,
  };
}
