import crypto from 'node:crypto';
import { userEvents } from '../workers/autoAddWorker.js';

export function createMongoAdminActions(deps) {
  const R = deps.mongoRepository, s = R.store;
  const selectUser = async (selector) => {
    const text = String(selector || "").trim();
    return await R.findUserById(text) || await R.findUserByUsername(text);
  };
  const selectChat = async (selector) => {
    const text = String(selector || "").trim();
    return await R.findChatById(text) || await R.findChatByGroupUsername(text);
  };
  function required(value, message) { if (!value) throw Object.assign(new Error(message), { status: 400 }); return value; }
  function username(value) { const name = String(value || "").trim().toLowerCase(); required(deps.USERNAME_REGEX.test(name), "Invalid username."); return name; }
  const emit = (chatId, type, extra = {}) => deps.emitChatEvent?.(chatId, { type, chatId, ...extra });
  const cleanup = (removed) => deps.cleanupDeletedFiles ? deps.cleanupDeletedFiles(removed.files || []) : deps.removeStoredFileNames?.(removed.storedNames || []);

  return async function execute(action, p = {}) {
      let result;
      if (["check_owner", "check_owner_exists"].includes(action)) { const owner = await R.getOwnerUser(); result = { exists: Boolean(owner), owner }; }
      else if (action === "inspect_db") result = await deps.buildInspectSnapshot(p.kind || "all", p.limit || 25);
      else if (["vacuum", "vacuum_db"].includes(action)) result = await R.vacuumDatabase();
      else if (action === "create_user") {
        const name = username(p.username);
        required(!await R.findUserByUsername(name) && !await R.findChatByGroupUsername(name), "Username is already taken.");
        required(p.password, "Password is required.");
        const role = ["user", "admin", "owner"].includes(p.role) ? p.role : "user";
        const id = await R.createUser(name, await deps.bcrypt.hash(String(p.password), 10), p.nickname || name, p.avatarUrl || null, p.color || null, { role, verified: p.verified });
        userEvents.emit("user:created", { id }); result = { id, username: name, nickname: p.nickname || name, role };
      } else if (action === "create_chat") {
        const owner = required(await selectUser(p.owner || p.ownerUsername || p.ownerId), "Owner user not found.");
        const type = p.type === "channel" ? "channel" : "group", groupUsername = username(p.username || p.groupUsername);
        required(!await R.findUserByUsername(groupUsername) && !await R.findChatByGroupUsername(groupUsername), "Username is already taken.");
        const id = await s.transaction(async () => {
          const chatId = await R.createChat(p.name || p.nickname || groupUsername, type, { groupUsername, groupVisibility: p.visibility || "public", createdByUserId: owner.id, groupColor: p.color || owner.color, inviteToken: crypto.randomBytes(24).toString("base64url"), allowMemberInvites: p.allowMemberInvites !== false, autoAddNewUsers: p.autoAddNewUsers });
          await R.addChatMember(chatId, owner.id, "owner");
          const selectors = Array.isArray(p.members) ? p.members : String(p.members || "").split(/[,\s]+/).filter(Boolean);
          for (const selector of selectors) { const user = await selectUser(selector); if (user && user.id !== owner.id) await R.addChatMember(chatId, user.id); }
          return chatId;
        });
        emit(id, "chat_updated"); result = { id, chatId: id, username: groupUsername, type };
      } else if (action === "add_chat_members") {
        const chat = required(await selectChat(p.chat || p.chatId || p.username), "Chat not found.");
        if (p.all) result = await R.addAllEligibleChatMembers(chat.id);
        else {
          const addedUsers = [];
          const selectors = Array.isArray(p.users || p.members) ? p.users || p.members : String(p.users || p.members || "").split(/[,\s]+/).filter(Boolean);
          for (const selector of selectors) { const user = required(await selectUser(selector), "User not found."); if (await R.addChatMember(chat.id, user.id)) addedUsers.push({ id: user.id, username: user.username, nickname: user.nickname }); }
          result = { addedUsers, skippedLeftCount: 0 };
        }
        result = { ...result, added: result.addedUsers.length, chatId: chat.id }; emit(chat.id, "chat_updated");
      } else if (action === "edit_user") {
        const user = required(await selectUser(p.user || p.userId || p.selector), "User not found.");
        const patch = {};
        for (const field of ["username", "nickname", "color", "status", "role"]) if (p[field] !== undefined) patch[field] = field === "username" ? username(p[field]) : p[field];
        if (p.avatarUrl !== undefined) patch.avatar_url = p.avatarUrl;
        if (p.password) patch.password_hash = await deps.bcrypt.hash(String(p.password), 10);
        await R.updateUserProfile(user.id, patch); result = { id: user.id, username: patch.username || user.username };
      } else if (action === "edit_chat") {
        const chat = required(await selectChat(p.chat || p.chatId || p.selector), "Chat not found.");
        const patch = {};
        for (const [from, to] of Object.entries({ name: "name", username: "group_username", visibility: "group_visibility", color: "group_color", allowMemberInvites: "allow_member_invites", autoAddNewUsers: "auto_add_new_users" })) if (p[from] !== undefined) patch[to] = typeof p[from] === "boolean" ? Number(p[from]) : p[from];
        await s.transaction(async () => {
          if (p.owner) { const owner = required(await selectUser(p.owner), "Owner not found."); await s.update("chat_members", { chat_id: chat.id, role: "owner" }, { role: "member" }); await R.addChatMember(chat.id, owner.id, "owner"); await R.setChatMemberRole(chat.id, owner.id, "owner"); patch.created_by_user_id = owner.id; }
          await R.updateChat(chat.id, patch);
        });
        emit(chat.id, "chat_updated"); result = { id: chat.id, chatId: chat.id };
      } else if (["toggle_user_verified", "toggle_user_ban"].includes(action)) {
        const user = required(await selectUser(p.user || p.userId || p.selector || p.username), "User not found.");
        const field = action === "toggle_user_ban" ? "banned" : "verified", next = p[field] === undefined ? Number(!user[field]) : Number(Boolean(p[field]));
        await s.update("users", { id: user.id }, { [field]: next }); if (field === "banned" && next) await R.deleteSessionsByUserId(user.id);
        result = { id: user.id, username: user.username, [field]: Boolean(next) };
      } else if (action === "toggle_chat_verified") {
        const chat = required(await selectChat(p.chat || p.chatId || p.selector), "Chat not found."); const verified = p.verified === undefined ? Number(!chat.verified) : Number(Boolean(p.verified)); await R.updateChat(chat.id, { verified }); emit(chat.id, "chat_updated"); result = { id: chat.id, verified: Boolean(verified) };
      } else if (action === "delete_users") {
        const selectors = p.all ? (await s.many("users")).map((row) => row.id) : p.userIds || p.users || [];
        required(Array.isArray(selectors) && selectors.length, "Provide users or all=true.");
        let deleted = 0;
        for (const selector of selectors) { const user = await selectUser(selector); if (!user) continue; const removed = await R.deleteUserById(user.id); await cleanup(removed); deleted++; }
        result = { deleted, deletedUsers: deleted };
      } else if (action === "delete_chats") {
        const selectors = p.all ? (await s.many("chats")).map((row) => row.id) : p.chatIds || [];
        required(Array.isArray(selectors) && selectors.length, "Provide chatIds or all=true.");
        for (const selector of selectors) { const chat = required(await selectChat(selector), "Chat not found."); const removed = await R.deleteChatById(chat.id); await cleanup(removed); emit(chat.id, "chat_deleted"); }
        result = { deleted: selectors.length, deletedChats: selectors.length };
      } else if (action === "delete_files") {
        const files = await s.many("chat_message_files", p.all ? {} : { $or: [{ id: { $in: (p.fileIds || p.ids || []).map(Number) } }, { stored_name: { $in: p.names || [] } }] });
        const ids = [...new Set(files.map((file) => file.message_id))]; const removed = await R.removeMessages(ids); await cleanup({ files: removed, storedNames: removed.map((row) => row.stored_name) }); result = { deletedMessages: ids.length, deletedFiles: removed.length };
      } else if (["reset_db", "delete_db"].includes(action)) {
        const removed = await R.adminResetDatabase(); await cleanup(removed); deps.removeAllMessageUploads?.(); result = { cleared: true, filesRemoved: removed.storedNames.length };
      } else if (action === "generate_users") {
        const count = Math.max(1, Math.min(1000, Number(p.count) || 10)), ids = [];
        for (let i = 0; i < count; i++) { const name = `demo${crypto.randomBytes(6).toString("hex")}`; ids.push(await R.createUser(name, await deps.bcrypt.hash(String(p.password || "demo-password"), 10), `Demo ${i + 1}`)); }
        result = { created: ids.length, ids };
      } else if (action === "generate_chat_messages") {
        const chat = required(await selectChat(p.chat || p.chatId), "Chat not found."), user = required(await selectUser(p.user || p.userId || p.username), "User not found.");
        const count = Math.max(1, Math.min(10000, Number(p.count) || 10));
        for (let i = 0; i < count; i++) await R.createMessage(chat.id, user.id, p.body || `Demo message ${i + 1}`);
        emit(chat.id, "chat_list_changed"); result = { created: count, chatId: chat.id };
      } else if (action === "create_demo") {
        let user = await R.findUserByUsername("demo"); if (!user) { const id = await R.createUser("demo", await deps.bcrypt.hash("demo-password", 10), "Demo User"); user = await R.findUserById(id); }
        let chat = await s.one("chats", { name: "Ouj Chat Demo" }); if (!chat) { const id = await R.createChat("Ouj Chat Demo", "group", { createdByUserId: user.id }); chat = await R.findChatById(id); await R.addChatMember(id, user.id, "owner"); }
        if (!await s.count("chat_messages", { chat_id: chat.id })) for (let i = 0; i < 10; i++) await R.createMessage(chat.id, user.id, `Demo message ${i + 1}`);
        result = { userId: user.id, chatId: chat.id };
      } else if (action === "edit_remote_channel") {
        const chat = required(await selectChat(p.chat || p.chatId || p.selector), "Chat not found.");
        const current = await R.getRemoteChannelSourceByChatId(chat.id);
        if (p.pause !== undefined || p.paused !== undefined) { required(current, "Remote channel not configured."); await R.updateRemoteChannelSourcePaused(current.id, p.pause ?? p.paused); }
        if (p.skipCurrent && current) await R.skipCurrentRemoteChannelQueueItem(current.id);
        if (p.skipAll && current) await R.skipAllRemoteChannelQueueItems(current.id);
        if (p.source !== undefined || p.enabled !== undefined || p.syncMetadata !== undefined || p.streamMedia !== undefined) await R.upsertRemoteChannelSource({ chatId: chat.id, provider: "telegram", sourceRaw: p.source ?? current?.source_raw, sourceChatId: p.sourceChatId ?? current?.source_chat_id, sourceUsername: p.sourceUsername ?? current?.source_username, sourceUrl: current?.source_url, enabled: p.enabled ?? current?.enabled ?? true, syncMetadata: p.syncMetadata ?? current?.sync_metadata, streamMedia: p.streamMedia ?? current?.stream_media });
        result = { chatId: chat.id };
      } else throw Object.assign(new Error("Unknown admin action."), { status: 400 });

    return result;
  };
}
