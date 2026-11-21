import crypto from "node:crypto";
import path from "node:path";
import rateLimit from "express-rate-limit";
import { storageEncryption as defaultStorageEncryption } from "../lib/storageEncryption.js";
import { dbKnex } from "../db/query.js";
import { dispatchMediaWorkerJob } from "../lib/mediaWorker.js";
import { ensureBucketCorsForRequest } from "../lib/bucketCors.js";
import { resolveWebhookCallbackUrl } from "../lib/webhookUrl.js";
import { resolveThumbUrl } from "../lib/thumbUrl.js";
import { readEnvBool } from "../settings/env.js";
import { safeErrorCode } from "../lib/requestLogging.js";
import {
  createServiceReplayGuard,
  verifyServiceAuth,
} from "../../shared/serviceAuth.js";
import {
  authorizeMessageFileAccess,
  getSessionActorId,
  setMessageMediaCacheHeaders,
} from "../lib/messageMediaAccess.js";

export function registerRemoteUploadRoutes(app, deps) {
  const workerCallbackReplayGuard = deps.workerCallbackReplayGuard ||
    createServiceReplayGuard({ maxEntries: 10_000 });
  const {
    storageProvider,
    mediaQueueManager,
    adminGetRow,
    adminRun,
    adminSave,
    getSession,
    createMessageFiles,
    findMessageFileById,
    findMessageById,
    findChatById,
    isMember,
    emitChatEvent,
    recordPendingPresignedUpload,
    findPendingPresignedUpload,
    removePendingPresignedUploads,
    storageProcessingMode = "auto",
    s3ProcessingMode = "auto",
    webhookSecret,
    workerUrl =
      deps.workerUrl ||
      deps.mediaWorkerUrl ||
      process.env.WORKER_URL ||
      process.env.MEDIA_WORKER_URL ||
      null,
    mediaWorkerUrl =
      deps.workerUrl ||
      deps.mediaWorkerUrl ||
      process.env.WORKER_URL ||
      process.env.MEDIA_WORKER_URL ||
      null,
    requireSession,
    getSessionFromRequest,
    storageEncryption = defaultStorageEncryption,
    enqueueVideoTranscodeJob = deps.enqueueVideoTranscodeJob,
    listMessageFilesByMessageIds = deps.listMessageFilesByMessageIds,
    ALLOWED_AVATAR_MIME_TYPES = deps.ALLOWED_AVATAR_MIME_TYPES,
    AVATAR_FILE_LIMITS = deps.AVATAR_FILE_LIMITS,
    uploadFiles = deps.uploadFiles,
  } = deps;

  function toSql(builder, p = []) {
    if (builder && typeof builder.toSQL === "function") {
      const c = builder.toSQL();
      return { sql: c.sql, params: c.bindings || [] };
    }
    return { sql: builder, params: p };
  }

  const callAdminGetRow = (builder, p) => {
    const { sql, params } = toSql(builder, p);
    return adminGetRow(sql, params);
  };
  const callAdminRun = (builder, p) => {
    const { sql, params } = toSql(builder, p);
    return adminRun(sql, params);
  };

  const parseCookies = (cookieHeader = "") => {
    const list = {};
    cookieHeader.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      if (parts.length >= 2) {
        list[parts.shift().trim()] = decodeURIComponent(parts.join("=").trim());
      }
    });
    return list;
  };

  const authenticateSession = async (req, res) => {
    if (typeof requireSession === "function") {
      return await requireSession(req, res);
    }
    let session = null;
    if (typeof getSessionFromRequest === "function") {
      const rawSession = getSessionFromRequest(req);
      session = rawSession && typeof rawSession.then === "function" ? await rawSession : rawSession;
    } else if (typeof getSession === "function") {
      const cookies = parseCookies(req.headers.cookie || "");
      const token =
        cookies.sid || req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const rawSession = getSession(token);
      session = rawSession && typeof rawSession.then === "function" ? await rawSession : rawSession;
    }
    if (!session) {
      res.status(401).json({ error: "Not authenticated." });
      return null;
    }
    return session;
  };

  const resolveMaybePromise = async (value) =>
    value && typeof value.then === "function" ? await value : value;

  const loadMessage = async (messageId) => {
    let message = null;
    if (typeof findMessageById === "function") {
      message = await resolveMaybePromise(findMessageById(messageId));
    }
    if (!message && typeof adminGetRow === "function") {
      message = await resolveMaybePromise(
        callAdminGetRow(dbKnex("chat_messages").where("id", messageId).first()),
      );
    }
    return message;
  };

  const loadChat = async (chatId) => {
    let chat = null;
    if (typeof findChatById === "function") {
      chat = await resolveMaybePromise(findChatById(chatId));
    }
    if (!chat && typeof adminGetRow === "function") {
      chat = await resolveMaybePromise(
        callAdminGetRow(dbKnex("chats").where("id", chatId).first()),
      );
    }
    return chat;
  };

  const loadPendingUpload = async (storageKey) => {
    if (!storageKey || typeof findPendingPresignedUpload !== "function") {
      return null;
    }
    return await resolveMaybePromise(findPendingPresignedUpload(storageKey));
  };

  const recordPendingUpload = async (binding) => {
    if (typeof recordPendingPresignedUpload !== "function") {
      throw new Error("Pending upload ownership storage is unavailable.");
    }
    return await resolveMaybePromise(recordPendingPresignedUpload(binding));
  };

  const removePendingUpload = async (storageKey) => {
    if (!storageKey || typeof removePendingPresignedUploads !== "function") {
      throw new Error("Pending upload ownership storage is unavailable.");
    }
    return await resolveMaybePromise(removePendingPresignedUploads([storageKey]));
  };

  const extractInsertedFileId = (inserted) => {
    const first = Array.isArray(inserted) ? inserted[0] : inserted;
    if (first === null || first === undefined || first === "") return null;
    if (typeof first === "string" || typeof first === "number") return first;
    return first?.id ?? null;
  };

  const requireOwnedMessageTarget = async ({
    actorId,
    messageId,
    requestedChatId,
    res,
  }) => {
    const message = await loadMessage(messageId);
    if (!message) {
      res.status(404).json({ error: "Message not found." });
      return null;
    }
    const messageOwnerId = message.user_id ?? message.userId ?? null;
    if (!messageOwnerId || String(messageOwnerId) !== String(actorId)) {
      res.status(403).json({ error: "Access denied." });
      return null;
    }
    const chatId = message.chat_id ?? message.chatId ?? null;
    if (!chatId || (requestedChatId && String(requestedChatId) !== String(chatId))) {
      res.status(400).json({ error: "Upload target does not match the message chat." });
      return null;
    }
    if (typeof isMember !== "function") {
      res.status(503).json({ error: "Upload authorization is unavailable." });
      return null;
    }
    const member = await resolveMaybePromise(isMember(chatId, actorId));
    if (!member) {
      res.status(403).json({ error: "Access denied." });
      return null;
    }
    return { chatId, message };
  };

  const requireChatTarget = async ({ actorId, chatId, res }) => {
    if (!chatId) {
      res.status(400).json({ error: "chatId or messageId is required." });
      return null;
    }
    const chat = await loadChat(chatId);
    if (!chat) {
      res.status(404).json({ error: "Chat not found." });
      return null;
    }
    if (typeof isMember !== "function") {
      res.status(503).json({ error: "Upload authorization is unavailable." });
      return null;
    }
    const member = await resolveMaybePromise(isMember(chatId, actorId));
    if (!member) {
      res.status(403).json({ error: "Access denied." });
      return null;
    }
    return { chat, chatId };
  };

  const authorizeFileRequest = (req, res, file) =>
    authorizeMessageFileAccess({
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
    });

  const presignRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: "Too many upload requests. Please slow down." }),
  });

  // POST /api/uploads/presign
  app.post("/api/uploads/presign", presignRateLimiter, async (req, res) => {
    const session = await authenticateSession(req, res);
    if (!session) return;

    // Self-heal bucket CORS from the request's own origin (covers domains
    // attached after first boot — no redeploy needed). Best-effort: presign
    // continues regardless of the outcome. Opt-in via STORAGE_AUTO_CORS=true.
    if (
      (deps.getSetting && deps.getSetting("STORAGE_AUTO_CORS")) ||
      String(process.env.STORAGE_AUTO_CORS ?? "false").toLowerCase() ===
        "true" ||
      String(process.env.STORAGE_AUTO_CORS ?? "false") === "1"
    ) {
      try {
        const corsResult = await ensureBucketCorsForRequest(
          storageProvider,
          req,
        );
        if (corsResult.status === "applied") {
          console.log(JSON.stringify({
            service: "ouj-chat",
            event: "uploads.cors_applied",
          }));
        } else if (corsResult.status === "error") {
          console.warn(JSON.stringify({
            service: "ouj-chat",
            event: "uploads.cors_failed",
            errorCode: "bucket_cors_failed",
          }));
        }
      } catch (_) {}
    }

    const {
      filename,
      originalName,
      contentType,
      mimeType,
      fileSize,
      sizeBytes,
      width,
      height,
      duration,
      clientWebpThumbBase64,
      blurhash,
      waveform,
      messageId,
      encryptionType,
      encryption_type,
      uploadType,
      uploadPurpose,
      purpose,
      chatId,
      clientRequestId,
    } = req.body || {};

    const name = filename || originalName || "upload.bin";
    const mime = contentType || mimeType || "application/octet-stream";
    const size = Number(fileSize ?? sizeBytes ?? 0);

    const isAvatarUpload = String(uploadType || "").toLowerCase() === "avatar";
    const actorId = getSessionActorId(session);
    if (!actorId) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    if (isAvatarUpload) {
      const avatarLimit =
        AVATAR_FILE_LIMITS?.maxFileSizeBytes ||
        deps.AVATAR_FILE_LIMITS?.maxFileSizeBytes ||
        10 * 1024 * 1024;

      if (!size || size <= 0 || size > avatarLimit) {
        return res
          .status(400)
          .json({ error: "File size exceeds maximum allowed limit." });
      }

      const allowedMimes =
        ALLOWED_AVATAR_MIME_TYPES ||
        deps.ALLOWED_AVATAR_MIME_TYPES ||
        new Set([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/bmp",
        ]);

      if (!allowedMimes.has(String(mime || "").toLowerCase())) {
        return res
          .status(400)
          .json({ error: "Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image." });
      }

      if (
        !storageProvider ||
        (storageProvider.type !== "remote" && storageProvider.type !== "s3") ||
        typeof storageProvider.getUploadUrl !== "function"
      ) {
        return res.json({
          success: true,
          type: "local",
        });
      }

      const ext = path.extname(name).toLowerCase() || ".png";
      const generatedName = `avatar-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
      const generatedKey = `uploads/avatars/${generatedName}`;

      try {
        const uploadResult = await storageProvider.getUploadUrl({
          filename: generatedName,
          contentType: mime,
          fileSize: size,
          key: generatedKey,
        });

        const finalStorageKey =
          uploadResult.storageKey || uploadResult.key || generatedKey;
        const providerType = storageProvider.type || uploadResult.type || "s3";

        await recordPendingUpload({
          storageKey: finalStorageKey,
          userId: actorId,
          chatId: chatId || null,
          messageId: null,
          clientRequestId: clientRequestId || null,
          purpose: String(uploadPurpose || purpose || "profile-avatar").toLowerCase(),
        });

        return res.json({
          success: true,
          type: providerType,
          uploadUrl: uploadResult.uploadUrl,
          storageKey: finalStorageKey,
          avatarUrl: `/api/uploads/avatars/${generatedName}`,
        });
      } catch (err) {
        console.warn(JSON.stringify({
          service: "ouj-chat",
          event: "uploads.avatar_presign_failed",
          errorCode: safeErrorCode(err, "presign_failed"),
        }));
        return res.status(500).json({
          error: "Failed to generate presigned upload URL.",
        });
      }
    }

    const maxLimit =
      deps.MESSAGE_FILE_LIMITS?.maxFileSizeBytes ||
      (deps.getSetting ? deps.getSetting("FILE_UPLOAD_MAX_SIZE") : null) ||
      100 * 1024 * 1024;

    if (!size || size <= 0 || size > maxLimit) {
      return res
        .status(400)
        .json({ error: "File size exceeds maximum allowed limit." });
    }

    const ext = path.extname(name).toLowerCase();
    const generatedKey = `uploads/messages/${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;

    const targetMsgId = messageId || null;
    let targetChatId = chatId || null;
    const normalizedClientRequestId = String(clientRequestId || "").trim();
    if (normalizedClientRequestId.length > 120) {
      return res.status(400).json({ error: "clientRequestId is too long." });
    }
    if (!targetMsgId && !normalizedClientRequestId) {
      return res.status(400).json({
        error: "clientRequestId is required before a message is created.",
      });
    }
    if (targetMsgId) {
      const target = await requireOwnedMessageTarget({
        actorId,
        messageId: targetMsgId,
        requestedChatId: targetChatId,
        res,
      });
      if (!target) return;
      targetChatId = target.chatId;
    } else {
      const target = await requireChatTarget({
        actorId,
        chatId: targetChatId,
        res,
      });
      if (!target) return;
      targetChatId = target.chatId;
    }

    if (
      !storageProvider ||
      typeof storageProvider.getUploadUrl !== "function"
    ) {
      return res
        .status(500)
        .json({ error: "Storage provider not configured." });
    }

    try {
      const uploadResult = await storageProvider.getUploadUrl({
        filename: name,
        contentType: mime,
        fileSize: size,
        key: generatedKey,
      });

      const finalStorageKey =
        uploadResult.storageKey || uploadResult.key || generatedKey;
      const providerType = storageProvider.type || uploadResult.type || "s3";

      let kind = "document";
      if (mime.startsWith("image/")) kind = "image";
      else if (mime.startsWith("video/")) kind = "video";
      else if (mime.startsWith("audio/")) kind = "audio";

      const transcodeEnabled = deps.getSetting
        ? Boolean(deps.getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS"))
        : readEnvBool("FILE_UPLOAD_TRANSCODE_VIDEOS", true);

      const fileObj = {
        kind,
        originalName: name,
        storedName: path.basename(finalStorageKey),
        mimeType: mime,
        sizeBytes: size,
        widthPx: Number.isFinite(Number(width)) ? Number(width) : null,
        heightPx: Number.isFinite(Number(height)) ? Number(height) : null,
        durationSeconds: Number.isFinite(Number(duration))
          ? Number(duration)
          : null,
        processingStatus: (kind === "video" && !transcodeEnabled) ? "ready" : "pending",
        storageDriver: providerType,
        storageKey: finalStorageKey,
        blurhash: clientWebpThumbBase64 || blurhash || null,
        waveform: waveform
          ? typeof waveform === "string"
            ? waveform
            : JSON.stringify(waveform)
          : null,
        encryptionType:
          encryptionType ||
          encryption_type ||
          process.env.STORAGE_ENCRYPTION_MODE ||
          "remote",
      };

      await recordPendingUpload({
        storageKey: finalStorageKey,
        userId: actorId,
        chatId: targetChatId,
        messageId: targetMsgId,
        clientRequestId: normalizedClientRequestId || null,
        purpose: "message",
      });

      let fileId = null;
      if (targetMsgId && typeof createMessageFiles === "function") {
        const inserted = await resolveMaybePromise(
          createMessageFiles(targetMsgId, [fileObj]),
        );
        fileId = extractInsertedFileId(inserted);
      }
      if (!fileId && targetMsgId && typeof adminGetRow === "function") {
        const row = await resolveMaybePromise(callAdminGetRow(
          dbKnex("chat_message_files")
            .select("id")
            .where("storage_key", finalStorageKey)
            .orderBy("id", "desc")
            .first(),
        ));
        fileId = row?.id || null;
      }

      return res.json({
        success: true,
        type: providerType,
        uploadUrl: uploadResult.uploadUrl,
        storageKey: finalStorageKey,
        fileId,
      });
    } catch (err) {
      console.warn(JSON.stringify({
        service: "ouj-chat",
        event: "uploads.message_presign_failed",
        errorCode: safeErrorCode(err, "presign_failed"),
      }));
      return res.status(500).json({
        error: "Failed to generate presigned upload URL.",
      });
    }
  });

  // POST /api/uploads/complete
  app.post("/api/uploads/complete", async (req, res) => {
    const session = await authenticateSession(req, res);
    if (!session) return;
    const actorId = getSessionActorId(session);
    if (!actorId) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const { fileId, storageKey } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required." });
    }

    let file = null;
    if (typeof findMessageFileById === "function") {
      const raw = findMessageFileById(fileId);
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file && typeof adminGetRow === "function") {
      const raw = callAdminGetRow(dbKnex("chat_message_files").where("id", fileId).first());
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }

    if (!file) {
      return res.status(404).json({ error: "File not found." });
    }

    if (storageKey && file.storage_key && file.storage_key !== storageKey) {
      return res.status(400).json({ error: "Storage key mismatch." });
    }

    const finalStorageKey = file.storage_key || storageKey || null;
    if (!finalStorageKey || typeof findPendingPresignedUpload !== "function") {
      return res
        .status(503)
        .json({ error: "Upload ownership verification is unavailable." });
    }
    const target = await requireOwnedMessageTarget({
      actorId,
      messageId: file.message_id,
      requestedChatId: null,
      res,
    });
    if (!target) return;

    const pending = await loadPendingUpload(finalStorageKey);
    const completedAt = file.upload_completed_at ?? file.uploadCompletedAt ?? null;
    if (!pending) {
      if (!completedAt) {
        return res.status(403).json({ error: "Upload ownership could not be verified." });
      }
      return res.json({
        success: true,
        fileId,
        status: file.processing_status || file.processingStatus || "ready",
        deduped: true,
      });
    }
    const pendingActorId = pending.user_id ?? pending.userId ?? null;
    const pendingChatId = pending.chat_id ?? pending.chatId ?? null;
    const pendingMessageId = pending.message_id ?? pending.messageId ?? null;
    const pendingPurpose = String(pending.purpose || "").toLowerCase();
    if (
      String(pendingActorId || "") !== String(actorId) ||
      pendingPurpose !== "message" ||
      String(pendingMessageId || "") !== String(file.message_id || "") ||
      String(target.chatId) !== String(pendingChatId || "")
    ) {
      return res.status(403).json({ error: "Access denied." });
    }

    const currentStatus = file.processing_status || file.processingStatus || null;
    if (completedAt && currentStatus === "ready") {
      await removePendingUpload(finalStorageKey);
      return res.json({
        success: true,
        fileId,
        status: currentStatus,
        deduped: true,
      });
    }

    const mode = String(
      deps.storageProcessingMode || storageProcessingMode || "auto",
    ).toLowerCase();
    const isVideo = String(file.mime_type || file.mimeType || "")
      .toLowerCase()
      .startsWith("video/");

    const transcodeEnabled = deps.getSetting
      ? Boolean(deps.getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS"))
      : readEnvBool("FILE_UPLOAD_TRANSCODE_VIDEOS", true);

    let newStatus = "ready";
    if (transcodeEnabled) {
      if (mode === "remote") {
        newStatus = "pending";
      } else if (isVideo) {
        newStatus = "pending";
      }
    }

    if (typeof adminRun === "function") {
      await resolveMaybePromise(callAdminRun(
        dbKnex("chat_message_files").where("id", fileId).update({
          processing_status: newStatus,
          upload_completed_at: completedAt || new Date().toISOString(),
        }),
      ));
      if (typeof adminSave === "function") {
        await resolveMaybePromise(adminSave());
      }
    }

    if (isVideo && transcodeEnabled) {
      dispatchMediaWorkerJob({
        workerUrl:
          (deps.getSetting && deps.getSetting("WORKER_URL")) ||
          deps.workerUrl ||
          deps.mediaWorkerUrl ||
          workerUrl ||
          mediaWorkerUrl ||
          process.env.WORKER_URL ||
          process.env.MEDIA_WORKER_URL ||
          null,
        mediaWorkerUrl:
          (deps.getSetting && deps.getSetting("WORKER_URL")) ||
          deps.workerUrl ||
          deps.mediaWorkerUrl ||
          workerUrl ||
          mediaWorkerUrl ||
          process.env.WORKER_URL ||
          process.env.MEDIA_WORKER_URL ||
          null,
        storageProcessingMode: mode,
        storageProcessingTimeoutMs:
          (deps.getSetting && Number(deps.getSetting("STORAGE_PROCESSING_TIMEOUT_MS"))) ||
          deps.storageProcessingTimeoutMs ||
          (process.env.STORAGE_PROCESSING_TIMEOUT_MS ? Number(process.env.STORAGE_PROCESSING_TIMEOUT_MS) : undefined),
        workerPort: deps.workerPort || process.env.WORKER_PORT || "8080",
        webhookSecret:
          deps.webhookSecret !== undefined
            ? deps.webhookSecret
            : webhookSecret || process.env.WEBHOOK_SECRET || null,
        callbackUrl: deps.webhookCallbackUrl || resolveWebhookCallbackUrl(),
        fileId: file.id || fileId,
        storageKey: file.storage_key || storageKey,
        storedName: file.stored_name || file.storedName,
        mimeType: file.mime_type || file.mimeType || "video/mp4",
        encryptionType: file.encryption_type || file.encryptionType || "none",
        fetchImpl: deps.fetchImpl || globalThis.fetch,
        transcodeEnabled,
      }).catch(() => {});
    }

    if (newStatus === "pending" && mediaQueueManager?.scheduleFallbackCheck) {
      const scheduled = await resolveMaybePromise(mediaQueueManager.scheduleFallbackCheck({
        fileId,
        storageKey: file.storage_key || storageKey,
      }));
      if (scheduled?.accepted === false && scheduled.reason !== "remote_mode") {
        res.setHeader("Retry-After", "5");
        return res.status(503).json({
          error: "Media processing queue is temporarily unavailable.",
          retryable: true,
        });
      }
    }

    await removePendingUpload(finalStorageKey);

    return res.json({
      success: true,
      fileId,
      status: newStatus,
    });
  });

  // GET /api/uploads/thumbs/:fileId — serves video thumbnails.
  app.get("/api/uploads/thumbs/:fileId", async (req, res) => {
    const fileId = req.params?.fileId;
    if (!fileId) return res.status(404).end();

    let file = null;
    if (typeof findMessageFileById === "function") {
      const raw = findMessageFileById(fileId);
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file && typeof adminGetRow === "function") {
      const raw = callAdminGetRow(dbKnex("chat_message_files").where("id", fileId).first());
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file) return res.status(404).end();

    const authorization = await authorizeFileRequest(req, res, file);
    if (!authorization) return;

    const thumbKey = file.thumb_storage_key || file.thumbStorageKey;
    if (!thumbKey) return res.status(404).end();

    const enc = storageEncryption || defaultStorageEncryption;
    const sendJpeg = (buf) => {
      res.setHeader("Content-Type", "image/jpeg");
      setMessageMediaCacheHeaders(res, authorization);
      return res.send(buf);
    };
    // NOTE: filesystem helpers come from deps.* (never shadow node:path).
    const depFs = deps.fs;
    const depPath = deps.path;
    const depUploadRootDir = deps.uploadRootDir;

    // Local disk first (covers local-driver deployments).
    const localPaths = [];
    if (depUploadRootDir && depPath && typeof depPath.join === "function") {
      localPaths.push(depPath.join(depUploadRootDir, String(thumbKey)));
      const base =
        typeof depPath.basename === "function"
          ? depPath.basename(String(thumbKey))
          : String(thumbKey).split("/").pop();
      if (base && base !== String(thumbKey)) {
        localPaths.push(depPath.join(depUploadRootDir, base));
      }
    }
    for (const candidate of localPaths) {
      try {
        if (depFs && typeof depFs.existsSync === "function" && depFs.existsSync(candidate)) {
          try {
            return sendJpeg(enc.decryptBuffer(depFs.readFileSync(candidate)));
          } catch (_) {
            return res.status(500).end();
          }
        }
      } catch (_) {
        return res.status(500).end();
      }
    }

    // Remote object storage: fetch + decrypt (no-op for plaintext).
    try {
      if (
        !storageProvider ||
        typeof storageProvider.getDownloadUrl !== "function"
      ) {
        return res.status(404).end();
      }
      const url = await storageProvider.getDownloadUrl(thumbKey);
      const fetchImpl = deps.fetch || globalThis.fetch;
      const resp = await fetchImpl(url);
      if (!resp || !resp.ok) return res.status(502).end();
      return sendJpeg(enc.decryptBuffer(Buffer.from(await resp.arrayBuffer())));
    } catch (_) {
      return res.status(502).end();
    }
  });

  // POST /api/uploads/webhook/processed
  app.post("/api/uploads/webhook/processed", async (req, res) => {
    const expectedSecret =
      deps.webhookSecret !== undefined ? deps.webhookSecret : webhookSecret;
    if (!String(expectedSecret || "").trim()) {
      return res
        .status(503)
        .json({ error: "Upload processing callback is not configured." });
    }
    const requireSignedWorkerAuth = deps.requireSignedWorkerAuth !== undefined
      ? deps.requireSignedWorkerAuth === true
      : String(process.env.WORKER_REQUIRE_SIGNED_REQUESTS || "").toLowerCase() === "true";
    const signedAuth = verifyServiceAuth({
      headers: req.headers,
      secret: expectedSecret,
      method: req.method,
      path: req.path,
      replayGuard: workerCallbackReplayGuard,
      maxSkewMs: Number(process.env.WORKER_AUTH_MAX_SKEW_MS) || 300_000,
    });
    const headerSecret = String(req.headers["x-ouj-chat-webhook-secret"] || "");
    const expectedBuffer = Buffer.from(String(expectedSecret));
    const providedBuffer = Buffer.from(headerSecret);
    const validSecret =
      expectedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, providedBuffer);
    if (!signedAuth.ok && (requireSignedWorkerAuth || !validSecret)) {
      console.warn(JSON.stringify({
        service: "ouj-chat",
        event: "uploads.webhook_rejected",
        errorCode: signedAuth.code || "invalid_webhook_secret",
      }));
      return res.status(401).json({ error: "Unauthorized webhook request." });
    }

    const {
      fileId,
      status,
      transcodedStorageKey,
      thumbStorageKey,
      width,
      height,
      duration,
    } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required." });
    }
    console.log(JSON.stringify({
      service: "ouj-chat",
      event: "uploads.webhook_received",
      fileId: String(fileId).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 200),
      status: String(status || "ready").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 40),
    }));

    let file = null;
    if (typeof findMessageFileById === "function") {
      const raw = findMessageFileById(fileId);
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file && typeof adminGetRow === "function") {
      const raw = callAdminGetRow(dbKnex("chat_message_files").where("id", fileId).first());
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }

    if (!file) {
      console.warn(JSON.stringify({
        service: "ouj-chat",
        event: "uploads.webhook_unknown_file",
        fileId: String(fileId).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 200),
        errorCode: "file_not_found",
      }));
      return res.status(404).json({ error: "File not found." });
    }

    const finalStatus = status || "ready";
    if (typeof adminRun === "function") {
      const updatePayload = { processing_status: finalStatus };
      if (transcodedStorageKey) {
        updatePayload.storage_key = transcodedStorageKey;
        updatePayload.stored_name = path.basename(transcodedStorageKey);
      }
      if (thumbStorageKey) updatePayload.thumb_storage_key = thumbStorageKey;
      if (Number.isFinite(Number(width)) && Number(width) > 0) {
        updatePayload.width_px = Number(width);
      }
      if (Number.isFinite(Number(height)) && Number(height) > 0) {
        updatePayload.height_px = Number(height);
      }
      if (Number.isFinite(Number(duration)) && Number(duration) >= 0) {
        updatePayload.duration_seconds = Number(duration);
      }
      const rawUpdate = callAdminRun(
        dbKnex("chat_message_files").where("id", fileId).update(updatePayload),
      );
      if (rawUpdate && typeof rawUpdate.then === "function") await rawUpdate;
      if (typeof adminSave === "function") {
        await resolveMaybePromise(adminSave());
      }
    }

    if (mediaQueueManager?.cancelFallbackCheck) {
      mediaQueueManager.cancelFallbackCheck(fileId);
    }

    let chatId = null;
    let messageRow = null;
    if (file.message_id && typeof adminGetRow === "function") {
      const rawMsg = callAdminGetRow(
        dbKnex("chat_messages").where("id", file.message_id).first(),
      );
      messageRow = rawMsg && typeof rawMsg.then === "function" ? await rawMsg : rawMsg;
      chatId = messageRow?.chat_id || null;
    }

    if (typeof emitChatEvent === "function") {
      if (chatId && file.message_id) {
        const rawFiles = typeof listMessageFilesByMessageIds === "function"
          ? listMessageFilesByMessageIds([file.message_id])
          : [];
        const filesForMessage =
          (rawFiles && typeof rawFiles.then === "function" ? await rawFiles : rawFiles) || [];

        const enc = deps.storageEncryption || defaultStorageEncryption;
        const decryptedBody = enc
          ? enc.decryptText(messageRow?.body || "")
          : messageRow?.body || "";

        const resolvedFiles = await Promise.all(
          filesForMessage.map(async (f) => {
            const isTargetFile = String(f.id) === String(fileId);
            const driver = f.storage_driver || f.storageDriver;
            const sKey = (isTargetFile && transcodedStorageKey)
              ? transcodedStorageKey
              : (f.storage_key || f.storageKey);
            const thumbKey = (isTargetFile && thumbStorageKey)
              ? thumbStorageKey
              : (f.thumb_storage_key || f.thumbStorageKey);
            const storedName = f.stored_name || f.storedName || "";
            const resolvedFileId = f?.id ?? (isTargetFile ? fileId : null);
            const fileUrl =
              resolvedFileId !== null && resolvedFileId !== undefined
                ? `/api/uploads/file/${encodeURIComponent(resolvedFileId)}`
                : storedName
                  ? `/api/uploads/messages/${encodeURIComponent(storedName)}`
                  : null;
            let thumbUrl = await resolveThumbUrl({
              storageProvider,
              file: f,
              thumbKey,
              fileId: f?.id ?? fileId,
            });
            const isThisPending = isTargetFile
              ? finalStatus === "pending"
              : (f.processing_status || f.processingStatus) === "pending";

            const fileWidth = isTargetFile && Number.isFinite(Number(width)) && Number(width) > 0
              ? Number(width)
              : Number.isFinite(Number(f.width_px ?? f.widthPx))
                ? Number(f.width_px ?? f.widthPx)
                : null;
            const fileHeight = isTargetFile && Number.isFinite(Number(height)) && Number(height) > 0
              ? Number(height)
              : Number.isFinite(Number(f.height_px ?? f.heightPx))
                ? Number(f.height_px ?? f.heightPx)
                : null;
            const fileDuration = isTargetFile && Number.isFinite(Number(duration)) && Number(duration) >= 0
              ? Number(duration)
              : Number.isFinite(Number(f.duration_seconds ?? f.durationSeconds))
                ? Number(f.duration_seconds ?? f.durationSeconds)
                : null;

            return {
              id: f.id,
              kind: f.kind,
              name: f.original_name || f.originalName || "",
              mimeType: f.mime_type || f.mimeType || "",
              processing: isThisPending,
              sizeBytes: Number(f.size_bytes || f.sizeBytes || 0),
              width: fileWidth,
              height: fileHeight,
              durationSeconds: fileDuration,
              blurhash: f.blurhash || null,
              expiresAt: f.expires_at || f.expiresAt || null,
              storageDriver: driver || null,
              storageKey: sKey || null,
              thumbStorageKey: thumbKey || null,
              thumbUrl: thumbUrl || null,
              url: fileUrl,
            };
          }),
        );

        emitChatEvent(chatId, {
          type: "chat_message_updated",
          chatId,
          messageId: file.message_id,
          username: messageRow?.username || "",
          userId: messageRow?.user_id || null,
          body: decryptedBody || "",
          files: resolvedFiles,
        });
      }

      emitChatEvent(chatId, {
        type: "video:ready",
        fileId,
        status: finalStatus,
        storageKey: transcodedStorageKey || file.storage_key,
        thumbStorageKey: thumbStorageKey || file.thumb_storage_key,
      });
    }

    console.log(JSON.stringify({
      service: "ouj-chat",
      event: "uploads.webhook_processed",
      fileId: String(fileId).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 200),
      status: String(finalStatus).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 40),
    }));
    return res.json({ success: true });
  });

  // POST /api/uploads (fallback multipart upload for an existing message)
  const fallbackUploadMiddleware =
    uploadFiles && typeof uploadFiles.single === "function"
      ? uploadFiles.single("file")
      : (_req, _res, next) => next();
  app.post("/api/uploads", fallbackUploadMiddleware, async (req, res) => {
    const session = await authenticateSession(req, res);
    if (!session) return;
    const actorId = getSessionActorId(session);
    if (!actorId) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    if (deps.getSetting && !deps.getSetting("FILE_UPLOAD")) {
      return res
        .status(503)
        .json({ error: "File uploads are disabled on this server." });
    }

    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    if (!file) {
      return res.status(400).json({ error: "Upload file is required." });
    }
    const messageId = String(req.body?.messageId || "").trim();
    if (!messageId) {
      return res.status(400).json({ error: "messageId is required." });
    }
    const target = await requireOwnedMessageTarget({
      actorId,
      messageId,
      requestedChatId: req.body?.chatId || null,
      res,
    });
    if (!target) return;

    const filename =
      req.body?.filename || file?.originalname || file?.name || "upload.bin";
    const mimeType =
      req.body?.contentType ||
      req.body?.mimeType ||
      file?.mimetype ||
      file?.type ||
      "application/octet-stream";
    const fileSize = Number(
      req.body?.fileSize || req.body?.size || file?.size || 0,
    );

    const storedName = path.basename(file.filename || file.name || "");
    if (!storedName) {
      return res.status(500).json({ error: "Uploaded file was not stored." });
    }
    const generatedKey = `uploads/messages/${storedName}`;

    let kind = "document";
    if (mimeType.startsWith("image/")) kind = "image";
    else if (mimeType.startsWith("video/")) kind = "video";
    else if (mimeType.startsWith("audio/")) kind = "audio";

    const fileObj = {
      kind,
      originalName: filename,
      storedName,
      mimeType,
      sizeBytes: fileSize,
      widthPx: Number.isFinite(Number(req.body?.width))
        ? Number(req.body?.width)
        : null,
      heightPx: Number.isFinite(Number(req.body?.height))
        ? Number(req.body?.height)
        : null,
      durationSeconds: Number.isFinite(Number(req.body?.duration))
        ? Number(req.body?.duration)
        : null,
      processingStatus: "ready",
      storageDriver: "local",
      storageKey: generatedKey,
      blurhash: req.body?.clientWebpThumbBase64 || req.body?.blurhash || null,
      waveform: req.body?.waveform
        ? typeof req.body.waveform === "string"
          ? req.body.waveform
          : JSON.stringify(req.body.waveform)
        : null,
      encryptionType: "local",
    };

    if (typeof createMessageFiles !== "function") {
      return res.status(503).json({ error: "File metadata storage is unavailable." });
    }
    const inserted = await resolveMaybePromise(
      createMessageFiles(messageId, [fileObj]),
    );

    let fileId = extractInsertedFileId(inserted);
    if (!fileId && typeof adminGetRow === "function") {
      const row = await resolveMaybePromise(callAdminGetRow(
        dbKnex("chat_message_files")
          .select("id")
          .where("storage_key", generatedKey)
          .orderBy("id", "desc")
          .first(),
      ));
      fileId = row?.id || null;
    }
    if (!fileId) {
      return res.status(500).json({ error: "Unable to persist uploaded file." });
    }

    return res.json({
      success: true,
      fileId,
      url: `/api/uploads/file/${fileId}`,
      filename,
      mimeType,
      fileSize,
      waveform: fileObj.waveform,
      blurhash: fileObj.blurhash,
    });
  });

  // GET /api/uploads/file/:id
  app.get("/api/uploads/file/:id", async (req, res) => {
    const idParam = req.params?.id;
    if (!idParam) return res.status(404).end();

    let file = null;
    if (typeof findMessageFileById === "function") {
      const raw = findMessageFileById(idParam);
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file && typeof adminGetRow === "function") {
      const raw = callAdminGetRow(
        dbKnex("chat_message_files")
          .where((builder) => {
            builder.where("id", idParam).orWhere("stored_name", idParam).orWhere("storage_key", idParam);
          })
          .first(),
      );
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }

    if (!file) return res.status(404).end();
    const authorization = await authorizeFileRequest(req, res, file);
    if (!authorization) return;
    setMessageMediaCacheHeaders(res, authorization);

    const driver = file.storage_driver || file.storageDriver;
    if (driver === "s3" || driver === "remote") {
      if (
        !storageProvider ||
        typeof storageProvider.getDownloadUrl !== "function"
      ) {
        return res
          .status(500)
          .json({ error: "Storage provider not available." });
      }

      try {
        const downloadUrl = await storageProvider.getDownloadUrl(
          file.storage_key,
        );

        const encType = file.encryption_type || "remote";
        if (
          encType === "remote" ||
          encType === "none" ||
          encType === "provider_sse"
        ) {
          return res.redirect(302, downloadUrl);
        }

        if (
          encType === "local" ||
          encType === "app" ||
          encType === "aes-256-gcm"
        ) {
          const fetchImpl = deps.fetch || globalThis.fetch;
          const resp = await fetchImpl(downloadUrl);
          if (!resp.ok) return res.status(resp.status).end();

          const arrayBuf = await resp.arrayBuffer();
          const cipherBuf = Buffer.from(arrayBuf);
          const decrypted = (
            deps.storageEncryption || defaultStorageEncryption
          ).decryptBuffer(cipherBuf);

          if (file.mime_type) res.type(file.mime_type);
          return res.send(decrypted);
        }

        return res.redirect(302, downloadUrl);
      } catch (err) {
        console.warn(JSON.stringify({
          service: "ouj-chat",
          event: "uploads.download_failed",
          fileId: String(idParam).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 200),
          errorCode: safeErrorCode(err, "download_failed"),
        }));
        return res
          .status(500)
          .json({ error: "Download failed." });
      }
    }

    // Local storage is served by the range-aware stored-name route, which
    // repeats the same authorization check before opening the file.
    const storedName = path.basename(file.stored_name || file.storedName || "");
    if (!storedName) return res.status(404).end();
    return res.redirect(
      302,
      `/api/uploads/messages/${encodeURIComponent(storedName)}`,
    );
  });
}
