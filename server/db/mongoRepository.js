import crypto from "node:crypto";
import { createMongoStore } from "./mongoStore.js";
import { COLLECTION_KEYS, MONGO_SCHEMA_VERSION } from "./mongoSchema.js";
import { storageEncryption } from "../lib/storageEncryption.js";
import { setUserColor } from "../settings/colors.js";
import { createRemoteRepository } from "./mongoRemote.js";
import { createAdminRepository } from "./mongoAdmin.js";
import { createMessagingRepository } from "./mongoMessaging.js";
import { createDocumentExecutor } from "./query.js";
import { createMongoMaintenance } from "./mongoMaintenance.js";
import { createAppearanceRepository } from "./mongoAppearance.js";

const now = () => new Date().toISOString();
const time = (value) => { if (!value) return null; const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(value)) ? value : `${String(value).replace(" ", "T")}Z`); return Number.isFinite(+parsed) ? parsed.toISOString() : null; };
const unique = (values) => [...new Set((values || []).filter((value) => value != null && value !== ""))];
const regex = (value) => new RegExp(String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const publicUser = (row) => { if (!row) return null; const { password_hash, chat_appearance, ...user } = row; return user; };
const and = (...filters) => {
  const clauses = filters.filter((filter) => filter && Object.keys(filter).length);
  return clauses.length ? { $and: clauses } : {};
};
const alive = (field = "expires_at") => ({ $or: [{ [field]: null }, { [field]: { $gt: now() } }] });
const sessionTokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const SESSION_DEVICE_BATCH_SIZE = 100;
export const isRemoteMessageClientRequestId = (value) => /^remote:/i.test(String(value || "").trim());
export const isRemoteMessageRow = (row) => isRemoteMessageClientRequestId(row?.client_request_id || row?.clientRequestId);

export function createMongoRepository({ db, client, encryption = storageEncryption }) {
  const s = createMongoStore({ db, client });
  const R = { store: s };
  async function removeSessionDeviceLabels(filter) {
    const cursor = db.collection("sessions").find(filter, s.opts({ projection: { _id: 0, token: 1 } })).batchSize(SESSION_DEVICE_BATCH_SIZE);
    let hashes = [];
    const flush = async () => {
      if (!hashes.length) return;
      await s.remove("session_devices", { token_hash: { $in: hashes } });
      hashes = [];
    };
    try {
      for await (const session of cursor) {
        if (typeof session.token !== "string" || !session.token) continue;
        hashes.push(sessionTokenHash(session.token));
        if (hashes.length === SESSION_DEVICE_BATCH_SIZE) await flush();
      }
      await flush();
    } finally { await cursor.close(); }
  }
  const commands = createDocumentExecutor(s);
  Object.assign(R, commands, { adminGetRow: commands.getRow, adminGetAll: commands.getAll, adminRun: commands.run });
  const decrypt = (row) => {
    if (!row) return null;
    const value = { ...row };
    for (const key of ["body", "edited_body", "reply_body", "last_message"]) if (typeof value[key] === "string") value[key] = encryption.decryptText(value[key]);
    return value;
  };
  async function visibleFilter(userId, chatId, extra = {}) {
    const hidden = userId ? await s.many("hidden_chat_messages", { user_id: userId }, { projection: { message_id: 1 } }) : [];
    return and(chatId ? { chat_id: chatId } : {}, { hidden_everyone_at: null }, alive(), hidden.length ? { id: { $nin: hidden.map((row) => row.message_id) } } : {}, extra);
  }
  async function hydrateMessages(rows, userId) {
    if (!rows.length) return [];
    const replyIds = unique(rows.map((row) => row.reply_to_message_id));
    const replies = replyIds.length ? await s.many("chat_messages", await visibleFilter(userId, null, { id: { $in: replyIds } })) : [];
    const users = await s.many("users", { id: { $in: unique([...rows, ...replies].map((row) => row.user_id)) } });
    const byUser = new Map(users.map((user) => [user.id, user]));
    const byReply = new Map(replies.map((row) => [row.id, row]));
    return rows.map((row) => {
      const user = byUser.get(row.user_id), reply = byReply.get(row.reply_to_message_id), replyUser = byUser.get(reply?.user_id);
      return decrypt({ ...row, body: row.edited_body ?? row.body, username: user?.username || "deleted", nickname: user?.nickname || "Deleted user", avatar_url: user?.avatar_url || null, color: user?.color || null, user_role: user?.role || "user", user_verified: user?.verified || 0,
        reply_id: reply?.id || null, reply_body: reply ? reply.edited_body ?? reply.body : null, reply_created_at: reply?.created_at || null, reply_user_id: reply?.user_id || null,
        reply_username: reply ? replyUser?.username || "deleted" : null, reply_nickname: reply ? replyUser?.nickname || "Deleted user" : null,
        reply_avatar_url: replyUser?.avatar_url || null, reply_user_color: replyUser?.color || null, reply_user_verified: replyUser?.verified || 0, reply_user_role: replyUser?.role || "user" });
    });
  }
  Object.assign(R, {
    getCurrentSchemaVersion: async () => MONGO_SCHEMA_VERSION,
    findUserByUsername: (username) => username ? s.one("users", { username: String(username).toLowerCase() }) : Promise.resolve(null),
    findUserById: (id) => id ? s.one("users", { id }) : Promise.resolve(null),
    async listUsers(excludeUsername) { return (await s.many("users", excludeUsername ? { username: { $ne: String(excludeUsername).toLowerCase() } } : {}, { sort: { username: 1 } })).map(publicUser); },
    async searchUsers(query, excludeUsername) { return (await s.many("users", and({ $or: [{ username: regex(query) }, { nickname: regex(query) }] }, excludeUsername ? { username: { $ne: String(excludeUsername).toLowerCase() } } : {}), { sort: { username: 1 }, limit: 100 })).map(publicUser); },
    async createUser(username, passwordHash, nickname = null, avatarUrl = null, color = null, options = {}) {
      const row = await s.insert("users", { id: crypto.randomUUID(), username: String(username).toLowerCase(), password_hash: passwordHash, nickname, avatar_url: avatarUrl, color: color || setUserColor(), role: typeof options === "string" ? options : options.role || "user", verified: options.verified ? 1 : 0, status: options.status || "online" });
      return row.id;
    },
    async createChat(name, type = "dm", options = {}) {
      const social = ["group", "channel"].includes(type);
      const visibility = type === "saved" || options.groupVisibility === "private" ? "private" : "public";
      return (await s.insert("chats", { id: crypto.randomUUID(), name: String(name || "").trim() || (type === "dm" ? "dm" : null), type,
        group_username: social ? String(options.groupUsername || "").trim().toLowerCase() || null : null,
        group_visibility: visibility, invite_token: social ? options.inviteToken || null : null, created_by_user_id: options.createdByUserId || null,
        group_color: social ? options.groupColor || setUserColor() : null, group_avatar_url: options.groupAvatarUrl || null, allow_member_invites: options.allowMemberInvites === false ? 0 : 1,
        verified: options.verified ? 1 : 0, auto_add_new_users: visibility === "public" && (options.auto_add_new_users || options.autoAddNewUsers) ? 1 : 0,
        ...(type === "saved" && options.createdByUserId ? { saved_owner_id: options.createdByUserId } : {}), ...(options.dmPair ? { dm_pair: options.dmPair } : {}) })).id;
    },
    async findDmChat(userId, otherUserId) {
      if (!userId || !otherUserId) return null;
      const memberships = await s.many("chat_members", { user_id: { $in: unique([userId, otherUserId]) } });
      const ids = memberships.filter((member) => member.user_id === userId && memberships.some((peer) => peer.chat_id === member.chat_id && peer.user_id === otherUserId)).map((member) => member.chat_id);
      const chats = await s.many("chats", { id: { $in: ids }, type: "dm" });
      const ranked = [];
      for (const chat of chats) { const count = await s.count("chat_messages", { chat_id: chat.id }); const latest = await s.one("chat_messages", { chat_id: chat.id }, { sort: { created_at: -1, id: -1 } }); ranked.push({ id: chat.id, count, time: latest?.created_at || "" }); }
      ranked.sort((a, b) => b.count - a.count || b.time.localeCompare(a.time) || b.id.localeCompare(a.id));
      return ranked[0]?.id || null;
    },
    addChatMember: (chatId, userId, role = "member") => s.ignore("chat_members", { chat_id: chatId, user_id: userId }, { chat_id: chatId, user_id: userId, role }),
    removeChatMember: (chatId, userId) => s.remove("chat_members", { chat_id: chatId, user_id: userId }),
    markChatMemberLeft: (chatId, userId) => s.upsert("chat_left_members", { chat_id: chatId, user_id: userId }, { left_at: now() }),
    clearChatMemberLeft: (chatId, userId) => s.remove("chat_left_members", { chat_id: chatId, user_id: userId }),
    async hasChatMemberLeft(chatId, userId) { return Boolean(await s.one("chat_left_members", { chat_id: chatId, user_id: userId })); },
    markGroupMemberRemoved: (chatId, userId, removedByUserId) => s.upsert("group_removed_members", { chat_id: chatId, user_id: userId }, { removed_by_user_id: removedByUserId, removed_at: now() }),
    clearGroupMemberRemoved: (chatId, userId) => s.remove("group_removed_members", { chat_id: chatId, user_id: userId }),
    async isGroupMemberRemoved(chatId, userId) { return Boolean(await s.one("group_removed_members", { chat_id: chatId, user_id: userId })); },
    findChatById: (id) => s.one("chats", { id }),
    findChatByGroupUsername: (username) => s.one("chats", { type: { $in: ["group", "channel"] }, group_username: { $in: [String(username || "").replace(/^@/, "").toLowerCase(), `@${String(username || "").replace(/^@/, "").toLowerCase()}`] } }),
    findChatByInviteToken: (token) => s.one("chats", { invite_token: token, type: { $in: ["group", "channel"] } }),
    updateChat: (id, updates = {}) => s.update("chats", { id }, { ...updates, ...(updates.group_visibility === "private" ? { auto_add_new_users: 0 } : {}) }),
    async updateGroupChat(id, payload) { return R.updateSocialChat(id, payload, "group"); },
    async updateChannelChat(id, payload) { return R.updateSocialChat(id, payload, "channel"); },
    async updateSocialChat(id, payload = {}, type) {
      const fields = { name: "name", groupUsername: "group_username", groupVisibility: "group_visibility", groupColor: "group_color", groupAvatarUrl: "group_avatar_url", allowMemberInvites: "allow_member_invites", autoAddNewUsers: "auto_add_new_users", auto_add_new_users: "auto_add_new_users" };
      const patch = {};
      for (const [source, target] of Object.entries(fields)) if (Object.hasOwn(payload, source)) patch[target] = typeof payload[source] === "boolean" ? Number(payload[source]) : payload[source];
      if (patch.group_visibility === "private") patch.auto_add_new_users = 0;
      return Object.keys(patch).length ? s.update("chats", { id, type }, patch) : 0;
    },
    regenerateGroupInviteToken: (id, inviteToken) => s.update("chats", { id }, { invite_token: inviteToken }),
    async isMember(chatId, userId) { return Boolean(await s.one("chat_members", { chat_id: chatId, user_id: userId })); },
    async getChatMemberRole(chatId, userId) { return (await s.one("chat_members", { chat_id: chatId, user_id: userId }))?.role || null; },
    setChatMemberRole: (chatId, userId, role = "member") => s.update("chat_members", { chat_id: chatId, user_id: userId }, { role }),
    async listChatMembers(chatId) { return (await R.listChatMembersForChats([chatId])).get(chatId) || []; },
    async listChatMembersForChats(chatIds = []) {
      const members = await s.many("chat_members", { chat_id: { $in: unique(chatIds) } });
      const users = await s.many("users", { id: { $in: unique(members.map((member) => member.user_id)) } });
      const result = new Map();
      for (const member of members) {
        const user = users.find((user) => user.id === member.user_id); if (!user) continue;
        if (!result.has(member.chat_id)) result.set(member.chat_id, []);
        result.get(member.chat_id).push({ id: user.id, username: user.username, nickname: user.nickname, avatar_url: user.avatar_url, color: user.color, user_verified: user.verified, user_role: user.role, status: user.status, chat_id: member.chat_id, role: member.role });
      }
      for (const rows of result.values()) rows.sort((a, b) => a.username.localeCompare(b.username));
      return result;
    },
    async addAllEligibleChatMembers(chatId) {
      const current = await s.many("chat_members", { chat_id: chatId });
      const left = await s.many("chat_left_members", { chat_id: chatId });
      const legacyLeft = await s.many("chat_messages", { chat_id: chatId, body: /^\[\[system:left:/ });
      const excluded = new Set([...left, ...legacyLeft].map((row) => row.user_id));
      const users = await s.many("users", { id: { $nin: current.map((row) => row.user_id) } }, { sort: { id: 1 } });
      const addedUsers = users.filter((user) => !excluded.has(user.id)).map(({ id, username, nickname }) => ({ id, username, nickname }));
      for (const user of addedUsers) await R.addChatMember(chatId, user.id);
      return { addedUsers, skippedLeftCount: users.length - addedUsers.length };
    },
    async getAutoAddPublicChatIds() { return (await s.many("chats", { type: { $in: ["group", "channel"] }, group_visibility: "public", auto_add_new_users: 1 })).map((row) => row.id); },
    async bulkAddMemberToChats(userId, chatIds) { for (const id of chatIds) if (!await R.hasChatMemberLeft(id, userId) && !await R.isGroupMemberRemoved(id, userId)) await R.addChatMember(id, userId); },
    async searchPublicGroups(query, viewer, limit = 20) { return R.searchSocialChats("group", query, viewer, limit); },
    async searchPublicChannels(query, viewer, limit = 20) { return R.searchSocialChats("channel", query, viewer, limit); },
    async searchSocialChats(type, query, viewer, limit) {
      const memberships = await s.many("chat_members", { user_id: viewer });
      const chats = await s.many("chats", and({ type }, { $or: [{ group_visibility: "public" }, { id: { $in: memberships.map((row) => row.chat_id) } }] }, { $or: [{ name: regex(query) }, { group_username: regex(query) }] }), { sort: { name: 1 }, limit: Math.max(1, Math.min(100, Number(limit) || 20)) });
      for (const chat of chats) { chat.members_count = await s.count("chat_members", { chat_id: chat.id }); chat.is_member = Number(memberships.some((member) => member.chat_id === chat.id)); }
      return chats;
    },
    async findSavedChatByUserId(userId) { return s.one("chats", { type: "saved", created_by_user_id: userId }); },
    async ensureSavedChatForUser(userId) {
      let chat = await R.findSavedChatByUserId(userId);
      if (!chat) { try { const id = await R.createChat("Saved messages", "saved", { createdByUserId: userId }); chat = await R.findChatById(id); } catch (error) { if (error.code !== 11000) throw error; chat = await R.findSavedChatByUserId(userId); } }
      await R.addChatMember(chat.id, userId, "owner");
      return chat;
    },
    async createMessage(chatId, userId, body, replyToMessageId = null, expiresAt = null, clientRequestId = null, options = {}) {
      return s.transaction(async () => {
        const id = crypto.randomUUID();
        await s.insert("chat_messages", { id, chat_id: chatId, user_id: userId, body: encryption.encryptText(body, { allowPlaintextSystemMessage: options.allowPlaintextSystemMessage }), reply_to_message_id: replyToMessageId || null, expires_at: time(expiresAt), client_request_id: clientRequestId || null });
        if (options.topicId) await s.insert("chat_message_topics", { message_id: id, topic_id: options.topicId });
        await s.event(chatId, { type: "chat_message", messageId: id });
        return id;
      });
    },
    async findMessageIdByClientRequestId(chatId, userId, id) { return id ? (await s.one("chat_messages", { chat_id: chatId, user_id: userId, client_request_id: String(id).trim() }))?.id || null : null; },
    async createOrReuseMessage(chatId, userId, body, reply = null, expires = null, requestId = null, options = {}) {
      const key = String(requestId || "").trim() || null;
      const existing = await R.findMessageIdByClientRequestId(chatId, userId, key);
      if (existing) return { id: existing, deduped: true };
      try { return { id: await R.createMessage(chatId, userId, body, reply, expires, key, options), deduped: false }; }
      catch (error) { if (error.code !== 11000 || !key) throw error; const id = await R.findMessageIdByClientRequestId(chatId, userId, key); if (!id) throw error; return { id, deduped: true }; }
    },
    async findMessageById(id) { return decrypt(await s.one("chat_messages", { id })); },
    setMessageExpiresAt: (id, expiresAt = null) => s.update("chat_messages", { id }, { expires_at: time(expiresAt) }),
    async editMessage(id, body) { return R.mutateMessage(id, { edited: 1, edited_body: encryption.encryptText(body) }, "chat_message_updated"); },
    async updateCallMessageBody(id, body) { await R.mutateMessage(id, { body }, "chat_message_updated"); return id; },
    async mutateMessage(id, patch, event, viewer = null) { return s.transaction(async () => { const row = await s.one("chat_messages", { id }); if (!row) return 0; const changed = await s.update("chat_messages", { id }, patch); await s.event(row.chat_id, { type: event, messageId: id }, viewer); return changed; }); },
    async hideMessageForUser(id, userId) { return s.transaction(async () => { const row = await s.one("chat_messages", { id }); if (!row) return 0; const changed = await s.ignore("hidden_chat_messages", { message_id: id, user_id: userId }, { message_id: id, user_id: userId }); await s.event(row.chat_id, { type: "chat_message_deleted", messageId: id }, userId); return changed; }); },
    hideMessageForEveryone: (id) => R.mutateMessage(id, { hidden_everyone_at: now() }, "chat_message_deleted"),
    setMessageForwardOrigin: (id, payload = {}) => s.update("chat_messages", { id }, { forwarded_from_chat_id: payload.sourceChatId || null, forwarded_from_user_id: payload.sourceUserId || null, forwarded_from_username: payload.sourceUsername || null, forwarded_from_label: payload.sourceLabel || null, forwarded_from_avatar_url: payload.sourceAvatarUrl || null, forwarded_from_color: payload.sourceColor || null }),
    async getMessages(chatId, options = {}) {
      const limit = Math.max(1, Math.min(10000, Number(options.limit) || 50));
      const before = time(options.beforeCreatedAt), after = time(options.afterCreatedAt);
      const ascending = Boolean(options.afterId && after);
      const filters = [];
      if (options.beforeId && before) filters.push({ $or: [{ created_at: { $lt: before } }, { created_at: before, id: { $lt: options.beforeId } }] });
      if (ascending) filters.push({ $or: [{ created_at: { $gt: after } }, { created_at: after, id: { $gte: options.afterId } }] });
      if (options.topicId) { const ids = await s.many("chat_message_topics", { topic_id: options.topicId }); filters.push({ id: { $in: ids.map((row) => row.message_id) } }); }
      const rows = await s.many("chat_messages", await visibleFilter(options.viewerUserId, chatId, and(...filters)), { sort: { created_at: ascending ? 1 : -1, id: ascending ? 1 : -1 }, limit: limit + 1 });
      const page = rows.slice(0, limit); if (!ascending) page.reverse();
      return { messages: await hydrateMessages(page, options.viewerUserId), hasMore: rows.length > limit };
    },
    async getFirstUnreadMessage(chatId, userId) {
      const reads = await s.many("chat_message_reads", { user_id: userId }, { projection: { message_id: 1 } });
      return s.one("chat_messages", await visibleFilter(userId, chatId, and({ id: { $nin: reads.map((row) => row.message_id) } }, { body: { $not: /^\[\[system:/ }, $or: [{ user_id: { $ne: userId } }, { client_request_id: /^remote:/i }] })), { projection: { id: 1, created_at: 1 }, sort: { created_at: 1, id: 1 } });
    },
    async listChatsForUser(userId) {
      const memberships = await s.many("chat_members", { user_id: userId });
      const hidden = await s.many("hidden_chats", { user_id: userId });
      const excluded = new Set(hidden.map((row) => row.chat_id));
      const chats = await s.many("chats", { id: { $in: memberships.map((row) => row.chat_id).filter((id) => !excluded.has(id)) } });
      const mutes = await s.many("chat_mutes", { user_id: userId });
      const reads = await s.many("chat_message_reads", { user_id: userId }, { projection: { message_id: 1 } });
      const result = [];
      for (const chat of chats) {
        const filter = await visibleFilter(userId, chat.id, { body: { $not: /^\[\[system:/ } });
        const latest = await s.one("chat_messages", filter, { sort: { created_at: -1, id: -1 } });
        const outgoing = await s.one("chat_messages", and(filter, { user_id: userId, client_request_id: { $not: /^remote:/i } }), { sort: { created_at: -1, id: -1 } });
        const unread = await s.count("chat_messages", and(filter, { id: { $nin: reads.map((row) => row.message_id) } }, { $or: [{ user_id: { $ne: userId } }, { client_request_id: /^remote:/i }] }));
        const author = latest ? await R.findUserById(latest.user_id) : null;
        const remote = await R.getRemoteChannelSourceByChatId(chat.id);
        result.push(decrypt({ ...chat, muted: mutes.find((row) => row.chat_id === chat.id)?.muted || 0, remote_channel_enabled: remote?.enabled || 0, last_message_id: latest?.id || null, last_message: latest?.edited_body ?? latest?.body ?? null, last_time: latest?.created_at || null, last_sender_id: latest?.user_id || null, last_message_client_request_id: latest?.client_request_id || null, last_sender_username: latest ? author?.username || "deleted" : null, last_sender_nickname: latest ? author?.nickname || "Deleted user" : null, last_sender_avatar_url: author?.avatar_url || null, last_message_read_at: latest?.read_at || null, last_message_read_by_user_id: latest?.read_by_user_id || null, last_outgoing_time: outgoing?.created_at || null, unread_count: unread }));
      }
      return result.sort((a, b) => (b.last_time || b.created_at).localeCompare(a.last_time || a.created_at));
    },
    async listCallHistoryForUser(userId, limit = 200) {
      const memberships = await s.many("chat_members", { user_id: userId });
      const chats = await s.many("chats", { id: { $in: memberships.map((row) => row.chat_id) }, type: "dm" });
      const rows = await s.many("chat_messages", await visibleFilter(userId, null, { chat_id: { $in: chats.map((row) => row.id) }, body: /^\[\[call:/ }), { sort: { created_at: -1, id: -1 }, limit: Math.min(1000, Number(limit) || 200) });
      const result = [];
      for (const row of rows) {
        const peer = await s.one("chat_members", { chat_id: row.chat_id, user_id: { $ne: userId } });
        const user = peer ? await R.findUserById(peer.user_id) : null;
        result.push(decrypt({ ...row, peer_id: user?.id || null, peer_username: user?.username || null, peer_nickname: user?.nickname || null, peer_avatar_url: user?.avatar_url || null, peer_color: user?.color || null, peer_verified: user?.verified || 0, peer_role: user?.role || "user", peer_status: user?.status || "offline" }));
      }
      return result;
    },
    async createMessageFiles(messageId, files = []) {
      const result = [];
      await s.transaction(async () => {
        for (const file of files) result.push(await s.insert("chat_message_files", { message_id: messageId, kind: file.kind, original_name: file.originalName || file.original_name || "", stored_name: file.storedName || file.stored_name || "", mime_type: file.mimeType || file.mime_type || "", size_bytes: Number(file.sizeBytes || file.size_bytes || 0), width_px: file.widthPx ?? file.width_px ?? null, height_px: file.heightPx ?? file.height_px ?? null, duration_seconds: file.durationSeconds ?? file.duration_seconds ?? null, expires_at: time(file.expiresAt || file.expires_at), storage_driver: file.storageDriver || file.storage_driver || "local", storage_key: file.storageKey || file.storage_key || null, processing_status: file.processingStatus || file.processing_status || "ready", blurhash: file.blurhash || null, waveform: file.waveform || null, thumb_storage_key: file.thumbStorageKey || file.thumb_storage_key || null, encryption_type: file.encryptionType || file.encryption_type || "none" }));
        const message = await s.one("chat_messages", { id: messageId }); if (message) await s.event(message.chat_id, { type: "chat_message_updated", messageId });
      });
      return result.map((row) => row.id);
    },
    findMessageFileById: (id) => s.one("chat_message_files", { id: Number(id) }),
    listMessageFilesByMessageIds: (ids = []) => s.many("chat_message_files", { message_id: { $in: unique(ids) } }, { sort: { id: 1 } }),
    listMessageFilesNeedingMetadata: (limit = 10000) => s.many("chat_message_files", { $or: [{ width_px: null }, { height_px: null }, { duration_seconds: null }] }, { limit }),
    updateMessageFileMetadata: (id, metadata = {}) => s.update("chat_message_files", { id: Number(id) }, Object.fromEntries(Object.entries({ width_px: metadata.widthPx ?? metadata.width, height_px: metadata.heightPx ?? metadata.height, duration_seconds: metadata.durationSeconds }).filter(([, value]) => value != null))),
    recordPendingPresignedUpload: ({ storageKey, userId = null, expiresAt = null }) => s.upsert("pending_presigned_uploads", { storage_key: storageKey }, { user_id: userId, expires_at: time(expiresAt), created_at: now() }),
    removePendingPresignedUploads: (keys = []) => s.remove("pending_presigned_uploads", { storage_key: { $in: unique(keys) } }),
    listPendingPresignedUploads: (cutoff = null) => s.many("pending_presigned_uploads", cutoff ? { created_at: { $lte: time(cutoff) } } : {}),
    async rewriteStorageKeys(pairs = []) {
      let changed = 0;
      await s.transaction(async () => {
        for (const pair of pairs) {
          const oldKey = pair.oldKey || pair.from, newKey = pair.newKey || pair.to;
          if (!oldKey || !newKey) continue;
          changed += await s.update("chat_message_files", { storage_key: oldKey }, { storage_key: newKey });
          changed += await s.update("chat_message_files", { thumb_storage_key: oldKey }, { thumb_storage_key: newKey });
          changed += await s.update("pending_presigned_uploads", { storage_key: oldKey }, { storage_key: newKey });
        }
      });
      return changed;
    },
    async markMessageRead(messageId, readerId) {
      return s.transaction(async () => {
        const row = await s.one("chat_messages", { id: messageId }); if (!row) return 0;
        const saved = (await R.findChatById(row.chat_id))?.type === "saved";
        if (row.user_id === readerId && !saved && !isRemoteMessageRow(row)) return 0;
        await s.ignore("chat_message_reads", { message_id: messageId, user_id: readerId }, { message_id: messageId, user_id: readerId, read_at: now() });
        const changed = await s.update("chat_messages", { id: messageId, read_at: null }, { read_at: now(), read_by_user_id: readerId });
        await s.event(row.chat_id, { type: "chat_read", messageId });
        return changed;
      });
    },
    async markMessagesRead(chatId, readerId) { const rows = await s.many("chat_messages", await visibleFilter(readerId, chatId)); for (const row of rows) await R.markMessageRead(row.id, readerId); },
    async recordMessageReads(ids, readerId) { for (const id of unique(ids)) await R.markMessageRead(id, readerId); },
    getMessageAuthors: (ids = []) => s.many("chat_messages", { id: { $in: unique(ids) } }, { projection: { id: 1, user_id: 1, client_request_id: 1 } }),
    getMessageReadByUser: (ids = [], userId) => s.many("chat_message_reads", { user_id: userId, message_id: { $in: unique(ids) } }, { projection: { message_id: 1 } }),
    getMessageReadCounts: (ids = []) => s.aggregate("chat_message_reads", [{ $match: { message_id: { $in: unique(ids) } } }, { $group: { _id: "$message_id", count: { $sum: 1 } } }, { $project: { _id: 0, message_id: "$_id", count: 1 } }]),
    async hideChatsForUser(userId, ids) { for (const chatId of unique(ids)) await s.ignore("hidden_chats", { user_id: userId, chat_id: chatId }, { user_id: userId, chat_id: chatId }); },
    unhideChat: (userId, chatId) => s.remove("hidden_chats", { user_id: userId, chat_id: chatId }),
    setChatMuted: (userId, chatId, muted) => s.upsert("chat_mutes", { user_id: userId, chat_id: chatId }, { muted: Number(Boolean(muted)) }),
    async getTotalUnreadCount(userId) { return (await R.listChatsForUser(userId)).reduce((total, row) => total + (Number(row.muted) ? 0 : Number(row.unread_count || 0)), 0); },
    async listMutedUserIdsForChat(chatId) { return (await s.many("chat_mutes", { chat_id: chatId, muted: 1 })).map((row) => row.user_id); },
    upsertPushSubscription: (userId, endpoint, p256dh, auth, messagePreview = 1, locale = "fa") => s.upsert("push_subscriptions", { endpoint }, { user_id: userId, p256dh, auth, message_preview: Number(messagePreview), locale: locale === "en" ? "en" : "fa" }),
    deletePushSubscription: (endpoint, userId) => s.remove("push_subscriptions", { endpoint, ...(userId ? { user_id: userId } : {}) }),
    listPushSubscriptionsByUserIds: (ids = []) => s.many("push_subscriptions", { user_id: { $in: unique(ids) } }),
    createSession: (userId, token) => s.insert("sessions", { id: crypto.randomUUID(), user_id: userId, token, last_seen: now() }),
    async getSession(token) { const session = token ? await s.one("sessions", { token }) : null; if (!session) return null; const user = await R.findUserById(session.user_id); return user && !user.banned ? { ...publicUser(user), chat_appearance: user.chat_appearance, session_id: session.id, token: session.token } : null; },
    touchSession: (token) => s.update("sessions", { token }, { last_seen: now() }),
    async deleteSession(token) {
      if (typeof token !== "string" || !token) return 0;
      return s.transaction(async () => {
        await s.remove("session_devices", { token_hash: sessionTokenHash(token) });
        return s.remove("sessions", { token });
      });
    },
    async deleteSessionsByUserId(userId) {
      if (typeof userId !== "string" || !userId) return 0;
      return s.transaction(async () => {
        await removeSessionDeviceLabels({ user_id: userId });
        return s.remove("sessions", { user_id: userId });
      });
    },
    updateUserPassword: (id, passwordHash) => s.update("users", { id }, { password_hash: passwordHash }),
    updateUserStatus: (id, status) => s.update("users", { id }, { status }),
    setUserBanned: (id, banned) => s.update("users", { id }, { banned: Number(Boolean(banned)) }),
    updateLastSeen: (id) => s.update("users", { id }, { last_seen: now() }),
    async getUserPresence(username) { const user = await R.findUserByUsername(String(username || "").trim()); return user ? { id: user.id, username: user.username, status: user.status, last_seen: user.last_seen } : null; },
    updateUserProfile(id, arg2, nickname, avatarUrl) {
      const patch = typeof arg2 === "object" && arg2 ? { ...arg2 } : { username: arg2, nickname, avatar_url: avatarUrl };
      if (Object.hasOwn(patch, "avatarUrl")) { patch.avatar_url = patch.avatarUrl; delete patch.avatarUrl; }
      return s.update("users", { id }, patch);
    },
    setUserRole: (id, role) => s.update("users", { id }, { role }),
    async getUserRole(id) { return (await R.findUserById(id))?.role || "user"; },
    async isUserAdmin(id) { return ["admin", "owner"].includes(await R.getUserRole(id)); },
    async isUserOwner(id) { return await R.getUserRole(id) === "owner"; },
    getOwnerUser: () => s.one("users", { role: "owner" }, { projection: { id: 1, username: 1 } }),
    async bootstrapAdminUsers(names = []) { for (const username of names) { const user = await R.findUserByUsername(username); if (user && user.role !== "owner") await R.setUserRole(user.id, "admin"); } },
    adminBanUser: (id, banned) => R.setUserBanned(id, banned),
    dbGetAllSettings: () => s.many("app_settings"),
    async dbGetSetting(key) { const row = await s.one("app_settings", { key: String(key) }); return row?.value == null ? null : String(row.value); },
    dbSetSetting: (key, value) => s.upsert("app_settings", { key: String(key) }, { value: String(value), updated_at: now() }),
    dbDeleteSetting: (key) => s.remove("app_settings", { key }),
    adminSave: async () => {},
    adminTransaction: (callback) => s.transaction(() => callback(R.adminRun)),
    vacuumDatabase: async () => ({ compacted: false, engine: "mongodb", message: "MongoDB manages storage automatically." }),
    reloadDatabase: async () => db.command({ ping: 1 }),
  });

  // Multi-document cascade cleanup is explicit; MongoDB does not implement SQL
  // foreign-key cascades. Keep it in the same transaction as its replay event.
  async function removeMessages(ids) {
    if (!ids.length) return [];
    const filter = { message_id: { $in: ids } };
    const files = await s.many("chat_message_files", filter);
    const polls = await s.many("chat_polls", filter);
    for (const name of ["chat_message_files", "chat_message_reads", "hidden_chat_messages", "message_reactions", "chat_pinned_messages", "chat_message_topics", "chat_polls"]) await s.remove(name, filter);
    await s.remove("chat_poll_votes", { poll_id: { $in: polls.map((row) => row.id) } });
    await s.update("chat_messages", { reply_to_message_id: { $in: ids } }, { reply_to_message_id: null });
    await s.remove("chat_messages", { id: { $in: ids } });
    return files;
  }
  R.removeMessages = (ids) => s.transaction(async () => {
    const rows = await s.many("chat_messages", { id: { $in: ids } }, { projection: { id: 1, chat_id: 1 } });
    const files = await removeMessages(ids);
    for (const chatId of unique(rows.map((row) => row.chat_id))) await s.event(chatId, { type: "chat_message_deleted", messageIds: rows.filter((row) => row.chat_id === chatId).map((row) => row.id) });
    return files;
  });
  R.deleteChatById = (chatId) => s.transaction(async () => {
    const messages = await s.many("chat_messages", { chat_id: chatId }, { projection: { id: 1 } });
    const files = await removeMessages(messages.map((row) => row.id));
    const sources = await s.many("remote_channel_sources", { chat_id: chatId });
    await s.remove("remote_channel_queue", { source_id: { $in: sources.map((row) => row.id) } });
    for (const name of ["chat_members", "chat_left_members", "group_removed_members", "chat_mutes", "hidden_chats", "chat_preferences", "chat_pinned_messages", "chat_topics", "chat_group_policy", "scheduled_messages", "remote_channel_sources", "group_call_rooms", "group_call_peers"]) await s.remove(name, { chat_id: chatId });
    await s.remove("chats", { id: chatId });
    await s.event(chatId, { type: "chat_deleted" });
    return { storedNames: files.map((file) => file.stored_name), files };
  });
  R.deleteUserById = (userId) => s.transaction(async () => {
    const user = await R.findUserById(userId);
    const ownedMemberships = await s.many("chat_members", { user_id: userId, role: "owner" });
    const owned = await s.many("chats", { id: { $in: ownedMemberships.map((row) => row.chat_id) } });
    const storedNames = [], files = [], deletedChatIds = [], transferredChatIds = [];
    for (const chat of owned) {
      const remaining = await s.many("chat_members", { chat_id: chat.id, user_id: { $ne: userId } }, { sort: { created_at: 1, user_id: 1 } });
      if (chat.type === "saved" || !remaining.length) { const removed = await R.deleteChatById(chat.id); storedNames.push(...removed.storedNames); files.push(...removed.files); deletedChatIds.push(chat.id); }
      else { const successor = remaining.find((member) => member.role === "admin") || remaining[0]; await R.updateChat(chat.id, { created_by_user_id: successor.user_id }); await R.setChatMemberRole(chat.id, successor.user_id, "owner"); transferredChatIds.push(chat.id); }
    }
    // Preserve the existing history contract: messages in surviving chats stay
    // visible with a deleted-author placeholder, including their attachments.
    await s.update("chat_messages", { read_by_user_id: userId }, { read_by_user_id: null });
    await R.deleteSessionsByUserId(userId);
    for (const name of ["chat_members", "chat_left_members", "group_removed_members", "chat_mutes", "hidden_chats", "chat_preferences", "chat_message_reads", "hidden_chat_messages", "message_reactions", "chat_poll_votes", "scheduled_messages", "push_subscriptions", "group_call_peers"]) await s.remove(name, { user_id: userId });
    await s.remove("users", { id: userId });
    return { storedNames, files, avatarUrl: user?.avatar_url || null, deletedChatIds, transferredChatIds };
  });
  R.adminDeleteUser = R.deleteUserById; R.adminDeleteChat = R.deleteChatById;
  R.adminClearAllMessages = () => s.transaction(async () => {
    const files = await s.many("chat_message_files");
    for (const name of ["chat_message_files", "chat_messages", "chat_message_reads", "hidden_chat_messages", "message_reactions", "chat_pinned_messages", "chat_message_topics", "chat_polls", "chat_poll_votes", "scheduled_messages"]) await s.remove(name);
    for (const chat of await s.many("chats")) await s.event(chat.id, { type: "chat_cleared" });
    return { storedNames: files.map((row) => row.stored_name), files };
  });
  R.adminResetDatabase = () => s.transaction(async () => {
    const files = await s.many("chat_message_files");
    for (const name of Object.keys(COLLECTION_KEYS)) if (!["app_settings", "meta", "migration_runs"].includes(name)) await s.remove(name);
    return { storedNames: files.map((row) => row.stored_name), files };
  });
  Object.assign(R, createRemoteRepository(s, R));
  Object.assign(R, createAdminRepository(s, R));
  R.messagingDb = createMessagingRepository(s, R, encryption, visibleFilter);
  Object.assign(R, createMongoMaintenance(s));
  Object.assign(R, createAppearanceRepository(s));
  return R;
}
