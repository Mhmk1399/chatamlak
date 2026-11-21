import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";
import {
  PLATFORM_ASSERTION_JTI_COLLECTION,
  PLATFORM_IDENTITY_LINK_COLLECTION,
  SUPPORT_GUEST_IDENTITY_LINK_COLLECTION,
} from "./platformIdentitySchema.js";

const TOKEN_USES = new Set(["support_registered", "support_guest", "support_agent"]);

export class PlatformIdentityLinkError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "PlatformIdentityLinkError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new PlatformIdentityLinkError(code, message, status);
}

function value(input, field, max = 200) {
  const result = typeof input === "string" ? input.trim() : "";
  if (!result || result.length > max) {
    fail("IDENTITY_LINK_INPUT_INVALID", `The ${field} value is invalid.`, 400);
  }
  return result;
}

function clean(row) {
  if (!row) return null;
  const { _id, ...document } = row;
  return document;
}

function isDuplicateKey(error) {
  return error?.code === 11000 || error?.codeName === "DuplicateKey";
}

const guestSubjectDigest = (subject) =>
  `sha256:${createHash("sha256").update(`owj-web:${subject}`, "utf8").digest("hex")}`;

/**
 * Platform-identity queries live in this DB module even though their additive
 * collections are outside the legacy COLLECTION_KEYS registry. Pass the
 * existing Mongo store; the returned operations can be Object.assign'ed into
 * the main repository during feature-gated composition.
 */
export function createPlatformIdentityRepository(store, {
  now = Date.now,
  randomUUID = nodeRandomUUID,
} = {}) {
  if (!store?.db || typeof store.db.collection !== "function") {
    throw new TypeError("The Mongo store is required.");
  }
  const options = (extra = {}) => typeof store.opts === "function" ? store.opts(extra) : extra;
  const links = () => store.db.collection(PLATFORM_IDENTITY_LINK_COLLECTION);
  const assertionJtis = () => store.db.collection(PLATFORM_ASSERTION_JTI_COLLECTION);
  const guestLinks = () => store.db.collection(SUPPORT_GUEST_IDENTITY_LINK_COLLECTION);

  async function findPlatformIdentityLinkByWebUserId(provider, webUserId) {
    return clean(await links().findOne({
      provider: value(provider, "provider", 64),
      web_user_id: value(webUserId, "Web user ID"),
    }, options()));
  }

  async function findPlatformIdentityLinkByChatUserId(chatUserId) {
    return clean(await links().findOne({
      chat_user_id: value(chatUserId, "Chat user ID"),
    }, options()));
  }

  function identicalLink(row, provider, webUserId, chatUserId) {
    return row?.provider === provider &&
      row?.web_user_id === webUserId &&
      row?.chat_user_id === chatUserId &&
      row?.status === "active";
  }

  async function resolveExisting(provider, webUserId, chatUserId) {
    const [byWeb, byChat] = await Promise.all([
      findPlatformIdentityLinkByWebUserId(provider, webUserId),
      findPlatformIdentityLinkByChatUserId(chatUserId),
    ]);
    if (!byWeb && !byChat) return null;
    if (
      identicalLink(byWeb || byChat, provider, webUserId, chatUserId) &&
      (!byWeb || !byChat || byWeb.id === byChat.id)
    ) {
      return { created: false, duplicate: true, link: byWeb || byChat };
    }
    fail(
      "IDENTITY_LINK_CONFLICT",
      "The Web identity or Chat account is already linked incompatibly.",
      409,
    );
  }

  async function linkPlatformIdentityAccount({
    provider = "owj-web",
    webUserId,
    chatUserId,
    linkedByWebUserId = null,
  } = {}) {
    const normalizedProvider = value(provider, "provider", 64);
    if (normalizedProvider !== "owj-web") {
      fail("IDENTITY_LINK_INPUT_INVALID", "The identity provider is not supported.", 400);
    }
    const normalizedWebUserId = value(webUserId, "Web user ID");
    const normalizedChatUserId = value(chatUserId, "Chat user ID");
    const existing = await resolveExisting(
      normalizedProvider,
      normalizedWebUserId,
      normalizedChatUserId,
    );
    if (existing) return existing;
    const timestamp = new Date(Number(now())).toISOString();
    const document = {
      id: randomUUID(),
      provider: normalizedProvider,
      web_user_id: normalizedWebUserId,
      chat_user_id: normalizedChatUserId,
      status: "active",
      revision: 1,
      created_at: timestamp,
      updated_at: timestamp,
      linked_by_web_user_id: linkedByWebUserId == null
        ? null
        : value(linkedByWebUserId, "linking Web user ID"),
      revoked_at: null,
      revocation_reason: null,
    };
    try {
      await links().insertOne(document, options());
      return { created: true, duplicate: false, link: document };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const concurrent = await resolveExisting(
        normalizedProvider,
        normalizedWebUserId,
        normalizedChatUserId,
      );
      if (concurrent) return concurrent;
      fail("IDENTITY_LINK_CONFLICT", "The identity link conflicts with an existing mapping.", 409);
    }
  }

  async function deactivatePlatformIdentityLink({
    provider = "owj-web",
    webUserId,
    reason = "web_account_deactivated",
  } = {}) {
    const normalizedProvider = value(provider, "provider", 64);
    const normalizedWebUserId = value(webUserId, "Web user ID");
    const current = await findPlatformIdentityLinkByWebUserId(
      normalizedProvider,
      normalizedWebUserId,
    );
    if (!current) return null;
    if (current.status === "deactivated") return current;
    const timestamp = new Date(Number(now())).toISOString();
    return clean(await links().findOneAndUpdate(
      { id: current.id, status: current.status },
      {
        $set: {
          status: "deactivated",
          updated_at: timestamp,
          revoked_at: timestamp,
          revocation_reason: value(reason, "revocation reason", 200),
        },
        $inc: { revision: 1 },
      },
      options({ returnDocument: "after" }),
    ));
  }

  async function consumePlatformIdentityAssertionJti({
    issuer,
    jti,
    subject,
    tokenUse,
    expiresAt,
  } = {}) {
    const normalizedTokenUse = value(tokenUse, "token use", 64);
    if (!TOKEN_USES.has(normalizedTokenUse) || !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
      fail("IDENTITY_ASSERTION_INPUT_INVALID", "The assertion replay record is invalid.", 400);
    }
    const document = {
      id: randomUUID(),
      issuer: value(issuer, "issuer"),
      jti: value(jti, "assertion ID", 128),
      subject: value(subject, "subject"),
      token_use: normalizedTokenUse,
      expires_at: expiresAt,
      created_at: new Date(Number(now())),
    };
    try {
      await assertionJtis().insertOne(document, options());
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async function findSupportGuestIdentityLink(provider, guestSubject) {
    return clean(await guestLinks().findOne({
      provider: value(provider, "provider", 64),
      guest_subject_digest: guestSubjectDigest(value(guestSubject, "guest subject")),
    }, options()));
  }

  async function linkSupportGuestToRegistered({
    provider = "owj-web",
    guestSubject,
    webUserId,
    chatUserId,
    conversationId,
    proofJti,
  } = {}) {
    const normalizedProvider = value(provider, "provider", 64);
    const normalizedGuestSubject = value(guestSubject, "guest subject");
    const document = {
      id: randomUUID(),
      provider: normalizedProvider,
      guest_subject_digest: guestSubjectDigest(normalizedGuestSubject),
      web_user_id: value(webUserId, "Web user ID"),
      chat_user_id: value(chatUserId, "Chat user ID"),
      conversation_id: value(conversationId, "conversation ID", 128),
      proof_jti: value(proofJti, "conversion proof ID", 128),
      converted_at: new Date(Number(now())).toISOString(),
    };
    const existing = await findSupportGuestIdentityLink(normalizedProvider, normalizedGuestSubject);
    if (existing) {
      if (
        existing.web_user_id === document.web_user_id &&
        existing.chat_user_id === document.chat_user_id &&
        existing.conversation_id === document.conversation_id
      ) return { created: false, duplicate: true, link: existing };
      fail("GUEST_CONVERSION_CONFLICT", "The guest identity was already converted incompatibly.", 409);
    }
    try {
      await guestLinks().insertOne(document, options());
      return { created: true, duplicate: false, link: document };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const concurrent = await findSupportGuestIdentityLink(normalizedProvider, normalizedGuestSubject);
      if (
        concurrent?.web_user_id === document.web_user_id &&
        concurrent?.chat_user_id === document.chat_user_id &&
        concurrent?.conversation_id === document.conversation_id
      ) return { created: false, duplicate: true, link: concurrent };
      fail("GUEST_CONVERSION_CONFLICT", "The guest identity was already converted incompatibly.", 409);
    }
  }

  return {
    findPlatformIdentityLinkByWebUserId,
    findPlatformIdentityLinkByChatUserId,
    linkPlatformIdentityAccount,
    deactivatePlatformIdentityLink,
    consumePlatformIdentityAssertionJti,
    findSupportGuestIdentityLink,
    linkSupportGuestToRegistered,
  };
}
