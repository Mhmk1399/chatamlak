const PREFIX = "ouj-chat-draft-v1:";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const keyFor = (username, chatId) => `${PREFIX}${encodeURIComponent(String(username).toLowerCase())}:${chatId}`;

export function readChatDraft(username, chatId, storage = globalThis.localStorage) {
  if (!username || !chatId) return null;
  try {
    const key = keyFor(username, chatId);
    const draft = JSON.parse(storage.getItem(key) || "null");
    if (!draft || Date.now() - draft.updatedAt > MAX_AGE) {
      storage.removeItem(key);
      return null;
    }
    return draft;
  } catch { return null; }
}

export function saveChatDraft(username, chatId, body, replyTo = null, storage = globalThis.localStorage) {
  if (!username || !chatId) return false;
  try {
    const key = keyFor(username, chatId);
    if (!body && !replyTo) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ body, replyTo, updatedAt: Date.now() }));
    return true;
  } catch { return false; }
}

export function clearChatDraft(username, chatId, storage = globalThis.localStorage) {
  return saveChatDraft(username, chatId, "", null, storage);
}
