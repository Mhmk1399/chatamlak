import { createMessagePublicationService } from "./messagePublicationService.js";

export function createMessagingService(deps) {
  const { messagingDb: db } = deps;
  const publication = createMessagePublicationService(deps);
  let working = false;

  async function publicationError(chatId, userId, hasFiles = false, clientRequestId = null) {
    if (!db) return null;
    if (!await deps.isMember(chatId, userId)) return { status: 403, error: "You are no longer a member of this chat." };
    if (clientRequestId && await deps.findMessageIdByClientRequestId?.(chatId, userId, clientRequestId)) return null;
    const chat = await deps.findChatById(chatId);
    const role = String(await deps.getChatMemberRole(chatId, userId) || "").toLowerCase();
    if (chat?.type === "channel" && !["owner", "admin"].includes(role)) return { status: 403, error: "Only channel administrators can post." };
    if (chat?.type !== "group" || ["owner", "admin"].includes(role)) return null;
    const policy = await db.policy(chatId);
    if (!Number(policy.members_can_send)) return { status: 403, error: "Only group administrators can send messages." };
    if (hasFiles && !Number(policy.members_can_upload)) return { status: 403, error: "Group members cannot upload files." };
    if (Number(policy.slow_seconds) > 0) {
      const last = await db.latestOwnMessage(chatId, userId);
      const time = last?.created_at ? Date.parse(String(last.created_at).replace(" ", "T").replace(/(?<!Z)$/, "Z")) : 0;
      if (Date.now() - time < Number(policy.slow_seconds) * 1000) return { status: 429, error: `Slow mode: wait ${Math.ceil((time + policy.slow_seconds * 1000 - Date.now()) / 1000)} seconds.` };
    }
    return null;
  }

  async function tick() {
    if (!db || working) return;
    working = true;
    try {
      for (const row of await db.dueSchedules()) {
        if (!await db.claimSchedule(row.id)) continue;
        try {
          const user = await deps.findUserById(row.user_id);
          if (!user || Number(user.banned)) throw new Error("Account unavailable.");
          const denied = await publicationError(row.chat_id, user.id, false, `scheduled:${row.id}`);
          if (denied) throw new Error(denied.error);
          const result = await publication.publishTextMessage({ chatId: row.chat_id, userId: user.id, body: row.body,
            username: user.username, clientRequestId: `scheduled:${row.id}`, isUserConnectedFn: deps.isUserConnected });
          await db.finishSchedule(row.id, "sent");
          // Publication is already durable. Notification failures must not turn
          // the scheduled entry into a failed message or cause another send.
          for (const event of result.sseEvents) {
            try { deps.emitChatEvent(event.chatId, event.payload); } catch { /* Durable sync recovers the event. */ }
          }
          if (!result.deduped && result.pushRecipients?.length) {
            try { await deps.sendPushNotificationToUsers?.(result.pushRecipients, { title: user.nickname || user.username, body: row.body, data: { chatId: row.chat_id } }); }
            catch { /* Push is best effort after publication. */ }
          }
        } catch (error) { await db.finishSchedule(row.id, "failed", String(error.message || "Unable to send.")); }
      }
    } finally { working = false; }
  }

  return { publicationError, tick };
}
