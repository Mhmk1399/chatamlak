export function createMongoFileJobs({ mongoRepository: R, storageProvider, fs, path, uploadRootDir, getSetting }) {
  const s = R.store;
  const chunkArray = (items = [], size = 500) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
  const computeExpiryIso = (createdAt = new Date(), days = Number(getSetting("MESSAGE_FILE_RETENTION")) || 0) => days > 0 ? new Date(new Date(createdAt).getTime() + days * 86400000).toISOString() : null;
  async function deleteUnusedFiles(files, provider = storageProvider) {
    let removed = 0;
    for (const file of files) {
      if (await s.count("chat_message_files", { stored_name: file.stored_name })) continue;
      const key = file.storage_key;
      if (["remote", "s3"].includes(file.storage_driver) && key && provider?.deleteFile) {
        if (!await s.count("chat_message_files", { $or: [{ storage_key: key }, { thumb_storage_key: key }] })) { try { await provider.deleteFile(key); removed++; } catch { /* Retry through orphan cleanup. */ } }
      } else {
        const name = path.basename(String(file.stored_name || ""));
        if (name) { try { await fs.promises.unlink(path.join(uploadRootDir, name)); removed++; } catch (error) { if (error.code !== "ENOENT") throw error; } }
      }
      const thumb = file.thumb_storage_key;
      if (thumb && !await s.count("chat_message_files", { thumb_storage_key: thumb })) {
        if (["remote", "s3"].includes(file.storage_driver)) { try { await provider?.deleteFile(thumb); } catch { /* Retry later. */ } }
        else { const target = path.resolve(uploadRootDir, thumb); if (target.startsWith(`${path.resolve(uploadRootDir)}${path.sep}`)) { try { await fs.promises.unlink(target); } catch { /* Missing thumbnail is harmless. */ } } }
      }
    }
    return removed;
  }
  async function removeRelated(files) {
    const names = [...new Set(files.map((row) => row.stored_name))];
    const shared = await s.many("chat_message_files", { stored_name: { $in: names } });
    const ids = [...new Set(shared.map((row) => row.message_id))];
    const rows = await s.many("chat_messages", { id: { $in: ids } }, { projection: { id: 1, chat_id: 1 } });
    const allFiles = await R.removeMessages(ids);
    await deleteUnusedFiles(allFiles);
    const deletedByChat = new Map();
    for (const row of rows) { if (!deletedByChat.has(row.chat_id)) deletedByChat.set(row.chat_id, []); deletedByChat.get(row.chat_id).push(row.id); }
    return { deletedMessageIds: ids, deletedByChat, changed: Boolean(ids.length), removedMessages: ids.length, removedFiles: allFiles.length };
  }
  async function prune(options, avatars) {
    const provider = options.storageProvider || storageProvider;
    if (!provider || !["s3", "remote"].includes(provider.type)) return { prunedCount: 0, prunedKeys: [] };
    const cutoff = new Date(Date.now() - (options.maxAgeMs ?? 3600000)).toISOString();
    const referenced = new Set();
    for (const row of await s.many("chat_message_files")) for (const key of [row.storage_key, row.thumb_storage_key]) if (key) referenced.add(key);
    for (const [collection, field] of [["users", "avatar_url"], ["chats", "group_avatar_url"], ["remote_channel_sources", "source_avatar_url"]]) for (const row of await s.many(collection, { [field]: { $ne: null } })) { const url = String(row[field] || ""); referenced.add(url.replace(/^\/?(?:api\/)?uploads\/avatars\//, "uploads/avatars/")); }
    const pending = await s.many("pending_presigned_uploads", { created_at: { $gte: cutoff } });
    for (const row of pending) referenced.add(row.storage_key);
    const objects = options.storageKeys ? options.storageKeys.map((key) => ({ key })) : await provider.listObjects(avatars ? "uploads/avatars/" : "uploads/messages/");
    const prunedKeys = [];
    for (const object of objects) {
      if (!object.key.startsWith(avatars ? "uploads/avatars/" : "uploads/messages/")) continue;
      if (referenced.has(object.key) || !object.lastModified && !options.storageKeys || object.lastModified && new Date(object.lastModified).toISOString() >= cutoff) continue;
      try { await provider.deleteFile(object.key); prunedKeys.push(object.key); } catch { /* Leave unreachable objects for the next run. */ }
    }
    await s.remove("pending_presigned_uploads", { created_at: { $lt: cutoff }, storage_key: { $in: prunedKeys } });
    return { prunedCount: prunedKeys.length, prunedKeys };
  }
  return {
    chunkArray, computeExpiryIso, cleanupDeletedFiles: deleteUnusedFiles,
    async cleanupMissingMessageFiles() {
      const files = await s.many("chat_message_files", { storage_driver: "local" });
      const missing = files.filter((file) => file.stored_name && !fs.existsSync(path.join(uploadRootDir, path.basename(file.stored_name))));
      return missing.length ? removeRelated(missing) : { deletedMessageIds: [], deletedByChat: new Map(), changed: false };
    },
    async cleanupExpiredMessageFiles() {
      if (!(Number(getSetting("MESSAGE_FILE_RETENTION")) > 0)) return { removedMessages: 0, removedFiles: 0 };
      const files = await s.many("chat_message_files", { expires_at: { $ne: null, $lte: new Date().toISOString() } });
      return files.length ? removeRelated(files) : { removedMessages: 0, removedFiles: 0 };
    },
    async backfillMessageFileExpiry() {
      const days = Number(getSetting("MESSAGE_FILE_RETENTION")); if (!(days > 0)) return 0;
      const rows = await s.many("chat_message_files", { $or: [{ expires_at: null }, { expires_at: "" }] });
      for (const row of rows) await s.update("chat_message_files", { id: row.id }, { expires_at: computeExpiryIso(row.created_at, days) });
      return rows.length;
    },
    removeAllMessageUploads() {
      const root = path.resolve(uploadRootDir);
      if (path.basename(root) !== "messages" || path.basename(path.dirname(root)) !== "uploads") throw new Error("Unexpected message upload directory.");
      if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
      fs.mkdirSync(root, { recursive: true });
    },
    pruneOrphanRemoteObjects: (options = {}) => prune(options, false),
    pruneOrphanAvatarObjects: (options = {}) => prune(options, true),
  };
}
