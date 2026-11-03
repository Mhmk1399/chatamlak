export async function cleanupMongoTextMessages(repository, days, emitChatEvent) {
  if (!(days > 0)) return { removedMessages: 0 };
  const rows = await repository.store.aggregate("chat_messages", [
    { $match: { expires_at: { $ne: null, $lte: new Date().toISOString() }, hidden_everyone_at: null } },
    { $lookup: { from: "chat_message_files", localField: "id", foreignField: "message_id", as: "files" } },
    { $match: { "files.0": { $exists: false } } }, { $limit: 1000 }, { $project: { _id: 0, id: 1, chat_id: 1 } },
  ]);
  if (!rows.length) return { removedMessages: 0 };
  await repository.removeMessages(rows.map((row) => row.id));
  for (const chatId of new Set(rows.map((row) => row.chat_id))) emitChatEvent(chatId, { type: "chat_message_deleted", chatId, messageIds: rows.filter((row) => row.chat_id === chatId).map((row) => row.id) });
  return { removedMessages: rows.length };
}

export async function backfillMongoTextExpiry(repository, days) {
  if (!(days > 0)) return 0;
  const rows = await repository.store.aggregate("chat_messages", [
    { $match: { $or: [{ expires_at: null }, { expires_at: "" }], hidden_everyone_at: null, body: { $type: "string", $nin: ["", null], $not: /^\[\[system:/ } } },
    { $lookup: { from: "chat_message_files", localField: "id", foreignField: "message_id", as: "files" } },
    { $match: { "files.0": { $exists: false } } }, { $project: { _id: 0, id: 1, created_at: 1 } },
  ]);
  for (const row of rows) await repository.setMessageExpiresAt(row.id, new Date(Date.parse(row.created_at) + days * 86400000).toISOString());
  return rows.length;
}
