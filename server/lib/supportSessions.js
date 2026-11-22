import crypto from "node:crypto";

const TOKEN_PREFIX = "ocs_";
const TOKEN_PATTERN = /^ocs_[A-Za-z0-9_-]{43,128}$/;
const ACTOR_KINDS = new Set(["guest", "registered", "agent"]);
const ACTIONS = new Set([
  "read",
  "send",
  "events",
  "logout",
  "staff:list",
  "staff:assign",
  "staff:resolve",
]);
const SUPPORT_SCOPES = new Set(["support:conversation:create", "support:agent"]);
const ASSERTION_JTI_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class SupportSessionError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.name = "SupportSessionError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status = 401) {
  throw new SupportSessionError(code, message, status);
}

function boundedDuration(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function requiredString(value, code, maximum = 200) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum) {
    fail(code, "Support session input is invalid.", 400);
  }
  return normalized;
}

function timestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function supportSessionTokenDigest(token) {
  const normalized = typeof token === "string" ? token.trim() : "";
  if (!normalized) return "";
  return crypto
    .createHash("sha256")
    .update(`ouj-chat:support-session:v1:${normalized}`, "utf8")
    .digest("hex");
}

function normalizeActions(value) {
  const actions = [...new Set(Array.isArray(value) ? value : [])]
    .filter((action) => typeof action === "string")
    .map((action) => action.trim())
    .filter((action) => ACTIONS.has(action));
  if (!actions.length || actions.length > ACTIONS.size) {
    fail("SUPPORT_SESSION_INVALID", "Support session actions are invalid.", 400);
  }
  return actions;
}

function normalizeScopes(value) {
  const scopes = [...new Set(Array.isArray(value) ? value : [])]
    .filter((scope) => typeof scope === "string")
    .map((scope) => scope.trim())
    .filter((scope) => SUPPORT_SCOPES.has(scope));
  if (scopes.length !== new Set(Array.isArray(value) ? value : []).size) {
    fail("SUPPORT_SESSION_INVALID", "Support session scopes are invalid.", 400);
  }
  return scopes;
}

function normalizeAssertionReference(principal, suppliedJti) {
  const rawIssuedAt = Number(principal?.issuedAt);
  const principalJti = typeof principal?.jti === "string" ? principal.jti.trim() : "";
  const explicitJti = typeof suppliedJti === "string" ? suppliedJti.trim() : "";
  const jti = principalJti || explicitJti;
  const referenceRequired = principal?.kind === "registered" || principal?.kind === "agent";
  const hasReference = Number.isFinite(rawIssuedAt) || Boolean(jti);

  if (!referenceRequired && !hasReference) {
    return { identityIssuedAt: null, bootstrapJti: null };
  }
  if (
    !Number.isInteger(rawIssuedAt) ||
    rawIssuedAt < 1_000 ||
    rawIssuedAt % 1_000 !== 0 ||
    !ASSERTION_JTI_PATTERN.test(jti) ||
    (principalJti && explicitJti && principalJti !== explicitJti)
  ) {
    fail(
      "SUPPORT_IDENTITY_REFERENCE_INVALID",
      "The verified support identity reference is invalid.",
      400,
    );
  }
  return {
    identityIssuedAt: rawIssuedAt / 1_000,
    bootstrapJti: jti,
  };
}

function normalizePrincipal(principal, chatUserId) {
  if (!principal || !ACTOR_KINDS.has(principal.kind)) {
    fail("SUPPORT_IDENTITY_REQUIRED", "A verified support identity is required.", 401);
  }
  if (principal.provider !== "owj-web") {
    fail("SUPPORT_IDENTITY_REQUIRED", "The support identity provider is invalid.", 401);
  }

  const scopes = [...new Set(Array.isArray(principal.scopes) ? principal.scopes : [])]
    .filter((scope) => typeof scope === "string")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .slice(0, 32);
  if (principal.kind === "agent" && !scopes.includes("support:agent")) {
    fail("SUPPORT_SCOPE_DENIED", "Support agent scope is required.", 403);
  }

  if (principal.kind === "guest") {
    return {
      actorKind: "guest",
      subject: requiredString(
        principal.guestSubject || principal.subject,
        "SUPPORT_IDENTITY_REQUIRED",
      ),
      webUserId: null,
      chatUserId: requiredString(
        chatUserId || principal.chatUserId,
        "SUPPORT_CONVERSATION_DENIED",
      ),
      scopes,
    };
  }

  const webUserId = requiredString(
    principal.webUserId || principal.subject,
    "SUPPORT_IDENTITY_REQUIRED",
  );
  return {
    actorKind: principal.kind,
    subject: webUserId,
    webUserId,
    chatUserId: requiredString(
      chatUserId || principal.chatUserId,
      "SUPPORT_CONVERSATION_DENIED",
    ),
    scopes,
  };
}

/**
 * Creates a support-only session boundary. The injected store owns persistence;
 * it receives a SHA-256 digest and never the opaque browser credential.
 */
export function createSupportSessionService({
  store,
  validateAuthorization,
  randomBytes = crypto.randomBytes,
  randomUuid = crypto.randomUUID,
  now = Date.now,
  idleTimeoutMs = Number(process.env.SUPPORT_SESSION_IDLE_TIMEOUT_MS) || 30 * 60 * 1000,
  absoluteTimeoutMs = Number(process.env.SUPPORT_SESSION_ABSOLUTE_TIMEOUT_MS) || 12 * 60 * 60 * 1000,
  touchIntervalMs = 60_000,
} = {}) {
  const idleMs = boundedDuration(idleTimeoutMs, 30 * 60 * 1000, 1_000, 24 * 60 * 60 * 1000);
  const absoluteMs = boundedDuration(absoluteTimeoutMs, 12 * 60 * 60 * 1000, 1_000, 7 * 24 * 60 * 60 * 1000);
  const touchMs = boundedDuration(touchIntervalMs, 60_000, 1_000, 10 * 60 * 1000);

  function requireStore(method) {
    if (!store || typeof store[method] !== "function") {
      fail(
        "SUPPORT_PROVIDER_UNAVAILABLE",
        "Support session persistence is unavailable.",
        503,
      );
    }
  }

  async function issue({
    principal,
    conversationId,
    chatUserId,
    allowedActions = ["read", "send", "events", "logout"],
    bootstrapJti = null,
  } = {}) {
    requireStore("insert");
    const normalizedConversationId = requiredString(
      conversationId,
      "SUPPORT_CONVERSATION_DENIED",
      128,
    );
    const actor = normalizePrincipal(principal, chatUserId);
    const identityReference = normalizeAssertionReference(principal, bootstrapJti);
    const actions = normalizeActions(allowedActions);
    const scopes = normalizeScopes(principal.scopes);
    const issuedAt = Number(now());
    if (!Number.isFinite(issuedAt)) {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Support clock is unavailable.", 503);
    }
    const absoluteExpiry = issuedAt + absoluteMs;
    const idleExpiry = Math.min(absoluteExpiry, issuedAt + idleMs);
    const entropy = randomBytes(32);
    if (!Buffer.isBuffer(entropy) || entropy.length < 32) {
      fail("SUPPORT_PROVIDER_UNAVAILABLE", "Secure session entropy is unavailable.", 503);
    }
    const credential = `${TOKEN_PREFIX}${entropy.toString("base64url")}`;
    const record = {
      id: String(randomUuid()),
      tokenDigest: supportSessionTokenDigest(credential),
      conversationId: normalizedConversationId,
      actorKind: actor.actorKind,
      subject: actor.subject,
      webUserId: actor.webUserId,
      chatUserId: actor.chatUserId,
      scopes: actor.scopes,
      allowedActions: actions,
      scopes,
      status: "active",
      bootstrapJti: identityReference.bootstrapJti,
      identityIssuedAt: identityReference.identityIssuedAt,
      createdAt: new Date(issuedAt).toISOString(),
      lastSeenAt: new Date(issuedAt).toISOString(),
      idleExpiresAt: new Date(idleExpiry).toISOString(),
      expiresAt: new Date(absoluteExpiry).toISOString(),
      revokedAt: null,
      revocationReason: null,
    };
    await store.insert(record);
    return {
      credential,
      session: { ...record, tokenDigest: undefined },
      expiresAt: record.expiresAt,
    };
  }

  async function revokeRecord(session, reason) {
    requireStore("revoke");
    const revokedAt = new Date(Number(now())).toISOString();
    await store.revoke(session.id, {
      revokedAt,
      revocationReason: String(reason || "revoked").slice(0, 100),
    });
  }

  async function authenticate(
    credential,
    { requiredAction = null, touch = true, revalidate = true } = {},
  ) {
    const token = typeof credential === "string" ? credential.trim() : "";
    if (!TOKEN_PATTERN.test(token)) {
      fail("SUPPORT_SESSION_REQUIRED", "A valid support session is required.", 401);
    }
    requireStore("findByDigest");
    const session = await store.findByDigest(supportSessionTokenDigest(token));
    if (!session) {
      fail("SUPPORT_SESSION_REQUIRED", "A valid support session is required.", 401);
    }
    if (session.status !== "active") {
      fail("SUPPORT_SESSION_REVOKED", "The support session is no longer active.", 401);
    }

    const current = Number(now());
    const absoluteExpiry = timestamp(session.expiresAt);
    const idleExpiry = timestamp(session.idleExpiresAt);
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(absoluteExpiry) ||
      !Number.isFinite(idleExpiry) ||
      current >= absoluteExpiry ||
      current >= idleExpiry
    ) {
      await revokeRecord(session, "expired");
      fail("SUPPORT_SESSION_EXPIRED", "The support session has expired.", 401);
    }

    const actions = Array.isArray(session.allowedActions)
      ? session.allowedActions
      : [];
    if (requiredAction && !actions.includes(requiredAction)) {
      fail("SUPPORT_ACTION_DENIED", "This support session cannot perform that action.", 403);
    }

    if (revalidate && typeof validateAuthorization === "function") {
      let active = false;
      try {
        const result = await validateAuthorization(session, { requiredAction });
        active = result === true || result?.active === true;
      } catch (_) {
        fail(
          "SUPPORT_PROVIDER_UNAVAILABLE",
          "Current support authorization could not be verified.",
          503,
        );
      }
      if (!active) {
        await revokeRecord(session, "authorization_removed");
        fail("SUPPORT_SESSION_REVOKED", "Support authorization was removed.", 401);
      }
    }

    const lastSeen = timestamp(session.lastSeenAt);
    if (
      touch &&
      Number.isFinite(lastSeen) &&
      current - lastSeen >= touchMs &&
      typeof store.touch === "function"
    ) {
      const nextIdleExpiry = Math.min(absoluteExpiry, current + idleMs);
      const patch = {
        lastSeenAt: new Date(current).toISOString(),
        idleExpiresAt: new Date(nextIdleExpiry).toISOString(),
      };
      await store.touch(session.id, patch);
      Object.assign(session, patch);
    }
    return session;
  }

  async function revoke(credential, reason = "revoked") {
    const token = typeof credential === "string" ? credential.trim() : "";
    if (!TOKEN_PATTERN.test(token)) return false;
    requireStore("findByDigest");
    const session = await store.findByDigest(supportSessionTokenDigest(token));
    if (!session || session.status !== "active") return false;
    await revokeRecord(session, reason);
    return true;
  }

  return {
    issue,
    authenticate,
    revoke,
    tokenDigest: supportSessionTokenDigest,
  };
}
