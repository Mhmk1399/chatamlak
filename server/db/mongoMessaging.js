import crypto from "node:crypto";
const now = () => new Date().toISOString();
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const all = (...filters) => ({ $and: filters });
export function createMessagingRepository(s, R, encryption, visibleFilter) {
  async function visibleIds(userId, chatId, ids) {
    return (
      await s.many(
        "chat_messages",
        await visibleFilter(userId, chatId, { id: { $in: ids } }),
        { projection: { id: 1 } },
      )
    ).map((row) => row.id);
  }
  const M = {
    async messageChanges(userId, chatId, ids) {
      const rows = await s.many(
        "chat_messages",
        await visibleFilter(userId, chatId, { id: { $in: ids } }),
      );
      const files = await R.listMessageFilesByMessageIds(
        rows.map((row) => row.id),
      );
      return ids.map((id) => {
        const row = rows.find((row) => row.id === id);
        return !row
          ? { id, deleted: true }
          : {
              id,
              body: encryption.decryptText(row.edited_body ?? row.body),
              edited: row.edited || 0,
              read_at: row.read_at,
              read_by_user_id: row.read_by_user_id,
              files: files
                .filter((file) => file.message_id === id)
                .map((file) => ({
                  id: file.id,
                  kind: file.kind,
                  name: file.original_name,
                  mimeType: file.mime_type,
                  sizeBytes: file.size_bytes,
                  width: file.width_px,
                  height: file.height_px,
                  durationSeconds: file.duration_seconds,
                  expiresAt: file.expires_at,
                  processing: Boolean(
                    file.processing_status &&
                    !["ready", "failed"].includes(file.processing_status),
                  ),
                  url: `/api/uploads/file/${file.id}`,
                  thumbUrl: file.thumb_storage_key
                    ? `/api/uploads/thumbs/${file.id}`
                    : null,
                })),
            };
      });
    },
    async groupPeers(chatId) {
      const rows = await s.many(
        "group_call_peers",
        {
          chat_id: chatId,
          updated_at: { $gt: new Date(Date.now() - 45000).toISOString() },
        },
        { sort: { id: 1 } },
      );
      const users = await s.many("users", {
        id: { $in: rows.map((row) => row.user_id) },
      });
      return rows.map((row) => {
        const user = users.find((user) => user.id === row.user_id);
        return {
          ...row,
          username: user?.username || "deleted",
          nickname: user?.nickname || "Deleted user",
        };
      });
    },
    async joinGroupCall(chatId, userId, video) {
      await s.ignore(
        "group_call_rooms",
        { chat_id: chatId },
        { chat_id: chatId, version: 0 },
      );
      return s.transaction(async () => {
        await s.modify(
          "group_call_rooms",
          { chat_id: chatId },
          { $inc: { version: 1 } },
        );
        await s.remove("group_call_peers", {
          chat_id: chatId,
          updated_at: { $lte: new Date(Date.now() - 45000).toISOString() },
        });
        if ((await s.count("group_call_peers", { chat_id: chatId })) >= 6)
          return null;
        return s.insert("group_call_peers", {
          id: crypto.randomUUID(),
          chat_id: chatId,
          user_id: userId,
          video: Number(Boolean(video)),
          updated_at: now(),
        });
      });
    },
    groupPeer: (id) =>
      s.one("group_call_peers", {
        id,
        updated_at: { $gt: new Date(Date.now() - 45000).toISOString() },
      }),
    touchGroupPeer: (id, userId) =>
      s.update(
        "group_call_peers",
        { id, user_id: userId },
        { updated_at: now() },
      ),
    leaveGroupCall: (id, userId) =>
      s.remove("group_call_peers", { id, user_id: userId }),
    preferences: (userId) => s.many("chat_preferences", { user_id: userId }),
    setPreference: (userId, chatId, patch) =>
      s.upsert("chat_preferences", { user_id: userId, chat_id: chatId }, patch),
    async messageExtras(chatId, userId, visible = []) {
      const candidates = visible.length
        ? visible
        : (
            await R.getMessages(chatId, { viewerUserId: userId, limit: 120 })
          ).messages.map((row) => row.id);
      const ids = await visibleIds(userId, chatId, candidates);
      const reactions = await s.many(
        "message_reactions",
        { message_id: { $in: ids } },
        { projection: { message_id: 1, emoji: 1, user_id: 1 } },
      );
      const rawPins = await s.many(
        "chat_pinned_messages",
        { chat_id: chatId },
        { sort: { created_at: -1 }, limit: 100 },
      );
      const pinMessages = await s.many(
        "chat_messages",
        await visibleFilter(userId, chatId, {
          id: { $in: rawPins.map((row) => row.message_id) },
        }),
      );
      const pins = rawPins.filter((pin) =>
        pinMessages.some((row) => row.id === pin.message_id),
      );
      const topics = await s.many(
        "chat_topics",
        { chat_id: chatId },
        { sort: { created_at: 1 } },
      );
      const messageTopics = await s.many(
        "chat_message_topics",
        {
          message_id: { $in: ids },
          topic_id: { $in: topics.map((row) => row.id) },
        },
        { projection: { message_id: 1, topic_id: 1 } },
      );
      const rawPolls = await s.many(
        "chat_polls",
        { chat_id: chatId, message_id: { $in: ids } },
        { sort: { created_at: 1 } },
      );
      const votes = await s.many("chat_poll_votes", {
        poll_id: { $in: rawPolls.map((row) => row.id) },
      });
      const polls = rawPolls.map((row) => {
        const options = JSON.parse(encryption.decryptText(row.options)),
          ballot = votes.filter((vote) => vote.poll_id === row.id);
        return {
          ...row,
          question: encryption.decryptText(row.question),
          options,
          counts: options.map(
            (_, i) => ballot.filter((vote) => vote.option_index === i).length,
          ),
          myVote:
            ballot.find((vote) => vote.user_id === userId)?.option_index ??
            null,
        };
      });
      return {
        reactions,
        pins: pins.map((pin) => pin.message_id),
        pinnedMessages: pins.map((pin) => {
          const row = pinMessages.find((row) => row.id === pin.message_id);
          return {
            id: row.id,
            chatId,
            created_at: row.created_at,
            body: encryption.decryptText(row.edited_body ?? row.body),
          };
        }),
        topics,
        messageTopics,
        polls,
      };
    },
    react: (messageId, userId, emoji, active) =>
      active
        ? s.ignore(
            "message_reactions",
            { message_id: messageId, user_id: userId, emoji },
            { message_id: messageId, user_id: userId, emoji },
          )
        : s.remove("message_reactions", {
            message_id: messageId,
            user_id: userId,
            emoji,
          }),
    pin: (chatId, messageId, userId, active) =>
      active
        ? s.ignore(
            "chat_pinned_messages",
            { chat_id: chatId, message_id: messageId },
            { chat_id: chatId, message_id: messageId, user_id: userId },
          )
        : s.remove("chat_pinned_messages", {
            chat_id: chatId,
            message_id: messageId,
          }),
    createTopic: (chatId, userId, title) =>
      s.insert("chat_topics", {
        id: crypto.randomUUID(),
        chat_id: chatId,
        user_id: userId,
        title,
      }),
    topic: (id) => s.one("chat_topics", { id }),
    assignTopic: (messageId, topicId) =>
      topicId
        ? s.upsert(
            "chat_message_topics",
            { message_id: messageId },
            { topic_id: topicId },
          )
        : s.remove("chat_message_topics", { message_id: messageId }),
    poll: (id) => s.one("chat_polls", { id }),
    async createPoll(chatId, userId, question, options) {
      return s.transaction(async () => {
        const id = crypto.randomUUID();
        const messageId = await R.createMessage(
          chatId,
          userId,
          question,
          null,
          null,
          `poll:${id}`,
        );
        await s.insert("chat_polls", {
          id,
          chat_id: chatId,
          user_id: userId,
          message_id: messageId,
          question: encryption.encryptText(question),
          options: encryption.encryptText(JSON.stringify(options)),
        });
        return { id, messageId };
      });
    },
    vote: (pollId, userId, optionIndex) =>
      s.upsert(
        "chat_poll_votes",
        { poll_id: pollId, user_id: userId },
        { option_index: optionIndex },
      ),
    closePoll: (id) => s.update("chat_polls", { id }, { closed: 1 }),
    pollOptionCount: async (poll) =>
      JSON.parse(encryption.decryptText(poll.options)).length,
    async schedules(userId, chatId) {
      return (
        await s.many(
          "scheduled_messages",
          {
            user_id: userId,
            chat_id: chatId,
            status: { $in: ["pending", "failed"] },
          },
          { sort: { due_at: 1 } },
        )
      ).map((row) => ({ ...row, body: encryption.decryptText(row.body) }));
    },
    async schedule(userId, chatId, body, dueAt, context = {}) {
      return {
        id: (
          await s.insert("scheduled_messages", {
            id: crypto.randomUUID(),
            user_id: userId,
            chat_id: chatId,
            body: encryption.encryptText(body),
            due_at: dueAt,
            status: "pending",
            ...(context.replyToMessageId ? { reply_to_message_id: context.replyToMessageId } : {}),
            ...(context.topicId ? { topic_id: context.topicId } : {}),
          })
        ).id,
      };
    },
    cancelSchedule: (userId, id) =>
      s.update(
        "scheduled_messages",
        { id, user_id: userId, status: { $in: ["pending", "failed"] } },
        { status: "cancelled" },
      ),
    async dueSchedules() {
      return (
        await s.many(
          "scheduled_messages",
          {
            due_at: { $lte: now() },
            $or: [
              { status: "pending" },
              { status: "sending", lease_until: { $lt: now() } },
            ],
          },
          { sort: { due_at: 1 }, limit: 50 },
        )
      ).map((row) => ({ ...row, body: encryption.decryptText(row.body) }));
    },
    claimSchedule: (id) =>
      s.update(
        "scheduled_messages",
        {
          id,
          $or: [
            { status: "pending" },
            { status: "sending", lease_until: { $lt: now() } },
          ],
        },
        {
          status: "sending",
          lease_until: new Date(Date.now() + 120000).toISOString(),
        },
      ),
    finishSchedule: (id, status, error = null) =>
      s.update("scheduled_messages", { id }, { status, error }),
    async policy(chatId) {
      return (
        (await s.one("chat_group_policy", { chat_id: chatId })) || {
          slow_seconds: 0,
          members_can_send: 1,
          members_can_upload: 1,
        }
      );
    },
    setPolicy: (chatId, patch) =>
      s.upsert("chat_group_policy", { chat_id: chatId }, patch),
    latestOwnMessage: (chatId, userId) =>
      s.one(
        "chat_messages",
        { chat_id: chatId, user_id: userId },
        { sort: { created_at: -1, id: -1 } },
      ),
    async search(
      userId,
      { chatId, query = "", cursor, sender, before, after, limit = 30 },
    ) {
      const memberships = await s.many("chat_members", { user_id: userId });
      const allowed = memberships.map((row) => row.chat_id);
      if (chatId && !allowed.includes(chatId))
        return { messages: [], nextCursor: null };
      const filters = [{ chat_id: chatId || { $in: allowed } }];
      if (sender) {
        const user = await R.findUserByUsername(sender);
        if (!user) return { messages: [], nextCursor: null };
        filters.push({ user_id: user.id });
      }
      if (before)
        filters.push({ created_at: { $lte: new Date(before).toISOString() } });
      if (after)
        filters.push({ created_at: { $gte: new Date(after).toISOString() } });
      if (cursor)
        filters.push({
          $or: [
            { created_at: { $lt: cursor.time } },
            { created_at: cursor.time, id: { $lt: cursor.id } },
          ],
        });
      const rows = await s.many(
        "chat_messages",
        await visibleFilter(userId, null, all(...filters)),
        { sort: { created_at: -1, id: -1 }, limit: 500 },
      );
      const normalize = (text) =>
        String(text)
          .normalize("NFKC")
          .replace(/ي/g, "ی")
          .replace(/ك/g, "ک")
          .toLocaleLowerCase();
      const needle = normalize(query),
        messages = [];
      let last;
      for (const row of rows) {
        last = row;
        const body = encryption.decryptText(row.edited_body ?? row.body);
        if (normalize(body).includes(needle)) {
          const user = await R.findUserById(row.user_id);
          messages.push({
            id: row.id,
            chatId: row.chat_id,
            body,
            username: user?.username || "deleted",
            nickname: user?.nickname || "Deleted user",
            created_at: row.created_at,
          });
        }
        if (messages.length >= limit) break;
      }
      return {
        messages,
        nextCursor:
          last && (rows.length === 500 || messages.length === limit)
            ? { time: last.created_at, id: last.id }
            : null,
      };
    },
    async media(userId, chatId, offset = 0, kind = "all") {
      const filter = await visibleFilter(userId, chatId);
      const mime = ["image", "video", "audio"].includes(kind)
        ? { mime_type: new RegExp(`^${kind}/`) }
        : kind === "document"
          ? { mime_type: { $not: /^(image|video|audio)\// } }
          : {};
      const rows = await s.aggregate("chat_messages", [
        { $match: filter },
        { $sort: { created_at: -1, id: -1 } },
        {
          $lookup: {
            from: "chat_message_files",
            localField: "id",
            foreignField: "message_id",
            as: "file",
          },
        },
        { $unwind: "$file" },
        {
          $replaceWith: {
            $mergeObjects: ["$file", { created_at: "$created_at" }],
          },
        },
        {
          $match: {
            $and: [
              mime,
              { $or: [{ expires_at: null }, { expires_at: { $gt: now() } }] },
            ],
          },
        },
        { $sort: { created_at: -1, id: -1 } },
        { $skip: Math.max(0, offset) },
        { $limit: 41 },
        {
          $project: {
            _id: 0,
            id: 1,
            message_id: 1,
            original_name: 1,
            mime_type: 1,
            size_bytes: 1,
            created_at: 1,
          },
        },
      ]);
      return {
        files: rows
          .slice(0, 40)
          .map((row) => ({ ...row, url: `/api/uploads/file/${row.id}` })),
        hasMore: rows.length > 40,
      };
    },
    recordEvent: (chatId, payload) =>
      s.transaction(() =>
        s.event(chatId, {
          type: payload.type,
          messageId: payload.messageId,
          messageIds: payload.messageIds,
        }),
      ),
    async sync(userId, after = 0) {
      const memberships = await s.many("chat_members", { user_id: userId });
      const rows = await s.many(
        "chat_event_log",
        {
          id: { $gt: Number(after) },
          $and: [
            { $or: [{ chat_id: { $in: memberships.map((row) => row.chat_id) } }, { chat_id: null, viewer_user_id: userId }] },
            { $or: [{ viewer_user_id: null }, { viewer_user_id: userId }] },
          ],
        },
        { sort: { id: 1 }, limit: 201 },
      );
      const latest = await s.one("chat_event_log", {}, { sort: { id: -1 } });
      return {
        events: rows
          .slice(0, 200)
          .map((row) => ({
            ...(typeof row.payload === "string"
              ? JSON.parse(row.payload)
              : row.payload),
            sequence: row.id,
          })),
        cursor: rows.length > 200 ? rows[199].id : latest?.id || Number(after),
        hasMore: rows.length > 200,
      };
    },
    recordDevice: (token, label) =>
      s.ignore(
        "session_devices",
        { token_hash: hash(token) },
        {
          token_hash: hash(token),
          label: String(label || "Unknown device").slice(0, 180),
        },
      ),
    async devices(userId, currentToken) {
      const result = [];
      for (const session of await s.many("sessions", { user_id: userId })) {
        const id = hash(session.token),
          device = await s.one("session_devices", { token_hash: id });
        result.push({
          id,
          label: device?.label || "Browser session",
          created_at: session.created_at,
          last_seen: session.last_seen,
          current: session.token === currentToken,
        });
      }
      return result;
    },
    async deviceToken(userId, id) {
      return (
        (await s.many("sessions", { user_id: userId })).find(
          (row) => hash(row.token) === id,
        )?.token || null
      );
    },
  };
  return M;
}
