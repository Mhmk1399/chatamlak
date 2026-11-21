import { WebSocketServer, WebSocket } from "ws";
import { isIP } from "node:net";
import { isValidUuid } from "./uuidUtils.js";
import { sessionTokenStorageValue } from "./sessionTokens.js";

const MEMBERSHIP_EVENT_TYPES = new Set(["chat_updated", "chat_deleted", "chat_list_changed"]);
const CALL_SIGNAL_TYPES = new Set([
  "start",
  "accept",
  "reject",
  "end",
  "offer",
  "answer",
  "ice-candidate",
  "camera-state",
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

export function resolveWebSocketClientIp(
  request,
  { trustProxy = false } = {},
) {
  const direct = String(
    request?.socket?.remoteAddress ||
      request?.connection?.remoteAddress ||
      "unknown",
  );
  if (!trustProxy) return direct;
  const forwarded = String(request?.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return isIP(forwarded) ? forwarded : direct;
}

export function createWebSocketGateway({
  server,
  sseHub,
  redisClient,
  callManager,
  getSessionFromToken,
  onUserConnected,
  onUserDisconnected,
  heartbeatIntervalMs = 30000,
  heartbeatTimeoutMs = 10000,
  allowedOrigins,
  maxPayloadBytes = Number(process.env.WS_MAX_PAYLOAD_BYTES) || 64 * 1024,
  maxConnectionsPerIp = Number(process.env.WS_MAX_CONNECTIONS_PER_IP) || 50,
  maxMessagesPerWindow = Number(process.env.WS_MESSAGE_RATE_LIMIT) || 120,
  messageRateWindowMs = Number(process.env.WS_MESSAGE_RATE_WINDOW_MS) || 60_000,
  authTimeoutMs = Number(process.env.WS_AUTH_TIMEOUT_MS) || 5_000,
  sessionRevalidateIntervalMs = Number(process.env.WS_SESSION_REVALIDATE_MS) || 60_000,
  trustProxy = ["1", "true", "yes"].includes(
    String(process.env.WS_TRUST_PROXY || "").trim().toLowerCase(),
  ),
}) {
  const effectiveMaxPayloadBytes = boundedInteger(maxPayloadBytes, 64 * 1024, 1024, 1024 * 1024);
  const effectiveMaxConnectionsPerIp = boundedInteger(maxConnectionsPerIp, 50, 1, 1000);
  const effectiveMaxMessagesPerWindow = boundedInteger(maxMessagesPerWindow, 120, 1, 10_000);
  const effectiveMessageRateWindowMs = boundedInteger(messageRateWindowMs, 60_000, 1_000, 60 * 60 * 1000);
  const effectiveAuthTimeoutMs = boundedInteger(authTimeoutMs, 5_000, 100, 30_000);
  const effectiveSessionRevalidateMs = boundedInteger(
    sessionRevalidateIntervalMs,
    60_000,
    1_000,
    5 * 60_000,
  );
  const configuredOrigins = new Set(
    (Array.isArray(allowedOrigins)
      ? allowedOrigins
      : String(process.env.WS_ALLOWED_ORIGINS || process.env.APP_PUBLIC_URL || "").split(","))
      .map((origin) => String(origin || "").trim())
      .filter(Boolean)
      .map((origin) => {
        try { return new URL(origin).origin; } catch { return ""; }
      })
      .filter(Boolean),
  );
  const wss = new WebSocketServer({ noServer: true, maxPayload: effectiveMaxPayloadBytes });
  const clientsByUsername = new Map();
  const connectionsByIp = new Map();
  const pendingUpgradesByIp = new Map();
  const rawSessionTokensBySocket = new WeakMap();
  const socketsBeingRevalidated = new WeakSet();

  const instanceId = Math.random().toString(36).substring(2);

  function getClientIp(request) {
    return resolveWebSocketClientIp(request, { trustProxy });
  }

  function changeCount(map, key, delta) {
    const next = Math.max(0, Number(map.get(key) || 0) + delta);
    if (next) map.set(key, next);
    else map.delete(key);
    return next;
  }

  function rejectUpgrade(socket, status, statusText, message) {
    const body = `${message}\n`;
    try {
      socket.write(
        `HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
      );
    } catch (_) {}
    try { socket.destroy(); } catch (_) {}
  }

  function isOriginAllowed(request) {
    const rawOrigin = String(request?.headers?.origin || "").trim();
    if (!rawOrigin) return true;
    let origin;
    try { origin = new URL(rawOrigin).origin; } catch { return false; }
    if (configuredOrigins.has(origin)) return true;
    const host = String(request?.headers?.host || "").trim().toLowerCase();
    if (!host) return false;
    return origin === `https://${host}` || origin === `http://${host}`;
  }

  function withAuthTimeout(value) {
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("WebSocket authentication timed out.")), effectiveAuthTimeoutMs);
      if (typeof timeout.unref === "function") timeout.unref();
    });
    return Promise.race([Promise.resolve(value), timeoutPromise]).finally(() => clearTimeout(timeout));
  }

  function clearHeartbeatTimeoutTimer(ws) {
    if (ws && ws._heartbeatTimeoutTimer) {
      clearTimeout(ws._heartbeatTimeoutTimer);
      ws._heartbeatTimeoutTimer = null;
    }
  }

  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        clearHeartbeatTimeoutTimer(ws);
        if (typeof ws.terminate === "function") {
          ws.terminate();
        }
        return;
      }
      ws.isAlive = false;
      if (typeof ws.ping === "function") {
        ws.ping();
      }
      clearHeartbeatTimeoutTimer(ws);
      if (heartbeatTimeoutMs > 0) {
        ws._heartbeatTimeoutTimer = setTimeout(() => {
          ws._heartbeatTimeoutTimer = null;
          if (ws.isAlive === false && typeof ws.terminate === "function") {
            ws.terminate();
          }
        }, heartbeatTimeoutMs);
      }
    });
  }, heartbeatIntervalMs);

  if (typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }

  // PubSub subscriber for cross-instance message routing
  const pubsubSub = redisClient ? redisClient.duplicate() : null;
  if (pubsubSub) {
    pubsubSub.subscribe("ouj-chat:events");
    pubsubSub.on("message", (channel, message) => {
      if (channel === "ouj-chat:events") {
        try {
          const { username, chatId, payload, broadcast, senderInstance } = JSON.parse(message);
          if (senderInstance === instanceId) return;
          if (broadcast) {
            broadcastLocal(payload);
          } else if (chatId && sseHub) {
            if (MEMBERSHIP_EVENT_TYPES.has(String(payload?.type || ""))) {
              sseHub.invalidateChatMembers?.(chatId);
            }
            const rawMembers = sseHub.getCachedMembers(chatId);
            const processMembers = (members) => {
              (members || []).forEach((m) => {
                if (m?.username) sendToUsernameLocal(m.username, payload);
              });
            };
            if (rawMembers && typeof rawMembers.then === "function") {
              rawMembers.then(processMembers).catch(() => {});
            } else {
              processMembers(rawMembers);
            }
          } else if (username) {
            sendToUsernameLocal(username, payload);
          }
        } catch (_) {}
      }
    });
  }

  function broadcastLocal(payload) {
    const data = JSON.stringify(payload);
    clientsByUsername.forEach((clients) => {
      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(data);
          } catch (_) {}
        }
      });
    });
  }

  function sendToUsernameLocal(username, payload) {
    const key = String(username || "").toLowerCase();
    const clients = clientsByUsername.get(key);
    if (!clients?.size) return;
    const data = JSON.stringify(payload);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (_) {}
      }
    });
  }

  function sendEvent(username, payload) {
    sendToUsernameLocal(username, payload);
    if (redisClient) {
      redisClient.publish(
        "ouj-chat:events",
        JSON.stringify({ username, payload, senderInstance: instanceId }),
      );
    }
  }

  function routeChatEvent(chatId, payload, cacheAlreadyInvalidated = false) {
    if (sseHub) {
      if (!cacheAlreadyInvalidated && MEMBERSHIP_EVENT_TYPES.has(String(payload?.type || ""))) {
        sseHub.invalidateChatMembers?.(chatId);
      }
      const rawMembers = sseHub.getCachedMembers(chatId);
      const processMembers = (members) => {
        (members || []).forEach((member) => {
          if (member?.username) sendToUsernameLocal(member.username, payload);
        });
      };
      if (rawMembers && typeof rawMembers.then === "function") {
        rawMembers.then(processMembers).catch(() => {});
      } else {
        processMembers(rawMembers);
      }
    }
    if (redisClient) {
      redisClient.publish(
        "ouj-chat:events",
        JSON.stringify({ chatId, payload, senderInstance: instanceId }),
      );
    }
  }

  function sendChatEvent(chatId, payload) {
    routeChatEvent(chatId, payload, false);
  }

  let unsubscribeHub = null;
  if (sseHub && typeof sseHub.onChatEvent === "function") {
    unsubscribeHub = sseHub.onChatEvent((chatId, payload) => {
      routeChatEvent(chatId, payload, true);
    });
  }

  function broadcastAll(payload) {
    broadcastLocal(payload);
    if (redisClient) {
      redisClient.publish(
        "ouj-chat:events",
        JSON.stringify({ broadcast: true, payload, senderInstance: instanceId }),
      );
    }
  }

  wss.on("connection", (ws, req, rawSession) => {
    const sessionCookie = String(req?.headers?.cookie || "").match(/(?:^|;\s*)sid=([^;]+)/);
    let cookieToken = "";
    try { cookieToken = sessionCookie ? decodeURIComponent(sessionCookie[1]) : ""; } catch (_) {}
    ws._sessionTokenId = req?._wsSessionTokenId || sessionTokenStorageValue(cookieToken) || null;
    if (cookieToken) rawSessionTokensBySocket.set(ws, cookieToken);
    ws._connectionIp = req?._wsClientIp || getClientIp(req);
    ws._messageRateWindowStartedAt = Date.now();
    ws._messageRateCount = 0;
    ws._connectionCounted = true;
    changeCount(connectionsByIp, ws._connectionIp, 1);
    ws.isAlive = true;
    if (wss.clients && typeof wss.clients.add === "function") {
      wss.clients.add(ws);
    }
    if (typeof ws.on === "function") {
      ws.on("pong", () => {
        ws.isAlive = true;
        clearHeartbeatTimeoutTimer(ws);
      });
    }

    let currentSession = null;

    const handleConnection = (session) => {
      currentSession = session;
      const username = session?.username
        ? String(session.username).toLowerCase()
        : null;
      if (username) {
        const clients = clientsByUsername.get(username) || new Set();
        clients.add(ws);
        clientsByUsername.set(username, clients);
      }
      if (!username) {
        if (ws._connectionCounted) {
          ws._connectionCounted = false;
          changeCount(connectionsByIp, ws._connectionIp, -1);
        }
        if (wss.clients && typeof wss.clients.delete === "function") wss.clients.delete(ws);
        if (typeof ws.close === "function") ws.close(1008, "Authentication required");
        return;
      }
      if (onUserConnected) onUserConnected(username, ws);

      if (typeof ws.on === "function") {
        ws.on("close", () => {
          rawSessionTokensBySocket.delete(ws);
          clearHeartbeatTimeoutTimer(ws);
          if (ws._connectionCounted) {
            ws._connectionCounted = false;
            changeCount(connectionsByIp, ws._connectionIp, -1);
          }
          if (wss.clients && typeof wss.clients.delete === "function") {
            wss.clients.delete(ws);
          }
          if (username) {
            const clients = clientsByUsername.get(username);
            if (clients) {
              clients.delete(ws);
              if (!clients.size) clientsByUsername.delete(username);
            }
            if (callManager && typeof callManager.cleanupUserCalls === "function") {
              callManager.cleanupUserCalls(username);
            }
          }
          if (onUserDisconnected) onUserDisconnected(username, ws);
        });
      }
    };

    if (rawSession && typeof rawSession.then === "function") {
      rawSession.then(handleConnection).catch(() => handleConnection(null));
    } else {
      handleConnection(rawSession);
    }

    if (typeof ws.on === "function") {
      ws.on("message", (raw) => {
        const rawLength = Buffer.isBuffer(raw)
          ? raw.length
          : Buffer.byteLength(String(raw || ""));
        if (rawLength > effectiveMaxPayloadBytes) {
          if (typeof ws.close === "function") ws.close(1009, "Payload too large");
          return;
        }

        const currentTime = Date.now();
        if (currentTime - ws._messageRateWindowStartedAt >= effectiveMessageRateWindowMs) {
          ws._messageRateWindowStartedAt = currentTime;
          ws._messageRateCount = 0;
        }
        ws._messageRateCount += 1;
        if (ws._messageRateCount > effectiveMaxMessagesPerWindow) {
          if (typeof ws.close === "function") ws.close(1008, "Message rate limit exceeded");
          return;
        }

        try {
          const msg = JSON.parse(raw.toString());
          if (!msg || typeof msg !== "object" || Array.isArray(msg)) throw new Error("Invalid payload");
          if (msg.type === "pong" || msg.type === "ping") {
            ws.isAlive = true;
            clearHeartbeatTimeoutTimer(ws);
          }
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }

          if (msg.action === "call_signal") {
            const { signalType, chatId, data } = msg;
            const sendCallError = (error) => {
              if (typeof ws.send === "function") {
                ws.send(JSON.stringify({ type: "call:error", chatId, error }));
              }
            };
            const validData = data === undefined || data === null
              || (typeof data === "object" && !Array.isArray(data));
            if (!callManager || !currentSession?.username) {
              sendCallError("Authentication required.");
              return;
            }
            if (!CALL_SIGNAL_TYPES.has(String(signalType || ""))
              || !isValidUuid(String(chatId || ""))
              || !validData
              || (signalType === "start" && !["audio", "video"].includes(data?.type))) {
              sendCallError("Invalid call signal.");
              return;
            }
            // Serialize per socket: a camera-level signal posted right after
            // start must not relay before startCall has seeded the call.
            ws._callSignalQueue = (ws._callSignalQueue || Promise.resolve()).then(
              async () => {
                try {
                  let response;
                  if (signalType === "start") {
                    response = await callManager.startCall({
                      user: currentSession,
                      chatId,
                      type: data?.type,
                    });
                  } else if (signalType === "accept") {
                    response = await callManager.acceptCall({
                      user: currentSession,
                      chatId,
                    });
                  } else if (signalType === "reject") {
                    response = await callManager.rejectCall({
                      user: currentSession,
                      chatId,
                      reason: String(data?.reason || "").slice(0, 200),
                    });
                  } else if (signalType === "end") {
                    response = await callManager.endCall({
                      user: currentSession,
                      chatId,
                    });
                  } else if (["offer", "answer", "ice-candidate", "camera-state"].includes(signalType)) {
                    response = await callManager.relaySignal({
                      user: currentSession,
                      chatId,
                      signalType,
                      payload: data || {},
                    });
                  }
                  if (response?.error) sendCallError(String(response.error).slice(0, 300));
                } catch (_) {
                  sendCallError("Unable to process call signal.");
                }
              },
            );
          }
        } catch (_) {
          if (typeof ws.send === "function") {
            try { ws.send(JSON.stringify({ type: "error", error: "Invalid WebSocket payload." })); } catch (_) {}
          }
        }
      });
    }
  });

  const sessionRevalidateTimer = typeof getSessionFromToken === "function"
    ? setInterval(() => {
        for (const ws of wss.clients) {
          const token = rawSessionTokensBySocket.get(ws);
          if (!token || socketsBeingRevalidated.has(ws)) continue;
          socketsBeingRevalidated.add(ws);
          void Promise.resolve(getSessionFromToken(token, { touch: false }))
            .then((session) => {
              const expectedUsername = [...clientsByUsername.entries()]
                .find(([, clients]) => clients.has(ws))?.[0];
              if (
                !session?.username ||
                !expectedUsername ||
                String(session.username).trim().toLowerCase() !== expectedUsername
              ) {
                try {
                  ws.send(JSON.stringify({ type: "session_revoked", reason: "expired" }));
                } catch (_) {}
                try { ws.close(1008, "Session expired or revoked"); } catch (_) {}
              }
            })
            .catch(() => {
              try {
                ws.send(JSON.stringify({ type: "session_revoked", reason: "revalidation_failed" }));
              } catch (_) {}
              try { ws.close(1008, "Session expired or revoked"); } catch (_) {}
            })
            .finally(() => socketsBeingRevalidated.delete(ws));
        }
      }, effectiveSessionRevalidateMs)
    : null;
  sessionRevalidateTimer?.unref?.();

  if (server) {
    server.on("upgrade", (request, socket, head) => {
      let urlObj;
      try {
        urlObj = new URL(
          request.url,
          `http://${request.headers.host || "localhost"}`,
        );
      } catch (_) {
        rejectUpgrade(socket, 400, "Bad Request", "Invalid WebSocket request.");
        return;
      }
      const pathname = urlObj.pathname;
      if (pathname === "/ws" || pathname === "/api/ws") {
        if (!isOriginAllowed(request)) {
          rejectUpgrade(socket, 403, "Forbidden", "WebSocket origin is not allowed.");
          return;
        }
        if (urlObj.searchParams.has("token") || urlObj.searchParams.has("sid")) {
          rejectUpgrade(socket, 400, "Bad Request", "WebSocket credentials must use the session cookie.");
          return;
        }

        const cookieHeader = String(request.headers.cookie || "");
        const matches = cookieHeader.match(/(?:^|;\s*)sid=([^;]+)/);
        let token = "";
        try { token = matches ? decodeURIComponent(matches[1]) : ""; } catch (_) {}
        if (!token || typeof getSessionFromToken !== "function") {
          rejectUpgrade(socket, 401, "Unauthorized", "Authentication required.");
          return;
        }

        const clientIp = getClientIp(request);
        const admitted = Number(connectionsByIp.get(clientIp) || 0)
          + Number(pendingUpgradesByIp.get(clientIp) || 0);
        if (admitted >= effectiveMaxConnectionsPerIp) {
          rejectUpgrade(socket, 429, "Too Many Requests", "WebSocket connection limit exceeded.");
          return;
        }
        changeCount(pendingUpgradesByIp, clientIp, 1);

        let rawSession;
        try { rawSession = getSessionFromToken(token); }
        catch (_) { rawSession = null; }
        withAuthTimeout(rawSession)
          .then((session) => {
            if (!session?.username) {
              rejectUpgrade(socket, 401, "Unauthorized", "Authentication required.");
              return;
            }
            request._wsClientIp = clientIp;
            request._wsSessionTokenId = sessionTokenStorageValue(token);
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit("connection", ws, request, session);
            });
          })
          .catch(() => {
            rejectUpgrade(socket, 401, "Unauthorized", "Authentication required.");
          })
          .finally(() => changeCount(pendingUpgradesByIp, clientIp, -1));
      }
    });
  }

  return {
    wss,
    clientsByUsername,
    sendEvent,
    sendChatEvent,
    broadcastAll,
    disconnectSession(token) {
      const tokenId = sessionTokenStorageValue(token);
      wss.clients.forEach((ws) => {
        if (tokenId && ws._sessionTokenId === tokenId) {
          try { ws.send(JSON.stringify({ type: "session_revoked" })); } catch (_) {}
          try { ws.close(1008, "Session revoked"); } catch (_) {}
        }
      });
    },
    disconnectUsername(username, reason = "revoked") {
      const key = String(username || "").trim().toLowerCase();
      const safeReason = ["banned", "password_changed", "account_deleted", "revoked"]
        .includes(String(reason || ""))
        ? String(reason)
        : "revoked";
      const clients = clientsByUsername.get(key);
      if (!clients?.size) return 0;
      let disconnected = 0;
      for (const ws of [...clients]) {
        try {
          ws.send(JSON.stringify({ type: "session_revoked", reason: safeReason }));
        } catch (_) {}
        try { ws.close(1008, "Session revoked"); } catch (_) {}
        disconnected += 1;
      }
      return disconnected;
    },
    close() {
      clearInterval(heartbeatTimer);
      if (sessionRevalidateTimer) clearInterval(sessionRevalidateTimer);
      if (wss.clients && typeof wss.clients.forEach === "function") {
        wss.clients.forEach((ws) => clearHeartbeatTimeoutTimer(ws));
      }
      if (unsubscribeHub) unsubscribeHub();
      if (pubsubSub) pubsubSub.quit();
      wss.close();
    },
  };
}
