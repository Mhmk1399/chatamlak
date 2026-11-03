import { beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ensureMongoSchema, COLLECTION_KEYS } from '../../db/mongoSchema.js';
import { createMongoRepository } from '../../db/mongoRepository.js';

let replica, client;
export let db, R;
export let testUri;
export const alice = crypto.randomUUID(), bob = crypto.randomUUID();
beforeAll(async () => {
  process.env.STORAGE_ENCRYPTION_KEY = "isolated-mongodb-test-key";
  let uri = process.env.MONGODB_TEST_URI;
  let database = "ouj_chat_test";
  if (uri) {
    database = decodeURIComponent(new URL(uri).pathname.slice(1));
    if (!database || !/(?:test|e2e)/i.test(database) || ["admin", "config", "local"].includes(database)) throw new Error("MONGODB_TEST_URI must name a dedicated test/e2e database; production databases are refused.");
  } else {
    replica = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION || "8.0.34" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    uri = replica.getUri();
  }
  client = await new MongoClient(uri, { serverSelectionTimeoutMS: 10000 }).connect();
  testUri = uri;
  db = client.db(database);
  await ensureMongoSchema(db);
  R = createMongoRepository({ db, client });
});
beforeEach(async () => {
  for (const name of [...Object.keys(COLLECTION_KEYS), "counters"]) await db.collection(name).deleteMany({});
  await ensureMongoSchema(db);
  await R.store.insert("users", { id: alice, username: "alice", password_hash: "test-hash", nickname: "Alice" });
  await R.store.insert("users", { id: bob, username: "bob", password_hash: "test-hash", nickname: "Bob" });
});
afterAll(async () => { if (client) await client.close(); if (replica) await replica.stop(); delete process.env.STORAGE_ENCRYPTION_KEY; });
export async function group() { const id = await R.createChat("Reports", "group", { groupUsername: "reports", createdByUserId: alice }); await R.addChatMember(id, alice, "owner"); await R.addChatMember(id, bob); return id; }

