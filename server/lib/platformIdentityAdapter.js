const MAX_SCOPES = 32;
const MAX_CONVERSATION_CAPABILITIES = 20;

export class PlatformIdentityError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.name = "PlatformIdentityError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new PlatformIdentityError(code, message, status);
}

function requiredString(value, code, message, max = 200) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) fail(code, message, 401);
  return normalized;
}

function normalizeStringList(value, { code, message, maxItems = MAX_SCOPES } = {}) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\s+/)
      : [];
  const normalized = [
    ...new Set(
      values
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (normalized.length > maxItems) {
    fail(code || "IDENTITY_CLAIMS_INVALID", message || "Identity claims are invalid.", 401);
  }
  return normalized;
}

function normalizeExpiry(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return Date.parse(value);
  return Number.NaN;
}

/**
 * Chat-side claim/link boundary for an injected Web assertion verifier. Sprint
 * 2 supplies an RS256/JWKS verifier separately; keeping it injected makes key
 * retrieval and claim verification independently testable. This adapter then
 * enforces Chat's audience, route policy, current link, and local-account rules.
 */
export function createPlatformIdentityAdapter({
  enabled = false,
  expectedIssuer,
  identityProvider = "owj-web",
  expectedAudience,
  verifyCredential,
  findIdentityLinkByWebUserId,
  findChatUserById,
  now = Date.now,
} = {}) {
  async function authenticate({
    credential,
    requiredScopes = [],
    allowedScopes,
    allowedTokenUses,
    allowGuest = false,
  } = {}) {
    if (!enabled) {
      fail(
        "IDENTITY_FEDERATION_DISABLED",
        "Platform identity federation is not enabled.",
        503,
      );
    }
    if (
      typeof verifyCredential !== "function" ||
      typeof expectedIssuer !== "string" ||
      !expectedIssuer.trim() ||
      typeof identityProvider !== "string" ||
      !identityProvider.trim() ||
      typeof expectedAudience !== "string" ||
      !expectedAudience.trim()
    ) {
      fail(
        "IDENTITY_PROVIDER_UNAVAILABLE",
        "Platform identity provider is not configured.",
        503,
      );
    }
    if (typeof credential !== "string" || !credential.trim()) {
      fail(
        "IDENTITY_CREDENTIAL_REQUIRED",
        "A platform identity credential is required.",
        401,
      );
    }

    const tokenUsePolicy = Array.isArray(allowedTokenUses)
      ? normalizeStringList(allowedTokenUses, {
        code: "IDENTITY_TOKEN_USE_INVALID",
        message: "Allowed identity credential types are invalid.",
      })
      : ["support_registered", ...(allowGuest ? ["support_guest"] : [])];
    let claims;
    try {
      claims = await verifyCredential(credential, {
        requiredScopes,
        allowedScopes,
        allowedTokenUses: tokenUsePolicy,
      });
    } catch (error) {
      if (error instanceof PlatformIdentityError) throw error;
      fail(
        "IDENTITY_CREDENTIAL_INVALID",
        "The platform identity credential is invalid.",
        401,
      );
    }
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
      fail(
        "IDENTITY_CREDENTIAL_INVALID",
        "The platform identity credential is invalid.",
        401,
      );
    }

    const issuer = requiredString(
      claims.issuer,
      "IDENTITY_ISSUER_INVALID",
      "The identity issuer is invalid.",
    );
    if (issuer !== expectedIssuer.trim()) {
      fail(
        "IDENTITY_ISSUER_INVALID",
        "The identity issuer is not trusted for Owj Chat.",
        403,
      );
    }
    const subject = requiredString(
      claims.subject,
      "IDENTITY_SUBJECT_INVALID",
      "The identity subject is invalid.",
    );
    const audience = normalizeStringList(claims.audience, {
      code: "IDENTITY_AUDIENCE_INVALID",
      message: "The identity audience is invalid.",
    });
    if (!audience.includes(expectedAudience.trim())) {
      fail(
        "IDENTITY_AUDIENCE_INVALID",
        "The identity credential is not intended for Owj Chat.",
        403,
      );
    }

    const scopes = normalizeStringList(claims.scopes, {
      code: "IDENTITY_SCOPE_DENIED",
      message: "Identity scopes are invalid.",
    });
    const required = normalizeStringList(requiredScopes, {
      code: "IDENTITY_SCOPE_DENIED",
      message: "Required identity scopes are invalid.",
    });
    if (required.some((scope) => !scopes.includes(scope))) {
      fail(
        "IDENTITY_SCOPE_DENIED",
        "Required identity scope is missing.",
        403,
      );
    }

    const expiresAt = normalizeExpiry(claims.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Number(now())) {
      fail("IDENTITY_EXPIRED", "The identity credential has expired.", 401);
    }
    if (claims.status !== "active") {
      fail(
        "IDENTITY_SUBJECT_DISABLED",
        "The platform identity is not active.",
        403,
      );
    }

    const tokenUse = claims.tokenUse || claims.token_use || null;
    const expectedTokenUse = {
      guest: "support_guest",
      registered: "support_registered",
      agent: "support_agent",
    }[claims.kind];
    if (tokenUse && tokenUse !== expectedTokenUse) {
      fail(
        "IDENTITY_TOKEN_USE_INVALID",
        "The platform identity credential type is invalid.",
        403,
      );
    }
    if (tokenUse && !tokenUsePolicy.includes(tokenUse)) {
      fail(
        "IDENTITY_TOKEN_USE_INVALID",
        "The platform identity credential type is not allowed for this operation.",
        403,
      );
    }
    let assertionMetadata = {};
    if (tokenUse) {
      const jti = requiredString(
        claims.jti,
        "IDENTITY_JTI_INVALID",
        "The platform identity assertion ID is invalid.",
        128,
      );
      const issuedAt = normalizeExpiry(claims.issuedAt);
      if (!Number.isFinite(issuedAt) || issuedAt > expiresAt) {
        fail(
          "IDENTITY_ISSUED_AT_INVALID",
          "The platform identity issue time is invalid.",
          401,
        );
      }
      assertionMetadata = {
        tokenUse,
        jti,
        keyId: requiredString(
          claims.keyId,
          "IDENTITY_KEY_INVALID",
          "The platform identity signing key is invalid.",
          128,
        ),
        issuedAt,
        expiresAt,
      };
    }

    if (claims.kind === "guest") {
      if (!allowGuest) {
        fail(
          "GUEST_IDENTITY_NOT_ALLOWED",
          "Guest identity is not permitted for this operation.",
          403,
        );
      }
      const conversationIds = normalizeStringList(claims.conversationIds, {
        code: "GUEST_CAPABILITY_INVALID",
        message: "Guest conversation capability is invalid.",
        maxItems: MAX_CONVERSATION_CAPABILITIES,
      });
      return {
        kind: "guest",
        provider: identityProvider.trim(),
        guestSubject: subject,
        scopes,
        conversationIds,
        ...assertionMetadata,
      };
    }

    if (claims.kind !== "registered" && claims.kind !== "agent") {
      fail(
        "IDENTITY_KIND_INVALID",
        "The platform identity kind is invalid.",
        401,
      );
    }
    if (
      typeof findIdentityLinkByWebUserId !== "function" ||
      typeof findChatUserById !== "function"
    ) {
      fail(
        "IDENTITY_LINK_STORE_UNAVAILABLE",
        "Platform identity linking is not configured.",
        503,
      );
    }

    const link = await findIdentityLinkByWebUserId(
      identityProvider.trim(),
      subject,
    );
    if (!link) {
      fail(
        "IDENTITY_LINK_REQUIRED",
        "A verified Chat account link is required.",
        403,
      );
    }
    const linkedProvider = link.provider || link.identity_provider;
    const linkedWebUserId = link.web_user_id || link.webUserId;
    const chatUserId = link.chat_user_id || link.chatUserId;
    if (
      linkedProvider !== identityProvider.trim() ||
      linkedWebUserId !== subject ||
      typeof chatUserId !== "string" ||
      !chatUserId
    ) {
      fail(
        "IDENTITY_LINK_CONFLICT",
        "The platform identity link is inconsistent.",
        403,
      );
    }
    if (link.status !== "active") {
      fail(
        "IDENTITY_LINK_REVOKED",
        "The platform identity link is not active.",
        403,
      );
    }

    const chatUser = await findChatUserById(chatUserId);
    if (!chatUser || chatUser.banned || chatUser.status === "disabled") {
      fail(
        "CHAT_ACCOUNT_DISABLED",
        "The linked Chat account is not active.",
        403,
      );
    }
    return {
      kind: claims.kind,
      provider: identityProvider.trim(),
      webUserId: subject,
      chatUserId,
      scopes,
      chatUser,
      ...assertionMetadata,
    };
  }

  return { authenticate };
}
