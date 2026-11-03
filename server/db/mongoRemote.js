const now = () => new Date().toISOString();
export function createRemoteRepository(s, R) {
  const skip = { status: "skipped", locked_at: null, lock_owner: null, processed_at: now() };
  return {
    getRemoteChannelSourceByChatId: (chatId) => s.one("remote_channel_sources", { chat_id: chatId }),
    getRemoteChannelSourceById: (id) => Number.isFinite(Number(id)) && Number(id) > 0 ? s.one("remote_channel_sources", { id: Number(id) }) : Promise.resolve(null),
    async upsertRemoteChannelSource(payload = {}) {
      if (!payload.chatId) return null;
      return s.transaction(async () => {
        const filter = { chat_id: payload.chatId };
        const current = await s.one("remote_channel_sources", filter);
        const values = { provider: String(payload.provider || "telegram").toLowerCase(), source_raw: String(payload.sourceRaw || "").trim() || null, source_chat_id: String(payload.sourceChatId || "").trim() || null, source_username: String(payload.sourceUsername || "").replace(/^@+/, "").toLowerCase() || null, source_url: payload.sourceUrl || null };
        const changed = current && Object.keys(values).some((key) => String(current[key] || "") !== String(values[key] || ""));
        const patch = { ...values, enabled: payload.enabled ? 1 : 0, sync_metadata: payload.syncMetadata ? 1 : 0, stream_media: payload.streamMedia ? 1 : 0, source_version: Math.max(1, Number(current?.source_version || 1)) + (changed ? 1 : 0), last_error: null, updated_at: now(), ...(changed ? { source_title: null, source_avatar_url: null, last_remote_message_id: null } : {}) };
        const row = await s.upsert("remote_channel_sources", filter, patch);
        if (current && (changed || !payload.enabled)) await s.update("remote_channel_queue", { source_id: current.id, status: { $in: ["pending", "retry", "processing"] } }, { ...skip, processed_at: now(), last_error: changed ? "Remote source changed before this item was mirrored." : "Remote Channel was disabled before this item was mirrored." });
        return row;
      });
    },
    listEnabledRemoteChannelSources: (provider = "telegram") => s.many("remote_channel_sources", { provider, enabled: 1 }, { sort: { id: 1 } }),
    async updateRemoteChannelSourceSeen(id, payload = {}) {
      const current = await R.getRemoteChannelSourceById(id); if (!current) return 0;
      const patch = { updated_at: now() };
      for (const [from, to] of Object.entries({ sourceChatId: "source_chat_id", sourceUsername: "source_username", sourceTitle: "source_title", sourceAvatarUrl: "source_avatar_url" })) if (Object.hasOwn(payload, from)) patch[to] = String(payload[from] || "").trim() || null;
      if (Number(payload.lastRemoteMessageId) > Number(current.last_remote_message_id || 0)) patch.last_remote_message_id = Math.trunc(Number(payload.lastRemoteMessageId));
      if (payload.touch !== false) patch.last_seen_at = now();
      if (payload.clearError !== false) patch.last_error = null;
      if (payload.touch === false && Object.keys(patch).every((key) => key === "updated_at" || patch[key] === current[key])) return 0;
      return s.update("remote_channel_sources", { id: Number(id) }, patch);
    },
    async updateRemoteChannelSourceError(id, error) { const value = String(error || "").slice(0, 1000) || null; const row = await R.getRemoteChannelSourceById(id); return row && row.last_error !== value ? s.update("remote_channel_sources", { id: Number(id) }, { last_error: value, updated_at: now() }) : 0; },
    updateRemoteChannelSourcePaused: (id, paused) => s.update("remote_channel_sources", { id: Number(id) }, { paused: Number(Boolean(paused)), updated_at: now() }),
    async getCurrentRemoteChannelQueueItemId(id) { return (await s.one("remote_channel_queue", { source_id: Number(id), status: { $in: ["pending", "retry", "processing"] } }, { sort: { id: 1 } }))?.id || null; },
    async skipCurrentRemoteChannelQueueItem(id) { const target = await R.getCurrentRemoteChannelQueueItemId(id); return target ? R.markRemoteChannelQueueItemSkipped(target, "Manually skipped.") : 0; },
    skipAllRemoteChannelQueueItems: (id) => s.update("remote_channel_queue", { source_id: Number(id), status: { $in: ["pending", "retry", "processing"] } }, { ...skip, processed_at: now(), last_error: "Manually skipped." }),
    getRemoteChannelProviderState: (provider = "telegram") => s.one("remote_channel_provider_state", { provider }),
    async setRemoteChannelProviderState(provider = "telegram", payload = {}) {
      const patch = { updated_at: now() };
      for (const [from, to] of Object.entries({ nextUpdateOffset: "next_update_offset", lastError: "last_error", lastPolledAt: "last_polled_at" })) if (Object.hasOwn(payload, from)) patch[to] = payload[from];
      return s.upsert("remote_channel_provider_state", { provider }, patch);
    },
    async enqueueRemoteChannelQueueItem(payload = {}) {
      if (!payload.sourceId || !payload.payloadJson) return null;
      try { return await s.insert("remote_channel_queue", { source_id: Number(payload.sourceId), provider: payload.provider || "telegram", telegram_update_id: payload.telegramUpdateId == null ? null : Number(payload.telegramUpdateId), telegram_message_id: payload.telegramMessageId == null ? null : Number(payload.telegramMessageId), source_version: Math.max(1, Number(payload.sourceVersion || 1)), payload_json: String(payload.payloadJson) }); }
      catch (error) { if (error.code === 11000) return null; throw error; }
    },
    async getRemoteChannelQueueSummary(id) { const rows = await s.aggregate("remote_channel_queue", [{ $match: { source_id: Number(id) } }, { $group: { _id: "$status", status: { $first: "$status" }, count: { $sum: 1 } } }]); return Object.fromEntries(rows.map((row) => [row.status, row.count])); },
    releaseStaleRemoteChannelQueueItems: (cutoff) => s.update("remote_channel_queue", { status: "processing", locked_at: { $lte: cutoff, $ne: null } }, { status: "retry", locked_at: null, lock_owner: null, next_attempt_at: now() }),
    async claimNextRemoteChannelQueueItem(lockOwner, timestamp = now()) {
      const sources = await s.many("remote_channel_sources", { enabled: 1, paused: 0 });
      const sourceIds = [];
      for (const source of sources) if ((await R.findChatById(source.chat_id))?.type === "channel") sourceIds.push(source.id);
      const rows = await s.many("remote_channel_queue", { source_id: { $in: sourceIds }, status: { $in: ["pending", "retry"] }, $or: [{ next_attempt_at: null }, { next_attempt_at: "" }, { next_attempt_at: { $lte: timestamp } }] }, { sort: { created_at: 1, id: 1 }, limit: 100 });
      for (const row of rows) {
        const source = sources.find((source) => source.id === row.source_id);
        if (source.source_version !== row.source_version || source.provider !== row.provider) continue;
        // Compare-and-set is atomic across workers; a losing claimant never
        // returns an item that another process has already leased.
        const claimed = await s.modify("remote_channel_queue", { id: row.id, status: { $in: ["pending", "retry"] } }, { $set: { status: "processing", locked_at: timestamp, lock_owner: lockOwner || "remote-channel-worker" } });
        if (!claimed) continue;
        const chat = await R.findChatById(source.chat_id);
        return { ...source, ...claimed, chat_id: source.chat_id, current_source_version: source.source_version, target_chat_name: chat.name, created_by_user_id: chat.created_by_user_id };
      }
      return null;
    },
    markRemoteChannelQueueItemDone: (id, messageId) => s.update("remote_channel_queue", { id: Number(id) }, { status: "done", locked_at: null, lock_owner: null, last_error: null, created_message_id: messageId || null, processed_at: now() }),
    markRemoteChannelQueueItemSkipped: (id, reason) => s.update("remote_channel_queue", { id: Number(id) }, { ...skip, processed_at: now(), last_error: String(reason || "Skipped").slice(0, 1000) }),
    markRemoteChannelQueueItemRetry: (id, payload = {}) => s.modify("remote_channel_queue", { id: Number(id) }, { $set: { status: payload.failed ? "failed" : "retry", next_attempt_at: payload.failed ? null : payload.nextAttemptAt || now(), locked_at: null, lock_owner: null, last_error: String(payload.error || "").slice(0, 1000) || null }, $inc: { attempts: 1 } }),
    purgeOldRemoteChannelQueueItems: (cutoff) => s.remove("remote_channel_queue", { status: { $in: ["done", "skipped", "failed"] }, processed_at: { $lt: cutoff, $ne: null } }),
  };
}
