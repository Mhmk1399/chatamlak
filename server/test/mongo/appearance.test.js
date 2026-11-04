import { describe, expect, test } from "vitest";
import { R, db, alice, bob } from "./helpers.js";

describe("account wallpapers on a real MongoDB replica set", () => {
  test("persists a bounded account preference and its private journal event together", async () => {
    const saved = await R.updateChatAppearance(alice, "courtyard", 0);
    expect(saved.appearance).toMatchObject({ wallpaperId: "courtyard", revision: 1 });
    expect((await R.findUserById(alice)).chat_appearance).toEqual(saved.appearance);
    const own = await R.messagingDb.sync(alice);
    expect(own.events).toHaveLength(1); expect(own.events[0]).toMatchObject({ type: "chat_appearance_updated", userId: alice, chatAppearance: saved.appearance });
    expect((await R.messagingDb.sync(bob)).events).toHaveLength(0);
    expect((await R.listUsers()).every((user) => !("chat_appearance" in user))).toBe(true);
    await R.createSession(alice, "appearance-session");
    expect((await R.getSession("appearance-session")).chat_appearance).toEqual(saved.appearance);
  });
  test("rolls back the setting when its journal record cannot commit", async () => {
    await expect(R.store.transaction(async () => { await R.updateChatAppearance(alice, "leaves", 0); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect((await R.findUserById(alice)).chat_appearance).toBeUndefined();
    expect(await db.collection("chat_event_log").countDocuments()).toBe(0);
  });
  test("accepts one concurrent edit and preserves the current version for a conflict", async () => {
    const results = await Promise.all([R.updateChatAppearance(alice, "leaves", 0), R.updateChatAppearance(alice, "contours", 0)]);
    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(results.filter((result) => result.conflict)).toHaveLength(1);
    expect(await db.collection("chat_event_log").countDocuments()).toBe(1);
  });
  test("does not create a new revision, timestamp or event for the same saved choice", async () => {
    const first = await R.updateChatAppearance(alice, "plain", 0);
    const unchanged = await R.updateChatAppearance(alice, "plain", 1);
    expect(unchanged).toEqual({ appearance: first.appearance, changed: false });
    expect(await db.collection("chat_event_log").countDocuments()).toBe(1);
    expect(await R.updateChatAppearance("missing-user", "plain", 0)).toEqual({ notFound: true });
  });
});
