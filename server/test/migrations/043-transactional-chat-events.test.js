import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTestDb } from "../db/testDbHelper.js";
import { migration043TransactionalChatEvents } from "../../migrations/043-transactional-chat-events.js";

const USER = "11111111-1111-4111-8111-111111111111";
const CHAT = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
describe("transactional replay journal", () => {
  let database, db, getAll;
  beforeEach(async () => {
    database = await createTestDb();
    ({ db, getAll } = database.migrationContext);
    db.run("INSERT INTO users(id, username, password_hash) VALUES (?, 'alice', 'test-only')", [USER]);
    db.run("INSERT INTO chats(id, name, type) VALUES (?, 'Group', 'group')", [CHAT]);
  });
  afterEach(() => database?.close());
  const insertMessage = () => db.run("INSERT INTO chat_messages(id, chat_id, user_id, body) VALUES (?, ?, ?, 'private body')", [MESSAGE, CHAT, USER]);
  test("rolls back the source message, journal entry and replay clock together", () => {
    db.run("BEGIN");
    insertMessage();
    expect(getAll("SELECT id FROM chat_event_log")).toHaveLength(1);
    db.run("ROLLBACK");
    expect(getAll("SELECT id FROM chat_messages")).toHaveLength(0);
    expect(getAll("SELECT id FROM chat_event_log")).toHaveLength(0);
    insertMessage();
    expect(getAll("SELECT id FROM chat_event_log")[0].id).toBe(1);
  });
  test("records inserts, edits and global hides without storing message content", () => {
    insertMessage();
    db.run("UPDATE chat_messages SET edited = 1, edited_body = 'private edit' WHERE id = ?", [MESSAGE]);
    db.run("UPDATE chat_messages SET hidden_everyone_at = datetime('now') WHERE id = ?", [MESSAGE]);
    const events = getAll("SELECT * FROM chat_event_log ORDER BY id");
    expect(events.map((event) => JSON.parse(event.payload).type)).toEqual(["chat_message", "chat_message_updated", "chat_message_deleted"]);
    expect(events.map((event) => event.id)).toEqual([1, 2, 3]);
    expect(JSON.stringify(events)).not.toContain("private");
  });
  test("targets a personal hide only to the user who hid it", () => {
    insertMessage();
    db.run("INSERT INTO hidden_chat_messages(user_id, message_id) VALUES (?, ?)", [USER, MESSAGE]);
    const event = getAll("SELECT * FROM chat_event_log ORDER BY id DESC LIMIT 1")[0];
    expect(event.viewer_user_id).toBe(USER);
    expect(JSON.parse(event.payload)).toMatchObject({ type: "chat_message_deleted", chatId: CHAT, messageId: MESSAGE });
  });
  test("reapplying the migration does not install duplicate triggers", async () => {
    await migration043TransactionalChatEvents.up(database.migrationContext);
    insertMessage();
    expect(getAll("SELECT id FROM chat_event_log")).toHaveLength(1);
    db.run("INSERT INTO message_reactions(message_id, user_id, emoji) VALUES (?, ?, '❤️')", [MESSAGE, USER]);
    const event = getAll("SELECT payload FROM chat_event_log ORDER BY id DESC LIMIT 1")[0];
    expect(JSON.parse(event.payload).type).toBe("chat_tools_updated");
  });
});
