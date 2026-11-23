export const PLATFORM_IDENTITY_LINK_COLLECTION = "platform_identity_links";
export const PLATFORM_ASSERTION_JTI_COLLECTION = "platform_identity_assertion_jtis";
export const SUPPORT_GUEST_IDENTITY_LINK_COLLECTION = "support_guest_identity_links";

export const PLATFORM_IDENTITY_LINK_INDEXES = [
  {
    keys: { id: 1 },
    options: { unique: true, name: "platform_identity_link_id" },
  },
  {
    keys: { provider: 1, web_user_id: 1 },
    options: { unique: true, name: "platform_identity_link_web_subject" },
  },
  {
    keys: { chat_user_id: 1 },
    options: { unique: true, name: "platform_identity_link_chat_user" },
  },
  {
    keys: { status: 1, updated_at: -1 },
    options: { name: "platform_identity_link_status_updated" },
  },
];

const validator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "id",
      "provider",
      "web_user_id",
      "chat_user_id",
      "status",
      "created_at",
      "updated_at",
    ],
    properties: {
      id: { bsonType: "string", minLength: 1 },
      provider: { enum: ["owj-web"] },
      web_user_id: { bsonType: "string", minLength: 1 },
      chat_user_id: { bsonType: "string", minLength: 1 },
      status: { enum: ["active", "revoked", "deactivated"] },
      revision: { bsonType: ["int", "long"], minimum: 1 },
      created_at: { bsonType: "string", minLength: 1 },
      updated_at: { bsonType: "string", minLength: 1 },
      linked_by_web_user_id: { bsonType: ["string", "null"] },
      revoked_at: { bsonType: ["string", "null"] },
      revocation_reason: { bsonType: ["string", "null"] },
    },
  },
};

export const PLATFORM_ASSERTION_JTI_INDEXES = [
  {
    keys: { id: 1 },
    options: { unique: true, name: "platform_assertion_jti_id" },
  },
  {
    keys: { issuer: 1, jti: 1 },
    options: { unique: true, name: "platform_assertion_jti_unique" },
  },
  {
    keys: { expires_at: 1 },
    options: { expireAfterSeconds: 0, name: "platform_assertion_jti_expiry" },
  },
];

export const SUPPORT_GUEST_IDENTITY_LINK_INDEXES = [
  {
    keys: { id: 1 },
    options: { unique: true, name: "support_guest_identity_link_id" },
  },
  {
    keys: { provider: 1, guest_subject_digest: 1 },
    options: { unique: true, name: "support_guest_identity_subject" },
  },
  {
    keys: { provider: 1, web_user_id: 1, converted_at: -1 },
    options: { name: "support_guest_identity_web_user" },
  },
  {
    keys: { conversation_id: 1 },
    options: { name: "support_guest_identity_conversation" },
  },
];

const assertionJtiValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["id", "issuer", "jti", "subject", "token_use", "expires_at", "created_at"],
    properties: {
      id: { bsonType: "string", minLength: 1 },
      issuer: { bsonType: "string", minLength: 1 },
      jti: { bsonType: "string", minLength: 1 },
      subject: { bsonType: "string", minLength: 1 },
      token_use: { enum: ["support_registered", "support_guest", "support_agent", "support_guest_link"] },
      expires_at: { bsonType: "date" },
      created_at: { bsonType: "date" },
    },
  },
};

const guestIdentityLinkValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "id",
      "provider",
      "guest_subject_digest",
      "web_user_id",
      "chat_user_id",
      "conversation_id",
      "proof_jti",
      "converted_at",
    ],
    properties: {
      id: { bsonType: "string", minLength: 1 },
      provider: { enum: ["owj-web"] },
      guest_subject_digest: { bsonType: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      web_user_id: { bsonType: "string", minLength: 1 },
      chat_user_id: { bsonType: "string", minLength: 1 },
      conversation_id: { bsonType: "string", minLength: 1 },
      proof_jti: { bsonType: "string", minLength: 1 },
      converted_at: { bsonType: "string", minLength: 1 },
    },
  },
};

async function ensureCollection(db, name, collectionValidator, indexes) {
  const exists = await db
    .listCollections({ name }, { nameOnly: true })
    .hasNext();
  if (!exists) {
    await db.createCollection(name, {
      validator: collectionValidator,
      validationLevel: "strict",
    });
  }
  const collection = db.collection(name);
  for (const { keys, options } of indexes) await collection.createIndex(keys, options);
  return !exists;
}

/**
 * Compatibility helper for callers that need only the additive account-link
 * collection. The active Mongo schema now declares the same named indexes;
 * this helper remains idempotent for migration tooling and older integrations.
 */
export async function ensurePlatformIdentityLinkSchema(
  db,
  { enabled = false } = {},
) {
  if (enabled !== true) {
    return {
      enabled: false,
      collection: PLATFORM_IDENTITY_LINK_COLLECTION,
      changed: false,
    };
  }
  if (!db || typeof db.listCollections !== "function") {
    throw new TypeError("A MongoDB database handle is required.");
  }

  const exists = await db
    .listCollections(
      { name: PLATFORM_IDENTITY_LINK_COLLECTION },
      { nameOnly: true },
    )
    .hasNext();
  if (!exists) {
    await db.createCollection(PLATFORM_IDENTITY_LINK_COLLECTION, {
      validator,
      validationLevel: "strict",
    });
  }
  const collection = db.collection(PLATFORM_IDENTITY_LINK_COLLECTION);
  for (const { keys, options } of PLATFORM_IDENTITY_LINK_INDEXES) {
    await collection.createIndex(keys, options);
  }
  return {
    enabled: true,
    collection: PLATFORM_IDENTITY_LINK_COLLECTION,
    changed: !exists,
  };
}

/**
 * Additive Sprint 2 identity storage. It creates only new collections and
 * indexes; users, sessions, memberships, messages, and attachments are never
 * altered. Callers must explicitly opt in after backup/rollout review.
 */
export async function ensurePlatformIdentitySchema(db, { enabled = false } = {}) {
  const collections = [
    PLATFORM_IDENTITY_LINK_COLLECTION,
    PLATFORM_ASSERTION_JTI_COLLECTION,
    SUPPORT_GUEST_IDENTITY_LINK_COLLECTION,
  ];
  if (enabled !== true) return { enabled: false, collections, changed: [] };
  if (!db || typeof db.listCollections !== "function") {
    throw new TypeError("A MongoDB database handle is required.");
  }
  const definitions = [
    [PLATFORM_IDENTITY_LINK_COLLECTION, validator, PLATFORM_IDENTITY_LINK_INDEXES],
    [PLATFORM_ASSERTION_JTI_COLLECTION, assertionJtiValidator, PLATFORM_ASSERTION_JTI_INDEXES],
    [SUPPORT_GUEST_IDENTITY_LINK_COLLECTION, guestIdentityLinkValidator, SUPPORT_GUEST_IDENTITY_LINK_INDEXES],
  ];
  const changed = [];
  for (const [name, collectionValidator, indexes] of definitions) {
    if (await ensureCollection(db, name, collectionValidator, indexes)) changed.push(name);
  }
  return { enabled: true, collections, changed };
}
