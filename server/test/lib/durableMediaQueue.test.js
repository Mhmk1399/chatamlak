import { describe, expect, test, vi } from "vitest";

import { createDurableMediaQueueRunner } from "../../lib/durableMediaQueue.js";

describe("durable media queue runner", () => {
  test("claims bounded work and acknowledges only successful processing", async () => {
    const jobs = [
      { id: "job-1", file_id: "file-1", storage_key: "a", reason: "fallback", attempts: 1 },
      { id: "job-2", file_id: "file-2", storage_key: "b", reason: "fallback", attempts: 1 },
    ];
    const repository = {
      claimNext: vi.fn(async () => jobs.shift() || null),
      complete: vi.fn(async () => true),
      retry: vi.fn(async () => true),
      enqueue: vi.fn(async () => ({ accepted: true, durable: true })),
      cancelByFileId: vi.fn(async () => 1),
    };
    let active = 0;
    let maxActive = 0;
    const runner = createDurableMediaQueueRunner({
      jobRepository: repository,
      concurrency: 2,
      processJob: async () => {
        active += 1;
        maxActive = Math.max(active, maxActive);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      },
    });

    await runner.runOnce();
    expect(maxActive).toBe(2);
    expect(repository.complete).toHaveBeenCalledTimes(2);
    expect(repository.retry).not.toHaveBeenCalled();
    expect(runner.getStats()).toMatchObject({ backend: "mongodb", active: 0, concurrency: 2 });
  });

  test("returns failed work to the durable store with capped attempts", async () => {
    const jobs = [
      { id: "retry", file_id: "file-1", attempts: 2 },
      { id: "terminal", file_id: "file-2", attempts: 3 },
    ];
    const repository = {
      claimNext: vi.fn(async () => jobs.shift() || null),
      complete: vi.fn(),
      retry: vi.fn(async () => true),
      enqueue: vi.fn(),
      cancelByFileId: vi.fn(),
    };
    const runner = createDurableMediaQueueRunner({
      jobRepository: repository,
      concurrency: 2,
      maxAttempts: 3,
      processJob: async () => {
        const error = new Error("private provider URL must not be logged");
        error.code = "provider_timeout";
        throw error;
      },
    });

    await runner.runOnce();
    expect(repository.retry).toHaveBeenNthCalledWith(1, "retry", expect.objectContaining({ errorCode: "provider_timeout", terminal: false }));
    expect(repository.retry).toHaveBeenNthCalledWith(2, "terminal", expect.objectContaining({ errorCode: "provider_timeout", terminal: true }));
  });

  test("persists delayed work and cancellation through the repository", async () => {
    const repository = {
      claimNext: vi.fn(async () => null),
      complete: vi.fn(),
      retry: vi.fn(),
      enqueue: vi.fn(async (value) => ({ accepted: true, durable: true, value })),
      cancelByFileId: vi.fn(async () => 1),
    };
    const runner = createDurableMediaQueueRunner({ jobRepository: repository, processJob: vi.fn() });

    await expect(runner.enqueueJob({ fileId: "file-1", storageKey: "a", reason: "fallback" }, 5_000)).resolves.toMatchObject({ accepted: true, durable: true });
    expect(repository.enqueue).toHaveBeenCalledWith(expect.objectContaining({ fileId: "file-1", runAt: expect.any(Number) }));
    await expect(runner.cancelByFileId("file-1")).resolves.toBe(1);
  });
});
