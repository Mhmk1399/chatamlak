// Stable public IDs and separate, indexed collections keep large conversations
// out of MongoDB's per-document size limit. Existing API field names stay intact.
export const COLLECTION_KEYS = {
  users: ["id"], chats: ["id"], chat_messages: ["id"], chat_message_files: ["id"],
  chat_members: ["chat_id", "user_id"], chat_left_members: ["chat_id", "user_id"],
  group_removed_members: ["chat_id", "user_id"], hidden_chats: ["user_id", "chat_id"],
  hidden_chat_messages: ["user_id", "message_id"], chat_message_reads: ["message_id", "user_id"],
  chat_mutes: ["user_id", "chat_id"], sessions: ["token"], app_settings: ["key"],
  push_subscriptions: ["endpoint"], pending_presigned_uploads: ["storage_key"],
  remote_channel_sources: ["id"], remote_channel_queue: ["id"], remote_channel_provider_state: ["provider"],
  admin_audit_logs: ["id"], chat_preferences: ["user_id", "chat_id"],
  message_reactions: ["message_id", "user_id", "emoji"], chat_pinned_messages: ["chat_id", "message_id"],
  chat_topics: ["id"], chat_message_topics: ["message_id"], chat_polls: ["id"], chat_poll_votes: ["poll_id", "user_id"],
  scheduled_messages: ["id"], chat_group_policy: ["chat_id"], chat_event_log: ["id"],
  session_devices: ["token_hash"], group_call_rooms: ["chat_id"], group_call_peers: ["id"],
  meta: ["key"], migration_runs: ["id"],
};
export const NUMERIC_IDS = new Set(["chat_message_files", "remote_channel_sources", "remote_channel_queue", "admin_audit_logs", "chat_event_log"]);
export const MONGO_SCHEMA_VERSION = 1;
const validators = {
  users: { required: ["id", "username", "password_hash"], properties: { id: { bsonType: "string" }, username: { bsonType: "string", minLength: 1 }, password_hash: { bsonType: "string" } } },
  chats: { required: ["id", "type"], properties: { id: { bsonType: "string" }, type: { enum: ["dm", "group", "channel", "saved"] } } },
  chat_messages: { required: ["id", "chat_id", "body", "created_at"], properties: { id: { bsonType: "string" }, chat_id: { bsonType: "string" }, body: { bsonType: "string" }, created_at: { bsonType: "string" } } },
  chat_members: { required: ["chat_id", "user_id", "role"], properties: { chat_id: { bsonType: "string" }, user_id: { bsonType: "string" }, role: { enum: ["owner", "admin", "member"] } } },
  chat_message_files: { required: ["id", "message_id", "mime_type", "stored_name"], properties: { id: { bsonType: ["int", "long", "double"] }, message_id: { bsonType: "string" }, mime_type: { bsonType: "string" }, stored_name: { bsonType: "string" } } },
};
const index = (collection, keys, options = {}) => ({ collection, keys, options });
export const MONGO_INDEXES = [
  ...Object.entries(COLLECTION_KEYS).map(([name, keys]) => index(name, Object.fromEntries(keys.map((key) => [key, 1])), { unique: true })),
  index("users", { username: 1 }, { unique: true }),
  index("users", { role: 1 }, { unique: true, partialFilterExpression: { role: "owner" } }),
  index("chats", { group_username: 1 }, { unique: true, partialFilterExpression: { group_username: { $type: "string" } } }),
  index("chats", { invite_token: 1 }, { unique: true, partialFilterExpression: { invite_token: { $type: "string" } } }),
  index("chats", { saved_owner_id: 1 }, { unique: true, partialFilterExpression: { saved_owner_id: { $type: "string" } } }),
  index("chats", { dm_pair: 1 }, { unique: true, partialFilterExpression: { dm_pair: { $type: "string" } } }),
  index("chats", { type: 1, group_visibility: 1, created_at: -1 }),
  index("chat_members", { user_id: 1, chat_id: 1 }),
  index("chat_messages", { chat_id: 1, created_at: -1, id: -1 }),
  index("chat_messages", { chat_id: 1, user_id: 1, client_request_id: 1 }, { unique: true, partialFilterExpression: { client_request_id: { $type: "string" } } }),
  index("chat_messages", { expires_at: 1 }),
  index("chat_message_files", { message_id: 1, id: 1 }),
  index("chat_message_files", { storage_key: 1 }),
  index("chat_message_files", { stored_name: 1 }),
  index("chat_message_files", { expires_at: 1 }),
  index("chat_message_reads", { user_id: 1, message_id: 1 }),
  index("hidden_chat_messages", { message_id: 1, user_id: 1 }),
  index("sessions", { user_id: 1 }),
  index("remote_channel_sources", { chat_id: 1 }, { unique: true }),
  index("remote_channel_queue", { source_id: 1, source_version: 1, telegram_update_id: 1 }, { unique: true, partialFilterExpression: { telegram_update_id: { $type: "number" } } }),
  index("remote_channel_queue", { source_id: 1, source_version: 1, telegram_message_id: 1 }, { unique: true, partialFilterExpression: { telegram_message_id: { $type: "number" } } }),
  index("remote_channel_queue", { status: 1, next_attempt_at: 1, id: 1 }),
  index("chat_event_log", { chat_id: 1, id: 1 }),
  index("group_call_peers", { chat_id: 1, updated_at: 1 }),
  index("scheduled_messages", { status: 1, due_at: 1, lease_until: 1 }),
  index("chat_topics", { chat_id: 1, created_at: 1 }),
  index("chat_polls", { chat_id: 1, message_id: 1 }),
  index("admin_audit_logs", { created_at: -1, id: -1 }),
];

export function documentDefaults(collection, now = new Date().toISOString()) {
  const defaults = {
    users: { role: "user", status: "online", banned: 0, verified: 0, nickname: null, avatar_url: null, avatar_storage_driver: "local", avatar_storage_key: null, avatar_encryption_type: "none", last_seen: now },
    chats: { type: "dm", group_visibility: "public", group_username: null, invite_token: null, created_by_user_id: null, verified: 0, allow_member_invites: 1, auto_add_new_users: 0, group_color: null, group_avatar_url: null },
    chat_messages: { edited: 0, edited_body: null, read_at: null, read_by_user_id: null, hidden_everyone_at: null, expires_at: null, reply_to_message_id: null, client_request_id: null },
    chat_message_files: { processing_status: "ready", encryption_type: "none", storage_driver: "local", expires_at: null, width_px: null, height_px: null, duration_seconds: null, storage_key: null, thumb_storage_key: null },
    chat_members: { role: "member" }, sessions: { last_seen: now },
    remote_channel_sources: { enabled: 0, paused: 0, source_version: 1, sync_metadata: 0, stream_media: 0, last_error: null, last_remote_message_id: null },
    remote_channel_queue: { status: "pending", attempts: 0, next_attempt_at: now, locked_at: null, lock_owner: null },
    chat_polls: { closed: 0 }, chat_preferences: { pinned: 0, archived: 0, folder: "" },
  };
  return { created_at: now, ...(defaults[collection] || {}) };
}

export async function ensureMongoSchema(db) {
  for (const name of Object.keys(COLLECTION_KEYS)) {
    if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext())) await db.createCollection(name, validators[name] ? { validator: { $jsonSchema: { bsonType: "object", ...validators[name] } }, validationLevel: "strict" } : {});
  }
  for (const { collection, keys, options } of MONGO_INDEXES) await db.collection(collection).createIndex(keys, options);
  if (!(await db.listCollections({ name: "counters" }, { nameOnly: true }).hasNext())) await db.createCollection("counters");
  for (const name of [...NUMERIC_IDS, "chat_events"]) await db.collection("counters").updateOne({ _id: name }, { $setOnInsert: { value: 0 } }, { upsert: true });
  await db.collection("meta").updateOne({ key: "mongo_schema_version" }, { $set: { value: MONGO_SCHEMA_VERSION } }, { upsert: true });
}
