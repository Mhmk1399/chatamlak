import { afterEach, describe, expect, test, vi } from "vitest";
import { CHAT_WALLPAPER_IDS, normalizeChatAppearance } from "../../../shared/chatAppearance.js";
import { CHAT_WALLPAPERS } from "../../src/utils/chatWallpapers.js";
import { normalizeSessionUser, saveSessionUser } from "../../src/utils/sessionStorage.js";

afterEach(() => vi.unstubAllGlobals());
describe("account wallpaper cache", () => {
  test("keeps server and client catalogs aligned with small local assets", () => {
    expect(CHAT_WALLPAPERS.map(({ id }) => id)).toEqual(CHAT_WALLPAPER_IDS);
    expect(CHAT_WALLPAPERS.filter(({ asset }) => asset)).toHaveLength(8);
  });
  test("normalizes missing, corrupt and future unsupported choices safely", () => {
    expect(normalizeChatAppearance(null)).toEqual({ wallpaperId: "default", revision: 0, updatedAt: null });
    expect(normalizeChatAppearance({ wallpaperId: "url(evil)", revision: -1 })).toEqual(normalizeChatAppearance(null));
    expect(normalizeChatAppearance({ wallpaperId: "future", revision: 9 }).revision).toBe(9);
  });
  test("retains the preference in the existing session snapshot", () => {
    expect(normalizeSessionUser({ username: "alice", chatAppearance: { wallpaperId: "leaves", revision: 2 } }).chatAppearance).toMatchObject({ wallpaperId: "leaves", revision: 2 });
  });
  test("does not rewrite an unchanged snapshot or clear unrelated cached work", () => {
    const values = new Map([["draft", "keep"]]);
    const setItem = vi.fn((key, value) => values.set(key, value));
    vi.stubGlobal("localStorage", { getItem: (key) => values.get(key), setItem });
    const user = { id: "alice", username: "alice", chatAppearance: { wallpaperId: "plain", revision: 1 } };
    saveSessionUser(user); saveSessionUser(user); expect(setItem).toHaveBeenCalledTimes(1);
    saveSessionUser({ ...user, chatAppearance: { wallpaperId: "leaves", revision: 2 } });
    expect(setItem).toHaveBeenCalledTimes(2); expect(values.get("draft")).toBe("keep");
  });
});
