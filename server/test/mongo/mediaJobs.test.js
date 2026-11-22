import { MongoClient } from "mongodb";
import { describe, expect, test } from "vitest";

import {
  MEDIA_PROCESSING_JOB_COLLECTION,
  createMongoMediaJobRepository,
  ensureMongoMediaJobSchema,
} from "../../db/mongoMediaJobs.js";
import { createDurableMediaQueueRunner } from "../../lib/durableMediaQueue.js";
import { db, testUri } from "./helpers.js";

async function reconnect() {
  const client = await new MongoClient(testUri, {
    serverSelectionTimeoutMS: 10_000,
  }).connect();
  return { client, db: client.db(db.databaseName) };
}

describe("durable media jobs on a real MongoDB replica set", () => {
  test("a new client/repository/runner completes an accepted job exactly once", async () => {
    let currentTime = Date.parse("2026-11-21T08:00:00.000Z");
    const initialRepository = createMongoMediaJobRepository({
      db,
      now: () => currentTime,
      workerId: "chat-before-restart",
    });

    await expect(initialRepository.enqueue({
      fileId: "restart-file",
      storageKey: "uploads/synthetic-restart.mp4",
      reason: "fallback_timer",
    })).resolves.toMatchObject({ accepted: true, durable: true, deduped: false });
    await expect(initialRepository.enqueue({
      fileId: "restart-file",
      storageKey: "uploads/synthetic-restart.mp4",
      reason: "fallback_timer",
    })).resolves.toMatchObject({ accepted: true, durable: true, deduped: true });

    const restarted = await reconnect();
    try {
      await ensureMongoMediaJobSchema(restarted.db);
      const restartedRepository = createMongoMediaJobRepository({
        db: restarted.db,
        now: () => currentTime,
        workerId: "chat-after-restart",
      });
      const processed = [];
      const restartedRunner = createDurableMediaQueueRunner({
        jobRepository: restartedRepository,
        processJob: async (job) => processed.push(job),
        concurrency: 1,
      });

      await expect(restartedRunner.runOnce()).resolves.toBe(1);
      await expect(restartedRunner.runOnce()).resolves.toBe(0);
      await restartedRunner.close();

      expect(processed).toEqual([
        expect.objectContaining({
          fileId: "restart-file",
          storageKey: "uploads/synthetic-restart.mp4",
          reason: "fallback_timer",
          attempts: 1,
        }),
      ]);
      const stored = await restarted.db.collection(MEDIA_PROCESSING_JOB_COLLECTION)
        .findOne({ job_key: "restart-file:fallback_timer" });
      expect(stored).toMatchObject({
        status: "completed",
        attempts: 1,
        last_error_code: null,
      });
      expect(stored.completed_at).toBeInstanceOf(Date);
      expect(await restarted.db.collection(MEDIA_PROCESSING_JOB_COLLECTION)
        .countDocuments({ job_key: "restart-file:fallback_timer" })).toBe(1);
    } finally {
      await restarted.client.close();
    }
  });

  test("a restarted worker reclaims a stale lease and terminally fails at the retry limit", async () => {
    let currentTime = Date.parse("2026-11-21T09:00:00.000Z");
    const interruptedRepository = createMongoMediaJobRepository({
      db,
      now: () => currentTime,
      workerId: "interrupted-worker",
    });
    await interruptedRepository.enqueue({
      fileId: "stale-file",
      storageKey: "uploads/synthetic-stale.mp4",
      reason: "media_processing",
    });
    const interruptedClaim = await interruptedRepository.claimNext({ staleAfterMs: 30_000 });
    expect(interruptedClaim).toMatchObject({ status: "processing", attempts: 1 });

    currentTime += 31_000;
    const restarted = await reconnect();
    try {
      const recoveryRepository = createMongoMediaJobRepository({
        db: restarted.db,
        now: () => currentTime,
        workerId: "recovery-worker",
      });
      const recovered = await recoveryRepository.claimNext({ staleAfterMs: 30_000 });
      expect(recovered).toMatchObject({
        id: interruptedClaim.id,
        status: "processing",
        attempts: 2,
        lock_owner: "recovery-worker",
      });
      await expect(interruptedRepository.complete(interruptedClaim.id)).resolves.toBe(false);
      await expect(recoveryRepository.retry(recovered.id, {
        errorCode: "synthetic_interruption",
        delayMs: 1_000,
      })).resolves.toBe(true);

      currentTime += 1_000;
      const finalRepository = createMongoMediaJobRepository({
        db: restarted.db,
        now: () => currentTime,
        workerId: "final-worker",
      });
      const runner = createDurableMediaQueueRunner({
        jobRepository: finalRepository,
        maxAttempts: 3,
        concurrency: 1,
        processJob: async () => {
          const error = new Error("synthetic provider failure");
          error.code = "synthetic_provider_failure";
          throw error;
        },
      });
      await expect(runner.runOnce()).resolves.toBe(1);
      await runner.close();

      const stored = await restarted.db.collection(MEDIA_PROCESSING_JOB_COLLECTION)
        .findOne({ id: interruptedClaim.id });
      expect(stored).toMatchObject({
        status: "failed",
        attempts: 3,
        last_error_code: "synthetic_provider_failure",
      });
      expect(stored).not.toHaveProperty("lock_owner");
      expect(stored).not.toHaveProperty("locked_at");
      expect(await restarted.db.collection(MEDIA_PROCESSING_JOB_COLLECTION)
        .countDocuments({ job_key: "stale-file:media_processing" })).toBe(1);
    } finally {
      await restarted.client.close();
    }
  });
});
