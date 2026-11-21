import {
  createServiceReplayGuard,
  verifyServiceAuth,
} from "../../shared/serviceAuth.js";
import { createPlatformIdentityAdapter } from "./platformIdentityAdapter.js";
import { createWebIdentityVerifier } from "./webIdentityVerifier.js";
import { createWebIdentityStatusClient } from "./webIdentityStatusClient.js";
import { createSupportSessionService } from "./supportSessions.js";
import { createSupportSessionStore } from "./supportSessionStore.js";
import {
  createSupportEventHub,
  createSupportRealtime,
  createSupportWebSocketGateway,
} from "./supportRealtime.js";

export const SUPPORT_STAFF_INBOX_ID = "00000000-0000-4000-8000-000000000002";

const enabled = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

function required(value, name, minimum = 1) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < minimum) {
    throw new Error(`OWJ support is enabled but ${name} is not configured.`);
  }
  return normalized;
}

function configuredUrl(value, name, { allowHttp = false } = {}) {
  const raw = required(value, name);
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if (url.username || url.password || url.hash || (!allowHttp && url.protocol !== "https:") || (allowHttp && !["http:", "https:"].includes(url.protocol))) {
    throw new Error(`${name} is not a permitted identity-service URL.`);
  }
  return url.toString();
}

function configuredOrigins(value, name, { allowHttp = false } = {}) {
  const values = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.length) throw new Error(`${name} is required when OWJ support is enabled.`);
  const origins = values.map((item) => {
    let url;
    try { url = new URL(item); } catch { throw new Error(`${name} contains an invalid origin.`); }
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (!allowHttp && url.protocol !== "https:") ||
      (allowHttp && !["http:", "https:"].includes(url.protocol))
    ) {
      throw new Error(`${name} contains an invalid origin.`);
    }
    return url.origin;
  });
  return [...new Set(origins)];
}

function safeConversation(row) {
  if (!row) return null;
  return {
    conversationId: row.id,
    status: row.status,
    assigned: Boolean(row.assigned_chat_user_id),
    assignedToCurrentAgent: false,
    identityKind: row.identity_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at || null,
    closedAt: row.closed_at || null,
  };
}

function safeMessage(row, customerActorId) {
  const files = Array.isArray(row?.files)
    ? row.files.slice(0, 10).map((file) => ({
        id: file.id || null,
        kind: file.kind || null,
        name: file.name || file.original_name || null,
        mimeType: file.mimeType || file.mime_type || null,
        sizeBytes: Number(file.sizeBytes || file.size_bytes || 0),
        url: file.url || (file.id ? `/api/uploads/file/${encodeURIComponent(file.id)}` : null),
        thumbUrl: file.thumbUrl || null,
      }))
    : [];
  return {
    id: row?.id || null,
    body: String(row?.editedBody ?? row?.edited_body ?? row?.body ?? ""),
    authorKind: String(row?.userId || row?.user_id || "") === String(customerActorId)
      ? "customer"
      : "agent",
    createdAt: row?.createdAt || row?.created_at || null,
    editedAt: row?.editedAt || row?.edited_at || null,
    files,
  };
}

/**
 * Composes the Web identity boundary with Chat-owned support persistence.
 * No Web database access occurs here; all current-state checks use the
 * authenticated Web status API and a bounded cache.
 */
export function createSupportRuntime({
  env = process.env,
  appEnv = env.APP_ENV || env.NODE_ENV || "development",
  supportDb,
  identityRepository,
  findChatUserById,
  isMember,
  createOrReuseMessage,
  emitChatEvent,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const supportEnabled = enabled(env.OWJ_SUPPORT_ENABLED);
  if (!supportEnabled) {
    return {
      enabled: false,
      apiDeps: {},
      attachWebSocket: () => null,
      close: () => {},
    };
  }
  if (!supportDb || !identityRepository) {
    throw new Error("OWJ support persistence is unavailable.");
  }
  const allowHttp = appEnv !== "production" && enabled(env.OWJ_WEB_ALLOW_INSECURE_HTTP);
  const issuer = configuredUrl(env.OWJ_WEB_ISSUER, "OWJ_WEB_ISSUER", { allowHttp });
  const jwksUrl = configuredUrl(env.OWJ_WEB_JWKS_URL, "OWJ_WEB_JWKS_URL", { allowHttp });
  const statusUrl = configuredUrl(env.OWJ_WEB_STATUS_URL, "OWJ_WEB_STATUS_URL", { allowHttp });
  const inboundServiceSecret = required(
    env.OWJ_WEB_TO_CHAT_SERVICE_SECRET,
    "OWJ_WEB_TO_CHAT_SERVICE_SECRET",
    32,
  );
  const outboundServiceToken = required(
    env.OWJ_CHAT_TO_WEB_SERVICE_TOKEN,
    "OWJ_CHAT_TO_WEB_SERVICE_TOKEN",
    16,
  );
  const allowedOrigins = configuredOrigins(
    env.OWJ_SUPPORT_ALLOWED_ORIGINS || env.APP_PUBLIC_URL,
    "OWJ_SUPPORT_ALLOWED_ORIGINS or APP_PUBLIC_URL",
    { allowHttp },
  );

  const assertionVerifier = createWebIdentityVerifier({
    expectedIssuer: issuer,
    expectedAudience: "owj-chat",
    jwksUrl,
    fetchImpl,
    consumeJti: identityRepository.consumePlatformIdentityAssertionJti,
    allowInsecureJwks: allowHttp,
    now,
  });
  const platformIdentityAdapter = createPlatformIdentityAdapter({
    enabled: true,
    expectedIssuer: issuer,
    expectedAudience: "owj-chat",
    verifyCredential: (credential, policy) => assertionVerifier.verify(credential, policy),
    findIdentityLinkByWebUserId: identityRepository.findPlatformIdentityLinkByWebUserId,
    findChatUserById,
    now,
  });
  let supportRealtime = null;
  const identityStatus = createWebIdentityStatusClient({
    endpoint: statusUrl,
    serviceCredential: outboundServiceToken,
    fetchImpl,
    now,
    cacheTtlMs: Math.min(60_000, Math.max(0, Number(env.OWJ_IDENTITY_STATUS_CACHE_MS) || 60_000)),
    onIdentityRevoked: async ({ webUserId, status }) => {
      await supportDb.revokeSupportSessionsByWebUserId(
        webUserId,
        `web_identity_${status || "revoked"}`,
      );
    },
  });
  const serviceReplayGuard = createServiceReplayGuard({
    maxEntries: 10_000,
    ttlMs: 10 * 60_000,
    now,
  });

  async function verifyWebServiceRequest(req) {
    const result = verifyServiceAuth({
      headers: req?.headers,
      secret: inboundServiceSecret,
      method: req?.method,
      path: String(req?.originalUrl || req?.url || "").split("?")[0],
      now,
      replayGuard: serviceReplayGuard,
    });
    return result.ok ? { service: "owj-web", scope: "chat:support:bootstrap" } : null;
  }

  async function checkCurrentWebIdentity(session, operation) {
    if (session.actorKind === "guest") return true;
    try {
      await identityStatus.authorize({
        kind: "registered",
        webUserId: session.webUserId,
        operation,
      });
      return true;
    } catch (error) {
      if (["IDENTITY_SUBJECT_DISABLED", "IDENTITY_LINK_REVOKED"].includes(error?.code)) return false;
      throw error;
    }
  }

  async function validateAuthorization(session) {
    if (!session?.id || !session?.chatUserId) return false;
    if (session.actorKind === "agent") {
      if (!session.scopes?.includes("support:agent")) return false;
      const link = await identityRepository.findPlatformIdentityLinkByWebUserId("owj-web", session.webUserId);
      if (!link || link.status !== "active" || link.chat_user_id !== session.chatUserId) return false;
      return checkCurrentWebIdentity(session, "support:agent");
    }
    const conversation = await supportDb.getSupportConversation(session.conversationId);
    if (!conversation || conversation.actor_id !== session.chatUserId) return false;
    if (session.actorKind === "guest") {
      return conversation.identity_kind === "guest" &&
        conversation.guest_subject_digest === session.subject;
    }
    if (
      conversation.web_user_id !== session.webUserId ||
      conversation.chat_user_id !== session.chatUserId ||
      !(await isMember(session.conversationId, session.chatUserId))
    ) return false;
    const link = await identityRepository.findPlatformIdentityLinkByWebUserId("owj-web", session.webUserId);
    if (!link || link.status !== "active" || link.chat_user_id !== session.chatUserId) return false;
    return checkCurrentWebIdentity(session, "support:session");
  }

  const supportSessionService = createSupportSessionService({
    store: createSupportSessionStore(supportDb),
    validateAuthorization,
    now,
    idleTimeoutMs: Number(env.SUPPORT_SESSION_IDLE_TIMEOUT_MS) || 30 * 60_000,
    absoluteTimeoutMs: Number(env.SUPPORT_SESSION_ABSOLUTE_TIMEOUT_MS) || 12 * 60 * 60_000,
  });

  const eventHub = createSupportEventHub({
    maxReplayEvents: Number(env.SUPPORT_REALTIME_MAX_REPLAY) || 200,
    maxConnectionsPerSession: Number(env.SUPPORT_MAX_CONNECTIONS_PER_SESSION) || 4,
    now,
  });
  const loadReplayEvents = async (conversationId, { after, limit, session } = {}) => {
    if (conversationId === SUPPORT_STAFF_INBOX_ID) {
      return eventHub.replay(conversationId, after, limit);
    }
    return supportDb.getSupportEvents({
      conversationId,
      after,
      limit,
      viewerUserId: session?.chatUserId || null,
    });
  };
  const sseRealtime = createSupportRealtime({
    eventHub,
    authenticateToken: supportSessionService.authenticate,
    loadReplayEvents,
    allowedOrigins,
    allowMissingOrigin: false,
    revalidateIntervalMs: Number(env.SUPPORT_REALTIME_REVALIDATE_MS) || 15_000,
  });
  supportRealtime = {
    ...sseRealtime,
    publish(conversationId, event) {
      const published = sseRealtime.publish(conversationId, event);
      if (conversationId !== SUPPORT_STAFF_INBOX_ID) {
        sseRealtime.publish(SUPPORT_STAFF_INBOX_ID, {
          type: event?.type === "support_request_created"
            ? "support_request_created"
            : "support_queue_updated",
          sourceConversationId: conversationId,
          sourceEventType: event?.type || "updated",
        });
      }
      return published;
    },
  };

  async function createOrResumeSupportConversation({ principal, locale, context } = {}) {
    if (principal.kind !== "guest") {
      const active = await checkCurrentWebIdentity({
        actorKind: principal.kind,
        webUserId: principal.webUserId,
      }, principal.kind === "agent" ? "support:agent:bootstrap" : "support:bootstrap");
      if (!active) throw Object.assign(new Error("The Web identity is disabled."), {
        code: "IDENTITY_SUBJECT_DISABLED",
        status: 403,
      });
    }
    if (principal.kind === "agent") {
      return {
        conversationId: SUPPORT_STAFF_INBOX_ID,
        chatUserId: principal.chatUserId,
        created: false,
        assigned: false,
        supportAvailable: true,
      };
    }
    const result = await supportDb.ensureSupportConversation({ principal, locale, context });
    if (result.created) {
      supportRealtime.publish(result.conversationId, {
        type: "support_request_created",
        identityKind: principal.kind,
      });
    }
    return {
      ...result,
      chatUserId: result.actorId,
      assigned: Boolean(result.assignedChatUserId),
      supportAvailable: ["open", "assigned"].includes(result.status),
    };
  }

  async function authorizeSupportConversation({ session, conversationId, operation } = {}) {
    if (session?.conversationId !== conversationId) return false;
    const conversation = await supportDb.getSupportConversation(conversationId);
    if (!conversation || conversation.actor_id !== session.chatUserId) return false;
    if (operation === "send" && !["open", "assigned"].includes(conversation.status)) return false;
    return validateAuthorization(session);
  }

  async function authorizeSupportAgentConversation({ session, conversationId, operation } = {}) {
    if (session?.actorKind !== "agent" || !session.scopes?.includes("support:agent")) return false;
    const conversation = await supportDb.getSupportConversation(conversationId);
    if (!conversation) return false;
    if (operation === "assign") {
      return (
        (conversation.status === "open" && !conversation.assigned_chat_user_id) ||
        (conversation.status === "assigned" && conversation.assigned_chat_user_id === session.chatUserId)
      );
    }
    const assigned = conversation.assigned_chat_user_id === session.chatUserId &&
      await isMember(conversationId, session.chatUserId);
    if (!assigned) return false;
    if (operation === "reply") return conversation.status === "assigned";
    if (operation === "resolve") return ["assigned", "resolved", "closed"].includes(conversation.status);
    return ["assigned", "resolved", "closed"].includes(conversation.status);
  }

  async function listSupportMessages(conversationId, options = {}) {
    return supportDb.getSupportMessages({
      conversationId,
      actorId: options.viewerChatUserId,
      limit: options.limit,
      beforeId: options.beforeId,
      beforeCreatedAt: options.beforeCreatedAt,
    });
  }

  async function listSupportConversationsForAgent(session, { status, limit } = {}) {
    let filterStatus = status;
    let assignedChatUserId;
    if (status === "available") {
      filterStatus = "open";
      assignedChatUserId = null;
    } else if (status === "assigned") {
      filterStatus = "assigned";
      assignedChatUserId = session.chatUserId;
    } else if (status === "open") {
      assignedChatUserId = null;
    } else if (["resolved", "closed"].includes(status)) {
      assignedChatUserId = session.chatUserId;
    }
    const rows = await supportDb.listSupportConversations({
      status: filterStatus,
      assignedChatUserId,
      limit,
    });
    return {
      conversations: rows.map((row) => ({
        ...safeConversation(row),
        assignedToCurrentAgent: row.assigned_chat_user_id === session.chatUserId,
      })),
      nextCursor: null,
    };
  }

  async function getSupportConversationForAgent(session, conversationId, { cursor, limit } = {}) {
    const row = await supportDb.getSupportConversation(conversationId);
    const messages = await supportDb.getSupportMessages({
      conversationId,
      actorId: session.chatUserId,
      limit,
      beforeId: cursor?.id,
      beforeCreatedAt: cursor?.createdAt,
    });
    return {
      ...safeConversation(row),
      assignedToCurrentAgent: row?.assigned_chat_user_id === session.chatUserId,
      messages: messages.messages.map((message) => safeMessage(message, row.actor_id)),
      hasMore: messages.hasMore,
    };
  }

  async function assignSupportConversation({ session, conversationId, idempotencyKey } = {}) {
    if (!await authorizeSupportAgentConversation({ session, conversationId, operation: "assign" })) {
      throw Object.assign(new Error("The support conversation cannot be assigned."), {
        code: "SUPPORT_CONVERSATION_DENIED",
        status: 403,
      });
    }
    const row = await supportDb.assignSupportConversation({
      conversationId,
      agentChatUserId: session.chatUserId,
      idempotencyKey,
    });
    if (!row?._deduped) {
      supportRealtime.publish(conversationId, { type: "support_assigned" });
    }
    return { ...safeConversation(row), assignedToCurrentAgent: true };
  }

  async function resolveSupportConversation({
    session,
    conversationId,
    resolution,
    idempotencyKey,
  } = {}) {
    if (!await authorizeSupportAgentConversation({ session, conversationId, operation: "resolve" })) {
      throw Object.assign(new Error("The support conversation cannot be resolved."), {
        code: "SUPPORT_CONVERSATION_DENIED",
        status: 403,
      });
    }
    const row = await supportDb.setSupportConversationStatus({
      conversationId,
      status: resolution,
      agentChatUserId: session.chatUserId,
      idempotencyKey,
    });
    if (!row?._deduped) {
      supportRealtime.publish(conversationId, { type: `support_${resolution}` });
    }
    return { ...safeConversation(row), assignedToCurrentAgent: true };
  }

  const cleanupSupportSessions = async () => {
    if (typeof supportDb.purgeExpiredSupportSessions !== "function") return;
    try {
      await supportDb.purgeExpiredSupportSessions();
    } catch (_) {
      // Expiry is still enforced on authentication. Cleanup is bounded,
      // periodic housekeeping and must not take the service down.
    }
  };
  void cleanupSupportSessions();
  const sessionCleanupTimer = setInterval(cleanupSupportSessions, 60 * 60 * 1000);
  sessionCleanupTimer.unref?.();

  let wsGateway = null;
  return {
    enabled: true,
    apiDeps: {
      verifyWebServiceRequest,
      platformIdentityAdapter,
      createOrResumeSupportConversation,
      supportSessionService,
      authorizeSupportConversation,
      listSupportMessages,
      createOrReuseMessage,
      emitChatEvent,
      supportRealtime,
      getSupportAvailability: async (session) => {
        if (session.actorKind === "agent") return true;
        const row = await supportDb.getSupportConversation(session.conversationId);
        return Boolean(row && ["open", "assigned"].includes(row.status));
      },
      listSupportConversationsForAgent,
      authorizeSupportAgentConversation,
      getSupportConversationForAgent,
      assignSupportConversation,
      resolveSupportConversation,
    },
    attachWebSocket(server) {
      wsGateway = createSupportWebSocketGateway({
        server,
        eventHub,
        authenticateToken: supportSessionService.authenticate,
        loadReplayEvents,
        allowedOrigins,
        allowMissingOrigin: false,
        maxConnectionsPerIp: Number(env.SUPPORT_WS_MAX_CONNECTIONS_PER_IP) || 20,
        revalidateIntervalMs: Number(env.SUPPORT_REALTIME_REVALIDATE_MS) || 15_000,
        trustProxy: enabled(env.WS_TRUST_PROXY),
      });
      return wsGateway;
    },
    async close() {
      clearInterval(sessionCleanupTimer);
      wsGateway?.close();
      sseRealtime.close();
      eventHub.close();
    },
  };
}
