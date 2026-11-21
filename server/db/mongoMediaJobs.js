import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const MEDIA_PROCESSING_JOB_COLLECTION = "media_processing_jobs";

export const MEDIA_PROCESSING_JOB_INDEXES = Object.freeze([
  { keys: { job_key: 1 }, options: { unique: true, name: "media_job_key_unique" } },
  { keys: { status: 1, run_at: 1, created_at: 1 }, options: { name: "media_job_due_claim" } },
  { keys: { status: 1, locked_at: 1 }, options: { name: "media_job_stale_lock" } },
  { keys: { completed_at: 1 }, options: { name: "media_job_completed_ttl", expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { status: "completed" } } },
]);

export const MEDIA_PROCESSING_JOB_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: ["id", "job_key", "file_id", "reason", "status", "attempts", "run_at", "created_at", "updated_at"],
    properties: {
      id: { bsonType: "string", minLength: 1, maxLength: 128 },
      job_key: { bsonType: "string", minLength: 1, maxLength: 300 },
      file_id: { bsonType: "string", minLength: 1, maxLength: 200 },
      storage_key: { bsonType: ["string", "null"], maxLength: 1024 },
      reason: { bsonType: "string", minLength: 1, maxLength: 64 },
      status: { enum: ["pending", "processing", "completed", "cancelled", "failed"] },
      attempts: { bsonType: ["int", "long"], minimum: 0 },
      run_at: { bsonType: "string", minLength: 20, maxLength: 40 },
      created_at: { bsonType: "string", minLength: 20, maxLength: 40 },
      updated_at: { bsonType: "string", minLength: 20, maxLength: 40 },
      locked_at: { bsonType: ["string", "null"] },
      lock_owner: { bsonType: ["string", "null"] },
      last_error_code: { bsonType: ["string", "null"], maxLength: 128 },
      // MongoDB TTL indexes only expire BSON Date values, never ISO strings.
      completed_at: { bsonType: ["date", "null"] },
    },
  },
};
const validator = MEDIA_PROCESSING_JOB_VALIDATOR;

const iso = (value) => new Date(Number(value)).toISOString();
const clean = (row) => {
  if (!row) return null;
  const { _id, ...value } = row;
  return value;
};
const boundedText = (value, max) => String(value || "").trim().slice(0, max);

export async function ensureMongoMediaJobSchema(db) {
  if (!db || typeof db.collection !== "function") throw new TypeError("A MongoDB database handle is required.");
  const existing = await db
    .listCollections({ name: MEDIA_PROCESSING_JOB_COLLECTION }, { nameOnly: false })
    .next();
  let changed = false;
  if (!existing) {
    await db.createCollection(MEDIA_PROCESSING_JOB_COLLECTION, { validator, validationLevel: "strict" });
    changed = true;
  } else if (
    typeof db.command === "function" &&
    (
      existing.options?.validationLevel !== "strict" ||
      !isDeepStrictEqual(existing.options?.validator, validator)
    )
  ) {
    await db.command({
      collMod: MEDIA_PROCESSING_JOB_COLLECTION,
      validator,
      validationLevel: "strict",
    });
    changed = true;
  }
  const collection = db.collection(MEDIA_PROCESSING_JOB_COLLECTION);
  for (const { keys, options } of MEDIA_PROCESSING_JOB_INDEXES) await collection.createIndex(keys, options);
  return { collection: MEDIA_PROCESSING_JOB_COLLECTION, changed };
}

export function createMongoMediaJobRepository({
  db,
  now = Date.now,
  workerId = `media-${process.pid}-${crypto.randomBytes(6).toString("hex")}`,
} = {}) {
  if (!db || typeof db.collection !== "function") throw new TypeError("A MongoDB database handle is required.");
  const collection = () => db.collection(MEDIA_PROCESSING_JOB_COLLECTION);
  const owner = boundedText(workerId, 128);

  async function enqueue({ fileId, storageKey = null, reason = "media_processing", runAt } = {}) {
    const normalizedFileId = boundedText(fileId, 200);
    const normalizedReason = boundedText(reason, 64);
    const normalizedStorageKey = storageKey == null ? null : boundedText(storageKey, 1024);
    if (!normalizedFileId || !normalizedReason || (storageKey != null && !normalizedStorageKey)) {
      return { accepted: false, reason: "invalid_job" };
    }
    const timestamp = Number(now());
    const currentIso = iso(timestamp);
    const result = await collection().updateOne(
      { job_key: `${normalizedFileId}:${normalizedReason}` },
      {
        $setOnInsert: {
          id: crypto.randomUUID(),
          job_key: `${normalizedFileId}:${normalizedReason}`,
          file_id: normalizedFileId,
          storage_key: normalizedStorageKey,
          reason: normalizedReason,
          status: "pending",
          attempts: 0,
          run_at: iso(Number.isFinite(Number(runAt)) ? Number(runAt) : timestamp),
          created_at: currentIso,
          updated_at: currentIso,
          locked_at: null,
          lock_owner: null,
          last_error_code: null,
          completed_at: null,
        },
      },
      { upsert: true },
    );
    return { accepted: true, durable: true, deduped: !result.upsertedCount };
  }

  async function claimNext({ staleAfterMs = 5 * 60 * 1000 } = {}) {
    const timestamp = Number(now());
    const currentIso = iso(timestamp);
    const staleIso = iso(timestamp - Math.max(30_000, Math.min(60 * 60 * 1000, Number(staleAfterMs) || 300_000)));
    const row = await collection().findOneAndUpdate(
      {
        $or: [
          { status: "pending", run_at: { $lte: currentIso } },
          { status: "processing", locked_at: { $lte: staleIso } },
        ],
      },
      {
        $set: { status: "processing", locked_at: currentIso, lock_owner: owner, updated_at: currentIso },
        $inc: { attempts: 1 },
      },
      { sort: { run_at: 1, created_at: 1 }, returnDocument: "after" },
    );
    return clean(row);
  }

  async function complete(id) {
    const timestamp = Number(now());
    const currentIso = iso(timestamp);
    const result = await collection().updateOne(
      { id: boundedText(id, 128), status: "processing", lock_owner: owner },
      {
        $set: {
          status: "completed",
          completed_at: new Date(timestamp),
          updated_at: currentIso,
        },
        $unset: { lock_owner: "", locked_at: "" },
      },
    );
    return result.modifiedCount === 1;
  }

  async function retry(id, { errorCode = "media_processing_failed", delayMs = 5_000, terminal = false } = {}) {
    const timestamp = Number(now());
    const result = await collection().updateOne(
      { id: boundedText(id, 128), status: "processing", lock_owner: owner },
      {
        $set: {
          status: terminal ? "failed" : "pending",
          run_at: iso(timestamp + Math.max(1_000, Math.min(60 * 60 * 1000, Number(delayMs) || 5_000))),
          last_error_code: boundedText(errorCode, 128) || "media_processing_failed",
          updated_at: iso(timestamp),
        },
        $unset: { lock_owner: "", locked_at: "" },
      },
    );
    return result.modifiedCount === 1;
  }

  async function cancelByFileId(fileId) {
    const result = await collection().updateMany(
      { file_id: boundedText(fileId, 200), status: { $in: ["pending", "processing"] } },
      { $set: { status: "cancelled", updated_at: iso(Number(now())) }, $unset: { lock_owner: "", locked_at: "" } },
    );
    return result.modifiedCount;
  }

  return { enqueue, claimNext, complete, retry, cancelByFileId, workerId: owner };
}
