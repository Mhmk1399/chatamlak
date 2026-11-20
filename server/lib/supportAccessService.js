const OPERATIONS = new Set(["read", "send", "acknowledge"]);

export class SupportAccessError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = "SupportAccessError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status = 403) {
  throw new SupportAccessError(code, message, status);
}

/**
 * Authorization boundary for a future Web-facing support adapter.
 *
 * This intentionally exposes no HTTP route. The Web-owned verifier must first
 * create a principal through platformIdentityAdapter. Existing Chat membership
 * remains authoritative for registered users, while guest access is limited to
 * conversation IDs present in a verified, short-lived Web capability.
 */
export function createSupportAccessService({ isMember } = {}) {
  async function authorizeConversation({
    principal,
    conversationId,
    operation,
  } = {}) {
    if (!principal || typeof principal !== "object") {
      fail(
        "SUPPORT_IDENTITY_REQUIRED",
        "A verified platform identity is required.",
        401,
      );
    }
    if (
      typeof conversationId !== "string" ||
      !conversationId.trim() ||
      conversationId.trim().length > 128
    ) {
      fail(
        "SUPPORT_CONVERSATION_INVALID",
        "The support conversation identifier is invalid.",
        400,
      );
    }
    if (!OPERATIONS.has(operation)) {
      fail(
        "SUPPORT_OPERATION_DENIED",
        "The requested support operation is not allowed.",
      );
    }
    if (
      !Array.isArray(principal.scopes) ||
      !principal.scopes.includes("support:conversation")
    ) {
      fail(
        "SUPPORT_SCOPE_DENIED",
        "The platform identity does not grant support conversation access.",
      );
    }

    const normalizedConversationId = conversationId.trim();
    if (principal.kind === "guest") {
      if (
        principal.provider !== "owj-web" ||
        typeof principal.guestSubject !== "string" ||
        !principal.guestSubject ||
        !Array.isArray(principal.conversationIds) ||
        !principal.conversationIds.includes(normalizedConversationId)
      ) {
        fail(
          "SUPPORT_CONVERSATION_DENIED",
          "The guest capability does not grant this conversation.",
        );
      }
      return {
        actorKind: "guest",
        subject: principal.guestSubject,
        conversationId: normalizedConversationId,
        operation,
      };
    }

    if (
      principal.kind !== "registered" ||
      principal.provider !== "owj-web" ||
      typeof principal.webUserId !== "string" ||
      !principal.webUserId ||
      typeof principal.chatUserId !== "string" ||
      !principal.chatUserId ||
      typeof isMember !== "function" ||
      !(await isMember(normalizedConversationId, principal.chatUserId))
    ) {
      fail(
        "SUPPORT_CONVERSATION_DENIED",
        "The linked Chat user is not a member of this conversation.",
      );
    }
    return {
      actorKind: "registered",
      subject: principal.webUserId,
      chatUserId: principal.chatUserId,
      conversationId: normalizedConversationId,
      operation,
    };
  }

  return { authorizeConversation };
}
