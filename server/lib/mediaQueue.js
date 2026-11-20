import { Queue, Worker } from "bullmq";
import { dbKnex } from "../db/query.js";
import { readEnvBool } from "../settings/env.js";

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

export function createMediaQueueManager({
  redisClient,
  storageProvider,
  s3ProcessingMode = "auto",
  s3ProcessingTimeoutMs,
  adminGetRow,
  adminRun,
  emitChatEvent,
  enqueueVideoTranscodeJob,
  transcodeVideosToH264,
  getSetting,
  maxQueueDepth = Number(process.env.MEDIA_QUEUE_MAX_DEPTH) || 100,
  processingConcurrency = Number(process.env.MEDIA_QUEUE_CONCURRENCY) || 1,
}) {
  const effectiveMaxQueueDepth = boundedInteger(maxQueueDepth, 100, 1, 1000);
  const effectiveConcurrency = boundedInteger(processingConcurrency, 1, 1, 4);
  const effectiveTimeoutMs = Math.max(
    0,
    Number(
      s3ProcessingTimeoutMs !== undefined
        ? s3ProcessingTimeoutMs
        : process.env.STORAGE_PROCESSING_TIMEOUT_MS || 120000,
    ) || 120000,
  );

  const isRealRedis =
    redisClient &&
    typeof redisClient.duplicate === "function" &&
    redisClient.constructor.name !== "InProcessRedisClient";

  let bullQueue = null;
  let bullWorker = null;
  const inMemoryQueue = [];
  const activeTimers = new Map();
  const activePromises = new Set();
  let activeJobCount = 0;
  let drainScheduled = false;
  let closed = false;
  let bullEnqueueChain = Promise.resolve();

  function toSql(builder) {
    if (builder && typeof builder.toSQL === "function") {
      const c = builder.toSQL();
      return { sql: c.sql, params: c.bindings || [] };
    }
    return { sql: builder, params: [] };
  }

  async function processMediaJob(jobData) {
    const { fileId, storageKey, reason } = jobData;
    if (!fileId) return;

    // Check DB status to see if remote provider already processed it
    const { sql: checkSql, params: checkParams } = toSql(
      dbKnex("chat_message_files").where("id", fileId).first(),
    );
    const row = adminGetRow ? await adminGetRow(checkSql, checkParams) : null;

    if (!row) return;
    if (row.processing_status === "ready") return; // Already processed by remote compute

    try {
      // Execute local fallback processing
      const isVideo = String(row.mime_type || "").toLowerCase().startsWith("video/");
      const isTranscodeEnabled = () => {
        if (typeof transcodeVideosToH264 === "boolean") return transcodeVideosToH264;
        if (typeof getSetting === "function") {
          const val = getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS");
          if (val !== undefined && val !== null) return Boolean(val);
        }
        return readEnvBool("FILE_UPLOAD_TRANSCODE_VIDEOS", true);
      };

      if (isVideo && isTranscodeEnabled() && typeof enqueueVideoTranscodeJob === "function") {
        const result = await enqueueVideoTranscodeJob({
          fileId,
          storedName: row.stored_name,
          storageKey: row.storage_key || storageKey,
          storageDriver: row.storage_driver,
          messageId: row.message_id,
        });
        if (result?.accepted === false) {
          throw new Error(result.reason || "Video transcode queue is full.");
        }
      } else {
        // Update DB status to ready
        if (adminRun) {
          const { sql: updateSql, params: updateParams } = toSql(
            dbKnex("chat_message_files").where("id", fileId).update({ processing_status: "ready" }),
          );
          await adminRun(updateSql, updateParams);
        }

        // Broadcast SSE notification
        if (typeof emitChatEvent === "function") {
          emitChatEvent("ouj-chat:realtime-event", {
            type: "video:ready",
            fileId,
            storageKey: row.storage_key || storageKey,
          });
        }
      }
    } catch (err) {
      if (adminRun) {
        const { sql: failSql, params: failParams } = toSql(
          dbKnex("chat_message_files").where("id", fileId).update({ processing_status: "failed" }),
        );
        await adminRun(failSql, failParams);
      }
    }
  }

  if (isRealRedis) {
    try {
      const connection = redisClient.options
        ? {
            host: redisClient.options.host,
            port: redisClient.options.port,
            username: redisClient.options.username,
            password: redisClient.options.password,
            db: redisClient.options.db,
          }
        : { host: "127.0.0.1", port: 6379 };

      bullQueue = new Queue("media-processing", { connection });
      bullWorker = new Worker(
        "media-processing",
        async (job) => {
          await processMediaJob(job.data);
        },
        { connection, concurrency: effectiveConcurrency },
      );
    } catch (e) {
      bullQueue = null;
      bullWorker = null;
    }
  }

  function inMemoryDepth() {
    return inMemoryQueue.length + activeJobCount + activeTimers.size;
  }

  function scheduleDrain() {
    if (closed || drainScheduled || !inMemoryQueue.length || activeJobCount >= effectiveConcurrency) return;
    drainScheduled = true;
    setImmediate(() => {
      drainScheduled = false;
      while (!closed && activeJobCount < effectiveConcurrency && inMemoryQueue.length) {
        const data = inMemoryQueue.shift();
        activeJobCount += 1;
        const processing = Promise.resolve()
          .then(() => processMediaJob(data))
          .catch(() => {})
          .finally(() => {
            activeJobCount -= 1;
            activePromises.delete(processing);
            scheduleDrain();
          });
        activePromises.add(processing);
      }
    });
  }

  function enqueueJob(data, delayMs = 0) {
    if (closed) return { accepted: false, reason: "queue_closed" };
    if (!data?.fileId) return { accepted: false, reason: "invalid_job" };
    if (bullQueue) {
      const enqueueResult = bullEnqueueChain.then(async () => {
        const counts = await bullQueue.getJobCounts("waiting", "delayed", "active", "prioritized");
        const depth = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
        if (depth >= effectiveMaxQueueDepth) return { accepted: false, reason: "queue_full" };
        await bullQueue.add("process-media", data, {
          delay: Math.max(0, Number(delayMs) || 0),
          removeOnComplete: 100,
          removeOnFail: 100,
        });
        return { accepted: true, backend: "bullmq" };
      }).catch(() => ({ accepted: false, reason: "queue_unavailable" }));
      bullEnqueueChain = enqueueResult.then(() => undefined);
      return enqueueResult;
    }

    const existingTimer = activeTimers.get(data.fileId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      activeTimers.delete(data.fileId);
    }
    if (inMemoryDepth() >= effectiveMaxQueueDepth) {
      return { accepted: false, reason: "queue_full" };
    }
    if (delayMs > 0) {
      const timer = setTimeout(() => {
        activeTimers.delete(data.fileId);
        if (closed) return;
        inMemoryQueue.push(data);
        scheduleDrain();
      }, Math.max(0, Number(delayMs) || 0));
      if (typeof timer.unref === "function") timer.unref();
      activeTimers.set(data.fileId, timer);
    } else {
      inMemoryQueue.push(data);
      scheduleDrain();
    }
    return { accepted: true, backend: "memory" };
  }

  function getStats() {
    return {
      backend: bullQueue ? "bullmq" : "memory",
      queued: inMemoryQueue.length,
      active: activeJobCount,
      delayed: activeTimers.size,
      maxQueueDepth: effectiveMaxQueueDepth,
      concurrency: effectiveConcurrency,
    };
  }

  function scheduleFallbackCheck({ fileId, storageKey }) {
    if (s3ProcessingMode === "remote") {
      return { accepted: false, reason: "remote_mode" };
    }

    // Read live so admin-panel changes apply without a restart.
    const liveTimeoutMs = typeof getSetting === "function"
      ? Number(getSetting("STORAGE_PROCESSING_TIMEOUT_MS"))
      : 0;
    return enqueueJob(
      { fileId, storageKey, reason: "fallback_timer" },
      Number.isFinite(liveTimeoutMs) && liveTimeoutMs > 0 ? liveTimeoutMs : effectiveTimeoutMs,
    );
  }

  function cancelFallbackCheck(fileId) {
    if (activeTimers.has(fileId)) {
      clearTimeout(activeTimers.get(fileId));
      activeTimers.delete(fileId);
      return true;
    }
    return false;
  }

  async function close() {
    closed = true;
    for (const timer of activeTimers.values()) {
      clearTimeout(timer);
    }
    activeTimers.clear();
    inMemoryQueue.length = 0;
    await Promise.allSettled([...activePromises]);

    if (bullWorker) await bullWorker.close();
    if (bullQueue) await bullQueue.close();
  }

  return {
    enqueueJob,
    scheduleFallbackCheck,
    cancelFallbackCheck,
    processMediaJob,
    getStats,
    close,
  };
}
