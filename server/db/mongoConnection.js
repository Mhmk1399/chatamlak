import { MongoClient } from "mongodb";
import { readDbConfig } from "../settings/env.js";

function connectionHint(error) {
  const pending = [error], seen = new Set(), failures = [];
  while (pending.length && seen.size < 32) {
    const item = pending.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item); failures.push(item);
    pending.push(item.cause, item.reason);
    if (item.servers instanceof Map) for (const server of item.servers.values()) pending.push(server.error);
  }
  const hasCode = (...codes) => failures.some((item) => codes.includes(item.code));
  if (hasCode(18) || failures.some((item) => item.codeName === "AuthenticationFailed")) {
    return "Authentication failed. Check the Atlas database username, password and authSource in MONGODB_URI.";
  }
  if (failures.some((item) => /^(?:ERR_SSL_|ERR_TLS_|CERT_|UNABLE_TO_VERIFY_|SELF_SIGNED_CERT|DEPTH_ZERO_SELF_SIGNED_CERT)/.test(String(item.code || ""))) || failures.some((item) => /SSL alert number \d+|tlsv\d(?:\.\d)? alert/i.test(String(item.message || "")))) {
    return "TLS handshake failed. For Atlas, check that this machine's outgoing IP is Active in Network Access / IP Access List. If it is allowed, check VPN, proxy, firewall and certificate settings.";
  }
  if (hasCode("ENOTFOUND", "EAI_AGAIN", "ESERVFAIL", "ENODATA")) {
    return "DNS lookup failed. Check the cluster hostname in MONGODB_URI and the system's DNS resolver.";
  }
  if (hasCode("ECONNREFUSED")) {
    return "Connection refused. Check that MongoDB is running and listening on the configured host and port.";
  }
  if (hasCode("ETIMEDOUT", "ETIMEOUT", "ECONNRESET")) {
    return "The network connection timed out or was reset. Check Atlas IP Access List, firewall and network routing.";
  }
  if (failures.some((item) => ["MongoParseError", "MongoInvalidArgumentError"].includes(item.name))) {
    return "Check MONGODB_URI syntax, percent-encoded credentials and MongoDB connection options.";
  }
  return "Check MONGODB_URI, network access and credentials.";
}

export async function connectMongo(config = readDbConfig()) {
  const uri = config.mongo?.uri || process.env.MONGODB_URI || "";
  if (!uri) throw new Error("MONGODB_URI is empty. Add your MongoDB replica-set or Atlas connection string to .env.");
  const database = config.mongo?.database || process.env.MONGODB_DATABASE || "ouj_chat";
  if (!["mongodb:", "mongodb+srv:"].some((prefix) => uri.startsWith(prefix))) throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
  let client;
  try {
    client = new MongoClient(uri, {
      appName: "ouj-chat", maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20),
      serverSelectionTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000), ignoreUndefined: true,
    });
    await client.connect();
    const hello = await client.db("admin").command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid") throw new Error("Ouj Chat needs a MongoDB replica set or Atlas cluster for transactional messages. Initialize a local replica set; see docs/MongoDB.md.");
    return { client, db: client.db(database) };
  } catch (error) {
    try { await client?.close(); } catch { /* Preserve the safe connection diagnostic. */ }
    // Driver errors can contain a connection URI. Never put credentials in logs.
    if (error.message.startsWith("Ouj Chat needs")) throw error;
    const knownNames = ["MongoParseError", "MongoInvalidArgumentError", "MongoServerSelectionError", "MongoServerError", "MongoNetworkError", "MongoNetworkTimeoutError"];
    const name = knownNames.includes(error.name) ? error.name : "connection error";
    throw new Error(`MongoDB connection failed (${name}). ${connectionHint(error)}`);
  }
}
