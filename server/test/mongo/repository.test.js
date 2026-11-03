import { describe, expect, test } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { prepareLegacyImport, importLegacyData } from "../../db/mongoImport.js";
import { createSessionHelpers } from "../../lib/sessions.js";
import { makeApp } from "../helpers/makeApp.js";

import { R, db, alice, bob, group } from './helpers.js';

describe("native MongoDB repositories on a real replica set", () => {
  test("enforces document validation and unique usernames", async () => {
    await expect(R.createUser("alice", "hash")).rejects.toMatchObject({ code: 11000 });
    await expect(db.collection("chat_messages").insertOne({ id: "bad", chat_id: null, body: "bad" })).rejects.toMatchObject({ code: 121 });
    expect((await R.findUserByUsername("ALICE")).id).toBe(alice);
  });
  test("keeps public session/member/settings contracts while storing native documents", async () => {
    const chat = await group(); await R.createSession(alice, "browser-token");
    expect(await R.getSession("browser-token")).toMatchObject({ id: alice, username: "alice", token: "browser-token" });
    expect((await R.listChatMembersForChats([chat])).get(chat)).toHaveLength(2);
    await R.dbSetSetting("REPORT_TEST", "yes"); expect(await R.dbGetSetting("REPORT_TEST")).toBe("yes");
    await R.setUserBanned(alice, true); expect(await R.getSession("browser-token")).toBeNull();
  });
  test("commits message, topic assignment and replay event together or rolls all back", async () => {
    const chat = await group();
    await expect(R.store.transaction(async () => { await R.createMessage(chat, alice, "uncommitted"); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect(await R.store.count("chat_messages")).toBe(0); expect(await R.store.count("chat_event_log")).toBe(0);
    const topic = await R.messagingDb.createTopic(chat, alice, "Daily reports");
    const id = await R.createMessage(chat, alice, "گزارش امروز", null, null, "report-1", { topicId: topic.id });
    expect((await R.getMessages(chat, { viewerUserId: bob, topicId: topic.id })).messages[0]).toMatchObject({ id, body: "گزارش امروز" });
    expect((await R.store.one("chat_messages", { id })).body).not.toContain("گزارش");
    expect((await R.messagingDb.sync(bob)).events.some((event) => event.messageId === id)).toBe(true);
  });
  test("deduplicates concurrent retries with the same client request", async () => {
    const chat = await group();
    const results = await Promise.all(Array.from({ length: 5 }, () => R.createOrReuseMessage(chat, alice, "one message", null, null, "same-request")));
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(await R.store.count("chat_messages")).toBe(1);
    expect(await R.store.count("chat_event_log")).toBe(1);
  });
  test("paginates on timestamp and UUID without overlap and respects private hides", async () => {
    const chat = await group();
    for (let i = 0; i < 8; i++) await R.createMessage(chat, alice, `message ${i}`);
    const first = await R.getMessages(chat, { viewerUserId: bob, limit: 3 });
    const anchor = first.messages[0];
    const second = await R.getMessages(chat, { viewerUserId: bob, beforeId: anchor.id, beforeCreatedAt: anchor.created_at, limit: 3 });
    expect(first.hasMore).toBe(true); expect(new Set([...first.messages, ...second.messages].map((row) => row.id)).size).toBe(6);
    await R.hideMessageForUser(anchor.id, bob);
    expect((await R.getMessages(chat, { viewerUserId: bob })).messages.some((row) => row.id === anchor.id)).toBe(false);
    expect((await R.getMessages(chat, { viewerUserId: alice })).messages.some((row) => row.id === anchor.id)).toBe(true);
  });
  test("keeps edits, read receipts, remote messages and unread badges consistent", async () => {
    const chat = await group(), id = await R.createMessage(chat, alice, "before");
    expect((await R.listChatsForUser(bob))[0].unread_count).toBe(1);
    await R.editMessage(id, "after"); await R.markMessageRead(id, bob);
    expect((await R.listChatsForUser(bob))[0].unread_count).toBe(0);
    expect(await R.getMessageReadCounts([id])).toEqual([{ message_id: id, count: 1 }]);
    expect((await R.messagingDb.messageChanges(bob, chat, [id]))[0].body).toBe("after");
    await R.createMessage(chat, alice, "remote mirror", null, null, "remote:123");
    expect((await R.listChatsForUser(alice))[0].unread_count).toBe(1);
  });
  test("preserves voice/video metadata and hides expired shared media", async () => {
    const chat = await group(), id = await R.createMessage(chat, alice, "Sent a media file");
    await R.createMessageFiles(id, [{ kind: "video_note", originalName: "video.webm", storedName: "video.webm", mimeType: "video/webm", durationSeconds: 4, widthPx: 480, heightPx: 480 }]);
    const files = await R.listMessageFilesByMessageIds([id]);
    expect(files[0]).toMatchObject({ kind: "video_note", duration_seconds: 4, width_px: 480 });
    expect((await R.messagingDb.media(bob, chat)).files).toHaveLength(1);
    await R.setMessageExpiresAt(id, new Date(Date.now() - 1000).toISOString());
    expect((await R.messagingDb.media(bob, chat)).files).toHaveLength(0);
  });
  test("supports preferences, reactions, pins, topics and encrypted polls", async () => {
    const chat = await group(); await R.messagingDb.setPreference(alice, chat, { pinned: 1, archived: 1, folder: "Work" });
    const poll = await R.messagingDb.createPoll(chat, alice, "جلسه چه ساعتی؟", ["صبح", "عصر"]);
    await R.messagingDb.vote(poll.id, bob, 1); await R.messagingDb.react(poll.messageId, bob, "👍", true); await R.messagingDb.pin(chat, poll.messageId, alice, true);
    const extras = await R.messagingDb.messageExtras(chat, bob);
    expect(extras.polls[0].counts).toEqual([0, 1]); expect(extras.polls[0].myVote).toBe(1); expect(extras.pins).toContain(poll.messageId);
    expect((await R.messagingDb.preferences(alice))[0]).toMatchObject({ archived: 1, folder: "Work" });
  });
  test("leases scheduled messages atomically across workers", async () => {
    const chat = await group(), row = await R.messagingDb.schedule(alice, chat, "later", new Date(Date.now() - 1000).toISOString());
    const claims = await Promise.all(Array.from({ length: 5 }, () => R.messagingDb.claimSchedule(row.id)));
    expect(claims.reduce((total, count) => total + count, 0)).toBe(1);
    expect(await R.messagingDb.dueSchedules()).toHaveLength(0);
  });
  test("enforces the six-peer group call cap under concurrent joins", async () => {
    const chat = await group();
    const joined = await Promise.all(Array.from({ length: 9 }, () => R.messagingDb.joinGroupCall(chat, alice, false)));
    expect(joined.filter(Boolean)).toHaveLength(6); expect(await R.messagingDb.groupPeers(chat)).toHaveLength(6);
  });
  test("atomically leases remote work and invalidates the old source version", async () => {
    const chat = await R.createChat("Remote", "channel", { createdByUserId: alice });
    const source = await R.upsertRemoteChannelSource({ chatId: chat, sourceRaw: "first", enabled: true });
    await R.enqueueRemoteChannelQueueItem({ sourceId: source.id, sourceVersion: 1, telegramUpdateId: 1, payloadJson: "{}" });
    const claims = await Promise.all([R.claimNextRemoteChannelQueueItem("a"), R.claimNextRemoteChannelQueueItem("b")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const next = await R.upsertRemoteChannelSource({ chatId: chat, sourceRaw: "second", enabled: true });
    expect(next.source_version).toBe(2); expect((await R.getRemoteChannelQueueSummary(source.id)).skipped).toBe(1);
  });
  test("transfers owned groups and keeps messages from deleted authors", async () => {
    const chat = await group(), id = await R.createMessage(chat, alice, "preserved history");
    const deletion = await R.deleteUserById(alice);
    expect(deletion.transferredChatIds).toContain(chat); expect(await R.getChatMemberRole(chat, bob)).toBe("owner");
    expect((await R.getMessages(chat, { viewerUserId: bob })).messages.find((row) => row.id === id)).toMatchObject({ username: "deleted", body: "preserved history" });
  });
  test("cleans dependent collections transactionally when deleting a chat", async () => {
    const chat = await group(), poll = await R.messagingDb.createPoll(chat, alice, "Question", ["A", "B"]);
    await R.messagingDb.vote(poll.id, bob, 1); await R.messagingDb.react(poll.messageId, bob, "👍", true);
    await R.deleteChatById(chat);
    for (const collection of ["chat_messages", "chat_members", "chat_polls", "chat_poll_votes", "message_reactions"]) expect(await R.store.count(collection)).toBe(0);
  });
  test("round-trips native backups and rejects invalid restores before deletion", async () => {
    const chat = await group(), id = await R.createMessage(chat, alice, "backup body");
    const backup = await R.backupDatabase();
    await expect(R.restoreDatabase(Buffer.from("invalid"))).rejects.toThrow("not a valid");
    expect(await R.findMessageById(id)).not.toBeNull();
    await R.adminClearAllMessages(); await R.restoreDatabase(backup);
    expect((await R.findMessageById(id)).body).toBe("backup body");
  });
  test("imports unchanged public IDs/ciphertext and continues file sequences", async () => {
    for (const name of ["users", "chats", "chat_members"]) await db.collection(name).deleteMany({});
    const chat = crypto.randomUUID(), message = crypto.randomUUID();
    const prepared = prepareLegacyImport({ users: [{ id: alice, username: "alice", password_hash: "unchanged-hash" }], chats: [{ id: chat, name: "Legacy", type: "group" }], chat_members: [{ chat_id: chat, user_id: alice, role: "owner" }], chat_messages: [{ id: message, chat_id: chat, user_id: alice, body: "legacy", created_at: "2026-10-01 12:00:00" }], chat_message_files: [{ id: 42, message_id: message, kind: "media", stored_name: "a.webm", original_name: "a.webm", mime_type: "video/webm", size_bytes: 100 }] });
    expect((await importLegacyData(db, prepared)).dryRun).toBe(true);
    expect(await R.store.count("users")).toBe(0);
    expect((await importLegacyData(db, prepared, { apply: true })).verified).toBe(true);
    expect((await R.findMessageById(message)).created_at).toBe("2026-10-01T12:00:00.000Z");
    expect((await R.findUserById(alice)).password_hash).toBe("unchanged-hash");
    await R.createMessageFiles(message, [{ kind: "media", storedName: "next.webm", originalName: "next.webm", mimeType: "video/webm" }]);
    expect((await R.listMessageFilesByMessageIds([message])).at(-1).id).toBe(43);
    expect((await importLegacyData(db, prepared, { apply: true })).alreadyImported).toBe(true);
  });
  test("refuses importing over existing accounts", async () => {
    const prepared = prepareLegacyImport({ users: [{ id: crypto.randomUUID(), username: "legacy", password_hash: "hash" }] });
    await expect(importLegacyData(db, prepared, { apply: true })).rejects.toThrow("not empty");
    expect(await R.store.count("users")).toBe(2);
  });
  test("serves authenticated API mutations through injected Mongo repositories", async () => {
    const sessions = createSessionHelpers({ getSession: R.getSession, touchSession: R.touchSession, sessionCookieMaxAge: 3600, appEnv: "development" });
    const { app } = makeApp({ deps: { ...R, mongoRepository: R, ...sessions, dbConfig: { client: "mongodb" }, isLoopbackRequest: () => true } });
    const chat = await group(); await R.createSession(alice, "api-token");
    const response = await request(app).post("/api/messages").set("Cookie", "sid=api-token").send({ chatId: chat, username: "alice", body: "گزارش از API", clientRequestId: "api-one" });
    expect(response.status).toBe(200);
    const fetched = await request(app).get(`/api/messages?chatId=${chat}&username=alice`).set("Cookie", "sid=api-token");
    expect(fetched.status).toBe(200); expect(fetched.body.messages.some((row) => row.body === "گزارش از API")).toBe(true);
  });
});
