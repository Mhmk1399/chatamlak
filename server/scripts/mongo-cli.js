import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import fsSync from "node:fs";
import bcrypt from "bcryptjs";
import { createMongoAdminActions } from "../lib/services/mongoAdminService.js";
import { createInspector } from "../lib/inspect.js";
import { createMongoFileJobs } from "../lib/mongoFileJobs.js";
import { createStorageProvider } from "../lib/storage/index.js";
import { connectMongo } from "../db/mongoConnection.js";
import { ensureMongoSchema } from "../db/mongoSchema.js";
import { createMongoRepository } from "../db/mongoRepository.js";
import { readLegacySqlite, readLegacyPostgres } from "../db/legacyReader.js";
import { prepareLegacyImport, importLegacyData } from "../db/mongoImport.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverDir, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
const args = process.argv.slice(2), action = args.shift() || "help";
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; };
const yes = flag("yes") || args.includes("-y");
const apiBase = `http://127.0.0.1:${process.env.PORT || process.env.SERVER_PORT || 5174}`;
const adminActions = {
  "user:create": "create_user", "user:edit": "edit_user", "user:ban": "toggle_user_ban", "user:verify": "toggle_user_verified", "user:delete": "delete_users", "user:generate": "generate_users",
  "chat:create": "create_chat", "chat:edit": "edit_chat", "chat:add": "add_chat_members", "chat:verify": "toggle_chat_verified", "chat:delete": "delete_chats", "file:delete": "delete_files", "message:generate": "generate_chat_messages",
};
function adminPayload() {
  const payload = {}, positional = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) { if (args[i] !== "-y") positional.push(args[i]); continue; }
    const [name, inline] = args[i].slice(2).split(/=(.*)/s);
    const key = name.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    let entry = inline ?? (args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : true);
    if (entry === "true" || entry === "false") entry = entry === "true";
    payload[key] = entry;
  }
  payload.selector ??= positional[0];
  payload.user ??= payload.selector;
  payload.chat ??= payload.selector;
  if (payload.users && typeof payload.users === "string") payload.users = payload.users.split(",").filter(Boolean);
  if (payload.chatIds && typeof payload.chatIds === "string") payload.chatIds = payload.chatIds.split(",").filter(Boolean);
  if (payload.userIds && typeof payload.userIds === "string") payload.userIds = payload.userIds.split(",").filter(Boolean);
  if (payload.fileIds && typeof payload.fileIds === "string") payload.fileIds = payload.fileIds.split(",").filter(Boolean);
  if (action === "user:delete" && !payload.all) payload.users ??= positional;
  if (action === "chat:delete" && !payload.all) payload.chatIds ??= positional;
  if (action === "file:delete" && !payload.all) payload.fileIds ??= positional;
  if (action === "chat:create") payload.members ??= payload.users;
  if (payload.resumeQueue) payload.paused = false;
  if (payload.pauseQueue) payload.paused = true;
  return payload;
}
async function serverRunning() {
  try { const response = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(1500) }); return response.ok; } catch { return false; }
}
async function offlineRequired() { if (await serverRunning()) throw new Error("Stop the application before this maintenance operation."); }
function fileJobs(repository) {
  return createMongoFileJobs({ mongoRepository: repository, fs: fsSync, path, uploadRootDir: path.resolve(process.env.DATA_DIR || path.join(serverDir, "..", "data"), "uploads", "messages"), getSetting: () => 0, storageProvider: createStorageProvider(process.env) });
}
function usage() {
  console.log(`Ouj Chat MongoDB tools
  db:check                       Check connection and database statistics
  db:migrate                     Create/verify MongoDB collections and indexes
  db:import-sql -- --source FILE --dry-run
  db:import-sql -- --source FILE --apply
  db:import-sql -- --postgres --dry-run  (LEGACY_POSTGRES_URI in .env)
  db:backup -- --file BACKUP.json.gz
  db:restore -- --file BACKUP.json.gz --yes --offline
  db:inspect                     Inspect counts without exposing secrets
  db:reset -- --yes --offline     Clear application rows, preserve settings
  db:user:create -- --username NAME --password PASSWORD [--nickname NAME]
  db:user:edit -- USER --nickname NAME
  db:user:ban / db:user:verify -- USER
  db:user:delete -- USER [USER ...] --yes
  db:chat:create -- --name NAME --username HANDLE --owner USER [--users bob,alice]
  db:chat:edit -- CHAT --name NAME [--owner USER]
  db:chat:add -- CHAT --users bob,alice  (or --all)
  db:chat:verify -- CHAT
  db:chat:delete -- CHAT [CHAT ...] --yes
  db:file:delete -- ID [ID ...] --yes
  db:user:generate -- --count 10 --password PASSWORD
  db:message:generate -- --chat CHAT --user USER --count 10
User/chat/file mutations use the running local server when available; otherwise
stop other writers and pass --offline. Destructive deletion also needs --yes.
MongoDB connection: MONGODB_URI and MONGODB_DATABASE in .env.
Media bytes remain in the configured local/S3 provider and need a separate backup.`);
}
let connection;
try {
  if (action === "help" || flag("help") || args.includes("-h")) usage();
  else if (Object.hasOwn(adminActions, action)) {
    if (action.endsWith(":delete") && !yes) throw new Error("Deletion requires --yes (or -y).");
    const payload = adminPayload(), adminAction = action === "chat:edit" && ["pauseQueue", "resumeQueue", "skipCurrent", "skipAll", "source", "enabled", "syncMetadata", "streamMedia"].some((key) => key in payload) ? "edit_remote_channel" : adminActions[action];
    if (await serverRunning()) {
      if (!process.env.ADMIN_API_TOKEN) throw new Error("ADMIN_API_TOKEN is required for online management.");
      const response = await fetch(`${apiBase}/api/admin/db-tools`, { method: "POST", headers: { "Content-Type": "application/json", "x-ouj-chat-admin-token": process.env.ADMIN_API_TOKEN }, body: JSON.stringify({ action: adminAction, payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Admin action failed.");
      console.log(JSON.stringify(body.result, null, 2));
    } else {
      if (!flag("offline")) throw new Error("The local server is not running. Start it, or stop all writers and pass --offline.");
      connection = await connectMongo(); await ensureMongoSchema(connection.db);
      if (await connection.db.collection("migration_runs").findOne({ status: "importing" })) throw new Error("An incomplete SQL import must be resumed before application writes.");
      const repository = createMongoRepository(connection);
      const inspector = createInspector({ fs: fsSync, dataDir: path.resolve(process.env.DATA_DIR || path.join(serverDir, "..", "data")), mongoRepository: repository });
      const execute = createMongoAdminActions({ mongoRepository: repository, bcrypt, USERNAME_REGEX: /^[a-zA-Z0-9_]{3,32}$/, ...inspector, ...fileJobs(repository) });
      console.log(JSON.stringify(await execute(adminAction, payload), null, 2));
    }
  }
  else if (action === "import-sql") {
    const sourcePath = value("source");
    if (!sourcePath && !flag("postgres")) throw new Error("Provide --source <SQLite file> or --postgres with LEGACY_POSTGRES_URI.");
    const source = flag("postgres") ? await readLegacyPostgres(process.env.LEGACY_POSTGRES_URI) : await readLegacySqlite(sourcePath);
    const prepared = prepareLegacyImport(source);
    if (!flag("apply")) console.log(JSON.stringify({ dryRun: true, counts: prepared.counts, remappedIds: prepared.remappedIds, checksum: prepared.checksum }, null, 2));
    else {
      await offlineRequired();
      connection = await connectMongo();
      console.log(JSON.stringify(await importLegacyData(connection.db, prepared, { apply: true }), null, 2));
    }
  } else {
    connection = await connectMongo();
    const repository = createMongoRepository(connection), s = repository.store;
    if (action === "check") console.log(JSON.stringify(await repository.health(), null, 2));
    else if (action === "migrate") { await ensureMongoSchema(connection.db); console.log("MongoDB collections and indexes are ready."); }
    else if (action === "backup") {
      const target = path.resolve(value("file", path.join(serverDir, "..", "data", "backups", `ouj-${Date.now()}.json.gz`)));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, await repository.backupDatabase(), { flag: "wx", mode: 0o600 });
      console.log(`MongoDB record backup written: ${target}`);
    } else if (action === "restore") {
      if (!yes || !flag("offline") || !value("file")) throw new Error("Restore requires --file <backup.json.gz> --yes --offline. It replaces the selected database's application collections.");
      await offlineRequired();
      await ensureMongoSchema(connection.db);
      console.log(JSON.stringify(await repository.restoreDatabase(await fs.readFile(path.resolve(value("file")))), null, 2));
    } else if (action === "inspect" || action.endsWith(":inspect")) {
      const inspector = createInspector({ fs: fsSync, dataDir: path.resolve(process.env.DATA_DIR || path.join(serverDir, "..", "data")), mongoRepository: repository });
      console.log(JSON.stringify(await inspector.buildInspectSnapshot(action.split(":")[0] === "inspect" ? "all" : action.split(":")[0], value("limit", 25)), null, 2));
    } else if (["reset", "delete"].includes(action)) {
      if (!yes || !flag("offline")) throw new Error("This action requires --yes --offline after stopping the application.");
      await offlineRequired(); const removed = await repository.adminResetDatabase(); await fileJobs(repository).cleanupDeletedFiles(removed.files); console.log(JSON.stringify({ cleared: true, filesRemoved: removed.files.length }, null, 2));
    } else if (action === "vacuum") console.log(JSON.stringify(await repository.vacuumDatabase(), null, 2));
    else if (action === "owner:check") { const owner = await repository.getOwnerUser(); console.log(JSON.stringify({ exists: Boolean(owner), owner }, null, 2)); if (!owner) process.exitCode = 1; }
    else throw new Error("Use the Admin Panel for user/chat/file management. Run db:help for the supported MongoDB maintenance commands.");
  }
} catch (error) {
  console.error(error.code === 11000 ? "Import or restore encountered duplicate logical keys. Existing data was not silently replaced." : error.message || "MongoDB operation failed.");
  process.exitCode = 1;
} finally { await connection?.client.close(); }
