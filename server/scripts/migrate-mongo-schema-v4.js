import { MongoClient } from "mongodb";
import { migrateMongoSchemaV4 } from "../db/mongoSchema.js";

const uri = String(process.env.MONGODB_MIGRATION_URI || "").trim();
const databaseName = String(process.env.MONGODB_DATABASE || "ouj_chat").trim();
if (!uri || !databaseName) {
  throw new Error("MONGODB_MIGRATION_URI and MONGODB_DATABASE are required.");
}

const client = new MongoClient(uri, { maxPoolSize: 2 });
try {
  await client.connect();
  await migrateMongoSchemaV4(client.db(databaseName));
  console.log(JSON.stringify({ service: "ouj-chat", event: "mongo_schema_v4.applied", database: databaseName }));
} finally {
  await client.close();
}
