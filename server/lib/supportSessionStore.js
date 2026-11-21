import crypto from "node:crypto";

function digestGuestSubject(subject) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(`owj-web:${String(subject || "")}`, "utf8")
    .digest("hex")}`;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tokenDigest: row.token_digest,
    conversationId: row.conversation_id,
    actorKind: row.principal_kind,
    subject: row.subject,
    webUserId: row.web_user_id,
    chatUserId: row.actor_id || row.chat_user_id,
    linkedChatUserId: row.chat_user_id,
    allowedActions: Array.isArray(row.allowed_actions) ? row.allowed_actions : [],
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    status: row.status,
    bootstrapJti: row.bootstrap_jti,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revocationReason: row.revocation_reason,
  };
}

/**
 * Adapts the snake-case Mongo support repository to the deliberately small
 * persistence contract consumed by createSupportSessionService.
 */
export function createSupportSessionStore(supportDb) {
  return {
    async insert(record) {
      if (!supportDb?.createSupportSession) throw new Error("Support session store unavailable.");
      const persistedSubject = record.actorKind === "guest"
        ? digestGuestSubject(record.subject)
        : record.subject;
      return mapRow(await supportDb.createSupportSession({
        id: record.id,
        tokenDigest: record.tokenDigest,
        conversationId: record.conversationId,
        principalKind: record.actorKind,
        actorId: record.chatUserId,
        subject: persistedSubject,
        webUserId: record.webUserId,
        chatUserId: record.actorKind === "guest" ? null : record.chatUserId,
        guestSubjectDigest: record.actorKind === "guest" ? persistedSubject : null,
        allowedActions: record.allowedActions,
        scopes: record.scopes,
        bootstrapJti: record.bootstrapJti,
        expiresAt: record.expiresAt,
        idleExpiresAt: record.idleExpiresAt,
      }));
    },
    async findByDigest(tokenDigest) {
      if (!supportDb?.findSupportSessionByDigest) return null;
      return mapRow(await supportDb.findSupportSessionByDigest(tokenDigest));
    },
    async touch(id, patch = {}) {
      if (!supportDb?.touchSupportSession) throw new Error("Support session store unavailable.");
      return supportDb.touchSupportSession(id, {
        lastSeenAt: patch.lastSeenAt,
        idleExpiresAt: patch.idleExpiresAt,
        identityCheckedAt: patch.identityCheckedAt,
      });
    },
    async revoke(id, patch = {}) {
      if (!supportDb?.revokeSupportSessionById) throw new Error("Support session store unavailable.");
      return supportDb.revokeSupportSessionById(
        id,
        patch.revocationReason,
        patch.revokedAt,
      );
    },
  };
}

export { mapRow as mapSupportSessionRow };
