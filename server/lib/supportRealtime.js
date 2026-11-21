import crypto from "node:crypto";
import { isIP } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

const DEFAULT_MAX_REPLAY = 200;

export class SupportRealtimeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "SupportRealtimeError";
    this.code = code;
    this.status = status;
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function parseCookie(request, name) {
  const raw = String(request?.headers?.cookie || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch (_) {
      return "";
    }
  }
  return "";
}

function writeSse(res, event) {
  const id = String(event?.cursor || event?.id || "").replace(/[\r\n]/g, "");
  const type = String(event?.type || "message").replace(/[^a-zA-Z0-9_.:-]/g, "");
  const lines = [];
  if (id) lines.push(`id: ${id}`);
  if (type) lines.push(`event: ${type}`);
  lines.push(`data: ${JSON.stringify(event)}`);
  res.write(`${lines.join("\n")}\n\n`);
}

function isOpen(ws) {
  return ws?.readyState === WebSocket.OPEN || ws?.readyState === 1;
}

function normalizeOrigins(value) {
  return new Set(
    (Array.isArray(value) ? value : String(value || "").split(","))
      .map((origin) => String(origin || "").trim())
      .filter(Boolean)
      .map((origin) => {
        try { return new URL(origin).origin; } catch (_) { return ""; }
      })
      .filter(Boolean),
  );
}

export function isSupportOriginAllowed(
  request,
  { allowedOrigins, allowMissingOrigin = false } = {},
) {
  const raw = String(request?.headers?.origin || "").trim();
  if (!raw) return allowMissingOrigin === true;
  let origin;
  try { origin = new URL(raw).origin; } catch (_) { return false; }
  const configured = allowedOrigins instanceof Set
    ? allowedOrigins
    : normalizeOrigins(allowedOrigins);
  if (configured.size > 0) return configured.has(origin);
  const host = String(request?.headers?.host || "").trim().toLowerCase();
  return Boolean(host) && (origin === `https://${host}` || origin === `http://${host}`);
}

/**
 * Conversation-scoped fan-out with a small bounded in-process replay window.
 * Durable replay should be injected from Chat's MongoDB event journal.
 */
export function createSupportEventHub({
  maxReplayEvents = DEFAULT_MAX_REPLAY,
  maxTrackedConversations = 1_000,
  maxConnectionsPerSession = 4,
  now = Date.now,
} = {}) {
  const replayLimit = boundedInteger(maxReplayEvents, DEFAULT_MAX_REPLAY, 1, 1_000);
  const conversationLimit = boundedInteger(maxTrackedConversations, 1_000, 10, 10_000);
  const sessionConnectionLimit = boundedInteger(maxConnectionsPerSession, 4, 1, 20);
  const subscribers = new Map();
  const replayByConversation = new Map();
  const connectionsBySession = new Map();
  let sequence = 0;

  function touchReplay(conversationId, events) {
    replayByConversation.delete(conversationId);
    replayByConversation.set(conversationId, events);
    while (replayByConversation.size > conversationLimit) {
      replayByConversation.delete(replayByConversation.keys().next().value);
    }
  }

  function publish(conversationId, payload = {}) {
    const normalizedId = String(conversationId || "").trim();
    if (!normalizedId) {
      throw new SupportRealtimeError(
        "SUPPORT_CONVERSATION_INVALID",
        "A support conversation is required.",
      );
    }
    sequence += 1;
    const requestedCursor = typeof payload.cursor === "string"
      ? payload.cursor.trim()
      : "";
    const cursor = requestedCursor && requestedCursor.length <= 256 && !/[\r\n]/.test(requestedCursor)
      ? requestedCursor
      : `sr_${sequence.toString(36)}`;
    const envelope = {
      ...payload,
      version: 1,
      conversationId: normalizedId,
      cursor,
      eventId: typeof payload.eventId === "string" && payload.eventId
        ? payload.eventId
        : crypto.randomUUID(),
      occurredAt: typeof payload.occurredAt === "string" && payload.occurredAt
        ? payload.occurredAt
        : new Date(Number(now())).toISOString(),
    };
    const events = [...(replayByConversation.get(normalizedId) || []), envelope]
      .slice(-replayLimit);
    touchReplay(normalizedId, events);
    for (const subscriber of [...(subscribers.get(normalizedId) || [])]) {
      try {
        subscriber.onEvent(envelope);
      } catch (_) {}
    }
    return envelope;
  }

  function subscribe(conversationId, onEvent, { sessionId, onDisconnect } = {}) {
    const normalizedId = String(conversationId || "").trim();
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedId || !normalizedSessionId || typeof onEvent !== "function") {
      throw new SupportRealtimeError(
        "SUPPORT_REALTIME_INVALID",
        "Support realtime subscription is invalid.",
      );
    }
    const currentCount = Number(connectionsBySession.get(normalizedSessionId) || 0);
    if (currentCount >= sessionConnectionLimit) {
      throw new SupportRealtimeError(
        "SUPPORT_CONNECTION_LIMIT",
        "Too many support connections are open.",
        429,
      );
    }
    const entry = {
      conversationId: normalizedId,
      sessionId: normalizedSessionId,
      onEvent,
      onDisconnect,
      closed: false,
    };
    const set = subscribers.get(normalizedId) || new Set();
    set.add(entry);
    subscribers.set(normalizedId, set);
    connectionsBySession.set(normalizedSessionId, currentCount + 1);

    const unsubscribe = (reason = "closed", notify = false) => {
      if (entry.closed) return false;
      entry.closed = true;
      const current = subscribers.get(normalizedId);
      current?.delete(entry);
      if (current && !current.size) subscribers.delete(normalizedId);
      const next = Math.max(
        0,
        Number(connectionsBySession.get(normalizedSessionId) || 0) - 1,
      );
      if (next) connectionsBySession.set(normalizedSessionId, next);
      else connectionsBySession.delete(normalizedSessionId);
      if (notify && typeof entry.onDisconnect === "function") {
        try { entry.onDisconnect(reason); } catch (_) {}
      }
      return true;
    };
    entry.unsubscribe = unsubscribe;
    return () => unsubscribe("closed", false);
  }

  function disconnectSession(sessionId, reason = "revoked") {
    const normalized = String(sessionId || "").trim();
    if (!normalized) return 0;
    let disconnected = 0;
    for (const set of [...subscribers.values()]) {
      for (const subscriber of [...set]) {
        if (subscriber.sessionId !== normalized) continue;
        if (subscriber.unsubscribe(reason, true)) disconnected += 1;
      }
    }
    return disconnected;
  }

  function replay(conversationId, afterCursor = null, limit = DEFAULT_MAX_REPLAY) {
    const events = replayByConversation.get(String(conversationId || "").trim()) || [];
    const pageLimit = boundedInteger(limit, DEFAULT_MAX_REPLAY, 1, replayLimit);
    let start = 0;
    let gap = false;
    if (afterCursor) {
      const index = events.findIndex((event) => event.cursor === afterCursor);
      if (index >= 0) start = index + 1;
      else gap = events.length > 0;
    }
    const page = events.slice(start, start + pageLimit);
    return {
      events: page,
      cursor: page.at(-1)?.cursor || afterCursor || null,
      hasMore: start + page.length < events.length,
      gap,
    };
  }

  return {
    publish,
    subscribe,
    disconnectSession,
    replay,
    close() {
      for (const set of [...subscribers.values()]) {
        for (const subscriber of [...set]) {
          subscriber.unsubscribe("shutdown", true);
        }
      }
      subscribers.clear();
      replayByConversation.clear();
      connectionsBySession.clear();
    },
  };
}

export function createSupportRealtime({
  eventHub = createSupportEventHub(),
  authenticateToken,
  loadReplayEvents,
  allowedOrigins,
  allowMissingOrigin = false,
  revalidateIntervalMs = Number(process.env.SUPPORT_REALTIME_REVALIDATE_MS) || 15_000,
  heartbeatIntervalMs = 25_000,
} = {}) {
  const revalidateMs = boundedInteger(revalidateIntervalMs, 15_000, 250, 60_000);
  const heartbeatMs = boundedInteger(heartbeatIntervalMs, 25_000, 1_000, 60_000);
  const streams = new Set();
  const configuredOrigins = normalizeOrigins(allowedOrigins);

  async function openSse(req, res, { token } = {}) {
    if (!isSupportOriginAllowed(req, {
      allowedOrigins: configuredOrigins,
      allowMissingOrigin,
    })) {
      throw new SupportRealtimeError(
        "SUPPORT_ORIGIN_DENIED",
        "The support event origin is not allowed.",
        403,
      );
    }
    if (typeof authenticateToken !== "function") {
      throw new SupportRealtimeError(
        "SUPPORT_PROVIDER_UNAVAILABLE",
        "Support session verification is unavailable.",
        503,
      );
    }
    const session = await authenticateToken(token, {
      requiredAction: "events",
      touch: true,
      revalidate: true,
    });
    if (!session?.id || !session?.conversationId) {
      throw new SupportRealtimeError(
        "SUPPORT_SESSION_REQUIRED",
        "A valid support session is required.",
        401,
      );
    }

    if (typeof res.set === "function") {
      res.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
    } else if (typeof res.setHeader === "function") {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "private, no-store, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
    }
    res.flushHeaders?.();

    const stream = {
      sessionId: session.id,
      conversationId: session.conversationId,
      res,
      closed: false,
      replaying: true,
      pending: [],
      sentEventKeys: new Set(),
      timers: [],
      unsubscribe: null,
    };
    const closeStream = (reason = "closed", notify = false) => {
      if (stream.closed) return;
      stream.closed = true;
      for (const timer of stream.timers) clearTimeout(timer);
      stream.timers.length = 0;
      stream.unsubscribe?.();
      streams.delete(stream);
      if (notify) {
        try {
          writeSse(res, {
            version: 1,
            type: "session_revoked",
            conversationId: session.conversationId,
            reason: String(reason || "revoked").slice(0, 80),
          });
        } catch (_) {}
      }
      try { res.end(); } catch (_) {}
    };
    const sendEvent = (event) => {
      if (stream.closed || !event || typeof event !== "object") return false;
      const key = String(event.eventId || event.cursor || "").trim();
      if (key && stream.sentEventKeys.has(key)) return false;
      if (key) {
        stream.sentEventKeys.add(key);
        while (stream.sentEventKeys.size > 400) {
          stream.sentEventKeys.delete(stream.sentEventKeys.values().next().value);
        }
      }
      writeSse(res, event);
      return true;
    };
    const receiveLiveEvent = (event) => {
      if (!stream.replaying) {
        sendEvent(event);
        return;
      }
      stream.pending.push(event);
      if (stream.pending.length > DEFAULT_MAX_REPLAY) stream.pending.shift();
    };

    const requestedCursor = String(
      req?.headers?.["last-event-id"] || req?.query?.cursor || "",
    ).trim().slice(0, 256) || null;
    let replayResult;
    try {
      stream.unsubscribe = eventHub.subscribe(
        session.conversationId,
        receiveLiveEvent,
        {
          sessionId: session.id,
          onDisconnect: (reason) => closeStream(reason, true),
        },
      );
      streams.add(stream);
      if (typeof loadReplayEvents === "function") {
        replayResult = await loadReplayEvents(session.conversationId, {
          after: requestedCursor,
          limit: DEFAULT_MAX_REPLAY,
          session,
        });
      } else {
        replayResult = eventHub.replay(
          session.conversationId,
          requestedCursor,
          DEFAULT_MAX_REPLAY,
        );
      }
    } catch (error) {
      closeStream("replay_failed");
      throw error;
    }
    const replayEvents = Array.isArray(replayResult?.events)
      ? replayResult.events.slice(0, DEFAULT_MAX_REPLAY)
      : [];
    for (const event of replayEvents) {
      if (
        !event?.conversationId ||
        event.conversationId === session.conversationId
      ) {
        sendEvent({ ...event, conversationId: session.conversationId });
      }
    }
    stream.replaying = false;
    for (const event of stream.pending.splice(0, DEFAULT_MAX_REPLAY)) sendEvent(event);
    sendEvent({
      version: 1,
      type: "connected",
      conversationId: session.conversationId,
      cursor: replayResult?.cursor || requestedCursor || null,
      hasMore: Boolean(replayResult?.hasMore),
      gap: Boolean(replayResult?.gap),
    });

    const heartbeat = setInterval(() => {
      if (stream.closed) return;
      try { res.write(": ping\n\n"); } catch (_) { closeStream("write_failed"); }
    }, heartbeatMs);
    heartbeat.unref?.();
    stream.timers.push(heartbeat);

    let revalidating = false;
    const revalidate = setInterval(async () => {
      if (stream.closed || revalidating) return;
      revalidating = true;
      try {
        const current = await authenticateToken(token, {
          requiredAction: "events",
          touch: false,
          revalidate: true,
        });
        if (
          current?.id !== session.id ||
          current?.conversationId !== session.conversationId
        ) {
          closeStream("authorization_changed", true);
        }
      } catch (_) {
        closeStream("expired_or_revoked", true);
      } finally {
        revalidating = false;
      }
    }, revalidateMs);
    revalidate.unref?.();
    stream.timers.push(revalidate);

    const expiresAt = Date.parse(session.expiresAt);
    if (Number.isFinite(expiresAt)) {
      const delay = Math.max(0, Math.min(2_147_000_000, expiresAt - Date.now()));
      const expiry = setTimeout(() => closeStream("expired", true), delay);
      expiry.unref?.();
      stream.timers.push(expiry);
    }
    req?.once?.("close", () => closeStream("client_closed"));
    res?.once?.("close", () => closeStream("client_closed"));
    return session;
  }

  return {
    openSse,
    publish: eventHub.publish,
    disconnectSession: eventHub.disconnectSession,
    close() {
      for (const stream of [...streams]) {
        try {
          eventHub.disconnectSession(stream.sessionId, "shutdown");
        } catch (_) {}
      }
      streams.clear();
    },
  };
}

function websocketClientIp(request, trustProxy) {
  const direct = String(request?.socket?.remoteAddress || "unknown");
  if (!trustProxy) return direct;
  const forwarded = String(request?.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return isIP(forwarded) ? forwarded : direct;
}

export function createSupportWebSocketGateway({
  server,
  eventHub = createSupportEventHub(),
  authenticateToken,
  loadReplayEvents,
  cookieName = "owj_support_sid",
  path = "/support/v1/ws",
  allowedOrigins,
  allowMissingOrigin = false,
  maxPayloadBytes = 16 * 1024,
  maxConnectionsPerIp = 20,
  revalidateIntervalMs = Number(process.env.SUPPORT_REALTIME_REVALIDATE_MS) || 15_000,
  heartbeatIntervalMs = 30_000,
  heartbeatTimeoutMs = 10_000,
  authTimeoutMs = 5_000,
  trustProxy = false,
} = {}) {
  const payloadLimit = boundedInteger(maxPayloadBytes, 16 * 1024, 1_024, 64 * 1_024);
  const ipLimit = boundedInteger(maxConnectionsPerIp, 20, 1, 200);
  const revalidateMs = boundedInteger(revalidateIntervalMs, 15_000, 250, 60_000);
  const authMs = boundedInteger(authTimeoutMs, 5_000, 100, 30_000);
  const origins = normalizeOrigins(allowedOrigins);
  const wss = new WebSocketServer({ noServer: true, maxPayload: payloadLimit });
  const connectionsByIp = new Map();
  const socketsBySession = new Map();

  function changeCount(ip, delta) {
    const next = Math.max(0, Number(connectionsByIp.get(ip) || 0) + delta);
    if (next) connectionsByIp.set(ip, next);
    else connectionsByIp.delete(ip);
    return next;
  }

  function reject(socket, status, text, message) {
    const body = `${message}\n`;
    try {
      socket.write(
        `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
      );
    } catch (_) {}
    try { socket.destroy(); } catch (_) {}
  }

  function originAllowed(request) {
    return isSupportOriginAllowed(request, {
      allowedOrigins: origins,
      allowMissingOrigin,
    });
  }

  function withTimeout(value) {
    let timer;
    const timeout = new Promise((_, rejectPromise) => {
      timer = setTimeout(
        () => rejectPromise(new Error("Support authentication timed out.")),
        authMs,
      );
      timer.unref?.();
    });
    return Promise.race([Promise.resolve(value), timeout]).finally(() => clearTimeout(timer));
  }

  function closeSocket(ws, reason = "expired_or_revoked") {
    if (isOpen(ws)) {
      try {
        ws.send(JSON.stringify({
          version: 1,
          type: "session_revoked",
          reason: String(reason).slice(0, 80),
        }));
      } catch (_) {}
    }
    try { ws.close(1008, "Support session revoked"); } catch (_) {}
  }

  wss.on("connection", (ws, request, session, token, clientIp) => {
    ws.isAlive = true;
    ws._supportSessionId = session.id;
    ws._supportIp = clientIp;
    ws._supportClosed = false;
    ws._supportReplayActive = false;
    ws._supportSentEventKeys = new Set();
    changeCount(clientIp, 1);
    const sockets = socketsBySession.get(session.id) || new Set();
    sockets.add(ws);
    socketsBySession.set(session.id, sockets);

    const timers = [];
    const cleanup = () => {
      if (ws._supportClosed) return;
      ws._supportClosed = true;
      timers.forEach(clearTimeout);
      unsubscribe?.();
      changeCount(clientIp, -1);
      const current = socketsBySession.get(session.id);
      current?.delete(ws);
      if (current && !current.size) socketsBySession.delete(session.id);
    };
    const sendEvent = (event) => {
      if (!isOpen(ws) || !event || typeof event !== "object") return false;
      if (
        event.conversationId &&
        event.conversationId !== session.conversationId
      ) return false;
      const key = String(
        event.eventId || (event.type === "replay_complete" ? "" : event.cursor) || "",
      ).trim();
      if (key && ws._supportSentEventKeys.has(key)) return false;
      if (key) {
        ws._supportSentEventKeys.add(key);
        while (ws._supportSentEventKeys.size > 400) {
          ws._supportSentEventKeys.delete(ws._supportSentEventKeys.values().next().value);
        }
      }
      try { ws.send(JSON.stringify(event)); } catch (_) { return false; }
      return true;
    };
    let unsubscribe;
    try {
      unsubscribe = eventHub.subscribe(
        session.conversationId,
        sendEvent,
        {
          sessionId: session.id,
          onDisconnect: (reason) => closeSocket(ws, reason),
        },
      );
    } catch (error) {
      cleanup();
      try { ws.close(1013, "Support connection limit reached"); } catch (_) {}
      return;
    }

    ws.on?.("pong", () => { ws.isAlive = true; });
    ws.on?.("message", async (raw) => {
      if (Buffer.byteLength(raw) > payloadLimit) {
        try { ws.close(1009, "Payload too large"); } catch (_) {}
        return;
      }
      let message;
      try { message = JSON.parse(Buffer.from(raw).toString("utf8")); } catch (_) {
        try { ws.send(JSON.stringify({ version: 1, type: "error", code: "INVALID_PAYLOAD" })); } catch (_) {}
        return;
      }
      if (message?.type === "ping") {
        try { ws.send(JSON.stringify({ version: 1, type: "pong", timestamp: new Date().toISOString() })); } catch (_) {}
      } else if (message?.type === "resume") {
        const cursor = typeof message.cursor === "string"
          ? message.cursor.trim()
          : "";
        if (cursor.length > 256 || /[\r\n]/.test(cursor)) {
          try { ws.send(JSON.stringify({ version: 1, type: "error", code: "INVALID_REPLAY_CURSOR" })); } catch (_) {}
          return;
        }
        if (ws._supportReplayActive) {
          try { ws.send(JSON.stringify({ version: 1, type: "error", code: "REPLAY_IN_PROGRESS" })); } catch (_) {}
          return;
        }
        ws._supportReplayActive = true;
        try {
          const result = typeof loadReplayEvents === "function"
            ? await loadReplayEvents(session.conversationId, {
                after: cursor || null,
                limit: DEFAULT_MAX_REPLAY,
                session,
              })
            : eventHub.replay(
                session.conversationId,
                cursor || null,
                DEFAULT_MAX_REPLAY,
              );
          const events = Array.isArray(result?.events)
            ? result.events.slice(0, DEFAULT_MAX_REPLAY)
            : [];
          for (const event of events) {
            if (
              !event?.conversationId ||
              event.conversationId === session.conversationId
            ) {
              sendEvent({ ...event, conversationId: session.conversationId });
            }
          }
          sendEvent({
            version: 1,
            type: "replay_complete",
            conversationId: session.conversationId,
            cursor: result?.cursor || cursor || null,
            hasMore: Boolean(result?.hasMore),
            gap: Boolean(result?.gap),
          });
        } catch (_) {
          try { ws.send(JSON.stringify({ version: 1, type: "error", code: "REPLAY_UNAVAILABLE" })); } catch (_) {}
        } finally {
          ws._supportReplayActive = false;
        }
      } else {
        try { ws.send(JSON.stringify({ version: 1, type: "error", code: "UNSUPPORTED_ACTION" })); } catch (_) {}
      }
    });
    ws.on?.("close", cleanup);
    ws.on?.("error", cleanup);

    let checking = false;
    const revalidate = setInterval(async () => {
      if (ws._supportClosed || checking) return;
      checking = true;
      try {
        const current = await authenticateToken(token, {
          requiredAction: "events",
          touch: false,
          revalidate: true,
        });
        if (
          current?.id !== session.id ||
          current?.conversationId !== session.conversationId
        ) {
          closeSocket(ws, "authorization_changed");
        }
      } catch (_) {
        closeSocket(ws, "expired_or_revoked");
      } finally {
        checking = false;
      }
    }, revalidateMs);
    revalidate.unref?.();
    timers.push(revalidate);

    const expiresAt = Date.parse(session.expiresAt);
    if (Number.isFinite(expiresAt)) {
      const expiry = setTimeout(
        () => closeSocket(ws, "expired"),
        Math.max(0, Math.min(2_147_000_000, expiresAt - Date.now())),
      );
      expiry.unref?.();
      timers.push(expiry);
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch (_) {}
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) {}
      const timeout = setTimeout(() => {
        if (ws.isAlive === false) {
          try { ws.terminate(); } catch (_) {}
        }
      }, heartbeatTimeoutMs);
      timeout.unref?.();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref?.();

  const handleUpgrade = async (request, socket, head) => {
    let parsed;
    try { parsed = new URL(request.url || "", "http://localhost"); } catch (_) { return; }
    if (parsed.pathname !== path) return;
    if (parsed.searchParams.has("token") || parsed.searchParams.has("sid") || parsed.searchParams.has("supportSession")) {
      reject(socket, 400, "Bad Request", "WebSocket credentials must use the support cookie.");
      return;
    }
    if (!originAllowed(request)) {
      reject(socket, 403, "Forbidden", "WebSocket origin is not allowed.");
      return;
    }
    if (typeof authenticateToken !== "function") {
      reject(socket, 503, "Service Unavailable", "Support authentication is unavailable.");
      return;
    }
    const token = parseCookie(request, cookieName);
    if (!token) {
      reject(socket, 401, "Unauthorized", "A support session is required.");
      return;
    }
    const clientIp = websocketClientIp(request, trustProxy);
    if (Number(connectionsByIp.get(clientIp) || 0) >= ipLimit) {
      reject(socket, 429, "Too Many Requests", "Too many WebSocket connections.");
      return;
    }
    let session;
    try {
      session = await withTimeout(authenticateToken(token, {
        requiredAction: "events",
        touch: true,
        revalidate: true,
      }));
    } catch (_) {
      reject(socket, 401, "Unauthorized", "The support session is invalid.");
      return;
    }
    if (!session?.id || !session?.conversationId) {
      reject(socket, 401, "Unauthorized", "The support session is invalid.");
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, session, token, clientIp);
    });
  };
  server?.on?.("upgrade", handleUpgrade);

  return {
    wss,
    handleUpgrade,
    disconnectSession(sessionId, reason = "revoked") {
      const disconnected = eventHub.disconnectSession(sessionId, reason);
      for (const ws of [...(socketsBySession.get(sessionId) || [])]) {
        closeSocket(ws, reason);
      }
      return disconnected;
    },
    close() {
      server?.off?.("upgrade", handleUpgrade);
      clearInterval(heartbeat);
      for (const sockets of socketsBySession.values()) {
        for (const ws of sockets) closeSocket(ws, "shutdown");
      }
      socketsBySession.clear();
      connectionsByIp.clear();
      try { wss.close(); } catch (_) {}
    },
  };
}

export { parseCookie as readSupportCookie };
