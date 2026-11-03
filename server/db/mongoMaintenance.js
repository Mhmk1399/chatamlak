import { gzipSync, gunzipSync } from "node:zlib";
import { BSON } from "mongodb";
import { COLLECTION_KEYS } from "./mongoSchema.js";

const FORMAT = "ouj-chat-mongodb-backup";
export function createMongoMaintenance(store) {
  return {
    async health() {
      await store.db.command({ ping: 1 });
      const stats = await store.db.stats();
      return { client: "mongodb", configured: true, reachable: true, database: store.db.databaseName, dataSize: Number(stats.dataSize || 0), storageSize: Number(stats.storageSize || 0), indexes: Number(stats.indexes || 0) };
    },
    async backupDatabase() {
      const names = [...Object.keys(COLLECTION_KEYS), "counters"];
      const collections = await store.transaction(async () => {
        const snapshot = {};
        for (const name of names) snapshot[name] = await store.db.collection(name).find({}, store.opts()).toArray();
        return snapshot;
      });
      return gzipSync(Buffer.from(BSON.EJSON.stringify({ format: FORMAT, version: 1, createdAt: new Date().toISOString(), collections }), "utf8"));
    },
    async restoreDatabase(buffer) {
      let archive;
      try { archive = BSON.EJSON.parse(gunzipSync(buffer, { maxOutputLength: 1024 * 1024 * 1024 }).toString("utf8")); }
      catch { throw new Error("The uploaded file is not a valid Ouj MongoDB backup."); }
      if (archive.format !== FORMAT || archive.version !== 1 || !archive.collections || typeof archive.collections !== "object") throw new Error("Unsupported MongoDB backup format.");
      const allowed = new Set([...Object.keys(COLLECTION_KEYS), "counters"]);
      if (Object.keys(archive.collections).length !== allowed.size || [...allowed].some((name) => !Object.hasOwn(archive.collections, name))) throw new Error("Incomplete MongoDB backup; no data has been replaced.");
      for (const [name, rows] of Object.entries(archive.collections)) if (!allowed.has(name) || !Array.isArray(rows)) throw new Error("Invalid collection in MongoDB backup.");
      // Validate the entire archive before deleting any target rows. The caller
      // must stop the app first; one transaction makes replacement all-or-none.
      await store.transaction(async () => {
        for (const name of allowed) {
          await store.db.collection(name).deleteMany({}, store.opts());
          const rows = archive.collections[name] || [];
          for (let offset = 0; offset < rows.length; offset += 500) await store.db.collection(name).insertMany(rows.slice(offset, offset + 500), store.opts());
        }
      });
      return { restored: true, collections: Object.keys(archive.collections).length };
    },
  };
}
