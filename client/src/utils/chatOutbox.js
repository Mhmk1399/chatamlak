import { CACHE_STORES, idbSet, idbDelete, idbGetAllEntries } from "./cacheDb.js";

const owner = (username) => String(username || "").toLowerCase();
const keyFor = (username, clientId) => `${owner(username)}:${clientId}`;

// File/Blob values use IndexedDB structured cloning. Object URLs are recreated
// on restore: they belong to a document and cannot survive a reload.
export async function saveOutboxMessage(username, message) {
  if (!username || !message?._clientId || !message?._chatId) throw new Error("Invalid queued message.");
  const files = (message._files || []).map(({ url: _url, _localUrl, ...file }) => file);
  const result = await idbSet(CACHE_STORES.outbox, keyFor(username, message._clientId), {
    ...message, files: [], _files: files, owner: owner(username),
  });
  if (!result) throw new Error("Unable to save this message on your device. Free some storage and try again.");
  window.dispatchEvent(new Event("songbird:outbox-changed"));
}

export async function removeOutboxMessage(username, clientId) {
  if (!username || !clientId) return;
  if (!await idbDelete(CACHE_STORES.outbox, keyFor(username, clientId))) throw new Error("Unable to remove this queued message. Try again.");
  window.dispatchEvent(new Event("songbird:outbox-changed"));
}

export async function readOutboxMessages(username, chatId, { hydrate = true } = {}) {
  const entries = await idbGetAllEntries(CACHE_STORES.outbox);
  return (entries || []).map((entry) => entry?.data).filter((message) =>
    message?.owner === owner(username) && (!chatId || String(message._chatId) === String(chatId)),
  ).sort((a, b) => a._queuedAt - b._queuedAt).map((message) => {
    const files = (message._files || []).map((file) => {
      const url = hydrate && file.file instanceof Blob ? URL.createObjectURL(file.file) : null;
      return { ...file, url, _localUrl: url };
    });
    return { ...message, _files: files, files, _queuedAt: Date.now(), _uploadProgress: null };
  });
}
