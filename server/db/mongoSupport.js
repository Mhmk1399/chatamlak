import crypto from "node:crypto";

const SUPPORT_CONVERSATION_STATUSES = new Set(["open", "assigned", "resolved", "closed"]);
const MAX_SUPPORT_PAGE_SIZE = 100;

export class SupportRepositoryError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "SupportRepositoryError";
    this.code = code;
    this.status = status;
  }
}

const fail = (code, message, status) => {
  throw new SupportRepositoryError(code, message, status);
};

const required = (value, field, max = 256) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) {
    fail("SUPPORT_REQUEST_INVALID", `${field} is invalid.`, 400);
  }
  return normalized;
};

const digest = (value) =>
  `sha256:${crypto.createHash("sha256").update(String(value), "utf8").digest("hex")}`;

function normalizePrincipal(principal) {
  if (!principal || principal.provider !== "owj-web") {
    fail("SUPPORT_IDENTITY_REQUIRED", "A verified Owj Web identity is required.", 401);
  }
  if (principal.kind === "registered") {
    const webUserId = required(principal.webUserId, "Web user id");
    const chatUserId = required(principal.chatUserId, "Chat user id", 128);
    return {
      kind: "registered",
      identityKey: `registered:${digest(`owj-web:${webUserId}`)}`,
      actorId: chatUserId,
      webUserId,
      chatUserId,
    };
  }
  if (principal.kind === "guest") {
    const guestSubject = required(principal.guestSubject, "Guest subject");
    const subjectDigest = digest(`owj-web:${guestSubject}`);
    return {
      kind: "guest",
      identityKey: `guest:${subjectDigest}`,
      actorId: `support-guest:${subjectDigest.slice("sha256:".length, "sha256:".length + 40)}`,
      guestSubjectDigest: subjectDigest,
    };
  }
  fail("SUPPORT_IDENTITY_REQUIRED", "A support customer identity is required.", 401);
}

function boundedContext(context) {
  if (context == null) return null;
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    fail("SUPPORT_REQUEST_INVALID", "Support context is invalid.", 400);
  }
  const allowed = new Set(["page", "publicListingId", "locale"]);
  if (Object.keys(context).some((key) => !allowed.has(key))) {
    fail("SUPPORT_REQUEST_INVALID", "Support context contains an unsupported field.", 400);
  }
  const result = {};
  for (const [key, raw] of Object.entries(context)) {
    const normalized = raw == null ? "" : String(raw).trim();
    const maximum = key === "page" ? 300 : 120;
    if (!normalized || normalized.length > maximum) {
      fail("SUPPORT_REQUEST_INVALID", "Support context is invalid.", 400);
    }
    result[key] = normalized;
  }
  return Object.keys(result).length ? result : null;
}

export function createSupportRepository(
  store,
  chatRepository,
  { now = () => new Date().toISOString(), randomUUID = crypto.randomUUID } = {},
) {
  if (!store || typeof store.transaction !== "function") {
    throw new TypeError("A Mongo support store is required.");
  }

  async function ensureSupportConversation({ principal, locale = null, context = null } = {}) {
    const identity = normalizePrincipal(principal);
    const normalizedLocale = locale == null ? null : String(locale).trim().slice(0, 24) || null;
    const normalizedContext = boundedContext(context);
    const existing = await store.one("support_conversations", { identity_key: identity.identityKey });
    if (existing) {
      return {
        conversationId: existing.id,
        actorId: existing.actor_id,
        status: existing.status,
        assignedChatUserId: existing.assigned_chat_user_id || null,
        created: false,
      };
    }

    try {
      return await store.transaction(async () => {
        const conversationId = randomUUID();
        const timestamp = now();
        await store.insert("chats", {
          id: conversationId,
          name: "Website support",
          type: "group",
          group_visibility: "private",
          created_by_user_id: identity.chatUserId || null,
          support_managed: 1,
        });
        await store.insert("support_conversations", {
          id: conversationId,
          identity_key: identity.identityKey,
          identity_kind: identity.kind,
          actor_id: identity.actorId,
          web_user_id: identity.webUserId || null,
          chat_user_id: identity.chatUserId || null,
          guest_subject_digest: identity.guestSubjectDigest || null,
          status: "open",
          assigned_chat_user_id: null,
          locale: normalizedLocale,
          context: normalizedContext,
          updated_at: timestamp,
          resolved_at: null,
          closed_at: null,
        });
        if (identity.kind === "registered") {
          await chatRepository.addChatMember(conversationId, identity.chatUserId, "member");
        }
        return {
          conversationId,
          actorId: identity.actorId,
          status: "open",
          assignedChatUserId: null,
          created: true,
        };
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const winner = await store.one("support_conversations", { identity_key: identity.identityKey });
      if (!winner) throw error;
      return {
        conversationId: winner.id,
        actorId: winner.actor_id,
        status: winner.status,
        assignedChatUserId: winner.assigned_chat_user_id || null,
        created: false,
      };
    }
  }

  async function createSupportSession({
    id = randomUUID(),
    tokenDigest,
    conversationId,
    principalKind,
    actorId,
    webUserId = null,
    chatUserId = null,
    guestSubjectDigest = null,
    subject = null,
    allowedActions = [],
    scopes = [],
    bootstrapJti = null,
    expiresAt,
    idleExpiresAt,
    identityCheckedAt = null,
  } = {}) {
    const timestamp = now();
    return store.insert("support_sessions", {
      id: required(id, "Session id", 128),
      token_digest: required(tokenDigest, "Session digest", 128),
      conversation_id: conversationId ? required(conversationId, "Conversation id", 128) : null,
      principal_kind: required(principalKind, "Principal kind", 32),
      actor_id: required(actorId, "Actor id", 128),
      web_user_id: webUserId || null,
      chat_user_id: chatUserId || null,
      guest_subject_digest: guestSubjectDigest || null,
      subject: subject || null,
      allowed_actions: [...new Set(
        (Array.isArray(allowedActions) && allowedActions.length ? allowedActions : scopes).map(String),
      )].slice(0, 16),
      scopes: [...new Set(Array.isArray(scopes) ? scopes.map(String) : [])].slice(0, 16),
      bootstrap_jti: bootstrapJti || null,
      status: "active",
      expires_at: required(expiresAt, "Session expiry", 40),
      idle_expires_at: required(idleExpiresAt, "Session idle expiry", 40),
      identity_checked_at: identityCheckedAt,
      last_seen_at: timestamp,
      updated_at: timestamp,
      revoked_at: null,
      revocation_reason: null,
    });
  }

  const findSupportSessionByDigest = (tokenDigest) =>
    tokenDigest ? store.one("support_sessions", { token_digest: String(tokenDigest) }) : null;

  const touchSupportSession = (id, { lastSeenAt = now(), idleExpiresAt, identityCheckedAt } = {}) =>
    store.update(
      "support_sessions",
      { id, status: "active" },
      {
        last_seen_at: lastSeenAt,
        ...(idleExpiresAt ? { idle_expires_at: idleExpiresAt } : {}),
        ...(identityCheckedAt ? { identity_checked_at: identityCheckedAt } : {}),
        updated_at: now(),
      },
    );

  const revokeSupportSessionByDigest = (tokenDigest, reason = "revoked") =>
    store.update(
      "support_sessions",
      { token_digest: String(tokenDigest), status: "active" },
      {
        status: "revoked",
        revoked_at: now(),
        revocation_reason: String(reason || "revoked").slice(0, 100),
        updated_at: now(),
      },
    );

  const revokeSupportSessionById = (id, reason = "revoked", revokedAt = now()) =>
    store.update(
      "support_sessions",
      { id: String(id), status: "active" },
      {
        status: "revoked",
        revoked_at: revokedAt,
        revocation_reason: String(reason || "revoked").slice(0, 100),
        updated_at: now(),
      },
    );

  const revokeSupportSessionsByWebUserId = (webUserId, reason = "identity_revoked") =>
    store.update(
      "support_sessions",
      { web_user_id: String(webUserId), status: "active" },
      {
        status: "revoked",
        revoked_at: now(),
        revocation_reason: String(reason || "identity_revoked").slice(0, 100),
        updated_at: now(),
      },
    );

  const purgeExpiredSupportSessions = ({ cutoff = now() } = {}) =>
    store.remove("support_sessions", {
      $or: [
        { expires_at: { $lte: String(cutoff) } },
        {
          status: { $ne: "active" },
          updated_at: { $lte: new Date(Date.parse(String(cutoff)) - 24 * 60 * 60 * 1000).toISOString() },
        },
      ],
    });

  const getSupportConversation = (conversationId) =>
    conversationId ? store.one("support_conversations", { id: String(conversationId) }) : null;

  async function listSupportConversations({ status = null, assignedChatUserId, limit = 50 } = {}) {
    const filter = {};
    if (status) {
      if (!SUPPORT_CONVERSATION_STATUSES.has(status)) {
        fail("SUPPORT_REQUEST_INVALID", "Support status is invalid.", 400);
      }
      filter.status = status;
    }
    if (assignedChatUserId !== undefined) filter.assigned_chat_user_id = assignedChatUserId || null;
    return store.many("support_conversations", filter, {
      sort: { updated_at: -1, id: -1 },
      limit: Math.max(1, Math.min(MAX_SUPPORT_PAGE_SIZE, Number(limit) || 50)),
    });
  }

  async function assignSupportConversation({
    conversationId,
    agentChatUserId,
    idempotencyKey,
  } = {}) {
    const id = required(conversationId, "Conversation id", 128);
    const agentId = required(agentChatUserId, "Agent Chat user id", 128);
    const keyDigest = digest(required(idempotencyKey, "Idempotency key", 180));
    return store.transaction(async () => {
      const current = await getSupportConversation(id);
      if (!current) return null;
      if (current.assigned_chat_user_id === agentId && current.status === "assigned") {
        await chatRepository.addChatMember(id, agentId, "member");
        return { ...current, _deduped: true };
      }
      if (["resolved", "closed"].includes(current.status)) {
        fail("SUPPORT_ASSIGNMENT_CLOSED", "The support conversation is no longer assignable.", 409);
      }
      if (current.assigned_chat_user_id && current.assigned_chat_user_id !== agentId) {
        fail("SUPPORT_ASSIGNMENT_CONFLICT", "The support conversation is assigned to another agent.", 409);
      }
      const assignedAt = now();
      const assigned = await store.modify(
        "support_conversations",
        { id, status: "open", assigned_chat_user_id: null },
        {
          $set: {
            assigned_chat_user_id: agentId,
            assignment_idempotency_digest: keyDigest,
            assigned_at: assignedAt,
            status: "assigned",
            updated_at: assignedAt,
          },
        },
      );
      if (!assigned) {
        const winner = await getSupportConversation(id);
        if (winner?.assigned_chat_user_id === agentId && winner.status === "assigned") {
          await chatRepository.addChatMember(id, agentId, "member");
          return { ...winner, _deduped: true };
        }
        fail("SUPPORT_ASSIGNMENT_CONFLICT", "The support conversation is assigned to another agent.", 409);
      }
      await chatRepository.addChatMember(id, agentId, "member");
      return { ...assigned, _deduped: false };
    });
  }

  async function setSupportConversationStatus({
    conversationId,
    status,
    agentChatUserId,
    idempotencyKey,
  } = {}) {
    const id = required(conversationId, "Conversation id", 128);
    if (!SUPPORT_CONVERSATION_STATUSES.has(status)) {
      fail("SUPPORT_REQUEST_INVALID", "Support status is invalid.", 400);
    }
    const keyDigest = digest(required(idempotencyKey, "Idempotency key", 180));
    return store.transaction(async () => {
      const conversation = await getSupportConversation(id);
      if (!conversation) return null;
      if (agentChatUserId && conversation.assigned_chat_user_id !== agentChatUserId) {
        fail("SUPPORT_CONVERSATION_DENIED", "Only the assigned support agent may change status.", 403);
      }
      if (conversation.resolution_idempotency_digest === keyDigest) {
        if (conversation.resolution_idempotency_status !== status) {
          fail("SUPPORT_IDEMPOTENCY_CONFLICT", "The idempotency key is bound to another resolution.", 409);
        }
        return { ...conversation, _deduped: true };
      }
      if (conversation.status === status) return { ...conversation, _deduped: true };
      const transitionAllowed = conversation.status === "assigned" ||
        (conversation.status === "resolved" && status === "closed");
      if (!transitionAllowed || !["resolved", "closed"].includes(status)) {
        fail("SUPPORT_RESOLUTION_CONFLICT", "The support resolution transition is not allowed.", 409);
      }
      const timestamp = now();
      const updated = await store.modify("support_conversations", {
        id,
        status: conversation.status,
        assigned_chat_user_id: conversation.assigned_chat_user_id,
      }, {
        $set: {
          status,
          resolution_idempotency_digest: keyDigest,
          resolution_idempotency_status: status,
          updated_at: timestamp,
          ...(status === "resolved" ? { resolved_at: timestamp } : {}),
          ...(status === "closed" ? { closed_at: timestamp } : {}),
        },
      });
      if (updated) return { ...updated, _deduped: false };
      const winner = await getSupportConversation(id);
      if (winner?.status === status) return { ...winner, _deduped: true };
      fail("SUPPORT_RESOLUTION_CONFLICT", "The support resolution changed concurrently.", 409);
    });
  }

  const createSupportMessage = ({
    conversationId,
    actorId,
    body,
    clientRequestId,
    replyToMessageId = null,
  } = {}) => chatRepository.createOrReuseMessage(
    required(conversationId, "Conversation id", 128),
    required(actorId, "Support actor id", 128),
    required(body, "Message", 4000),
    replyToMessageId || null,
    null,
    required(clientRequestId, "Client request id", 180),
  );

  const getSupportMessages = ({ conversationId, actorId, limit = 50, ...cursor } = {}) =>
    chatRepository.getMessages(required(conversationId, "Conversation id", 128), {
      viewerUserId: required(actorId, "Support actor id", 128),
      limit: Math.max(1, Math.min(MAX_SUPPORT_PAGE_SIZE, Number(limit) || 50)),
      beforeId: cursor.beforeId || null,
      beforeCreatedAt: cursor.beforeCreatedAt || null,
      afterId: cursor.afterId || null,
      afterCreatedAt: cursor.afterCreatedAt || null,
    });

  async function getSupportEvents({
    conversationId,
    after = null,
    limit = 100,
    viewerUserId = null,
  } = {}) {
    const id = required(conversationId, "Conversation id", 128);
    const rawCursor = String(after || "").trim().slice(0, 256);
    let cursor = /^\d+$/.test(rawCursor)
      ? Math.max(0, Math.trunc(Number(rawCursor) || 0))
      : 0;
    let gap = false;
    if (rawCursor && !/^\d+$/.test(rawCursor)) {
      const referenced = await store.one("chat_event_log", {
        chat_id: id,
        $or: [
          { "payload.messageId": rawCursor },
          { "payload.eventId": rawCursor },
        ],
      });
      if (referenced?.id) cursor = referenced.id;
      else gap = true;
    }
    const pageSize = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 100)));
    const visibility = viewerUserId
      ? { $or: [{ viewer_user_id: null }, { viewer_user_id: String(viewerUserId) }] }
      : { viewer_user_id: null };
    const rows = await store.many(
      "chat_event_log",
      { chat_id: id, id: { $gt: cursor }, ...visibility },
      { sort: { id: 1 }, limit: pageSize + 1 },
    );
    const page = rows.slice(0, pageSize);
    const conversation = await getSupportConversation(id);
    const messageIds = page
      .map((row) => row.payload?.messageId)
      .filter((value) => typeof value === "string" && value);
    const messages = messageIds.length
      ? await store.many(
          "chat_messages",
          { id: { $in: [...new Set(messageIds)] } },
          { projection: { id: 1, user_id: 1, created_at: 1 } },
        )
      : [];
    const messagesById = new Map(messages.map((message) => [message.id, message]));
    const events = page.map((row) => {
      const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? row.payload
        : {};
      const stableCursor = payload.messageId || payload.eventId || String(row.id);
      const message = payload.messageId ? messagesById.get(payload.messageId) : null;
      const userId = typeof payload.userId === "string" && payload.userId
        ? payload.userId
        : message?.user_id || null;
      const actorKind = ["customer", "agent"].includes(payload.actorKind)
        ? payload.actorKind
        : userId
          ? (userId === conversation?.actor_id ? "customer" : "agent")
          : null;
      return {
        ...payload,
        version: 1,
        conversationId: id,
        chatId: id,
        ...(userId ? { userId } : {}),
        ...(actorKind ? { actorKind } : {}),
        cursor: stableCursor,
        eventId: payload.eventId || (payload.messageId
          ? `message:${payload.messageId}`
          : `journal:${row.id}`),
        occurredAt: payload.occurredAt || message?.created_at || row.created_at,
        sequence: row.id,
      };
    });
    return {
      events,
      cursor: events.at(-1)?.cursor || rawCursor || null,
      hasMore: rows.length > pageSize,
      gap,
    };
  }

  async function convertGuestConversation({
    conversationId,
    guestSubjectDigest,
    webUserId,
    chatUserId,
    proofId,
  } = {}) {
    const id = required(conversationId, "Conversation id", 128);
    const expectedGuest = required(guestSubjectDigest, "Guest subject digest", 80);
    const webId = required(webUserId, "Web user id");
    const chatId = required(chatUserId, "Chat user id", 128);
    const proof = required(proofId, "Conversion proof id", 200);
    const conversation = await getSupportConversation(id);
    if (!conversation) return null;
    if (conversation.identity_kind === "registered") {
      if (conversation.web_user_id === webId && conversation.chat_user_id === chatId) return conversation;
      fail("SUPPORT_IDENTITY_LINK_CONFLICT", "The support conversation is linked to another identity.", 409);
    }
    if (conversation.guest_subject_digest !== expectedGuest) {
      fail("SUPPORT_CONVERSATION_DENIED", "The guest conversion proof does not match.", 403);
    }
    await store.update("support_conversations", { id, identity_kind: "guest" }, {
      identity_kind: "registered",
      identity_key: `registered:${digest(`owj-web:${webId}`)}`,
      web_user_id: webId,
      chat_user_id: chatId,
      conversion_proof_id: proof,
      converted_at: now(),
      updated_at: now(),
    });
    await chatRepository.addChatMember(id, chatId, "member");
    return getSupportConversation(id);
  }

  return {
    ensureSupportConversation,
    getSupportConversation,
    listSupportConversations,
    assignSupportConversation,
    setSupportConversationStatus,
    createSupportSession,
    findSupportSessionByDigest,
    touchSupportSession,
    revokeSupportSessionByDigest,
    revokeSupportSessionById,
    revokeSupportSessionsByWebUserId,
    purgeExpiredSupportSessions,
    createSupportMessage,
    getSupportMessages,
    getSupportEvents,
    convertGuestConversation,
  };
}
