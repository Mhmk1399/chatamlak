import crypto from "node:crypto";
import { COLLECTION_KEYS, NUMERIC_IDS, documentDefaults, ensureMongoSchema } from "./mongoSchema.js";

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const uuid = (table, value) => {
  if (value == null || value === "") return null;
  const string = String(value);
  if (/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(string)) return string.toLowerCase();
  const bytes = crypto.createHash("sha256").update(`ouj-legacy:${table}:${string}`).digest().subarray(0, 16);
  bytes[6] = bytes[6] & 0x0f | 0x50; bytes[8] = bytes[8] & 0x3f | 0x80;
  const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const refs = {
  user_id: "users", actor_user_id: "users", created_by_user_id: "users", removed_by_user_id: "users", read_by_user_id: "users", forwarded_from_user_id: "users", viewer_user_id: "users",
  chat_id: "chats", forwarded_from_chat_id: "chats", message_id: "chat_messages", reply_to_message_id: "chat_messages", created_message_id: "chat_messages", topic_id: "chat_topics", poll_id: "chat_polls",
};
const stable = (object) => JSON.stringify(Object.fromEntries(Object.entries(object).filter(([key]) => key !== "_id").sort(([a], [b]) => a.localeCompare(b))));

export function prepareLegacyImport(source) {
  const collections = {}, counts = {}; let remappedIds = 0;
  for (const [name, input] of Object.entries(source)) {
    if (name === "chat_event_clock") continue;
    if (!Object.hasOwn(COLLECTION_KEYS, name)) throw new Error(`Unsupported legacy collection: ${name}`);
    const rows = input.map((original) => {
      const row = { ...original };
      if (NUMERIC_IDS.has(name)) {
        row.id = Number(row.id);
        if (!Number.isSafeInteger(row.id) || row.id < 1) throw new Error(`Invalid numeric ID in ${name}.`);
      }
      for (const field of ["source_id", "source_version", "telegram_update_id", "telegram_message_id"]) if (row[field] != null) {
        row[field] = Number(row[field]);
        if (!Number.isSafeInteger(row[field])) throw new Error(`Invalid integer in ${name}.${field}.`);
      }
      if (COLLECTION_KEYS[name][0] === "id" && !NUMERIC_IDS.has(name)) { const id = uuid(name, row.id); if (String(row.id) !== id) remappedIds++; row.id = id; }
      for (const [field, table] of Object.entries(refs)) if (row[field] != null) row[field] = uuid(table, row[field]);
      for (const field of Object.keys(row)) {
        const value = row[field];
        if (value instanceof Date) row[field] = value.toISOString();
        else if ((field.endsWith("_at") || ["last_seen", "lease_until"].includes(field)) && value && typeof value === "string") {
          const timestamp = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
          if (!Number.isFinite(timestamp)) throw new Error(`Invalid timestamp in ${name}.${field}; correct the source before importing.`);
          row[field] = new Date(timestamp).toISOString();
        }
      }
      if (name === "users") row.username = String(row.username).toLowerCase();
      if (name === "chats" && row.group_username) row.group_username = String(row.group_username).replace(/^@+/, "").toLowerCase();
      if (name === "chats" && row.type === "saved") row.saved_owner_id = row.created_by_user_id;
      if (name === "chat_event_log") {
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        for (const [field, table] of Object.entries({ chatId: "chats", userId: "users", messageId: "chat_messages" })) if (payload[field]) payload[field] = uuid(table, payload[field]);
        if (Array.isArray(payload.messageIds)) payload.messageIds = payload.messageIds.map((id) => uuid("chat_messages", id));
        row.payload = payload;
      }
      const completed = { ...documentDefaults(name, row.created_at || "1970-01-01T00:00:00.000Z"), ...row };
      // Stable MongoDB document IDs make a crashed import safe to resume.
      const key = COLLECTION_KEYS[name].map((field) => completed[field]);
      if (key.some((value) => value == null || value === "")) throw new Error(`A required logical key is missing in ${name}.`);
      return { ...completed, _id: `legacy:${name}:${hash(JSON.stringify(key))}` };
    });
    collections[name] = rows;
    counts[name] = rows.length;
  }
  const users = new Set((collections.users || []).map((row) => row.id)), chats = new Set((collections.chats || []).map((row) => row.id)), messages = new Set((collections.chat_messages || []).map((row) => row.id));
  for (const row of collections.chat_members || []) if (!users.has(row.user_id) || !chats.has(row.chat_id)) throw new Error("A legacy membership refers to a missing user or chat.");
  for (const row of collections.chat_messages || []) if (!chats.has(row.chat_id)) throw new Error("A legacy message refers to a missing chat.");
  for (const row of collections.chat_message_files || []) if (!messages.has(row.message_id)) throw new Error("A legacy file refers to a missing message.");
  const digests = Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, hash(rows.map(stable).sort().join("\n"))]));
  const checksum = hash(JSON.stringify(Object.entries(digests).sort()));
  return { collections, counts, digests, checksum, remappedIds };
}

export async function importLegacyData(db, prepared, { apply = false } = {}) {
  if (!apply) return { dryRun: true, counts: prepared.counts, remappedIds: prepared.remappedIds, checksum: prepared.checksum };
  await ensureMongoSchema(db);
  const id = `legacy:${prepared.checksum}`, owner = crypto.randomUUID();
  const existing = await db.collection("migration_runs").findOne({ id });
  if (existing?.status === "complete") return { alreadyImported: true, counts: prepared.counts, checksum: prepared.checksum };
  if (!existing) {
    for (const name of Object.keys(COLLECTION_KEYS)) {
      if (["meta", "migration_runs"].includes(name)) continue;
      if (await db.collection(name).countDocuments({})) throw new Error("MongoDB target is not empty. Choose a new database; existing records have not been overwritten.");
    }
    if (await db.collection("migration_runs").findOne({ status: "importing" })) throw new Error("Another import is incomplete. Resume it with the same source.");
    await db.collection("migration_runs").insertOne({ id, checksum: prepared.checksum, status: "importing", counts: prepared.counts, created_at: new Date().toISOString(), lease_until: new Date(0) });
  }
  const claim = await db.collection("migration_runs").findOneAndUpdate({ id, $or: [{ lease_until: { $lt: new Date() } }, { lease_until: null }] }, { $set: { lease_owner: owner, lease_until: new Date(Date.now() + 120000) } }, { returnDocument: "after" });
  if (!claim) throw new Error("The import is already running in another process.");
  try {
    for (const [name, rows] of Object.entries(prepared.collections)) {
      for (let offset = 0; offset < rows.length; offset += 500) {
        const lease = await db.collection("migration_runs").updateOne({ id, lease_owner: owner }, { $set: { lease_until: new Date(Date.now() + 120000), current_collection: name, completed_rows: offset } });
        if (!lease.matchedCount) throw new Error("The import lease was lost. Stop and resume the same source.");
        const operations = rows.slice(offset, offset + 500).map((row) => ({ replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true } }));
        await db.collection(name).bulkWrite(operations, { ordered: true });
      }
      const actual = await db.collection(name).find({ _id: /^legacy:/ }).toArray();
      if (actual.length !== rows.length || hash(actual.map(stable).sort().join("\n")) !== prepared.digests[name]) throw new Error(`Import verification failed for ${name}. Resume using the unchanged source.`);
    }
    for (const name of NUMERIC_IDS) { const max = await db.collection(name).findOne({}, { sort: { id: -1 } }); await db.collection("counters").updateOne({ _id: name }, { $max: { value: Number(max?.id || 0) } }, { upsert: true }); }
    const event = await db.collection("chat_event_log").findOne({}, { sort: { id: -1 } });
    await db.collection("counters").updateOne({ _id: "chat_events" }, { $max: { value: Number(event?.id || 0) } }, { upsert: true });
    await db.collection("migration_runs").updateOne({ id, lease_owner: owner }, { $set: { status: "complete", completed_at: new Date().toISOString(), lease_until: new Date(0), lease_owner: null } });
    return { imported: true, verified: true, counts: prepared.counts, remappedIds: prepared.remappedIds };
  } catch (error) {
    await db.collection("migration_runs").updateOne({ id, lease_owner: owner }, { $set: { lease_until: new Date(0), lease_owner: null, last_error: String(error.codeName || error.name || "Import error") } });
    throw error;
  }
}
