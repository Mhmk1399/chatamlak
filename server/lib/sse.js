import { isValidUuid } from "./uuidUtils.js";
import { safeErrorCode } from "./requestLogging.js";
import { sessionTokenStorageValue } from "./sessionTokens.js";

const UUID_EVENT_TYPES = new Set([
  "chat_message",
  "chat_message_updated",
  "chat_message_deleted",
  "chat_read",
  "chat_typing",
  "chat_updated",
  "chat_deleted",
  "chat_list_changed",
  "presence_update",
  "profile_updated",
  "user_profile_updated",
]);
const MEMBERSHIP_EVENT_TYPES = new Set(["chat_updated", "chat_deleted", "chat_list_changed"]);

function hasValidUuidReferences(payload = {}) {
  const type = String(payload?.type || "");
  if (!UUID_EVENT_TYPES.has(type)) return true;

  const uuidFields = ["chatId", "messageId", "userId", "replyToMessageId", "sourceChatId", "sourceUserId"];
  for (const field of uuidFields) {
    if (payload[field] !== undefined && payload[field] !== null && !isValidUuid(String(payload[field]))) {
      return false;
    }
  }

  if (Array.isArray(payload.messageIds) && payload.messageIds.some((id) => !isValidUuid(String(id)))) {
    return false;
  }

  if (["chat_message", "chat_message_updated", "chat_message_deleted", "chat_read", "chat_typing", "chat_updated", "chat_deleted"].includes(type) && !isValidUuid(String(payload.chatId || ""))) {
    return false;
  }
  if (type === "presence_update" && !isValidUuid(String(payload.userId || ""))) {
    return false;
  }
  if ((type === "profile_updated" || type === "user_profile_updated") && !isValidUuid(String(payload.userId || ""))) {
    return false;
  }

  return true;
}

export function createSseHub({ listChatMembers, recordEvent }) {
  const sseClientsByUsername = new Map();
  const sessionTokenIdsByClient = new WeakMap();
  // Short-lived cache for chat member lists to avoid repeated DB queries on
  // rapid SSE event bursts (e.g., multiple messages in quick succession).
  const memberCache = new Map(); // chatId → { members, expiresAt }
  const MEMBER_CACHE_TTL_MS = 8000;
  // Sweep expired entries every 5 minutes to prevent unbounded Map growth.
  const memberCacheSweepTimer = setInterval(() => {
    const now = Date.now();
    memberCache.forEach((entry, chatId) => {
      if (entry.expiresAt <= now) memberCache.delete(chatId);
    });
  }, 5 * 60 * 1000);
  if (typeof memberCacheSweepTimer.unref === "function") {
    memberCacheSweepTimer.unref();
  }

  function getCachedMembers(chatId) {
    const entry = memberCache.get(chatId);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.members;
    }
    const rawMembers = listChatMembers(chatId);
    if (rawMembers && typeof rawMembers.then === "function") {
      const pendingEntry = {
        members: null,
        expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
      };
      pendingEntry.members = rawMembers.then((members) => {
        const list = Array.isArray(members) ? members : [];
        if (memberCache.get(chatId) === pendingEntry) {
          memberCache.set(chatId, {
            members: list,
            expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
          });
        }
        return list;
      });
      memberCache.set(chatId, pendingEntry);
      return pendingEntry.members;
    }
    const list = Array.isArray(rawMembers) ? rawMembers : [];
    memberCache.set(chatId, {
      members: list,
      expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
    });
    return list;
  }

  function invalidateChatMembers(chatId) {
    memberCache.delete(chatId);
  }

  function addSseClient(username, res, sessionToken = null) {
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key) || new Set();
    clients.add(res);
    sseClientsByUsername.set(key, clients);
    const tokenId = sessionTokenStorageValue(sessionToken);
    if (tokenId) sessionTokenIdsByClient.set(res, tokenId);
  }

  function removeSseClient(username, res) {
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key);
    if (!clients) return;
    clients.delete(res);
    sessionTokenIdsByClient.delete(res);
    if (!clients.size) {
      sseClientsByUsername.delete(key);
    }
  }

  function disconnectClientSet(clients, predicate = () => true) {
    if (!clients?.size) return 0;
    let disconnected = 0;
    for (const client of [...clients]) {
      if (!predicate(client)) continue;
      clients.delete(client);
      sessionTokenIdsByClient.delete(client);
      try { client.end(); } catch (_) {}
      disconnected += 1;
    }
    return disconnected;
  }

  function disconnectSession(token) {
    const tokenId = sessionTokenStorageValue(token);
    if (!tokenId) return 0;
    let disconnected = 0;
    for (const [username, clients] of sseClientsByUsername) {
      disconnected += disconnectClientSet(
        clients,
        (client) => sessionTokenIdsByClient.get(client) === tokenId,
      );
      if (!clients.size) sseClientsByUsername.delete(username);
    }
    return disconnected;
  }

  function disconnectUsername(username) {
    const key = String(username || "").trim().toLowerCase();
    if (!key) return 0;
    const clients = sseClientsByUsername.get(key);
    const disconnected = disconnectClientSet(clients);
    sseClientsByUsername.delete(key);
    return disconnected;
  }

  function emitSseEvent(username, payload) {
    if (!hasValidUuidReferences(payload)) return;
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key);
    if (!clients?.size) return;

    const message = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((client) => {
      try {
        client.write(message);
      } catch (_) {
        // connection cleanup is handled on close
      }
    });
  }

  function emitChatEvent(chatId, payload) {
    if (!isValidUuid(String(chatId || "")) || !hasValidUuidReferences(payload)) return;
    if (MEMBERSHIP_EVENT_TYPES.has(String(payload?.type || ""))) {
      invalidateChatMembers(chatId);
    }
    if (recordEvent && !["chat_typing", "chat_read"].includes(payload.type)) {
      void Promise.resolve(recordEvent(chatId, payload)).catch((error) => console.error(JSON.stringify({
        service: "ouj-chat",
        event: "event_journal.record_failed",
        errorCode: safeErrorCode(error, "event_journal_failed"),
      })));
    }
    const rawMembers = getCachedMembers(chatId);
    const processMembers = (members) => {
      const memberList = Array.isArray(members) ? members : [];
      memberList.forEach((member) => {
        if (!member?.username) return;
        emitSseEvent(member.username, payload);
      });
    };

    if (rawMembers && typeof rawMembers.then === "function") {
      rawMembers.then(processMembers).catch(() => {});
    } else {
      processMembers(rawMembers);
    }

    listeners.forEach((listener) => {
      try {
        listener(chatId, payload);
      } catch (_) {}
    });
  }

  const listeners = new Set();
  function onChatEvent(listener) {
    if (typeof listener === "function") {
      listeners.add(listener);
    }
    return () => listeners.delete(listener);
  }

  // Broadcasts a payload to every currently connected SSE client.
  function broadcastAll(payload) {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    sseClientsByUsername.forEach((clients) => {
      clients.forEach((client) => {
        try { client.write(message); } catch (_) {}
      });
    });
  }

  return {
    addSseClient,
    removeSseClient,
    disconnectSession,
    disconnectUsername,
    emitSseEvent,
    emitChatEvent,
    onChatEvent,
    broadcastAll,
    getCachedMembers,
    invalidateChatMembers,
    isUserConnected(username) {
      const key = String(username || "").toLowerCase();
      if (!key) return false;
      const clients = sseClientsByUsername.get(key);
      return Boolean(clients?.size);
    },
    close() {
      clearInterval(memberCacheSweepTimer);
      for (const clients of sseClientsByUsername.values()) {
        disconnectClientSet(clients);
      }
      sseClientsByUsername.clear();
      memberCache.clear();
      listeners.clear();
    },
  };
}

