export const PLATFORM_IDENTITY_LINK_COLLECTION = "platform_identity_links";

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

/**
 * Additive, dormant schema preparation for the future Web identity link.
 *
 * This function is deliberately not called by server/db.js. The approved Web
 * identity contract, feature flag, backup, migration review, and rollback plan
 * must exist before deployment invokes it.
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
