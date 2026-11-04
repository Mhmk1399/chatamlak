import { isValidUuid } from "../lib/uuidUtils.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const cursorEncode = (value) => value ? Buffer.from(JSON.stringify(value)).toString("base64url") : null;

export function registerMessagingRoutes(app, deps) {
  const db = deps.messagingDb;
  const wrap = (handler) => async (req, res) => {
    try {
      const user = await deps.requireSession(req, res);
      if (!user) return;
      if (!db) throw fail(503, "Messaging tools are unavailable.");
      return await handler(req, res, user);
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to complete this operation." }); }
  };
  const member = async (chatId, user) => {
    if (!isValidUuid(String(chatId || ""))) throw fail(400, "A valid chat is required.");
    if (!await deps.isMember(chatId, user.id)) throw fail(403, "Not a member of this chat.");
    const chat = await deps.findChatById(chatId);
    if (!chat) throw fail(404, "Chat not found.");
    return chat;
  };
  const manager = async (chatId, user, ownerOnly = false) => {
    const chat = await member(chatId, user);
    const role = String(await deps.getChatMemberRole(chatId, user.id)).toLowerCase();
    if (!(ownerOnly ? ["owner"] : ["owner", "admin"]).includes(role)) throw fail(403, "Administrator permission required.");
    return chat;
  };
  const message = async (chatId, messageId, user) => {
    await member(chatId, user);
    const row = isValidUuid(String(messageId || "")) && await deps.findMessageById(messageId);
    if (!row || row.chat_id !== chatId || row.hidden_everyone_at) throw fail(404, "Message not available.");
    return row;
  };
  const changed = (chatId) => deps.emitChatEvent(chatId, { type: "chat_tools_updated", chatId });

  const callMember = async (chatId, user) => {
    const chat = await member(chatId, user);
    if (chat.type !== "group") throw fail(400, "Group calls require a group chat.");
    if (!deps.getSetting("CALL")) throw fail(403, "Calls are disabled by the server.");
    return chat;
  };
  const callChanged = (chatId) => deps.emitChatEvent(chatId, { type: "group_call_updated", chatId });
  app.get("/api/messaging/chats/:chatId/call", wrap(async (req, res, user) => {
    await callMember(req.params.chatId, user);
    return res.json({ peers: await db.groupPeers(req.params.chatId), maxParticipants: 6 });
  }));
  app.post("/api/messaging/chats/:chatId/call/join", wrap(async (req, res, user) => {
    await callMember(req.params.chatId, user);
    if (typeof req.body.video !== "boolean") throw fail(400, "Choose a call type.");
    if (req.body.video && !deps.getSetting("CALL_VIDEO")) throw fail(403, "Video calls are disabled.");
    const peer = await db.joinGroupCall(req.params.chatId, user.id, req.body.video);
    if (!peer) throw fail(409, "This group call has reached its limit of six participants.");
    callChanged(req.params.chatId);
    return res.status(201).json({ peerId: peer.id, peers: await db.groupPeers(req.params.chatId), maxParticipants: 6 });
  }));
  app.post("/api/messaging/chats/:chatId/call/heartbeat", wrap(async (req, res, user) => {
    await callMember(req.params.chatId, user);
    const peer = await db.groupPeer(req.body.peerId);
    if (!peer || peer.user_id !== user.id || peer.chat_id !== req.params.chatId) throw fail(404, "Call session expired. Join again.");
    await db.touchGroupPeer(peer.id, user.id);
    return res.json({ peers: await db.groupPeers(req.params.chatId) });
  }));
  app.post("/api/messaging/chats/:chatId/call/leave", wrap(async (req, res, user) => {
    const peer = await db.groupPeer(req.body.peerId);
    if (peer && peer.user_id === user.id && peer.chat_id === req.params.chatId) {
      await db.leaveGroupCall(peer.id, user.id);
      callChanged(req.params.chatId);
    }
    return res.json({ ok: true });
  }));
  app.post("/api/messaging/chats/:chatId/call/signal", wrap(async (req, res, user) => {
    await callMember(req.params.chatId, user);
    const { peerId, targetPeerId, kind, data } = req.body;
    if (!["offer", "answer", "ice"].includes(kind) || !data || typeof data !== "object" || Buffer.byteLength(JSON.stringify(data)) > 65536) throw fail(400, "Invalid call signal.");
    const [from, target] = await Promise.all([db.groupPeer(peerId), db.groupPeer(targetPeerId)]);
    if (!from || !target || from.user_id !== user.id || from.chat_id !== req.params.chatId || target.chat_id !== req.params.chatId) throw fail(403, "Call participants do not match this group.");
    if (!await deps.isMember(req.params.chatId, target.user_id)) throw fail(403, "The participant has left this group.");
    const recipient = await deps.findUserById(target.user_id);
    if (!recipient || Number(recipient.banned)) throw fail(404, "Participant unavailable.");
    deps.emitSseEvent(recipient.username, { type: "group_call_signal", chatId: req.params.chatId, fromPeerId: from.id, targetPeerId: target.id, kind, data });
    return res.json({ ok: true });
  }));

  app.get("/api/messaging/preferences", wrap(async (_req, res, user) => res.json({ preferences: await db.preferences(user.id) })));
  app.put("/api/messaging/chats/:chatId/preference", wrap(async (req, res, user) => {
    await member(req.params.chatId, user);
    const patch = {};
    for (const field of ["pinned", "archived"]) {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] !== "boolean") throw fail(400, "Invalid preference.");
        patch[field] = req.body[field] ? 1 : 0;
      }
    }
    if (req.body.folder !== undefined) {
      if (typeof req.body.folder !== "string" || req.body.folder.length > 60) throw fail(400, "Folder name must be at most 60 characters.");
      patch.folder = req.body.folder.trim();
    }
    if (!Object.keys(patch).length) throw fail(400, "No preference supplied.");
    const preference = await db.setPreference(user.id, req.params.chatId, patch);
    changed(req.params.chatId);
    return res.json({ preference });
  }));
  app.get("/api/messaging/chats/:chatId", wrap(async (req, res, user) => {
    await member(req.params.chatId, user);
    const ids = req.query.ids ? String(req.query.ids).split(",") : [];
    if (ids.length > 200 || ids.some((id) => !isValidUuid(id))) throw fail(400, "Invalid message list.");
    return res.json({ ...await db.messageExtras(req.params.chatId, user.id, ids), policy: await db.policy(req.params.chatId) });
  }));
  app.get("/api/messaging/chats/:chatId/changes", wrap(async (req, res, user) => {
    await member(req.params.chatId, user);
    const ids = String(req.query.ids || "").split(",").filter(Boolean);
    if (!ids.length || ids.length > 200 || ids.some((id) => !isValidUuid(id))) throw fail(400, "Invalid message list.");
    return res.json({ messages: await db.messageChanges(user.id, req.params.chatId, ids) });
  }));
  app.put("/api/messaging/chats/:chatId/reaction", wrap(async (req, res, user) => {
    await message(req.params.chatId, req.body.messageId, user);
    if (!["👍", "❤️", "😂", "🎉", "😮", "😢", "👎"].includes(req.body.emoji) || typeof req.body.active !== "boolean") throw fail(400, "Invalid reaction.");
    await db.react(req.body.messageId, user.id, req.body.emoji, req.body.active);
    changed(req.params.chatId);
    return res.json({ ok: true });
  }));
  app.put("/api/messaging/chats/:chatId/pin", wrap(async (req, res, user) => {
    await manager(req.params.chatId, user);
    await message(req.params.chatId, req.body.messageId, user);
    if (typeof req.body.active !== "boolean") throw fail(400, "Invalid pin state.");
    await db.pin(req.params.chatId, req.body.messageId, user.id, req.body.active);
    changed(req.params.chatId);
    return res.json({ ok: true });
  }));
  app.get("/api/messaging/search", wrap(async (req, res, user) => {
    const chatId = req.query.chatId;
    if (chatId) await member(chatId, user);
    const query = text(req.query.q, 200);
    if (!query) throw fail(400, "Enter a search query (up to 200 characters).");
    let cursor = null;
    if (req.query.cursor) {
      try { cursor = JSON.parse(Buffer.from(String(req.query.cursor), "base64url").toString()); } catch { throw fail(400, "Invalid search cursor."); }
      if (!isValidUuid(cursor?.id) || !Number.isFinite(Date.parse(cursor?.time))) throw fail(400, "Invalid search cursor.");
    }
    for (const field of ["before", "after"]) if (req.query[field] && !Number.isFinite(Date.parse(req.query[field]))) throw fail(400, "Invalid search date.");
    const result = await db.search(user.id, { query, chatId, cursor, sender: text(req.query.sender, 100), before: req.query.before, after: req.query.after });
    return res.json({ ...result, nextCursor: cursorEncode(result.nextCursor) });
  }));
  app.get("/api/messaging/chats/:chatId/media", wrap(async (req, res, user) => {
    await member(req.params.chatId, user);
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw fail(400, "Invalid media page.");
    return res.json(await db.media(user.id, req.params.chatId, offset, req.query.kind));
  }));
  app.get("/api/messaging/sync", wrap(async (req, res, user) => {
    const after = Number(req.query.after || 0);
    if (!Number.isSafeInteger(after) || after < 0) throw fail(400, "Invalid sync cursor.");
    return res.json(await db.sync(user.id, after));
  }));
  app.get("/api/messaging/devices", wrap(async (req, res, user) => {
    return res.json({ devices: await db.devices(user.id, deps.parseCookies(req).sid) });
  }));
  app.delete("/api/messaging/devices/:id", wrap(async (req, res, user) => {
    const token = await db.deviceToken(user.id, req.params.id);
    if (!token) throw fail(404, "Session not found.");
    await deps.deleteSession(token);
    deps.disconnectSession?.(token);
    if (token === deps.parseCookies(req).sid) deps.clearSessionCookie(req, res);
    return res.json({ ok: true });
  }));
  app.get("/api/messaging/chats/:chatId/scheduled", wrap(async (req, res, user) => {
    await member(req.params.chatId, user);
    return res.json({ messages: await db.schedules(user.id, req.params.chatId) });
  }));
  app.post("/api/messaging/chats/:chatId/scheduled", wrap(async (req, res, user) => {
    await member(req.params.chatId, user);
    const denied = await deps.ensureChatPublishAllowed?.(req.params.chatId, user.id);
    if (denied) throw fail(denied.status, denied.error);
    const body = text(req.body.body, Number(deps.getSetting("MESSAGE_MAX_CHARS") || 4000));
    const due = Date.parse(req.body.dueAt);
    if (!body || !Number.isFinite(due) || due < Date.now() + 10000 || due > Date.now() + 366 * 86400000) throw fail(400, "Choose a message and a time between 10 seconds and one year from now.");
    const context = {};
    if (req.body.replyToMessageId) { await message(req.params.chatId, req.body.replyToMessageId, user); context.replyToMessageId = req.body.replyToMessageId; }
    if (req.body.topicId) {
      const topic = isValidUuid(String(req.body.topicId)) && await db.topic(req.body.topicId);
      if (!topic || topic.chat_id !== req.params.chatId || Number(topic.closed)) throw fail(400, "Topic unavailable.");
      context.topicId = topic.id;
    }
    return res.status(201).json(await db.schedule(user.id, req.params.chatId, body, new Date(due).toISOString(), context));
  }));
  app.delete("/api/messaging/scheduled/:id", wrap(async (req, res, user) => {
    if (!await db.cancelSchedule(user.id, req.params.id)) throw fail(404, "Scheduled message no longer available.");
    return res.json({ ok: true });
  }));
  app.post("/api/messaging/chats/:chatId/polls", wrap(async (req, res, user) => {
    await member(req.params.chatId, user);
    const denied = await deps.ensureChatPublishAllowed?.(req.params.chatId, user.id);
    if (denied) throw fail(denied.status, denied.error);
    const question = text(req.body.question, 300);
    const options = Array.isArray(req.body.options) ? req.body.options.map((option) => text(option, 100)) : [];
    if (!question || options.length < 2 || options.length > 10 || options.some((option) => !option) || new Set(options).size !== options.length) throw fail(400, "A poll needs a question and 2–10 different options.");
    const poll = await db.createPoll(req.params.chatId, user.id, question, options);
    deps.emitChatEvent(req.params.chatId, { type: "chat_message", chatId: req.params.chatId, messageId: poll.messageId, username: user.username });
    changed(req.params.chatId);
    return res.status(201).json(poll);
  }));
  app.put("/api/messaging/polls/:id/vote", wrap(async (req, res, user) => {
    const poll = await db.poll(req.params.id);
    if (!poll) throw fail(404, "Poll not found.");
    await message(poll.chat_id, poll.message_id, user);
    if (Number(poll.closed)) throw fail(409, "This poll is closed.");
    const option = req.body.option;
    if (!Number.isInteger(option) || option < 0 || option >= await db.pollOptionCount(poll)) throw fail(400, "Invalid poll option.");
    await db.vote(poll.id, user.id, option);
    changed(poll.chat_id);
    return res.json({ ok: true });
  }));
  app.post("/api/messaging/polls/:id/close", wrap(async (req, res, user) => {
    const poll = await db.poll(req.params.id);
    if (!poll) throw fail(404, "Poll not found.");
    await member(poll.chat_id, user);
    if (poll.user_id !== user.id) await manager(poll.chat_id, user);
    await db.closePoll(poll.id);
    changed(poll.chat_id);
    return res.json({ ok: true });
  }));
  app.post("/api/messaging/chats/:chatId/topics", wrap(async (req, res, user) => {
    const chat = await manager(req.params.chatId, user);
    if (chat.type !== "group") throw fail(400, "Topics are available in groups.");
    const title = text(req.body.title, 80);
    if (!title) throw fail(400, "Enter a topic name (up to 80 characters).");
    const topic = await db.createTopic(req.params.chatId, user.id, title);
    changed(req.params.chatId);
    return res.status(201).json({ topic });
  }));
  app.put("/api/messaging/chats/:chatId/topic", wrap(async (req, res, user) => {
    const row = await message(req.params.chatId, req.body.messageId, user);
    if (row.user_id !== user.id) await manager(req.params.chatId, user);
    const topic = req.body.topicId ? await db.topic(req.body.topicId) : null;
    if (req.body.topicId && (!topic || topic.chat_id !== req.params.chatId || Number(topic.closed))) throw fail(400, "Topic unavailable.");
    await db.assignTopic(row.id, topic?.id || null);
    changed(req.params.chatId);
    return res.json({ ok: true });
  }));
  app.put("/api/messaging/chats/:chatId/topics/:topicId", wrap(async (req, res, user) => {
    await manager(req.params.chatId, user);
    const topic = await db.topic(req.params.topicId);
    if (!topic || topic.chat_id !== req.params.chatId) throw fail(404, "Topic not found.");
    if (typeof req.body.closed !== "boolean") throw fail(400, "Invalid topic state.");
    await db.setTopicClosed(topic.id, req.body.closed);
    changed(req.params.chatId);
    return res.json({ ok: true });
  }));
  app.put("/api/messaging/chats/:chatId/policy", wrap(async (req, res, user) => {
    const chat = await manager(req.params.chatId, user);
    if (chat.type !== "group") throw fail(400, "Group settings required.");
    const { slowSeconds, membersCanSend, membersCanUpload } = req.body;
    if (!Number.isInteger(slowSeconds) || slowSeconds < 0 || slowSeconds > 3600 || typeof membersCanSend !== "boolean" || typeof membersCanUpload !== "boolean") throw fail(400, "Invalid group settings.");
    await db.setPolicy(req.params.chatId, { slow_seconds: slowSeconds, members_can_send: +membersCanSend, members_can_upload: +membersCanUpload });
    changed(req.params.chatId);
    return res.json({ ok: true });
  }));
  app.put("/api/messaging/chats/:chatId/role", wrap(async (req, res, user) => {
    await manager(req.params.chatId, user, true);
    if (!isValidUuid(String(req.body.userId || "")) || !["admin", "member"].includes(req.body.role)) throw fail(400, "Invalid member role.");
    if (!await deps.isMember(req.params.chatId, req.body.userId) || String(await deps.getChatMemberRole(req.params.chatId, req.body.userId)) === "owner") throw fail(400, "This member cannot be changed.");
    await deps.setChatMemberRole(req.params.chatId, req.body.userId, req.body.role);
    changed(req.params.chatId);
    return res.json({ ok: true });
  }));
}
