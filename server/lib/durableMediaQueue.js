function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

const safeCode = (error) =>
  String(error?.code || error?.name || "media_processing_failed")
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 128) || "media_processing_failed";

export function createDurableMediaQueueRunner({
  jobRepository,
  processJob,
  concurrency = Number(process.env.MEDIA_QUEUE_CONCURRENCY) || 1,
  maxAttempts = Number(process.env.MEDIA_QUEUE_MAX_ATTEMPTS) || 5,
  pollIntervalMs = Number(process.env.MEDIA_QUEUE_POLL_INTERVAL_MS) || 2_000,
  retryBaseDelayMs = Number(process.env.MEDIA_QUEUE_RETRY_BASE_MS) || 5_000,
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (
    !jobRepository ||
    typeof jobRepository.enqueue !== "function" ||
    typeof jobRepository.claimNext !== "function" ||
    typeof jobRepository.complete !== "function" ||
    typeof jobRepository.retry !== "function" ||
    typeof processJob !== "function"
  ) {
    throw new TypeError("A durable media job repository and processor are required.");
  }
  const effectiveConcurrency = boundedInteger(concurrency, 1, 1, 4);
  const effectiveMaxAttempts = boundedInteger(maxAttempts, 5, 1, 20);
  const effectivePollMs = boundedInteger(pollIntervalMs, 2_000, 250, 60_000);
  const effectiveRetryBaseMs = boundedInteger(retryBaseDelayMs, 5_000, 1_000, 5 * 60 * 1000);
  const active = new Set();
  let timer = null;
  let closed = false;
  let runningPass = null;

  async function handle(job) {
    try {
      await processJob({
        id: job.id,
        fileId: job.file_id ?? job.fileId,
        storageKey: job.storage_key ?? job.storageKey ?? null,
        reason: job.reason,
        attempts: Number(job.attempts || 0),
      });
      await jobRepository.complete(job.id);
    } catch (error) {
      const attempts = Math.max(1, Number(job.attempts || 1));
      const terminal = attempts >= effectiveMaxAttempts;
      await jobRepository.retry(job.id, {
        errorCode: safeCode(error),
        terminal,
        delayMs: Math.min(60 * 60 * 1000, effectiveRetryBaseMs * 2 ** Math.min(8, attempts - 1)),
      });
    }
  }

  async function performPass() {
    if (closed) return 0;
    const slots = Math.max(0, effectiveConcurrency - active.size);
    const claimed = [];
    for (let index = 0; index < slots; index += 1) {
      const job = await jobRepository.claimNext();
      if (!job) break;
      claimed.push(job);
    }
    const tasks = claimed.map((job) => {
      const task = Promise.resolve()
        .then(() => handle(job))
        .finally(() => active.delete(task));
      active.add(task);
      return task;
    });
    await Promise.allSettled(tasks);
    return claimed.length;
  }

  async function runOnce() {
    if (runningPass) return runningPass;
    runningPass = performPass().finally(() => {
      runningPass = null;
    });
    return runningPass;
  }

  function start() {
    if (closed || timer) return false;
    void runOnce();
    timer = setIntervalFn(() => void runOnce(), effectivePollMs);
    if (typeof timer?.unref === "function") timer.unref();
    return true;
  }

  async function enqueueJob(data, delayMs = 0) {
    if (closed) return { accepted: false, reason: "queue_closed" };
    const result = await jobRepository.enqueue({
      ...data,
      runAt: Number(now()) + Math.max(0, Number(delayMs) || 0),
    });
    if (result?.accepted && Number(delayMs || 0) <= 0) void runOnce();
    return result;
  }

  async function cancelByFileId(fileId) {
    if (typeof jobRepository.cancelByFileId !== "function") return 0;
    return jobRepository.cancelByFileId(fileId);
  }

  function getStats() {
    return {
      backend: "mongodb",
      active: active.size,
      concurrency: effectiveConcurrency,
      maxAttempts: effectiveMaxAttempts,
      pollIntervalMs: effectivePollMs,
      running: Boolean(timer),
    };
  }

  async function close() {
    closed = true;
    if (timer) clearIntervalFn(timer);
    timer = null;
    if (runningPass) await runningPass;
    await Promise.allSettled([...active]);
  }

  return { enqueueJob, cancelByFileId, runOnce, start, getStats, close };
}
