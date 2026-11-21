import { readEnvBool } from "../settings/env.js";
import { safeErrorCode } from "./requestLogging.js";
import { createServiceAuthHeaders } from "../../shared/serviceAuth.js";

function logDispatchFailure(event, fileId, error, fields = {}) {
  console.warn(JSON.stringify({
    service: "ouj-chat",
    event,
    fileId: String(fileId || "").slice(0, 200),
    errorCode: safeErrorCode(error, "media_worker_dispatch_failed"),
    ...(Number.isFinite(Number(fields.attempt))
      ? { attempt: Math.max(0, Math.round(Number(fields.attempt))) }
      : {}),
    ...(Number.isFinite(Number(fields.timeoutMs))
      ? { timeoutMs: Math.max(0, Math.round(Number(fields.timeoutMs))) }
      : {}),
  }));
}

async function sendTranscodeRequest(workerUrl, payload, webhookSecret, fetchImpl) {
  if (!workerUrl) return false;
  let cleanUrl = String(workerUrl).trim();
  while (cleanUrl.endsWith("/")) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  const endpoint = `${cleanUrl}/transcode`;
  const signedHeaders = webhookSecret
    ? createServiceAuthHeaders({
        secret: webhookSecret,
        method: "POST",
        path: "/transcode",
      })
    : {};
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signedHeaders,
      ...(webhookSecret ? { "x-ouj-chat-webhook-secret": webhookSecret } : {}),
    },
    body: JSON.stringify(payload),
  });
  return Boolean(res && res.ok);
}

function isLocalWorkerAddress(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "0.0.0.0"
    );
  } catch {
    return url.includes("127.0.0.1") || url.includes("localhost");
  }
}

/**
 * Dispatches video transcoding jobs to an external or local media processing worker via HTTP POST.
 *
 * @param {object} params
 * @param {string} [params.workerUrl] - Base URL of the external worker (e.g. https://worker.onrender.com)
 * @param {string} [params.mediaWorkerUrl] - Deprecated fallback alias for workerUrl
 * @param {string} [params.storageProcessingMode] - Strategy mode: 'auto' (default), 'local', or 'remote'
 * @param {string|number} [params.workerPort] - Port of local worker (default 8080)
 * @param {number} [params.storageProcessingTimeoutMs] - Total time (ms) to retry calling remote worker in auto mode (default: STORAGE_PROCESSING_TIMEOUT_MS or 120000)
 * @param {number} [params.retryDelayMs] - Delay between retry attempts in ms (default 250)
 * @param {string} [params.webhookSecret] - Secret token for x-ouj-chat-webhook-secret header
 * @param {string} [params.callbackUrl] - Ouj Chat callback webhook URL (e.g. https://ouj-chat.example.com/api/uploads/webhook/processed)
 * @param {string|number} params.fileId - File record ID in chat_message_files
 * @param {string} params.storageKey - S3/R2 storage key of raw uploaded file
 * @param {string} [params.storedName] - Original stored name of the file
 * @param {string} [params.mimeType] - MIME type of the uploaded file
 * @param {string} [params.encryptionType] - Encryption mode ('remote', 'none', 'aes-256-gcm', 'local')
 * @param {Function} [params.fetchImpl] - Fetch implementation (defaults to globalThis.fetch)
 * @returns {Promise<boolean>} Whether the dispatch request was successfully accepted
 */
export async function dispatchMediaWorkerJob({
  workerUrl,
  mediaWorkerUrl,
  storageProcessingMode,
  workerPort,
  storageProcessingTimeoutMs,
  retryDelayMs = 250,
  webhookSecret,
  callbackUrl,
  fileId,
  storageKey,
  storedName,
  mimeType,
  encryptionType = "none",
  downloadUrl = null,
  uploadUrl = null,
  thumbUploadUrl = null,
  storageConfig = null,
  fetchImpl = globalThis.fetch,
  transcodeVideos,
  transcodeVideosToH264,
  transcodeEnabled,
  getSetting,
}) {
  if (!fileId) return false;

  const isTranscodeEnabled = () => {
    if (typeof transcodeEnabled === "boolean") return transcodeEnabled;
    if (typeof transcodeVideos === "boolean") return transcodeVideos;
    if (typeof transcodeVideosToH264 === "boolean") return transcodeVideosToH264;
    if (typeof getSetting === "function") {
      const val = getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS");
      if (val !== undefined && val !== null) return Boolean(val);
    }
    return readEnvBool("FILE_UPLOAD_TRANSCODE_VIDEOS", true);
  };

  if (!isTranscodeEnabled()) {
    return false;
  }

  const mode = String(
    storageProcessingMode ||
      process.env.STORAGE_PROCESSING_MODE ||
      "auto",
  ).toLowerCase();

  const effectiveWorkerPort = workerPort || process.env.WORKER_PORT || "8080";
  const localWorkerUrl = `http://127.0.0.1:${effectiveWorkerPort}`;

  const effectiveStorageKey = storageKey || storedName;
  const effectiveStoredName = storedName || storageKey;

  const resolvedCallbackUrl =
    callbackUrl ||
    process.env.WEBHOOK_URL ||
    process.env.WEBHOOK_CALLBACK_URL ||
    process.env.OUJ_CHAT_WEBHOOK_URL ||
    process.env.OUJ_CHAT_WEBHOOK_CALLBACK_URL ||
    null;

  const getPayloadForTarget = (targetWorkerUrl) => {
    let effectiveCallback = resolvedCallbackUrl;
    if (!isLocalWorkerAddress(targetWorkerUrl) && isLocalWorkerAddress(effectiveCallback)) {
      effectiveCallback = null;
    }
    return {
      fileId,
      storageKey: effectiveStorageKey,
      storedName: effectiveStoredName,
      mimeType,
      encryptionType,
      callbackUrl: effectiveCallback,
      ...(downloadUrl ? { downloadUrl } : {}),
      ...(uploadUrl ? { uploadUrl } : {}),
      ...(thumbUploadUrl ? { thumbUploadUrl } : {}),
      ...(storageConfig ? { storageConfig } : {}),
    };
  };

  const configuredRemoteUrl =
    workerUrl !== undefined
      ? workerUrl
      : mediaWorkerUrl !== undefined
      ? mediaWorkerUrl
      : process.env.WORKER_URL || process.env.MEDIA_WORKER_URL || null;

  if (mode === "local") {
    // Mode: local -> calls only the local worker
    try {
      return await sendTranscodeRequest(
        localWorkerUrl,
        getPayloadForTarget(localWorkerUrl),
        webhookSecret,
        fetchImpl,
      );
    } catch (err) {
      logDispatchFailure("media_worker.local_dispatch_failed", fileId, err);
      return false;
    }
  }

  if (mode === "remote") {
    // Mode: remote -> calls only the remote worker without local fallback
    if (!configuredRemoteUrl) {
      return false;
    }
    try {
      return await sendTranscodeRequest(
        configuredRemoteUrl,
        getPayloadForTarget(configuredRemoteUrl),
        webhookSecret,
        fetchImpl,
      );
    } catch (err) {
      logDispatchFailure("media_worker.remote_dispatch_failed", fileId, err);
      return false;
    }
  }

  // Mode: auto (default)
  // If remote worker is configured and not pointing to local host, retry remote worker for STORAGE_PROCESSING_TIMEOUT_MS before falling back to local
  const isRemoteWorkerConfigured =
    Boolean(configuredRemoteUrl) && !isLocalWorkerAddress(configuredRemoteUrl);

  if (isRemoteWorkerConfigured) {
    const timeoutMs = Math.max(
      0,
      Number(
        storageProcessingTimeoutMs !== undefined
          ? storageProcessingTimeoutMs
          : process.env.STORAGE_PROCESSING_TIMEOUT_MS || 120000,
      ),
    );

    const startTime = Date.now();
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const ok = await sendTranscodeRequest(
          configuredRemoteUrl,
          getPayloadForTarget(configuredRemoteUrl),
          webhookSecret,
          fetchImpl,
        );
        if (ok) {
          return true;
        }
      } catch (err) {
        logDispatchFailure("media_worker.remote_dispatch_retry", fileId, err, {
          attempt,
        });
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        break;
      }

      const delay = Math.min(
        retryDelayMs !== undefined ? retryDelayMs : 250,
        timeoutMs - elapsed,
      );
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    logDispatchFailure(
      "media_worker.remote_dispatch_timeout",
      fileId,
      { code: "remote_worker_timeout" },
      { attempt, timeoutMs },
    );
  }

  // Fallback to local worker
  try {
    return await sendTranscodeRequest(
      localWorkerUrl,
      getPayloadForTarget(localWorkerUrl),
      webhookSecret,
      fetchImpl,
    );
  } catch (err) {
    logDispatchFailure("media_worker.local_fallback_failed", fileId, err);
    return false;
  }
}
