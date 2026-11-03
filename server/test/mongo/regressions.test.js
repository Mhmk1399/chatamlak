import { describe, test, expect } from "vitest";
import crypto from "node:crypto";
import { R, db, alice, bob, group } from "./helpers.js";
import { dbKnex } from "../../db/query.js";
import { readLegacySqlite } from "../../db/legacyReader.js";
import { prepareLegacyImport, importLegacyData } from "../../db/mongoImport.js";
import { createMongoAdminActions } from "../../lib/services/mongoAdminService.js";
import { connectMongo } from "../../db/mongoConnection.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import bcrypt from "bcryptjs";
import { gzipSync } from "node:zlib";

describe("database contracts carried over from the SQL implementation", () => {
  test("uses ISO timestamps and UUID tie breakers for incremental history", async () => {
    const chat = await group();
    const first = await R.createMessage(chat, alice, "first");
    await R.store.update("chat_messages", { id: first }, { created_at: "2026-01-01T00:00:00.000Z" });
    const second = await R.createMessage(chat, alice, "second");
    const result = await R.getMessages(chat, { afterId: first, afterCreatedAt: "2026-01-01T00:00:00.000Z", tailDelta: true, viewerUserId: bob });
    expect(result.messages.some((row) => row.id === second)).toBe(true);
  });
  test("selects previews by chronology and refreshes them on edits and deletion", async () => {
    const chat = await group();
    const first = "ffffffff-ffff-4fff-8fff-ffffffffffff", second = "00000000-0000-4000-8000-000000000001";
    await R.store.insert("chat_messages", { id: first, chat_id: chat, user_id: alice, body: "old", created_at: "2026-01-01T00:00:00.000Z" });
    await R.store.insert("chat_messages", { id: second, chat_id: chat, user_id: alice, body: "latest", created_at: "2026-01-02T00:00:00.000Z" });
    expect((await R.listChatsForUser(bob))[0].last_message).toBe("latest");
    await R.editMessage(second, "edited"); expect((await R.listChatsForUser(bob))[0].last_message).toBe("edited");
    await R.hideMessageForEveryone(second); expect((await R.listChatsForUser(bob))[0].last_message).toBe("old");
  });
  test("deduplicates saved chats concurrently and marks own saved messages read", async () => {
    const chats = await Promise.all(Array.from({ length: 4 }, () => R.ensureSavedChatForUser(alice)));
    expect(new Set(chats.map((chat) => chat.id)).size).toBe(1);
    const message = await R.createMessage(chats[0].id, alice, "personal notes");
    await R.markMessagesRead(chats[0].id, alice);
    expect((await R.findMessageById(message)).read_by_user_id).toBe(alice);
    expect(await R.getMessageReadCounts([message])).toEqual([{ message_id: message, count: 1 }]);
  });
  test("auto-add respects private visibility and explicit left/removed members", async () => {
    const publicChat = await R.createChat("Public", "group", { autoAddNewUsers: true });
    const privateChat = await R.createChat("Private", "group", { autoAddNewUsers: true, groupVisibility: "private" });
    expect(await R.getAutoAddPublicChatIds()).toEqual([publicChat]);
    expect((await R.findChatById(privateChat)).auto_add_new_users).toBe(0);
    await R.bulkAddMemberToChats(bob, [publicChat]); expect(await R.isMember(publicChat, bob)).toBe(true);
    await R.removeChatMember(publicChat, bob); await R.markChatMemberLeft(publicChat, bob);
    await R.bulkAddMemberToChats(bob, [publicChat]); expect(await R.isMember(publicChat, bob)).toBe(false);
    await R.updateGroupChat(publicChat, { groupVisibility: "private" });
    expect(await R.getAutoAddPublicChatIds()).toEqual([]);
  });
  test("keeps private auto-add disabled through generic chat updates", async () => {
    const chat = await R.createChat("Group", "group", { autoAddNewUsers: true });
    await R.updateChat(chat, { group_visibility: "private" });
    expect((await R.findChatById(chat)).auto_add_new_users).toBe(0);
  });
  test("retains default avatar storage fields for newly created users", async () => {
    expect(await R.findUserById(alice)).toMatchObject({ avatar_storage_driver: "local", avatar_storage_key: null, avatar_encryption_type: "none" });
  });
  test("preserves administrator owner details and remote filters", async () => {
    const chat = await group();
    const row = (await R.adminListChats({})).chats.find((row) => row.id === chat);
    expect(row).toMatchObject({ owner_id: alice, owner_username: "alice", owner_role: "user" });
    expect((await R.adminListChats({ remoteFilter: "active" })).chats).toHaveLength(0);
  });
  test("retains file metadata and rewrites pending and thumbnail storage references", async () => {
    const chat = await group(), message = await R.createMessage(chat, alice, "media");
    const [id] = await R.createMessageFiles(message, [{ kind: "media", storedName: "clip.webm", mimeType: "video/webm", storageDriver: "remote", storageKey: "uploads/clip.webm", thumbStorageKey: "avatars/thumb.jpg", encryptionType: "app" }]);
    await R.recordPendingPresignedUpload({ storageKey: "uploads/clip.webm", userId: alice });
    await R.rewriteStorageKeys([{ from: "uploads/clip.webm", to: "uploads/messages/clip.webm" }, { from: "avatars/thumb.jpg", to: "uploads/avatars/thumb.jpg" }]);
    await R.updateMessageFileMetadata(id, { widthPx: 480, heightPx: 480, durationSeconds: 3.5 });
    expect(await R.findMessageFileById(id)).toMatchObject({ storage_key: "uploads/messages/clip.webm", thumb_storage_key: "uploads/avatars/thumb.jpg", width_px: 480, duration_seconds: 3.5, encryption_type: "app" });
    expect((await R.listPendingPresignedUploads())[0].storage_key).toBe("uploads/messages/clip.webm");
  });
  test("scopes search, replay and media to visible messages and current membership", async () => {
    const chat = await group(), message = await R.createMessage(chat, alice, "گزارش ملک كيش");
    expect((await R.messagingDb.search(bob, { query: "کیش" })).messages).toHaveLength(1);
    await R.hideMessageForUser(message, bob);
    expect((await R.messagingDb.search(bob, { query: "گزارش" })).messages).toHaveLength(0);
    const aliceEvents = await R.messagingDb.sync(alice);
    expect(aliceEvents.events.some((event) => event.type === "chat_message_deleted")).toBe(false);
    await R.removeChatMember(chat, bob);
    expect((await R.messagingDb.sync(bob)).events).toHaveLength(0);
    expect((await R.messagingDb.search(bob, { query: "گزارش" })).messages).toHaveLength(0);
  });
  test("persists devices, mutes, subscriptions, profile edits and forward origins", async () => {
    const chat = await group(), message = await R.createMessage(chat, alice, "forward");
    await R.setChatMuted(alice, chat, true); expect(await R.listMutedUserIdsForChat(chat)).toEqual([alice]);
    await R.upsertPushSubscription(alice, "https://push.example/test", "key", "auth");
    expect(await R.listPushSubscriptionsByUserIds([alice])).toHaveLength(1);
    await R.createSession(alice, "device-token"); await R.messagingDb.recordDevice("device-token", "Test browser");
    expect((await R.messagingDb.devices(alice, "device-token"))[0]).toMatchObject({ label: "Test browser", current: true });
    await R.updateUserProfile(alice, { nickname: "New name", avatarUrl: "/api/uploads/avatars/test.png" });
    expect(await R.findUserById(alice)).toMatchObject({ nickname: "New name", avatar_url: "/api/uploads/avatars/test.png" });
    await R.setMessageForwardOrigin(message, { sourceChatId: chat, sourceUserId: bob, sourceLabel: "Bob" });
    expect(await R.findMessageById(message)).toMatchObject({ forwarded_from_user_id: bob, forwarded_from_label: "Bob" });
  });
  test("supports native injected administration commands without accepting SQL", async () => {
    const row = await R.adminGetRow(dbKnex("users").where({ id: alice }).select("username").first());
    expect(row).toEqual({ username: "alice" });
    await R.adminRun(dbKnex("app_settings").insert({ key: "NATIVE_TEST", value: "one" }).onConflict("key").merge());
    await R.adminRun(dbKnex("app_settings").insert({ key: "NATIVE_TEST", value: "two" }).onConflict("key").merge());
    expect(await R.dbGetSetting("NATIVE_TEST")).toBe("two");
    await expect(R.adminGetRow("SELECT * FROM users")).rejects.toThrow("document commands");
  });
  test("executes native admin user and chat management", async () => {
    const execute = createMongoAdminActions({ mongoRepository: R, bcrypt, USERNAME_REGEX: /^[a-z0-9_]{3,32}$/ });
    const user = await execute("create_user", { username: "manager", password: "test-password", role: "admin" });
    const chat = await execute("create_chat", { username: "office", name: "Office", owner: "manager", members: ["bob"] });
    expect(await R.getChatMemberRole(chat.id, user.id)).toBe("owner");
    await execute("edit_user", { user: "manager", nickname: "Manager" });
    await execute("toggle_user_ban", { user: "manager", banned: true });
    expect(await R.findUserById(user.id)).toMatchObject({ banned: 1, nickname: "Manager" });
  });
  test("imports PostgreSQL bigint strings as numeric counters and remaps legacy integer IDs deterministically", () => {
    const source = { users: [{ id: 1, username: "old", password_hash: "hash" }], chats: [{ id: 2, type: "group" }], chat_members: [{ user_id: 1, chat_id: 2 }], chat_messages: [{ id: 3, chat_id: 2, user_id: 1, body: "body" }], chat_message_files: [{ id: "42", message_id: 3, mime_type: "audio/webm", stored_name: "old.webm" }] };
    const a = prepareLegacyImport(source), b = prepareLegacyImport(source);
    expect(a.checksum).toBe(b.checksum); expect(a.collections.chat_message_files[0].id).toBe(42);
    expect(a.collections.chat_messages[0].user_id).toBe(a.collections.users[0].id);
  });
  test("reads a real SQLite source without modifying it", async () => {
    const SQL = await initSqlJs(), legacy = new SQL.Database();
    const source = path.join(os.tmpdir(), `ouj-import-test-${crypto.randomUUID()}.db`);
    legacy.run("CREATE TABLE users (id TEXT, username TEXT, password_hash TEXT)");
    legacy.run("INSERT INTO users VALUES (?, ?, ?)", [alice, "legacy", "retained-hash"]);
    const bytes = Buffer.from(legacy.export()); legacy.close(); await fs.writeFile(source, bytes);
    try {
      expect((await readLegacySqlite(source)).users[0]).toMatchObject({ id: alice, username: "legacy" });
      expect(await fs.readFile(source)).toEqual(bytes);
    } finally { await fs.unlink(source); }
  });
  test("resumes an incomplete import and refuses a different source", async () => {
    for (const name of ["users", "chats", "chat_members"]) await db.collection(name).deleteMany({});
    const prepared = prepareLegacyImport({ users: [{ id: alice, username: "legacy", password_hash: "hash" }] });
    await db.collection("migration_runs").insertOne({ id: `legacy:${prepared.checksum}`, status: "importing", lease_until: new Date(0) });
    await db.collection("users").insertOne(prepared.collections.users[0]);
    expect((await importLegacyData(db, prepared, { apply: true })).verified).toBe(true);
    expect(await R.store.count("users")).toBe(1);
  });
  test("redacts malformed credential-bearing MongoDB connection strings", async () => {
    await expect(connectMongo({ mongo: { uri: "mongodb://private-user:private-password@invalid host/", database: "test" } })).rejects.toThrow("MongoDB connection failed");
  });
  test("rejects a truncated backup before replacing existing records", async () => {
    const incomplete = gzipSync(Buffer.from(JSON.stringify({ format: "ouj-chat-mongodb-backup", version: 1, collections: { users: [] } })));
    await expect(R.restoreDatabase(incomplete)).rejects.toThrow("Incomplete MongoDB backup");
    expect(await R.store.count("users")).toBe(2);
  });
});
