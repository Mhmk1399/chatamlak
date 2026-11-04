import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { insertEmojiAtSelection, readEmojiPreferences, saveEmojiPreferences, withRecentEmoji } from "../../src/utils/emojiPreferences.js";
import { localizeEmojiData } from "../../src/utils/emojiLocale.js";
import english from "emoji-picker-react/data/emojis-en";
import persian from "../../src/i18n/emoji-fa.json";

beforeEach(() => { const values = new Map(); vi.stubGlobal("localStorage", { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }); });
afterEach(() => vi.unstubAllGlobals());
test("keeps recent choices bounded, deduplicated and separate for each account", () => {
  let preferences = { recent: [], tone: "1f3fd" };
  for (let id = 0x1f600; id < 0x1f630; id++) preferences = withRecentEmoji(preferences, id.toString(16));
  preferences = withRecentEmoji(preferences, "1f62f"); saveEmojiPreferences("alice", preferences);
  expect(readEmojiPreferences("alice")).toMatchObject({ tone: "1f3fd" });
  expect(readEmojiPreferences("alice").recent).toHaveLength(24);
  expect(new Set(readEmojiPreferences("alice").recent).size).toBe(24);
  expect(readEmojiPreferences("bob")).toEqual({ recent: [], tone: "neutral" });
});
test("ignores corrupt, unexpected and unavailable browser storage", () => {
  localStorage.setItem("ouj-emoji-preferences-v1:alice", "oops"); expect(readEmojiPreferences("alice").recent).toEqual([]);
  localStorage.setItem("ouj-emoji-preferences-v1:alice", JSON.stringify({ recent: [null, {}, "not an ID", "1f600", "1f600"], tone: "invalid" }));
  expect(readEmojiPreferences("alice")).toEqual({ recent: ["1f600"], tone: "neutral" });
  vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } });
  expect(readEmojiPreferences("alice").recent).toEqual([]); expect(() => saveEmojiPreferences("alice", {})).not.toThrow();
});
test("inserts whole emoji sequences at the caret or over a selection, respecting UTF-16 message limits", () => {
  expect(insertEmojiAtSelection("Report HERE end", "❤️", { start: 7, end: 11 }, 30)).toEqual({ value: "Report ❤️ end", caret: 9 });
  expect(insertEmojiAtSelection("سلام", "👨‍👩‍👧‍👦", { start: 4, end: 4 }, 8)).toBeNull();
  expect(insertEmojiAtSelection("", "👍🏽", null, null)).toEqual({ value: "👍🏽", caret: 4 });
  expect(insertEmojiAtSelection("", "😀", null, 1)).toBeNull();
});
test("covers the complete packaged catalog with Persian labels and English search aliases", () => {
  const fa = localizeEmojiData(english, persian.annotations, [], "fa");
  const originals = Object.values(english.emojis).flat(), translated = Object.values(fa.emojis).flat();
  expect(originals.length).toBeGreaterThan(1800); expect(translated.map((emoji) => emoji.u)).toEqual(originals.map((emoji) => emoji.u));
  for (const emoji of translated) expect(emoji.n.at(-1)).toMatch(/[\u0600-\u06ff]/);
  const heart = translated.find((emoji) => emoji.u === "2764-fe0f"); expect(heart.n.at(-1)).toBe("قلب قرمز"); expect(heart.n).toContain("red heart");
});
