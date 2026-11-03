const literalRegex = (value) => new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const page = (options) => ({ limit: Math.max(1, Math.min(500, Number(options.limit) || 200)), skip: Math.max(0, Number(options.offset) || 0) });
export function createAdminRepository(s, R) {
  function userFilter(o) {
    const clauses = [];
    if (o.search) clauses.push({ $or: ["username", "nickname"].map((key) => ({ [key]: literalRegex(o.search) })) });
    if (o.roleFilter === "banned") clauses.push({ banned: 1 }); else if (o.roleFilter) clauses.push({ banned: { $ne: 1 }, role: o.roleFilter });
    if (["1", "true", "0", "false"].includes(o.verifiedFilter)) clauses.push(["1", "true"].includes(o.verifiedFilter) ? { verified: 1 } : { verified: { $ne: 1 } });
    if (o.statusFilter === "online") clauses.push({ status: { $ne: "invisible" }, ...(Array.isArray(o.connectedUsernames) ? { username: { $in: o.connectedUsernames.map((name) => name.toLowerCase()) } } : {}) });
    if (o.statusFilter === "offline") clauses.push(Array.isArray(o.connectedUsernames) ? { $or: [{ status: "invisible" }, { username: { $nin: o.connectedUsernames.map((name) => name.toLowerCase()) } }] } : { status: "invisible" });
    return clauses.length ? { $and: clauses } : {};
  }
  async function chatRows(o) {
    const filter = { ...(o.typeFilter ? { type: o.typeFilter } : { type: { $in: ["group", "channel"] } }), ...(o.visibilityFilter ? { group_visibility: o.visibilityFilter } : {}) };
    if (o.search) filter.$or = ["name", "group_username"].map((key) => ({ [key]: literalRegex(o.search) }));
    if (o.verifiedFilter != null) filter.verified = ["1", "true"].includes(o.verifiedFilter) ? 1 : { $ne: 1 };
    if (o.autoAddFilter != null) filter.auto_add_new_users = ["1", "true"].includes(o.autoAddFilter) ? 1 : { $ne: 1 };
    const rows = await s.many("chats", filter);
    const result = [];
    for (const row of rows) {
      const remote = await R.getRemoteChannelSourceByChatId(row.id);
      if (o.remoteFilter === "none" && remote || o.remoteFilter === "active" && !(remote?.enabled && !remote?.paused) || o.remoteFilter === "paused" && !(remote?.enabled && remote?.paused) || o.remoteFilter === "disabled" && remote?.enabled !== 0) continue;
      const ownerMembership = await s.one("chat_members", { chat_id: row.id, role: "owner" });
      const owner = ownerMembership ? await R.findUserById(ownerMembership.user_id) : null;
      result.push({ ...row, owner_id: owner?.id || null, owner_username: owner?.username || null, owner_nickname: owner?.nickname || null, owner_avatar_url: owner?.avatar_url || null, owner_color: owner?.color || null, owner_verified: owner?.verified || 0, owner_role: owner?.role || null, member_count: await s.count("chat_members", { chat_id: row.id }), message_count: await s.count("chat_messages", { chat_id: row.id }), remote_enabled: remote?.enabled ?? null, remote_paused: remote?.paused ?? null, remote_channel_enabled: remote?.enabled || 0, remote_channel_paused: remote?.paused || 0, remote_channel_source: remote?.source_raw || null });
    }
    const key = ["id", "name", "type", "group_visibility", "created_at", "member_count", "message_count"].includes(o.sortBy) ? o.sortBy : "id";
    const direction = o.sortDir === "ASC" ? 1 : -1;
    return result.sort((a, b) => direction * (typeof a[key] === "number" ? a[key] - b[key] : String(a[key] || "").localeCompare(String(b[key] || ""), "fa", { numeric: true, sensitivity: "base" })));
  }
  return {
    async getAdminStats() {
      const result = {};
      for (const [key, collection, filter] of [
        ["totalUsers", "users", {}], ["bannedUsers", "users", { banned: 1 }], ["newUsers7d", "users", { created_at: { $gte: new Date(Date.now() - 7 * 86400000).toISOString() } }], ["onlineUsers", "users", { status: "online" }],
        ["totalChats", "chats", { type: { $in: ["group", "channel"] } }], ["dmChats", "chats", { type: "dm" }], ["groupChats", "chats", { type: "group" }], ["channelChats", "chats", { type: "channel" }],
        ["totalMessages", "chat_messages", {}], ["messagesLast24h", "chat_messages", { created_at: { $gte: new Date(Date.now() - 86400000).toISOString() } }], ["totalSessions", "sessions", {}], ["totalFiles", "chat_message_files", {}], ["pushSubscriptions", "push_subscriptions", {}],
      ]) result[key] = await s.count(collection, filter);
      return result;
    },
    async adminListUsers(options = {}) {
      const filter = userFilter(options);
      const sortBy = ["id", "username", "nickname", "role", "created_at", "last_seen"].includes(options.sortBy) ? options.sortBy : "id";
      const users = await s.many("users", filter, { ...page(options), sort: { [sortBy]: options.sortDir === "ASC" ? 1 : -1 }, collation: { locale: "en", numericOrdering: true, strength: 2 }, projection: { password_hash: 0 } });
      return { users: users.map((user) => ({ ...user, online: Number(user.status === "online") })), total: await s.count("users", filter) };
    },
    adminCountUsers: (options = {}) => s.count("users", userFilter(options)),
    async adminListChats(options = {}) { const rows = await chatRows(options), p = page(options); return { chats: rows.slice(p.skip, p.skip + p.limit), total: rows.length }; },
    async adminCountChats(options = {}) { return (await chatRows(options)).length; },
    async writeAdminAuditLog(entry = {}) {
      try { await s.insert("admin_audit_logs", { ts: entry.ts || new Date().toISOString(), actor_user_id: entry.actorUserId || null, actor_username: entry.actorUsername || null, action: entry.action || "", target_type: entry.targetType || null, target_label: entry.targetLabel || null, details: entry.details == null || typeof entry.details === "string" ? entry.details ?? null : JSON.stringify(entry.details), status: entry.status || "success" }); } catch { /* Audit failure must not replace the user's result. */ }
    },
    async readAdminAuditLogs(options = {}) {
      const filter = options.search ? { $or: ["actor_username", "action", "target_label", "details"].map((key) => ({ [key]: literalRegex(options.search) })) } : {};
      const rows = await s.many("admin_audit_logs", filter, { ...page(options), sort: { id: -1 } });
      return { entries: rows.map((row) => ({ ts: row.ts, actorUserId: row.actor_user_id, actorUsername: row.actor_username, action: row.action, targetType: row.target_type, targetLabel: row.target_label, details: row.details, status: row.status })), total: await s.count("admin_audit_logs", filter) };
    },
    clearAdminAuditLogs: () => s.remove("admin_audit_logs"),
  };
}
