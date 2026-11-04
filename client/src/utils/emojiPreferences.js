const RECENT_LIMIT = 24;
const tones = new Set(["neutral", "1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"]);
const preferenceKey = (owner) => `ouj-emoji-preferences-v1:${encodeURIComponent(String(owner || ""))}`;

export function readEmojiPreferences(owner) {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey(owner)) || "{}");
    return {
      recent: [...new Set((Array.isArray(value?.recent) ? value.recent : []).filter((id) => typeof id === "string" && /^[a-f0-9-]{1,100}$/.test(id)))].slice(0, RECENT_LIMIT),
      tone: tones.has(value?.tone) ? value.tone : "neutral",
    };
  } catch { return { recent: [], tone: "neutral" }; }
}

export function saveEmojiPreferences(owner, value) {
  try { localStorage.setItem(preferenceKey(owner), JSON.stringify(value)); } catch { /* Selection still works without browser storage. */ }
}

export function withRecentEmoji(preferences, id) {
  return { ...preferences, recent: [id, ...preferences.recent.filter((item) => item !== id)].slice(0, RECENT_LIMIT) };
}

export function insertEmojiAtSelection(text, emoji, selection, limit) {
  const start = Math.max(0, Math.min(text.length, selection?.start ?? text.length));
  const end = Math.max(start, Math.min(text.length, selection?.end ?? start));
  const value = text.slice(0, start) + emoji + text.slice(end);
  if (limit !== null && limit !== undefined && Number.isFinite(Number(limit)) && value.length > Number(limit)) return null;
  return { value, caret: start + emoji.length };
}
