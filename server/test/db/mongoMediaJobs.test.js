import { describe, expect, test, vi } from "vitest";

import {
  MEDIA_PROCESSING_JOB_COLLECTION,
  MEDIA_PROCESSING_JOB_INDEXES,
  MEDIA_PROCESSING_JOB_VALIDATOR,
  createMongoMediaJobRepository,
  ensureMongoMediaJobSchema,
} from "../../db/mongoMediaJobs.js";

describe("Mongo media processing job repository", () => {
  test("uses an idempotent file/reason key and a bounded durable payload", async () => {
    const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1, matchedCount: 0 });
    const db = { collection: vi.fn(() => ({ updateOne })) };
    const repository = createMongoMediaJobRepository({ db, now: () => 1_800_000_000_000 });

    await expect(repository.enqueue({ fileId: "file-1", storageKey: "uploads/a.mp4", reason: "fallback_timer", runAt: 1_800_000_001_000 })).resolves.toMatchObject({ accepted: true, durable: true });
    expect(db.collection).toHaveBeenCalledWith(MEDIA_PROCESSING_JOB_COLLECTION);
    expect(updateOne).toHaveBeenCalledWith(
      { job_key: "file-1:fallback_timer" },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ file_id: "file-1", storage_key: "uploads/a.mp4", status: "pending" }),
      }),
      { upsert: true },
    );
  });

  test("claims only due or stale work and records bounded retries", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({ id: "job-1", status: "processing" });
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const db = { collection: vi.fn(() => ({ findOneAndUpdate, updateOne })) };
    const repository = createMongoMediaJobRepository({ db, now: () => 1_800_000_000_000, workerId: "worker-a" });

    await expect(repository.claimNext({ staleAfterMs: 30_000 })).resolves.toMatchObject({ id: "job-1" });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ $or: expect.any(Array) }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "processing", lock_owner: "worker-a" }), $inc: { attempts: 1 } }),
      expect.objectContaining({ returnDocument: "after" }),
    );

    await expect(repository.retry("job-1", { errorCode: "provider_timeout", delayMs: 2_000 })).resolves.toBe(true);
    expect(updateOne).toHaveBeenCalledWith(
      { id: "job-1", status: "processing", lock_owner: "worker-a" },
      { $set: expect.objectContaining({ status: "pending", last_error_code: "provider_timeout" }), $unset: { lock_owner: "", locked_at: "" } },
    );

    await expect(repository.complete("job-1")).resolves.toBe(true);
    expect(updateOne).toHaveBeenCalledWith(
      { id: "job-1", status: "processing", lock_owner: "worker-a" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "completed",
          completed_at: expect.any(Date),
        }),
      }),
    );
  });

  test("declares unique claim and recovery indexes", () => {
    expect(MEDIA_PROCESSING_JOB_INDEXES).toEqual(expect.arrayContaining([
      expect.objectContaining({ options: expect.objectContaining({ unique: true }) }),
      expect.objectContaining({ keys: { status: 1, run_at: 1, created_at: 1 } }),
      expect.objectContaining({ keys: { status: 1, locked_at: 1 } }),
      expect.objectContaining({
        keys: { completed_at: 1 },
        options: expect.objectContaining({ expireAfterSeconds: 7 * 24 * 60 * 60 }),
      }),
    ]));
  });

  test("does not require collMod privilege when the installed validator already matches", async () => {
    const command = vi.fn();
    const createIndex = vi.fn(async () => "ok");
    const db = {
      listCollections: vi.fn(() => ({
        hasNext: vi.fn(async () => true),
        next: vi.fn(async () => ({
          name: MEDIA_PROCESSING_JOB_COLLECTION,
          options: {
            validator: MEDIA_PROCESSING_JOB_VALIDATOR,
            validationLevel: "strict",
          },
        })),
      })),
      command,
      collection: vi.fn(() => ({ createIndex })),
    };

    await expect(ensureMongoMediaJobSchema(db)).resolves.toMatchObject({ changed: false });
    expect(command).not.toHaveBeenCalled();
    expect(createIndex).toHaveBeenCalledTimes(MEDIA_PROCESSING_JOB_INDEXES.length);
  });
});
