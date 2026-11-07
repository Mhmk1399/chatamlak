import crypto from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { R, db, alice, bob, group } from "./helpers.js";

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

async function browser(userId, token) {
  await R.createSession(userId, token);
  await R.messagingDb.recordDevice(token, "Fixture browser");
}

describe("technical data lifecycle on MongoDB", () => {
  test("removes a revoked session's device label and preserves another account", async () => {
    await browser(alice, "alice-session"); await browser(bob, "bob-session");
    await R.deleteSession("alice-session");
    expect(await db.collection("session_devices").countDocuments({ token_hash: hash("alice-session") })).toBe(0);
    expect(await R.getSession("alice-session")).toBeNull();
    expect(await R.getSession("bob-session")).toMatchObject({ id: bob });
    expect(await db.collection("session_devices").countDocuments({ token_hash: hash("bob-session") })).toBe(1);
  });

  test("rolls device removal back if revoking its session fails", async () => {
    await browser(alice, "rollback-session");
    const remove = R.store.remove;
    const spy = vi.spyOn(R.store, "remove").mockImplementation(async (name, filter) => {
      if (name === "sessions") throw new Error("fixture session failure");
      return remove(name, filter);
    });
    try { await expect(R.deleteSession("rollback-session")).rejects.toThrow("fixture session failure"); }
    finally { spy.mockRestore(); }
    expect(await db.collection("session_devices").countDocuments({ token_hash: hash("rollback-session") })).toBe(1);
    expect(await R.getSession("rollback-session")).toMatchObject({ id: alice });
  });

  test("revokes all account sessions and their labels in bounded batches", async () => {
    const rows = Array.from({ length: 157 }, (_, index) => ({ id: crypto.randomUUID(), user_id: alice, token: `batch-session-${index}`, created_at: new Date().toISOString() }));
    await db.collection("sessions").insertMany(rows);
    await db.collection("session_devices").insertMany(rows.map((row) => ({ token_hash: hash(row.token), label: "Fixture browser" })));
    await browser(bob, "preserved-session");
    const spy = vi.spyOn(R.store, "remove");
    try {
      await R.deleteSessionsByUserId(alice);
      const batches = spy.mock.calls.filter(([name]) => name === "session_devices").map(([, filter]) => filter.token_hash.$in.length);
      expect(batches).toEqual([100, 57]);
    } finally { spy.mockRestore(); }
    expect(await db.collection("sessions").countDocuments({ user_id: alice })).toBe(0);
    expect(await db.collection("session_devices").countDocuments()).toBe(1);
    expect(await R.getSession("preserved-session")).toMatchObject({ id: bob });
  });

  test("empty revocation selectors never turn into a broad deletion", async () => {
    await browser(alice, "valid-session");
    expect(await R.deleteSession(undefined)).toBe(0);
    expect(await R.deleteSession("")).toBe(0);
    expect(await R.deleteSessionsByUserId(undefined)).toBe(0);
    expect(await R.getSession("valid-session")).toMatchObject({ id: alice });
    expect(await db.collection("session_devices").countDocuments()).toBe(1);
  });

  test("account deletion also removes its technical device metadata", async () => {
    await browser(alice, "deleted-account"); await browser(bob, "kept-account");
    await R.deleteUserById(alice);
    expect(await db.collection("session_devices").countDocuments({ token_hash: hash("deleted-account") })).toBe(0);
    expect(await R.getSession("kept-account")).toMatchObject({ id: bob });
  });

  test("completed and cancelled schedules discard duplicate text while pending and failed drafts survive", async () => {
    const chat = await group(), due = new Date(Date.now() + 60000).toISOString();
    const sent = await R.messagingDb.schedule(alice, chat, "Already published report", due);
    const cancelled = await R.messagingDb.schedule(alice, chat, "Cancelled report", due);
    const failed = await R.messagingDb.schedule(alice, chat, "Retry this report", due);
    const pending = await R.messagingDb.schedule(alice, chat, "Keep this draft", due);
    await R.messagingDb.finishSchedule(sent.id, "sent");
    await R.messagingDb.cancelSchedule(alice, cancelled.id);
    await R.messagingDb.finishSchedule(failed.id, "failed", "Fixture retry");
    expect((await db.collection("scheduled_messages").findOne({ id: sent.id })).body).toBeNull();
    expect((await db.collection("scheduled_messages").findOne({ id: cancelled.id })).body).toBeNull();
    const drafts = await R.messagingDb.schedules(alice, chat);
    expect(drafts.find((row) => row.id === failed.id)?.body).toBe("Retry this report");
    expect(drafts.find((row) => row.id === pending.id)?.body).toBe("Keep this draft");
    expect(await R.messagingDb.dueSchedules()).toHaveLength(0);
    expect(await R.messagingDb.cancelSchedule(bob, pending.id)).toBe(0);
    expect((await R.messagingDb.schedules(alice, chat)).find((row) => row.id === pending.id)?.body).toBe("Keep this draft");
  });
});
