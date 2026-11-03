import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { COLLECTION_KEYS, NUMERIC_IDS, documentDefaults } from "./mongoSchema.js";

export function createMongoStore({ db, client }) {
  const scope = new AsyncLocalStorage();
  const opts = (extra = {}) => ({ ...extra, ...(scope.getStore() ? { session: scope.getStore() } : {}) });
  function collection(name) {
    if (!Object.hasOwn(COLLECTION_KEYS, name) && name !== "counters") throw new Error(`Unknown application collection: ${name}`);
    return db.collection(name);
  }
  const clean = (row) => { if (!row) return null; const { _id, ...value } = row; return value; };
  async function sequence(name) {
    const row = await db.collection("counters").findOneAndUpdate({ _id: name }, { $inc: { value: 1 } }, opts({ upsert: true, returnDocument: "after" }));
    return row.value;
  }
  async function prepare(name, value) {
    const row = { ...documentDefaults(name), ...value };
    if (COLLECTION_KEYS[name]?.[0] === "id" && row.id == null) row.id = NUMERIC_IDS.has(name) ? await sequence(name) : randomUUID();
    return row;
  }
  const store = {
    db, client, opts, clean, sequence, prepare,
    async one(name, filter = {}, options = {}) { return clean(await collection(name).findOne(filter, opts(options))); },
    async many(name, filter = {}, options = {}) { return (await collection(name).find(filter, opts(options)).toArray()).map(clean); },
    async count(name, filter = {}) { return collection(name).countDocuments(filter, opts()); },
    async aggregate(name, pipeline = []) { return (await collection(name).aggregate(pipeline, opts()).toArray()).map(clean); },
    async insert(name, value) { const row = await prepare(name, value); await collection(name).insertOne(row, opts()); return clean(row); },
    async update(name, filter, patch, options = {}) {
      const result = await collection(name).updateMany(filter, Array.isArray(patch) ? patch : { $set: patch }, opts(options));
      return result.modifiedCount;
    },
    async upsert(name, filter, patch, insert = {}) {
      const fresh = await prepare(name, { ...filter, ...insert });
      for (const key of Object.keys(patch)) delete fresh[key];
      await collection(name).updateOne(filter, { $set: patch, $setOnInsert: fresh }, opts({ upsert: true }));
      return store.one(name, filter);
    },
    async ignore(name, filter, value) {
      // Allocation may leave harmless gaps. The unique logical-key index is the
      // authority for idempotency, including simultaneous application processes.
      const row = await prepare(name, value);
      const result = await collection(name).updateOne(filter, { $setOnInsert: row }, opts({ upsert: true }));
      return result.upsertedCount;
    },
    async remove(name, filter = {}) { return (await collection(name).deleteMany(filter, opts())).deletedCount; },
    async modify(name, filter, update, options = {}) { return clean(await collection(name).findOneAndUpdate(filter, update, opts({ returnDocument: "after", ...options }))); },
    async transaction(callback) {
      if (scope.getStore()) return callback();
      return client.withSession((session) => session.withTransaction(() => scope.run(session, callback), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" }));
    },
    async event(chatId, payload, viewerUserId = null) {
      const id = await sequence("chat_events");
      await store.insert("chat_event_log", { id, chat_id: chatId, viewer_user_id: viewerUserId, payload: { ...payload, chatId } });
      return id;
    },
  };
  return store;
}
