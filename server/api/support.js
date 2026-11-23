import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { isValidUuid } from "../lib/uuidUtils.js";
import { readSupportCookie } from "../lib/supportRealtime.js";

const SUPPORT_COOKIE = "owj_support_sid";
const SUPPORT_COOKIE_PATH = "/support/v1";
const SUPPORT_V2_COOKIE = "owj_support_v2_sid";
const SUPPORT_V2_COOKIE_PATH = "/support/v2";
const MAX_MESSAGE_CHARS = 4_000;
const MAX_MESSAGE_BYTES = 16 * 1_024;
const ALLOWED_CONTEXT_FIELDS = new Set(["page", "locale", "publicListingId"]);
const STAFF_STATUSES = new Set(["available", "assigned", "open", "resolved", "closed"]);

class SupportApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "SupportApiError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status = 400) {
  throw new SupportApiError(code, message, status);
}

function requestId(req) {
  const supplied = String(req?.headers?.["x-request-id"] || "").trim();
  return supplied && supplied.length <= 128 ? supplied : crypto.randomUUID();
}

function stableError(error, fallbackRequestId) {
  if (error?.code && Number.isInteger(error?.status)) {
    return {
      status: error.status,
      body: {
        error: {
          code: String(error.code),
          message: String(error.message || "The support request failed."),
          requestId: fallbackRequestId,
        },
      },
    };
  }
  if (error?.code === 11000) {
    return {
      status: 409,
      body: {
        error: {
          code: "SUPPORT_IDEMPOTENCY_CONFLICT",
          message: "The idempotency key conflicts with an existing request.",
          requestId: fallbackRequestId,
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "SUPPORT_INTERNAL_ERROR",
        message: "The support request could not be completed.",
        requestId: fallbackRequestId,
      },
    },
  };
}

function wrap(handler) {
  return async (req, res) => {
    const id = requestId(req);
    res.set?.("X-Request-Id", id);
    try {
      await handler(req, res, id);
    } catch (error) {
      if (res.headersSent) {
        try { res.end(); } catch (_) {}
        return;
      }
      const response = stableError(error, id);
      res.status(response.status).json(response.body);
    }
  };
}

function stringField(value, { code = "SUPPORT_REQUEST_INVALID", max = 200, required = true } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if ((required && !normalized) || normalized.length > max) {
    fail(code, "The support request is invalid.", 400);
  }
  return normalized || null;
}

function idempotencyKey(req) {
  return stringField(
    req.headers?.["idempotency-key"] || req.body?.idempotencyKey,
    { code: "SUPPORT_REQUEST_INVALID", max: 180 },
  );
}

function normalizeContext(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("SUPPORT_REQUEST_INVALID", "Support context is invalid.", 400);
  }
  const context = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!ALLOWED_CONTEXT_FIELDS.has(key)) {
      fail("SUPPORT_REQUEST_INVALID", "Support context contains an unsupported field.", 400);
    }
    context[key] = stringField(raw, { max: 500 });
  }
  if (Buffer.byteLength(JSON.stringify(context)) > 2_048) {
    fail("SUPPORT_REQUEST_INVALID", "Support context is too large.", 400);
  }
  return context;
}

function decodeCursor(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > 512) {
    fail("SUPPORT_REQUEST_INVALID", "The support cursor is invalid.", 400);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch (_) {
    fail("SUPPORT_REQUEST_INVALID", "The support cursor is invalid.", 400);
  }
  const id = stringField(parsed?.id, { max: 128 });
  const createdAt = stringField(parsed?.createdAt, { max: 64 });
  if (!Number.isFinite(Date.parse(createdAt))) {
    fail("SUPPORT_REQUEST_INVALID", "The support cursor is invalid.", 400);
  }
  return { id, createdAt };
}

function encodeCursor(message) {
  const id = message?.id;
  const createdAt = message?.createdAt || message?.created_at;
  if (!id || !Number.isFinite(Date.parse(createdAt))) return null;
  return Buffer.from(JSON.stringify({ id, createdAt })).toString("base64url");
}

function pageLimit(value) {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function normalizeMessage(message, session) {
  const files = Array.isArray(message?.files)
    ? message.files.slice(0, 10).map((file) => ({
        id: file.id || null,
        kind: file.kind || null,
        name: file.name || file.original_name || null,
        mimeType: file.mimeType || file.mime_type || null,
        sizeBytes: Number(file.sizeBytes || file.size_bytes || 0),
        url: file.url || (file.id ? `/api/uploads/file/${encodeURIComponent(file.id)}` : null),
        thumbUrl: file.thumbUrl || null,
      }))
    : [];
  const authorId = message?.userId || message?.user_id || null;
  return {
    id: message?.id || null,
    body: String(message?.editedBody ?? message?.edited_body ?? message?.body ?? ""),
    authorKind: ["customer", "agent"].includes(message?.authorKind)
      ? message.authorKind
      : String(authorId) === String(session.chatUserId) ? "customer" : "agent",
    createdAt: message?.createdAt || message?.created_at || null,
    editedAt: message?.editedAt || message?.edited_at || null,
    files,
  };
}

function validateMessageInput(body) {
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (
    !text ||
    text === "[object Object]" ||
    text.length > MAX_MESSAGE_CHARS ||
    Buffer.byteLength(text, "utf8") > MAX_MESSAGE_BYTES
  ) {
    fail("SUPPORT_REQUEST_INVALID", "The support message is invalid or too long.", 400);
  }
  const clientRequestId = stringField(body?.clientRequestId, { max: 120 });
  if (!/^[A-Za-z0-9._:-]+$/.test(clientRequestId)) {
    fail("SUPPORT_REQUEST_INVALID", "The message idempotency identifier is invalid.", 400);
  }
  return { text, clientRequestId };
}

function normalizeStaffConversation(value) {
  return {
    conversationId: value?.conversationId || null,
    status: value?.status || null,
    assigned: Boolean(value?.assigned),
    assignedToCurrentAgent: Boolean(value?.assignedToCurrentAgent),
    identityKind: value?.identityKind || null,
    createdAt: value?.createdAt || null,
    updatedAt: value?.updatedAt || null,
    resolvedAt: value?.resolvedAt || null,
    closedAt: value?.closedAt || null,
  };
}

function requireConversationId(value) {
  const id = String(value || "").trim();
  if (!isValidUuid(id)) {
    fail("SUPPORT_REQUEST_INVALID", "A valid support conversation is required.", 400);
  }
  return id;
}

export function registerSupportRoutes(app, deps = {}) {
  const cookieName = String(deps.supportCookieName || SUPPORT_COOKIE);
  const cookiePath = String(deps.supportCookiePath || SUPPORT_COOKIE_PATH);
  const v2CookieName = String(deps.supportV2CookieName || SUPPORT_V2_COOKIE);
  const v2CookiePath = String(deps.supportV2CookiePath || SUPPORT_V2_COOKIE_PATH);
  const secureCookie = deps.secureSupportCookie ?? process.env.NODE_ENV === "production";

  const bootstrapRateLimit = Math.max(
    10,
    Math.min(10_000, Number(process.env.SUPPORT_BOOTSTRAP_RATE_LIMIT) || 3_000),
  );
  const bootstrapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: bootstrapRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const response = stableError(
        new SupportApiError("SUPPORT_RATE_LIMITED", "Too many support bootstrap requests.", 429),
        requestId(req),
      );
      res.status(response.status).json(response.body);
    },
  });
  const messageLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const response = stableError(
        new SupportApiError("SUPPORT_RATE_LIMITED", "Too many support message requests.", 429),
        requestId(req),
      );
      res.status(response.status).json(response.body);
    },
  });

  async function authenticateRequest(req, requiredAction, { version2 = false, credential = null } = {}) {
    if (!deps.supportSessionService || typeof deps.supportSessionService.authenticate !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support sessions are unavailable.", 503);
    }
    const selectedCredential = credential || readSupportCookie(
      req,
      version2 ? v2CookieName : cookieName,
    );
    return deps.supportSessionService.authenticate(selectedCredential, {
      requiredAction,
      touch: true,
      revalidate: true,
    });
  }

  function requireAgent(session) {
    if (
      session?.actorKind !== "agent" ||
      !Array.isArray(session?.scopes) ||
      !session.scopes.includes("support:agent")
    ) {
      fail("SUPPORT_AGENT_REQUIRED", "An authorized support agent is required.", 403);
    }
  }

  async function persistMessage({ session, conversationId, body, staff = false, version2 = false }) {
    if (!session?.chatUserId) {
      fail("SUPPORT_CONVERSATION_DENIED", "The support actor is not bound to Chat.", 403);
    }
    if (typeof deps.createOrReuseMessage !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support message persistence is unavailable.", 503);
    }
    if (staff) {
      if (typeof deps.authorizeSupportAgentConversation !== "function") {
        fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support assignment authorization is unavailable.", 503);
      }
      const allowed = await deps.authorizeSupportAgentConversation({
        session,
        conversationId,
        operation: "reply",
      });
      if (!allowed) {
        fail("SUPPORT_CONVERSATION_DENIED", "The support conversation is not assigned to this agent.", 403);
      }
    } else {
      const authorize = version2 ? deps.authorizeSupportCaseV2 : deps.authorizeSupportConversation;
      if (typeof authorize !== "function") {
        fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support conversation authorization is unavailable.", 503);
      }
      const allowed = await authorize({
        session,
        conversationId,
        operation: "send",
      });
      if (!allowed) {
        fail("SUPPORT_CONVERSATION_DENIED", "The support conversation is not open for messages.", 403);
      }
    }
    const input = validateMessageInput(body);
    const result = await deps.createOrReuseMessage(
      conversationId,
      session.chatUserId,
      input.text,
      null,
      null,
      input.clientRequestId,
    );
    const messageId = result?.id || result?.messageId;
    if (!messageId) {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "The support message could not be persisted.", 503);
    }
    const deduped = Boolean(result?.deduped);
    if (result?.conflict) {
      fail(
        "SUPPORT_IDEMPOTENCY_CONFLICT",
        "The idempotency identifier is already bound to a different message.",
        409,
      );
    }
    if (!deduped) {
      const event = {
        version: 1,
        type: "chat_message",
        chatId: conversationId,
        conversationId,
        messageId,
        userId: session.chatUserId,
        actorKind: staff ? "agent" : "customer",
      };
      // createOrReuseMessage writes the durable Mongo event in the same
      // transaction as the message. Broadcast without journaling it twice.
      deps.emitChatEvent?.(conversationId, event, { record: false });
      deps.supportRealtime?.publish?.(conversationId, {
        ...event,
        cursor: messageId,
        eventId: `message:${messageId}`,
      });
    }
    return { messageId, deduped };
  }

  app.post("/internal/v1/support/bootstrap", bootstrapLimiter, wrap(async (req, res) => {
    if (typeof deps.verifyWebServiceRequest !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Web service authentication is unavailable.", 503);
    }
    const service = await deps.verifyWebServiceRequest(req, {
      requiredScope: "chat:support:bootstrap",
    });
    if (!service) {
      fail("SUPPORT_SERVICE_UNAUTHORIZED", "The Web service credential is invalid.", 401);
    }
    if (!deps.platformIdentityAdapter || typeof deps.platformIdentityAdapter.authenticate !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Web identity verification is unavailable.", 503);
    }
    const assertion = stringField(req.body?.assertion, { max: 16_384 });
    const key = idempotencyKey(req);
    const staffBootstrap = req.body?.bootstrapType === "staff";
    if (req.body?.bootstrapType && !["customer", "staff"].includes(req.body.bootstrapType)) {
      fail("SUPPORT_REQUEST_INVALID", "The support bootstrap type is invalid.", 400);
    }
    const principal = await deps.platformIdentityAdapter.authenticate({
      credential: assertion,
      requiredScopes: staffBootstrap
        ? ["support:conversation:create", "support:agent"]
        : ["support:conversation:create"],
      allowGuest: !staffBootstrap,
      allowedTokenUses: staffBootstrap
        ? ["support_agent"]
        : ["support_registered", "support_guest"],
    });
    if ((staffBootstrap && principal.kind !== "agent") || (!staffBootstrap && principal.kind === "agent")) {
      fail("SUPPORT_SCOPE_DENIED", "The support bootstrap identity type is not allowed.", 403);
    }
    if (typeof deps.createOrResumeSupportConversation !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support conversation persistence is unavailable.", 503);
    }
    const conversation = await deps.createOrResumeSupportConversation({
      principal,
      idempotencyKey: key,
      locale: stringField(req.body?.locale, { max: 35, required: false }),
      context: normalizeContext(req.body?.context),
      service,
    });
    if (!conversation?.conversationId || !conversation?.chatUserId) {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support conversation creation failed.", 503);
    }
    if (!deps.supportSessionService || typeof deps.supportSessionService.issue !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support sessions are unavailable.", 503);
    }
    const isAgent = principal.kind === "agent";
    const issued = await deps.supportSessionService.issue({
      principal,
      conversationId: conversation.conversationId,
      chatUserId: conversation.chatUserId,
      bootstrapJti: principal.jti || null,
      allowedActions: isAgent
        ? ["read", "send", "events", "logout", "staff:list", "staff:assign", "staff:resolve"]
        : ["read", "send", "events", "logout"],
    });
    res.set("Cache-Control", "private, no-store");
    res.status(conversation.created ? 201 : 200).json({
      version: 1,
      conversationId: conversation.conversationId,
      supportSessionCredential: issued.credential,
      expiresAt: issued.expiresAt,
      created: Boolean(conversation.created),
      assigned: Boolean(conversation.assigned),
      supportAvailable: conversation.supportAvailable !== false,
    });
  }));

  app.get("/support/v1/session", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "read");
    const available = typeof deps.getSupportAvailability === "function"
      ? await deps.getSupportAvailability(session)
      : session.supportAvailable !== false;
    res.set("Cache-Control", "private, no-store");
    res.json({
      version: 1,
      conversationId: session.conversationId,
      status: session.status,
      identityKind: session.actorKind,
      allowedActions: Array.isArray(session.allowedActions) ? session.allowedActions : [],
      expiresAt: session.expiresAt,
      supportAvailable: available !== false,
    });
  }));

  app.get("/support/v1/messages", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "read");
    if (typeof deps.listSupportMessages !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support message retrieval is unavailable.", 503);
    }
    const cursor = decodeCursor(req.query?.cursor);
    const result = await deps.listSupportMessages(session.conversationId, {
      cursor,
      beforeId: cursor?.id || null,
      beforeCreatedAt: cursor?.createdAt || null,
      limit: pageLimit(req.query?.limit),
      viewerChatUserId: session.chatUserId,
      session,
    });
    const rows = Array.isArray(result?.messages) ? result.messages.slice(0, 100) : [];
    const messages = rows.map((row) => normalizeMessage(row, session));
    res.set("Cache-Control", "private, no-store");
    res.json({
      version: 1,
      conversationId: session.conversationId,
      messages,
      nextCursor: result?.hasMore ? encodeCursor(rows.at(0)) : null,
      hasMore: Boolean(result?.hasMore),
    });
  }));

  app.post("/support/v1/messages", messageLimiter, wrap(async (req, res) => {
    const session = await authenticateRequest(req, "send");
    if (session.actorKind === "agent") {
      fail("SUPPORT_CONVERSATION_DENIED", "Agents must use the staff reply route.", 403);
    }
    const result = await persistMessage({
      session,
      conversationId: session.conversationId,
      body: req.body,
    });
    res.status(result.deduped ? 200 : 201).json({
      version: 1,
      conversationId: session.conversationId,
      ...result,
    });
  }));

  app.get("/support/v1/events", wrap(async (req, res) => {
    if (!deps.supportRealtime || typeof deps.supportRealtime.openSse !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support realtime is unavailable.", 503);
    }
    const token = readSupportCookie(req, cookieName);
    await deps.supportRealtime.openSse(req, res, { token });
  }));

  app.get("/support/v1/ws", (_req, res) => {
    res.set("Upgrade", "websocket");
    res.status(426).json({
      error: {
        code: "SUPPORT_WEBSOCKET_UPGRADE_REQUIRED",
        message: "Use a native WebSocket upgrade for this endpoint.",
      },
    });
  });

  app.post("/support/v1/logout", wrap(async (req, res) => {
    const token = readSupportCookie(req, cookieName);
    let session = null;
    try {
      session = await deps.supportSessionService?.authenticate?.(token, {
        requiredAction: "logout",
        touch: false,
        revalidate: false,
      });
    } catch (_) {
      // Logout remains locally available when Web is unavailable or the
      // support session has already expired/revoked.
    }
    await deps.supportSessionService.revoke(token, "user_logout");
    if (session?.id) {
      deps.supportRealtime?.disconnectSession?.(session.id, "user_logout");
      deps.disconnectSupportSession?.(session.id, "user_logout");
    }
    res.cookie(cookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: cookiePath,
      maxAge: 0,
    });
    res.json({ version: 1, ok: true });
  }));

  // V1's frozen cookie is intentionally scoped to /support/v1. Exchange the
  // already-issued opaque credential once so V2 can use a separate HttpOnly
  // cookie without widening or otherwise changing the V1 browser contract.
  app.post("/support/v2/session", wrap(async (req, res) => {
    const credential = stringField(req.body?.supportSessionCredential, { max: 4_096 });
    const session = await authenticateRequest(req, "read", { version2: true, credential });
    if (session.actorKind === "agent") {
      fail("SUPPORT_CONVERSATION_DENIED", "Staff use the support inbox.", 403);
    }
    const expiresAtMs = Date.parse(session.expiresAt || "");
    const maxAge = Number.isFinite(expiresAtMs)
      ? Math.max(1_000, expiresAtMs - Date.now())
      : undefined;
    res.cookie(v2CookieName, credential, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: v2CookiePath,
      ...(maxAge ? { maxAge } : {}),
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ version: 2, ok: true, expiresAt: session.expiresAt || null });
  }));

  app.post("/support/v2/logout", wrap(async (req, res) => {
    const token = readSupportCookie(req, v2CookieName);
    let session = null;
    try {
      session = await deps.supportSessionService?.authenticate?.(token, {
        requiredAction: "logout",
        touch: false,
        revalidate: false,
      });
    } catch (_) {
      // Local logout is idempotent even after expiry or upstream revocation.
    }
    await deps.supportSessionService?.revoke?.(token, "user_logout");
    if (session?.id) {
      deps.supportRealtime?.disconnectSession?.(session.id, "user_logout");
      deps.disconnectSupportSession?.(session.id, "user_logout");
    }
    res.cookie(v2CookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: v2CookiePath,
      maxAge: 0,
    });
    res.json({ version: 2, ok: true });
  }));

  app.get("/support/v2/cases", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "read", { version2: true });
    if (session.actorKind === "agent") fail("SUPPORT_CONVERSATION_DENIED", "Staff use the support inbox.", 403);
    const result = await deps.listSupportCasesV2?.(session);
    if (!result) fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support case history is unavailable.", 503);
    res.set("Cache-Control", "private, no-store");
    res.json({ version: 2, ...result });
  }));

  app.post("/support/v2/cases", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "send", { version2: true });
    if (session.actorKind === "agent") fail("SUPPORT_CONVERSATION_DENIED", "Staff cannot open customer cases.", 403);
    const conversation = await deps.createSupportCaseV2?.({
      session,
      idempotencyKey: idempotencyKey(req),
      locale: stringField(req.body?.locale, { max: 35, required: false }),
      context: normalizeContext(req.body?.context),
    });
    if (!conversation) fail("SUPPORT_PROVIDER_UNAVAILABLE", "The support case could not be created.", 503);
    res.status(conversation.deduped ? 200 : 201).json({ version: 2, conversation });
  }));

  app.post("/support/v2/cases/:conversationId/reopen", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "send", { version2: true });
    const conversationId = requireConversationId(req.params.conversationId);
    const conversation = await deps.reopenSupportCaseV2?.({
      session, conversationId, idempotencyKey: idempotencyKey(req),
    });
    if (!conversation) fail("SUPPORT_PROVIDER_UNAVAILABLE", "The support case could not be reopened.", 503);
    res.json({ version: 2, conversation });
  }));

  app.get("/support/v2/cases/:conversationId/messages", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "read", { version2: true });
    const conversationId = requireConversationId(req.params.conversationId);
    if (!await deps.authorizeSupportCaseV2?.({ session, conversationId, operation: "read" })) {
      fail("SUPPORT_CONVERSATION_DENIED", "The support case is not available to this identity.", 403);
    }
    const cursor = decodeCursor(req.query?.cursor);
    const result = await deps.listSupportMessages(conversationId, {
      cursor, beforeId: cursor?.id, beforeCreatedAt: cursor?.createdAt,
      limit: pageLimit(req.query?.limit), viewerChatUserId: session.chatUserId, session, version: 2,
    });
    await deps.markSupportCaseReadV2?.(session, conversationId);
    const rows = Array.isArray(result?.messages) ? result.messages.slice(0, 100) : [];
    res.set("Cache-Control", "private, no-store");
    res.json({ version: 2, conversationId, messages: rows.map((row) => normalizeMessage(row, session)), nextCursor: result?.hasMore ? encodeCursor(rows.at(0)) : null, hasMore: Boolean(result?.hasMore) });
  }));

  app.post("/support/v2/cases/:conversationId/messages", messageLimiter, wrap(async (req, res) => {
    const session = await authenticateRequest(req, "send", { version2: true });
    const conversationId = requireConversationId(req.params.conversationId);
    const result = await persistMessage({ session, conversationId, body: req.body, version2: true });
    res.status(result.deduped ? 200 : 201).json({ version: 2, conversationId, ...result });
  }));

  app.get("/support/v2/cases/:conversationId/events", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "events", { version2: true });
    const conversationId = requireConversationId(req.params.conversationId);
    const result = await deps.listSupportEventsV2?.(session, conversationId, {
      after: String(req.query?.after || "").slice(0, 256) || null,
      limit: pageLimit(req.query?.limit),
    });
    if (!result) fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support replay is unavailable.", 503);
    res.set("Cache-Control", "private, no-store");
    res.json({ version: 2, conversationId, ...result });
  }));

  app.post("/support/v2/link-registered", wrap(async (req, res) => {
    const guestSession = await authenticateRequest(req, "read", { version2: true });
    if (guestSession.actorKind !== "guest" || req.body?.intent !== "link_guest_history") {
      fail("SUPPORT_GUEST_LINK_INTENT_REQUIRED", "Explicit guest-history link intent is required.", 400);
    }
    const nativeSession = await deps.getSessionFromRequest?.(req, { forceRefresh: true });
    if (!nativeSession) fail("SUPPORT_GUEST_LINK_PROOF_REQUIRED", "A current Web-backed Chat session is required.", 401);
    const result = await deps.linkGuestHistoryV2?.({
      guestSession, nativeSession, idempotencyKey: idempotencyKey(req),
    });
    if (!result) fail("SUPPORT_PROVIDER_UNAVAILABLE", "Guest history linking is unavailable.", 503);
    res.json({ version: 2, linked: true, convertedCount: result.convertedCount });
  }));

  app.get("/support/v1/staff/conversations", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "staff:list");
    requireAgent(session);
    if (typeof deps.listSupportConversationsForAgent !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support conversation assignment is unavailable.", 503);
    }
    const status = String(req.query?.status || "assigned").trim();
    if (!STAFF_STATUSES.has(status)) {
      fail("SUPPORT_REQUEST_INVALID", "The support conversation status is invalid.", 400);
    }
    const result = await deps.listSupportConversationsForAgent(session, {
      status,
      cursor: String(req.query?.cursor || "").slice(0, 512) || null,
      limit: pageLimit(req.query?.limit),
    });
    res.set("Cache-Control", "private, no-store");
    res.json({
      version: 1,
      conversations: Array.isArray(result?.conversations)
        ? result.conversations.slice(0, 100).map(normalizeStaffConversation)
        : [],
      nextCursor: result?.nextCursor || null,
    });
  }));

  app.get("/support/v1/staff/conversations/:conversationId", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "staff:list");
    requireAgent(session);
    const conversationId = requireConversationId(req.params.conversationId);
    if (typeof deps.authorizeSupportAgentConversation !== "function" || typeof deps.getSupportConversationForAgent !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support conversation access is unavailable.", 503);
    }
    if (!await deps.authorizeSupportAgentConversation({ session, conversationId, operation: "read" })) {
      fail("SUPPORT_CONVERSATION_DENIED", "The support conversation is not available to this agent.", 403);
    }
    const result = await deps.getSupportConversationForAgent(session, conversationId, {
      cursor: decodeCursor(req.query?.cursor),
      limit: pageLimit(req.query?.limit),
    });
    const rawMessages = Array.isArray(result?.messages)
      ? result.messages.slice(0, 100)
      : [];
    const conversation = {
      ...normalizeStaffConversation(result),
      messages: rawMessages.map((row) => normalizeMessage(row, session)),
      hasMore: Boolean(result?.hasMore),
      nextCursor: result?.hasMore ? encodeCursor(rawMessages.at(0)) : null,
    };
    res.set("Cache-Control", "private, no-store");
    res.json({ version: 1, conversation });
  }));

  app.post("/support/v1/staff/conversations/:conversationId/reply", messageLimiter, wrap(async (req, res) => {
    const session = await authenticateRequest(req, "send");
    requireAgent(session);
    const conversationId = requireConversationId(req.params.conversationId);
    const result = await persistMessage({
      session,
      conversationId,
      body: req.body,
      staff: true,
    });
    res.status(result.deduped ? 200 : 201).json({
      version: 1,
      conversationId,
      ...result,
    });
  }));

  app.post("/support/v1/staff/conversations/:conversationId/assign", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "staff:assign");
    requireAgent(session);
    const conversationId = requireConversationId(req.params.conversationId);
    if (typeof deps.assignSupportConversation !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support assignment is unavailable.", 503);
    }
    const conversation = await deps.assignSupportConversation({
      session,
      conversationId,
      idempotencyKey: idempotencyKey(req),
    });
    res.json({ version: 1, conversation });
  }));

  app.post("/support/v1/staff/conversations/:conversationId/resolve", wrap(async (req, res) => {
    const session = await authenticateRequest(req, "staff:resolve");
    requireAgent(session);
    const conversationId = requireConversationId(req.params.conversationId);
    if (typeof deps.resolveSupportConversation !== "function") {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support resolution is unavailable.", 503);
    }
    const resolution = String(req.body?.resolution || "resolved").trim();
    if (!new Set(["resolved", "closed"]).has(resolution)) {
      fail("SUPPORT_REQUEST_INVALID", "The support resolution is invalid.", 400);
    }
    const conversation = await deps.resolveSupportConversation({
      session,
      conversationId,
      resolution,
      idempotencyKey: idempotencyKey(req),
    });
    res.json({ version: 1, conversation });
  }));
}

export {
  SupportApiError,
  SUPPORT_COOKIE,
  SUPPORT_COOKIE_PATH,
  SUPPORT_V2_COOKIE,
  SUPPORT_V2_COOKIE_PATH,
};
