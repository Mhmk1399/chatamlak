import { PlatformIdentityError } from "./platformIdentityAdapter.js";

function fail(code, message, status = 403) {
  throw new PlatformIdentityError(code, message, status);
}

function required(value, code, max = 200) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) fail(code, "The identity-link input is invalid.", 400);
  return normalized;
}

function expiration(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return Date.parse(value);
  return Number.NaN;
}

function registeredPrincipal(input, now) {
  if (
    !input ||
    input.kind !== "registered" ||
    input.provider !== "owj-web" ||
    input.tokenUse !== "support_registered" ||
    !Array.isArray(input.scopes) ||
    !input.scopes.includes("support:conversation:create") ||
    expiration(input.expiresAt) <= Number(now())
  ) {
    fail("IDENTITY_LINK_PRINCIPAL_INVALID", "A current verified Web principal is required.");
  }
  return {
    ...input,
    webUserId: required(input.webUserId || input.subject, "IDENTITY_LINK_PRINCIPAL_INVALID"),
  };
}

function validateProof(proof, expected, now, code) {
  if (
    !proof ||
    proof.authorized !== true ||
    proof.provider !== "owj-web" ||
    expiration(proof.expiresAt) <= Number(now()) ||
    typeof proof.jti !== "string" ||
    !proof.jti.trim() ||
    Object.entries(expected).some(([field, expectedValue]) => proof[field] !== expectedValue)
  ) {
    fail(code, "The Web identity-link proof is invalid.");
  }
  return proof;
}

/**
 * High-level identity association boundary. A normal bootstrap assertion alone
 * cannot claim an arbitrary historical Chat UUID: a separately injected Web
 * proof verifier must bind the exact Web and Chat IDs. Guest conversion uses a
 * separate proof bound to the trusted guest session and conversation.
 */
export function createPlatformIdentityLinkService({
  findChatUserById,
  findPlatformIdentityLinkByWebUserId,
  linkPlatformIdentityAccount,
  linkSupportGuestToRegistered,
  verifyAccountLinkProof,
  verifyGuestConversionProof,
  now = Date.now,
} = {}) {
  async function linkRegisteredAccount({ principal, chatUserId, proofCredential } = {}) {
    const actor = registeredPrincipal(principal, now);
    const targetChatUserId = required(chatUserId, "IDENTITY_LINK_INPUT_INVALID");
    if (
      typeof verifyAccountLinkProof !== "function" ||
      typeof linkPlatformIdentityAccount !== "function" ||
      typeof findChatUserById !== "function"
    ) {
      fail(
        "IDENTITY_LINK_PROVIDER_UNAVAILABLE",
        "The verified identity-link service is unavailable.",
        503,
      );
    }
    const credential = required(proofCredential, "IDENTITY_LINK_PROOF_REQUIRED", 16 * 1024);
    let proof;
    try {
      proof = await verifyAccountLinkProof(credential);
    } catch (error) {
      if (error instanceof PlatformIdentityError) throw error;
      fail("IDENTITY_LINK_PROOF_INVALID", "The Web identity-link proof is invalid.");
    }
    validateProof(proof, {
      webUserId: actor.webUserId,
      chatUserId: targetChatUserId,
    }, now, "IDENTITY_LINK_PROOF_INVALID");
    const chatUser = await findChatUserById(targetChatUserId);
    if (!chatUser || chatUser.banned || chatUser.status === "disabled") {
      fail("CHAT_ACCOUNT_DISABLED", "The target Chat account is not active.");
    }
    return linkPlatformIdentityAccount({
      provider: "owj-web",
      webUserId: actor.webUserId,
      chatUserId: targetChatUserId,
      linkedByWebUserId: actor.webUserId,
    });
  }

  async function convertGuestToRegistered({
    registeredPrincipal: inputPrincipal,
    guestSession,
    proofCredential,
  } = {}) {
    const actor = registeredPrincipal(inputPrincipal, now);
    if (
      !guestSession ||
      guestSession.kind !== "guest" ||
      guestSession.provider !== "owj-web"
    ) {
      fail("GUEST_CONVERSION_SESSION_INVALID", "A trusted guest support session is required.");
    }
    const guestSubject = required(guestSession.guestSubject, "GUEST_CONVERSION_SESSION_INVALID");
    const conversationId = required(
      guestSession.conversationId,
      "GUEST_CONVERSION_SESSION_INVALID",
      128,
    );
    if (
      typeof verifyGuestConversionProof !== "function" ||
      typeof findPlatformIdentityLinkByWebUserId !== "function" ||
      typeof linkSupportGuestToRegistered !== "function"
    ) {
      fail(
        "GUEST_CONVERSION_PROVIDER_UNAVAILABLE",
        "The verified guest-conversion service is unavailable.",
        503,
      );
    }
    const credential = required(proofCredential, "GUEST_CONVERSION_PROOF_REQUIRED", 16 * 1024);
    let proof;
    try {
      proof = await verifyGuestConversionProof(credential);
    } catch (error) {
      if (error instanceof PlatformIdentityError) throw error;
      fail("GUEST_CONVERSION_PROOF_INVALID", "The Web guest-conversion proof is invalid.");
    }
    validateProof(proof, {
      guestSubject,
      webUserId: actor.webUserId,
      conversationId,
    }, now, "GUEST_CONVERSION_PROOF_INVALID");
    const link = await findPlatformIdentityLinkByWebUserId("owj-web", actor.webUserId);
    const chatUserId = actor.chatUserId || link?.chat_user_id || link?.chatUserId;
    if (
      !link ||
      link.status !== "active" ||
      link.provider !== "owj-web" ||
      link.web_user_id !== actor.webUserId ||
      typeof chatUserId !== "string" ||
      !chatUserId ||
      (actor.chatUserId && actor.chatUserId !== (link.chat_user_id || link.chatUserId))
    ) {
      fail("IDENTITY_LINK_REQUIRED", "An active registered identity link is required.");
    }
    return linkSupportGuestToRegistered({
      provider: "owj-web",
      guestSubject,
      webUserId: actor.webUserId,
      chatUserId,
      conversationId,
      proofJti: required(proof.jti, "GUEST_CONVERSION_PROOF_INVALID", 128),
    });
  }

  return { linkRegisteredAccount, convertGuestToRegistered };
}
