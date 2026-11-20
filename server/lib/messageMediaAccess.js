function resolveMaybePromise(value) {
  return value && typeof value.then === "function" ? value : Promise.resolve(value);
}

export function getSessionActorId(session) {
  const id = session?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function isExplicitlyPublicChannel(chat) {
  return (
    String(chat?.type || "").toLowerCase() === "channel" &&
    String(chat?.group_visibility ?? chat?.groupVisibility ?? "").toLowerCase() ===
      "public"
  );
}

/**
 * Authorize access to a file that belongs to a chat message.
 *
 * Public-channel media is intentionally readable without a session. Every
 * other chat type requires a current session and a current membership check,
 * so a removed member loses media access immediately.
 */
export async function authorizeMessageFileAccess({
  req,
  res,
  file,
  requireSession,
  getSessionFromRequest,
  findMessageById,
  findChatById,
  isMember,
  loadMessage,
  loadChat,
}) {
  const messageId = file?.message_id ?? file?.messageId ?? null;
  if (!messageId) {
    res.status(404).end();
    return null;
  }

  const message = await resolveMaybePromise(
    typeof findMessageById === "function"
      ? findMessageById(messageId)
      : loadMessage?.(messageId),
  );
  const resolvedMessage =
    message ||
    (typeof loadMessage === "function"
      ? await resolveMaybePromise(loadMessage(messageId))
      : null);
  const chatId = resolvedMessage?.chat_id ?? resolvedMessage?.chatId ?? null;
  if (!resolvedMessage || !chatId) {
    res.status(404).end();
    return null;
  }

  const chat = await resolveMaybePromise(
    typeof findChatById === "function"
      ? findChatById(chatId)
      : loadChat?.(chatId),
  );
  const resolvedChat =
    chat ||
    (typeof loadChat === "function"
      ? await resolveMaybePromise(loadChat(chatId))
      : null);
  if (!resolvedChat) {
    res.status(404).end();
    return null;
  }

  if (isExplicitlyPublicChannel(resolvedChat)) {
    return {
      actorId: null,
      chat: resolvedChat,
      chatId,
      isPublic: true,
      message: resolvedMessage,
    };
  }

  let session = null;
  if (typeof requireSession === "function") {
    session = await resolveMaybePromise(requireSession(req, res));
  } else if (typeof getSessionFromRequest === "function") {
    session = await resolveMaybePromise(getSessionFromRequest(req));
    if (!session) res.status(401).json({ error: "Not authenticated." });
  } else {
    res.status(503).json({ error: "Media authorization is unavailable." });
  }
  if (!session) return null;

  const actorId = getSessionActorId(session);
  if (!actorId) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  if (typeof isMember !== "function") {
    res.status(503).json({ error: "Media authorization is unavailable." });
    return null;
  }
  const currentMember = await resolveMaybePromise(isMember(chatId, actorId));
  if (!currentMember) {
    res.status(403).json({ error: "Access denied." });
    return null;
  }

  return {
    actorId,
    chat: resolvedChat,
    chatId,
    isPublic: false,
    message: resolvedMessage,
  };
}

export function setMessageMediaCacheHeaders(res, authorization) {
  res.setHeader(
    "Cache-Control",
    authorization?.isPublic
      ? "public, max-age=31536000, immutable"
      : "private, no-store",
  );
}
