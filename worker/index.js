import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createStorage } from "./storage.js";
import { decryptFileToTempPath, encryptBuffer, isEncryptedFileBuffer } from "./encryption.js";
import {
  transcodeVideo,
  probeVideoMetadata,
  probeVideoDetails,
  faststartVideo,
  generateThumbnail,
} from "./ffmpeg.js";

const workerDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(workerDir, "..");

process.title = "ouj-chat-worker";

if (typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(path.join(projectRootDir, ".env")); } catch {}
  try { process.loadEnvFile(path.join(workerDir, ".env")); } catch {}
}

const PORT = Number(process.env.PORT || process.env.WORKER_PORT || 8080);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const boundedInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};
const safeLogValue = (value, maxLength = 200) =>
  String(value ?? "")
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, maxLength);
export const workerErrorCode = (error, fallback = "worker_error") =>
  safeLogValue(error?.code || error?.name || fallback, 128) || fallback;
const writeWorkerLog = (level, event, fields = {}) => {
  const entry = {
    service: "ouj-chat-media-worker",
    event: safeLogValue(event, 128),
  };
  for (const key of ["errorCode", "fileId", "jobId"]) {
    if (fields[key] !== undefined && fields[key] !== null) {
      entry[key] = safeLogValue(fields[key]);
    }
  }
  for (const key of ["attempt", "attempts", "delayMs", "status", "sizeBytes"]) {
    const value = Number(fields[key]);
    if (Number.isFinite(value)) entry[key] = Math.max(0, Math.round(value));
  }
  const method = ["error", "warn", "info"].includes(level) ? level : "info";
  console[method](JSON.stringify(entry));
};
const WORKER_CONCURRENCY = boundedInteger(
  process.env.WORKER_CONCURRENCY || process.env.CONCURRENCY,
  2,
  1,
  4,
);
const WORKER_MAX_INPUT_BYTES = boundedInteger(
  process.env.WORKER_MAX_INPUT_BYTES,
  75 * 1024 * 1024,
  1024,
  512 * 1024 * 1024,
);
const WORKER_FETCH_TIMEOUT_MS = boundedInteger(
  process.env.WORKER_FETCH_TIMEOUT_MS,
  5 * 60 * 1000,
  5_000,
  10 * 60 * 1000,
);
const WORKER_MAX_QUEUE_DEPTH = boundedInteger(
  process.env.WORKER_MAX_QUEUE_DEPTH,
  32,
  1,
  256,
);

const storage = createStorage({
  driver: process.env.STORAGE_DRIVER || process.env.STORAGE_DRIVE,
  dataDir: process.env.DATA_DIR,
  endpoint: process.env.STORAGE_ENDPOINT,
  region: process.env.STORAGE_REGION,
  bucket: process.env.STORAGE_BUCKET,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE,
});

export class AsyncQueue {
  constructor(concurrency = 2, maxDepth = 32) {
    this.concurrency = concurrency;
    this.maxDepth = maxDepth;
    this.running = 0;
    this.queue = [];
  }

  push(fn) {
    if (this.queue.length >= this.maxDepth) return false;
    this.queue.push(fn);
    this._next();
    return true;
  }

  _next() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      this.running += 1;
      task()
        .catch((err) => {
          writeWorkerLog("error", "worker.job.failed", {
            errorCode: workerErrorCode(err),
          });
        })
        .finally(() => {
          this.running -= 1;
          this._next();
        });
    }
  }

  get size() {
    return this.queue.length;
  }

  get pending() {
    return this.running;
  }
}

const jobQueue = new AsyncQueue(WORKER_CONCURRENCY, WORKER_MAX_QUEUE_DEPTH);

const tmpDir = path.join(os.tmpdir(), "ouj-chat-media-worker");
fs.mkdirSync(tmpDir, { recursive: true });

const tempPath = (suffix = "") =>
  path.join(
    tmpDir,
    `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${suffix}`,
  );

export const isLoopbackUrl = (url) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
};

const parseAllowedOrigins = (value) => {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const origins = new Set();
  for (const rawValue of rawValues) {
    try {
      const parsed = new URL(rawValue);
      if (["http:", "https:"].includes(parsed.protocol)) origins.add(parsed.origin);
    } catch {
      // Invalid configured origins are ignored and therefore fail closed.
    }
  }
  return origins;
};

const isPrivateIpv4 = (hostname) => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const isPrivateIpv6 = (hostname) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
};

const validateOutboundUrl = (
  rawValue,
  { field, allowedOrigins, allowLoopbackUrls },
) => {
  const value = String(rawValue || "");
  if (!value) return null;
  if (value.length > 4096) return `${field} is too long.`;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return `${field} must be a valid HTTP(S) URL.`;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return `${field} must use HTTP(S).`;
  }
  if (parsed.username || parsed.password) {
    return `${field} must not contain URL credentials.`;
  }
  if (parsed.hash) return `${field} must not contain a fragment.`;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata.azure.internal"
  ) {
    return `${field} targets a forbidden metadata endpoint.`;
  }
  const explicitlyAllowed = allowedOrigins.has(parsed.origin);
  if (isLoopbackUrl(parsed.href)) {
    return allowLoopbackUrls || explicitlyAllowed
      ? null
      : `${field} targets a loopback address that is not allowed.`;
  }
  const ipVersion = net.isIP(hostname);
  if (
    !explicitlyAllowed &&
    ((ipVersion === 4 && isPrivateIpv4(hostname)) ||
      (ipVersion === 6 && isPrivateIpv6(hostname)))
  ) {
    return `${field} targets a private or reserved address.`;
  }
  if (
    !explicitlyAllowed &&
    (hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan") ||
      hostname.endsWith(".home"))
  ) {
    return `${field} targets an internal hostname that is not allowed.`;
  }
  if (!explicitlyAllowed && parsed.protocol !== "https:") {
    return `${field} must use HTTPS unless its origin is explicitly allowed.`;
  }
  return null;
};

const validateStorageKey = (value, field) => {
  const key = String(value || "");
  if (!key) return null;
  if (key.length > 1024) return `${field} is too long.`;
  if (
    key.includes("\0") ||
    key.includes("\\") ||
    key.startsWith("/") ||
    key.split("/").includes("..")
  ) {
    return `${field} must be a relative storage key without traversal.`;
  }
  return null;
};

const createByteLimitTransform = (maxBytes) => {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += Buffer.byteLength(chunk);
      if (received > maxBytes) {
        const error = new Error(`Downloaded bytes exceed the ${maxBytes}-byte processing limit.`);
        error.code = "WORKER_INPUT_TOO_LARGE";
        callback(error);
        return;
      }
      callback(null, chunk);
    },
  });
};

const fetchWithTimeout = (url, options = {}) =>
  fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(WORKER_FETCH_TIMEOUT_MS),
  });

export function validateWorkerJobPayload(
  payload,
  {
    kind,
    allowedOrigins = new Set(),
    allowLoopbackUrls = true,
    maxInputBytes = WORKER_MAX_INPUT_BYTES,
  } = {},
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { status: 400, error: "Request body must be a JSON object." };
  }
  const idField = kind === "mirror" ? "jobId" : "fileId";
  const idValue = String(payload[idField] || "");
  if (idValue.length > 200) {
    return { status: 400, error: `${idField} is too long.` };
  }
  for (const [field, value] of [
    ["storageKey", payload.storageKey],
    ["storedName", payload.storageKey ? null : payload.storedName],
  ]) {
    const error = validateStorageKey(value, field);
    if (error) return { status: 400, error };
  }
  if (String(payload.storedName || "").length > 1024) {
    return { status: 400, error: "storedName is too long." };
  }
  if (String(payload.downloadSecret || "").length > 512) {
    return { status: 400, error: "downloadSecret is too long." };
  }
  for (const field of [
    "downloadUrl",
    "callbackUrl",
    "uploadUrl",
    "thumbUploadUrl",
  ]) {
    const error = validateOutboundUrl(payload[field], {
      field,
      allowedOrigins,
      allowLoopbackUrls,
    });
    if (error) return { status: 400, error };
  }

  if (payload.storageConfig !== undefined && payload.storageConfig !== null) {
    const config = payload.storageConfig;
    if (typeof config !== "object" || Array.isArray(config)) {
      return { status: 400, error: "storageConfig must be an object." };
    }
    if (config.dataDir !== undefined) {
      return {
        status: 400,
        error: "storageConfig.dataDir cannot be selected by a job request.",
      };
    }
    const driver = String(config.driver || "").toLowerCase();
    if (driver && !["remote", "s3", "r2", "cloudflare"].includes(driver)) {
      return {
        status: 400,
        error: "storageConfig.driver must select an approved remote storage driver.",
      };
    }
    const endpointError = validateOutboundUrl(config.endpoint, {
      field: "storageConfig.endpoint",
      allowedOrigins,
      allowLoopbackUrls,
    });
    if (endpointError) return { status: 400, error: endpointError };
    if (
      config.bucket !== undefined &&
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(String(config.bucket))
    ) {
      return { status: 400, error: "storageConfig.bucket is invalid." };
    }
    for (const field of ["accessKeyId", "secretAccessKey", "region"]) {
      if (String(config[field] || "").length > 512) {
        return { status: 400, error: `storageConfig.${field} is too long.` };
      }
    }
  }

  if (payload.maxBytes !== undefined && payload.maxBytes !== null) {
    const requestedMax = Number(payload.maxBytes);
    if (!Number.isSafeInteger(requestedMax) || requestedMax <= 0) {
      return { status: 400, error: "maxBytes must be a positive integer." };
    }
    if (requestedMax > maxInputBytes) {
      return {
        status: 413,
        error: `Requested maxBytes exceeds the ${maxInputBytes}-byte processing limit.`,
      };
    }
  }
  return { status: 200, error: "" };
}

const secretsMatch = (providedValue, expectedValue) => {
  const provided = Buffer.from(String(providedValue || ""));
  const expected = Buffer.from(String(expectedValue || ""));
  if (!provided.length || !expected.length || provided.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
};

export const isMissingKeyError = (err) => {
  if (!err) return false;
  const code = String(err.Code || err.code || err.name || "");
  if (["NoSuchKey", "NotFound", "NoSuchKeyException"].includes(code)) {
    return true;
  }
  return err?.$metadata?.httpStatusCode === 404;
};

/**
 * Encrypt a generated thumbnail in place when the video it belongs to is
 * stored encrypted. Mirrors the video-output rule exactly (same `isEncrypted`
 * condition), so thumb bytes and video bytes are never split across
 * protection states. `encryptBuffer` is a no-op without a key, and the
 * server serves thumbs through magic-gated decrypt, so old plaintext
 * thumbs keep working untouched.
 *
 * @returns {boolean} whether the thumbnail on disk is now ciphertext
 */
export const encryptThumbnail = (thumbPath, shouldEncrypt) => {
  if (!shouldEncrypt) return false;
  try {
    if (!thumbPath || !fs.existsSync(thumbPath)) return false;
    const encrypted = encryptBuffer(fs.readFileSync(thumbPath));
    if (!isEncryptedFileBuffer(encrypted)) return false;
    fs.writeFileSync(thumbPath, encrypted);
    return true;
  } catch {
    return false;
  }
};

/**
 * Sniff the encrypted-file header directly from disk. The server is supposed
 * to send the right encryptionType flag, but records written before the
 * flag was recorded correctly (encryption_type='none' with ciphertext on
 * disk) would otherwise make the worker ffprobe ciphertext and fail with
 * "moov atom not found". Disk truth wins over the flag.
 */
export const hasEncryptedMagic = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const fd = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
      return isEncryptedFileBuffer(header.subarray(0, bytesRead));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
};

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Download retry for the upload/download race: the job may be dispatched
 * just before the object becomes readable (slow client upload, eventual
 * consistency). Only missing-key errors are retried; anything else fails
 * fast so genuinely broken jobs do not hang the queue.
 */
export async function downloadWithRetry(
  downloadFn,
  {
    attempts = 6,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    sleep = defaultSleep,
  } = {},
) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await downloadFn();
      return;
    } catch (err) {
      lastErr = err;
      if (!isMissingKeyError(err) || attempt === attempts) throw err;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      writeWorkerLog("warn", "worker.download.retry", {
        attempt,
        attempts,
        delayMs,
        errorCode: workerErrorCode(err, "download_missing"),
      });
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

async function notifyCallback(url, payload, secret, maxRetries = 5) {
  if (!url) {
    writeWorkerLog("warn", "worker.callback.skipped", {
      fileId: payload?.fileId,
      jobId: payload?.jobId,
      errorCode: "callback_url_missing",
    });
    return;
  }
  const effectiveSecret = secret || WEBHOOK_SECRET || "";
  if (!effectiveSecret) {
    console.error(
      JSON.stringify({
        service: "ouj-chat-media-worker",
        event: "worker.callback.skipped",
        errorCode: "callback_secret_missing",
      }),
    );
    return false;
  }
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(effectiveSecret
            ? { "x-ouj-chat-webhook-secret": effectiveSecret }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log(
          JSON.stringify({
            service: "ouj-chat-media-worker",
            event: "worker.callback.delivered",
            status: res.status,
            fileId: payload?.fileId || null,
            jobId: payload?.jobId || null,
          }),
        );
        return true;
      }
      console.warn(
        JSON.stringify({
          service: "ouj-chat-media-worker",
          event: "worker.callback.rejected",
          status: res.status,
          attempt,
          errorCode: "callback_http_error",
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          service: "ouj-chat-media-worker",
          event: "worker.callback.failed",
          attempt,
          errorCode: String(err?.code || err?.name || "callback_fetch_failed")
            .replace(/[^A-Za-z0-9_.:-]/g, "_")
            .slice(0, 128),
        }),
      );
    }
    if (attempt < maxRetries) {
      const delayMs = Math.min(16000, 1000 * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function processTranscodeJob({
  fileId,
  storageKey,
  storedName,
  encryptionType,
  callbackUrl,
  webhookSecret,
  storageConfig,
  downloadUrl,
  uploadUrl,
  thumbUploadUrl,
  maxBytes,
}) {
  const defaultLocalCallback = `http://127.0.0.1:${process.env.PORT || process.env.SERVER_PORT || "5174"}/api/uploads/webhook/processed`;
  const targetCallback = callbackUrl || defaultLocalCallback;
  const isEncrypted =
    String(encryptionType || "").toLowerCase() === "local" ||
    String(encryptionType || "").toLowerCase() === "aes-256-gcm" ||
    String(encryptionType || "").toLowerCase() === "app";

  const ext = path.extname(storedName || storageKey || "video.mp4");
  const inputPath = tempPath(ext || ".mp4");
  const outputPath = tempPath(".mp4");
  const thumbPath = tempPath(".jpg");

  const effectiveStorage = storageConfig
    ? createStorage(storageConfig)
    : storage;
  const requestedMaxBytes = Number(maxBytes || WORKER_MAX_INPUT_BYTES);
  const sizeCap = Math.max(
    1,
    Math.min(
      WORKER_MAX_INPUT_BYTES,
      Number.isFinite(requestedMaxBytes) ? requestedMaxBytes : WORKER_MAX_INPUT_BYTES,
    ),
  );

  writeWorkerLog("info", "worker.transcode.started", { fileId });

  try {
    await downloadWithRetry(async () => {
      if (downloadUrl) {
        const res = await fetchWithTimeout(downloadUrl);
        if (!res.ok) {
          const downloadErr = new Error(
            `Failed to download from downloadUrl: HTTP ${res.status}`,
          );
          if (res.status === 404) downloadErr.code = "NotFound";
          throw downloadErr;
        }
        const contentLength = Number(res.headers.get("content-length") || 0);
        if (contentLength > sizeCap) {
          const sizeError = new Error(
            `Downloaded bytes exceed the ${sizeCap}-byte processing limit.`,
          );
          sizeError.code = "WORKER_INPUT_TOO_LARGE";
          throw sizeError;
        }
        await pipeline(
          res.body,
          createByteLimitTransform(sizeCap),
          fs.createWriteStream(inputPath),
        );
      } else {
        await effectiveStorage.downloadToPath(storageKey, inputPath);
      }
    });

    const inputSize = Number(fs.statSync(inputPath)?.size || 0);
    if (inputSize <= 0 || inputSize > sizeCap) {
      const sizeError = new Error(
        inputSize <= 0
          ? "Downloaded media is empty."
          : `Downloaded bytes exceed the ${sizeCap}-byte processing limit.`,
      );
      sizeError.code = inputSize <= 0 ? "WORKER_INPUT_EMPTY" : "WORKER_INPUT_TOO_LARGE";
      throw sizeError;
    }

    let workingInputPath = inputPath;
    let decryptCleanup = () => {};
    if (isEncrypted || hasEncryptedMagic(inputPath)) {
      const decrypted = decryptFileToTempPath(
        inputPath,
        storedName || "video.mp4",
      );
      workingInputPath = decrypted.path;
      decryptCleanup = decrypted.cleanup;
    }

    try {
      const details = await probeVideoDetails(workingInputPath);
      let meta = details;

      let finalOutputPath = workingInputPath;
      let usedTranscodedFile = false;

      if (details.needsTranscode) {
        writeWorkerLog("info", "worker.transcode.required", { fileId });
        await transcodeVideo({ inputPath: workingInputPath, outputPath });
        meta = await probeVideoMetadata(outputPath);
        finalOutputPath = outputPath;
        usedTranscodedFile = true;
      } else {
        writeWorkerLog("info", "worker.transcode.copy_only", { fileId });
        try {
          await faststartVideo({ inputPath: workingInputPath, outputPath });
          finalOutputPath = outputPath;
          usedTranscodedFile = true;
        } catch (faststartErr) {
          writeWorkerLog("warn", "worker.faststart.skipped", {
            fileId,
            errorCode: workerErrorCode(faststartErr, "faststart_failed"),
          });
          finalOutputPath = workingInputPath;
          usedTranscodedFile = false;
        }
      }

      let thumbStorageKey = null;
      try {
        await generateThumbnail({
          inputPath: workingInputPath,
          outputPath: thumbPath,
        });
        const thumbEncrypted = encryptThumbnail(thumbPath, isEncrypted);
        if (thumbEncrypted) {
          writeWorkerLog("info", "worker.thumbnail.encrypted", { fileId });
        }
        thumbStorageKey = `${storageKey.replace(/\.[^.]*$/, "")}-thumb.jpg`;
        if (thumbUploadUrl) {
          const res = await fetchWithTimeout(thumbUploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: fs.createReadStream(thumbPath),
            duplex: "half",
          });
          if (!res.ok) {
            throw new Error(`Failed to upload thumbnail: HTTP ${res.status}`);
          }
        } else {
          await effectiveStorage.uploadFile(
            thumbStorageKey,
            thumbPath,
            "image/jpeg",
          );
        }
      } catch (thumbErr) {
        writeWorkerLog("warn", "worker.thumbnail.skipped", {
          fileId,
          errorCode: workerErrorCode(thumbErr, "thumbnail_failed"),
        });
        thumbStorageKey = null;
      }

      let transcodedStorageKey = storageKey;
      if (usedTranscodedFile) {
        if (isEncrypted) {
          const rawOutput = fs.readFileSync(finalOutputPath);
          const encryptedOutput = encryptBuffer(rawOutput);
          fs.writeFileSync(finalOutputPath, encryptedOutput);
        }
        transcodedStorageKey = `${storageKey.replace(/(\.[^.]*)?$/, "")}-h264-${crypto
          .randomBytes(4)
          .toString("hex")}.mp4`;

        if (uploadUrl) {
          const res = await fetchWithTimeout(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "video/mp4" },
            body: fs.createReadStream(finalOutputPath),
            duplex: "half",
          });
          if (!res.ok) {
            throw new Error(
              `Failed to upload transcoded video: HTTP ${res.status}`,
            );
          }
        } else {
          await effectiveStorage.uploadFile(
            transcodedStorageKey,
            finalOutputPath,
            "video/mp4",
          );
        }

        // Delete the original raw file from remote storage to avoid storing duplicate orphaned video files
        if (transcodedStorageKey !== storageKey && !uploadUrl) {
          await effectiveStorage.deleteFile(storageKey);
          writeWorkerLog("info", "worker.transcode.original_deleted", {
            fileId,
          });
        }
      }

      writeWorkerLog("info", "worker.transcode.completed", { fileId });

      await notifyCallback(targetCallback, {
        fileId,
        status: "ready",
        transcodedStorageKey,
        thumbStorageKey,
        width: Number(meta?.widthPx || meta?.width || 0) || null,
        height: Number(meta?.heightPx || meta?.height || 0) || null,
        duration: Number(meta?.durationSeconds || meta?.duration || 0) || null,
      }, webhookSecret);
    } finally {
      decryptCleanup();
    }
    } catch (err) {
      writeWorkerLog("error", "worker.transcode.failed", {
        fileId,
        errorCode: workerErrorCode(err, "transcode_failed"),
      });
      await notifyCallback(targetCallback, {
      fileId,
      status: "failed",
    }, webhookSecret);
  } finally {
    for (const p of [inputPath, outputPath, thumbPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
  }
}

/**
 * Mirror job for Remote Channel media (Option A handoff).
 *
 * The server keeps the Telegram session: it downloads the bytes itself and
 * hands the worker a pull URL. The worker probes (video only), enforces the
 * size cap, uploads to the final destination, and reports back — no Telegram
 * credentials ever leave the server, and buckets keep holding raw bytes per
 * the message-upload convention.
 */
export async function processMirrorJob({
  jobId,
  downloadUrl,
  downloadSecret,
  storageKey,
  storedName,
  mimeType,
  widthPx,
  heightPx,
  durationSeconds,
  maxBytes,
  probeVideo = false,
  callbackUrl,
  webhookSecret,
  storageConfig,
  uploadUrl,
  uploadContentType,
}) {
  const defaultLocalCallback = `http://127.0.0.1:${process.env.PORT || process.env.SERVER_PORT || "5174"}/api/remote-channel/webhook/mirror-done`;
  const targetCallback = callbackUrl || defaultLocalCallback;
  const fail = async (error) => {
    const errorCode = workerErrorCode(error, "mirror_failed");
    writeWorkerLog("error", "worker.mirror.failed", { jobId, errorCode });
    await notifyCallback(targetCallback, {
      jobId,
      status: "failed",
      errorCode,
    }, webhookSecret);
  };

  const ext = path.extname(storedName || storageKey || ".bin") || ".bin";
  const inputPath = tempPath(ext);
  const effectiveStorage = storageConfig ? createStorage(storageConfig) : storage;
  const requestedMaxBytes = Number(maxBytes || 25 * 1024 * 1024);
  const sizeCap = Math.max(
    1,
    Math.min(
      WORKER_MAX_INPUT_BYTES,
      Number.isFinite(requestedMaxBytes) ? requestedMaxBytes : 25 * 1024 * 1024,
    ),
  );

  writeWorkerLog("info", "worker.mirror.started", { jobId });

  try {
    await downloadWithRetry(async () => {
      const headers = downloadSecret
        ? { "x-ouj-chat-mirror-secret": downloadSecret }
        : {};
      const res = await fetchWithTimeout(downloadUrl, { headers });
      if (!res.ok) {
        const downloadErr = new Error(
          `Failed to download mirror bytes: HTTP ${res.status}`,
        );
        if (res.status === 404) downloadErr.code = "NotFound";
        throw downloadErr;
      }
      const contentLength = Number(res.headers.get("content-length") || 0);
      if (contentLength > sizeCap) {
        const sizeError = new Error(
          `Downloaded bytes exceed the ${sizeCap}-byte processing limit.`,
        );
        sizeError.code = "WORKER_INPUT_TOO_LARGE";
        throw sizeError;
      }
      await pipeline(
        res.body,
        createByteLimitTransform(sizeCap),
        fs.createWriteStream(inputPath),
      );
    });

    const stat = fs.statSync(inputPath);
    const sizeBytes = Number(stat?.size || 0);
    if (sizeBytes <= 0) throw new Error("Mirror bytes are empty.");
    if (sizeBytes > sizeCap) {
      throw new Error(
        `Mirror bytes exceed the ${sizeCap}-byte cap (${sizeBytes} bytes).`,
      );
    }

    let outWidth = Number(widthPx || 0) || null;
    let outHeight = Number(heightPx || 0) || null;
    let outDuration = Number(durationSeconds || 0) || null;
    const isVideo = String(mimeType || "").toLowerCase().startsWith("video/");
    if (probeVideo && isVideo) {
      try {
        const details = await probeVideoDetails(inputPath);
        outWidth = outWidth || Number(details?.widthPx || details?.width || 0) || null;
        outHeight = outHeight || Number(details?.heightPx || details?.height || 0) || null;
        outDuration = outDuration || Number(details?.durationSeconds || details?.duration || 0) || null;
      } catch (probeErr) {
        writeWorkerLog("warn", "worker.mirror_probe.skipped", {
          jobId,
          errorCode: workerErrorCode(probeErr, "mirror_probe_failed"),
        });
      }
    }

    const contentType = uploadContentType || mimeType || "application/octet-stream";
    if (uploadUrl) {
      const res = await fetchWithTimeout(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: fs.createReadStream(inputPath),
        duplex: "half",
      });
      if (!res.ok) {
        throw new Error(`Failed to upload mirror bytes: HTTP ${res.status}`);
      }
    } else {
      await effectiveStorage.uploadFile(storageKey, inputPath, contentType);
    }

    writeWorkerLog("info", "worker.mirror.completed", { jobId, sizeBytes });

    await notifyCallback(targetCallback, {
      jobId,
      status: "ready",
      storageKey,
      storageDriver: storageConfig?.driver || storage?.type || null,
      storedName: storedName || null,
      mimeType: mimeType || null,
      sizeBytes,
      widthPx: outWidth,
      heightPx: outHeight,
      durationSeconds: outDuration,
    }, webhookSecret);
  } catch (err) {
    await fail(err);
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {}
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let receivedBytes = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      receivedBytes += Buffer.byteLength(chunk);
      if (receivedBytes > 1024 * 1024) {
        rejected = true;
        const error = new Error("Request body too large");
        error.code = "REQUEST_BODY_TOO_LARGE";
        reject(error);
        return;
      }
      body += String(chunk || "");
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createWorkerServer(options = {}) {
  const effectiveWebhookSecret = String(
    options.webhookSecret !== undefined ? options.webhookSecret || "" : WEBHOOK_SECRET,
  );
  const effectiveQueue = options.jobQueue || jobQueue;
  const processJobFn = options.processTranscodeJob || processTranscodeJob;
  const processMirrorFn = options.processMirrorJob || processMirrorJob;
  const allowedOrigins = parseAllowedOrigins(
    options.allowedUrlOrigins !== undefined
      ? options.allowedUrlOrigins
      : process.env.WORKER_ALLOWED_URL_ORIGINS,
  );
  const allowLoopbackUrls = options.allowLoopbackUrls !== false;
  const configuredMaxInputBytes = boundedInteger(
    options.maxInputBytes,
    WORKER_MAX_INPUT_BYTES,
    1024,
    WORKER_MAX_INPUT_BYTES,
  );

  const checkSecret = (req, res) => {
    if (!effectiveWebhookSecret) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Worker webhook secret is not configured" }));
      return false;
    }
    const incomingSecret = req.headers["x-ouj-chat-webhook-secret"];
    if (!secretsMatch(incomingSecret, effectiveWebhookSecret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return false;
    }
    return true;
  };

  const appServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // Health check
    if (
      req.method === "GET" &&
      (url.pathname === "/health" || url.pathname === "/")
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          status: "ok",
          service: "ouj-chat-media-worker",
          queue: {
            pending: effectiveQueue.pending,
            queued: effectiveQueue.size,
            concurrency: effectiveQueue.concurrency,
            maxDepth: effectiveQueue.maxDepth ?? null,
          },
        }),
      );
    }

    // Transcode dispatch endpoint
    if (req.method === "POST" && url.pathname === "/transcode") {
      if (!checkSecret(req, res)) return;

      let payload;
      try {
        payload = await parseJsonBody(req);
      } catch (err) {
        const status = err?.code === "REQUEST_BODY_TOO_LARGE" ? 413 : 400;
        res.writeHead(status, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: status === 413 ? "Request body too large" : "Invalid JSON body",
          }),
        );
      }

      const {
        fileId,
        storageKey,
        storedName,
        encryptionType,
        callbackUrl,
        storageConfig,
        downloadUrl,
        uploadUrl,
        thumbUploadUrl,
        maxBytes,
      } = payload;
      const effectiveStorageKey = storageKey || storedName;
      const effectiveStoredName = storedName || storageKey;
      if (!fileId || (!effectiveStorageKey && !downloadUrl)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error:
              "fileId and storageKey (or storedName/downloadUrl) are required",
          }),
        );
      }
      const validation = validateWorkerJobPayload(payload, {
        kind: "transcode",
        allowedOrigins,
        allowLoopbackUrls,
        maxInputBytes: configuredMaxInputBytes,
      });
      if (validation.error) {
        res.writeHead(validation.status, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: validation.error }));
      }

      const queuePosition = Number(effectiveQueue.size || 0);
      const accepted = effectiveQueue.push(() =>
        processJobFn({
          fileId,
          storageKey: effectiveStorageKey,
          storedName: effectiveStoredName,
          encryptionType,
          callbackUrl,
          webhookSecret: effectiveWebhookSecret,
          storageConfig,
          downloadUrl,
          uploadUrl,
          thumbUploadUrl,
          maxBytes: Number(maxBytes || configuredMaxInputBytes),
        }),
      );
      if (accepted === false) {
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Retry-After": "5",
        });
        return res.end(JSON.stringify({ error: "Worker queue is full" }));
      }

      // Acknowledge only after the bounded queue accepts the job.
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: "Transcode job accepted",
          fileId,
          queuePosition,
        }),
      );
      return;
    }

    // Mirror dispatch endpoint (Remote Channel media handoff)
    if (req.method === "POST" && url.pathname === "/mirror-media") {
      if (!checkSecret(req, res)) return;

      let payload;
      try {
        payload = await parseJsonBody(req);
      } catch (err) {
        const status = err?.code === "REQUEST_BODY_TOO_LARGE" ? 413 : 400;
        res.writeHead(status, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: status === 413 ? "Request body too large" : "Invalid JSON body",
          }),
        );
      }

      const {
        jobId,
        downloadUrl,
        downloadSecret,
        storageKey,
        storedName,
        mimeType,
        widthPx,
        heightPx,
        durationSeconds,
        maxBytes,
        probeVideo,
        callbackUrl,
        storageConfig,
        uploadUrl,
        uploadContentType,
      } = payload;
      if (!jobId || (!storageKey && !downloadUrl)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "jobId and storageKey (or downloadUrl) are required",
          }),
        );
      }
      const validation = validateWorkerJobPayload(payload, {
        kind: "mirror",
        allowedOrigins,
        allowLoopbackUrls,
        maxInputBytes: configuredMaxInputBytes,
      });
      if (validation.error) {
        res.writeHead(validation.status, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: validation.error }));
      }

      const queuePosition = Number(effectiveQueue.size || 0);
      const accepted = effectiveQueue.push(() =>
        processMirrorFn({
          jobId,
          downloadUrl,
          downloadSecret,
          storageKey,
          storedName,
          mimeType,
          widthPx,
          heightPx,
          durationSeconds,
          maxBytes,
          probeVideo,
          callbackUrl,
          webhookSecret: effectiveWebhookSecret,
          storageConfig,
          uploadUrl,
          uploadContentType,
        }),
      );
      if (accepted === false) {
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Retry-After": "5",
        });
        return res.end(JSON.stringify({ error: "Worker queue is full" }));
      }

      // Acknowledge only after the bounded queue accepts the job.
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: "Mirror job accepted",
          jobId,
          queuePosition,
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return appServer;
}

export const server = createWorkerServer();

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  server.listen(PORT, () => {
    writeWorkerLog("info", "worker.listening", {});
  });

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      writeWorkerLog("info", "worker.shutdown", {});
      server.close(() => process.exit(0));
    });
  }
}
