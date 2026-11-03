import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { COLLECTION_KEYS } from "./mongoSchema.js";

// The migration command is the only consumer. SQL is read-only and never used
// by the running application. Restrict identifiers to known historical tables.
const known = new Set([...Object.keys(COLLECTION_KEYS), "chat_event_clock"]);
export async function readLegacySqlite(filename) {
  const source = path.resolve(filename);
  if (!fs.existsSync(source)) throw new Error("The source SQLite file does not exist.");
  let database;
  try {
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3");
    database = new Database(source, { readonly: true, fileMustExist: true });
  } catch {
    if (fs.existsSync(`${source}-wal`) && fs.statSync(`${source}-wal`).size) throw new Error("SQLite has an active WAL file. Stop the old server and checkpoint it before importing; no data has been changed.");
    const { default: initialize } = await import("sql.js");
    const SQL = await initialize();
    const wasm = new SQL.Database(fs.readFileSync(source));
    database = {
      prepare(sql) { return { all() { const statement = wasm.prepare(sql), rows = []; try { while (statement.step()) rows.push(statement.getAsObject()); return rows; } finally { statement.free(); } } }; },
      exec: (sql) => wasm.run(sql), close: () => wasm.close(),
    };
  }
  try {
    database.exec("BEGIN");
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    const unknown = tables.filter((name) => !known.has(name));
    if (unknown.length) throw new Error(`Unknown legacy tables require an explicit migration mapping: ${unknown.join(", ")}`);
    const result = {};
    for (const table of tables) result[table] = database.prepare(`SELECT * FROM "${table}"`).all();
    database.exec("ROLLBACK");
    return result;
  } finally { database.close(); }
}

export async function readLegacyPostgres(uri) {
  if (!uri) throw new Error("Set LEGACY_POSTGRES_URI to read the old PostgreSQL database.");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: uri });
  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map((row) => row.tablename);
    const unknown = tables.filter((name) => !known.has(name));
    if (unknown.length) throw new Error(`Unknown legacy tables require an explicit migration mapping: ${unknown.join(", ")}`);
    const result = {};
    for (const table of tables) result[table] = (await client.query(`SELECT * FROM "${table}"`)).rows;
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    if (/Unknown legacy/.test(error.message)) throw error;
    throw new Error("Could not read the legacy PostgreSQL database. Check LEGACY_POSTGRES_URI and read permissions.");
  } finally { await client.end(); }
}
