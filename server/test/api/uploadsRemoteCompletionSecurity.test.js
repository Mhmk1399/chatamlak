import { beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

const SESSION_TOKEN = "uploads-completion-security-session";
const MESSAGE_ID = "50000000-0000-4000-8000-000000000501";
const CHAT_ID = "42000000-0000-4000-8000-000000000501";
const STORAGE_KEY = "uploads/messages/completion-security.mp4";

function addAuthenticatedUser(appObj, username = "completionuser") {
  const userId = appObj.userStore.createUser(
    username,
    "pass",
    "Completion User",
    null,
    "#123456",
  );
  appObj.sessionStore.createSession(userId, SESSION_TOKEN);
  return userId;
}

function makeCompletionApp(overrides = {}) {
  let actorId = null;
  const file = {
    id: 501,
    message_id: MESSAGE_ID,
    storage_driver: "s3",
    storage_key: STORAGE_KEY,
    stored_name: "completion-security.mp4",
    mime_type: "video/mp4",
    processing_status: "pending",
    upload_completed_at: null,
  };
  let pending = {
    storage_key: STORAGE_KEY,
    user_id: null,
    chat_id: CHAT_ID,
    message_id: MESSAGE_ID,
    purpose: "message",
  };

  const deps = {
    storageProcessingMode: "remote",
    storageProvider: { type: "s3" },
    findMessageFileById: () => file,
    findMessageById: () => ({
      id: MESSAGE_ID,
      chat_id: CHAT_ID,
      user_id: actorId,
    }),
    findChatById: () => ({ id: CHAT_ID, type: "group" }),
    isMember: () => true,
    findPendingPresignedUpload: () => pending,
    removePendingPresignedUploads: async () => {
      pending = null;
      return 1;
    },
    adminRun: async (query, params = []) => {
      Object.assign(
        file,
        query?.values || {
          processing_status: params[0],
          upload_completed_at: params[1],
        },
      );
      return 1;
    },
    adminSave: async () => {},
    getSetting: (key) =>
      key === "FILE_UPLOAD_TRANSCODE_VIDEOS" ? true : null,
    ...overrides,
  };
  const appObj = makeApp({ deps });
  actorId = addAuthenticatedUser(appObj);
  pending.user_id = actorId;
  return {
    ...appObj,
    actorId,
    file,
    getPending: () => pending,
  };
}

describe("remote upload completion ownership and retry safety", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("requires a bounded clientRequestId for a pre-message presign", async () => {
    const getUploadUrl = vi.fn(async () => ({
      uploadUrl: "https://storage.invalid/upload",
      storageKey: STORAGE_KEY,
    }));
    let actorId = null;
    const appObj = makeApp({
      deps: {
        storageProvider: { type: "s3", getUploadUrl },
        findChatById: () => ({ id: CHAT_ID, type: "group" }),
        isMember: (_chatId, userId) => String(userId) === String(actorId),
      },
    });
    actorId = addAuthenticatedUser(appObj, "presignclientid");

    const missing = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({
        chatId: CHAT_ID,
        filename: "clip.mp4",
        contentType: "video/mp4",
        fileSize: 1024,
      });

    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/clientRequestId is required/i);
    expect(getUploadUrl).not.toHaveBeenCalled();

    const tooLong = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({
        chatId: CHAT_ID,
        clientRequestId: "x".repeat(121),
        filename: "clip.mp4",
        contentType: "video/mp4",
        fileSize: 1024,
      });

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toMatch(/too long/i);
    expect(getUploadUrl).not.toHaveBeenCalled();
  });

  test("does not return or log raw storage-provider failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const providerFailure =
      "https://access-key:secret-key@storage.invalid/private?signature=token";
    let actorId = null;
    const appObj = makeApp({
      deps: {
        storageProvider: {
          type: "s3",
          getUploadUrl: vi.fn(async () => {
            throw new Error(providerFailure);
          }),
        },
        findChatById: () => ({ id: CHAT_ID, type: "group" }),
        isMember: (_chatId, userId) => String(userId) === String(actorId),
      },
    });
    actorId = addAuthenticatedUser(appObj, "presignfailure");

    const result = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({
        chatId: CHAT_ID,
        clientRequestId: "presign-provider-failure",
        filename: "clip.mp4",
        contentType: "video/mp4",
        fileSize: 1024,
      });

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("Failed to generate presigned upload URL.");
    expect(JSON.stringify(result.body)).not.toContain("secret-key");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls.flat().join(" ")).not.toContain("secret-key");
  });

  test("awaits durable status, fallback scheduling, and pending-claim removal", async () => {
    const events = [];
    let appObj;
    appObj = makeCompletionApp({
      adminRun: async (query, params = []) => {
        events.push("status:start");
        await Promise.resolve();
        Object.assign(
          appObj.file,
          query?.values || {
            processing_status: params[0],
            upload_completed_at: params[1],
          },
        );
        events.push("status:done");
        return 1;
      },
      adminSave: async () => {
        await Promise.resolve();
        events.push("save:done");
      },
      mediaQueueManager: {
        scheduleFallbackCheck: async () => {
          await Promise.resolve();
          events.push("queue:done");
          return { accepted: true, backend: "memory" };
        },
      },
      removePendingPresignedUploads: async () => {
        await Promise.resolve();
        events.push("claim:removed");
        return 1;
      },
    });

    const result = await request(appObj.app)
      .post("/api/uploads/complete")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({ fileId: appObj.file.id, storageKey: STORAGE_KEY });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true, status: "pending" });
    expect(events).toEqual([
      "status:start",
      "status:done",
      "save:done",
      "queue:done",
      "claim:removed",
    ]);
    expect(appObj.file.upload_completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("keeps the ownership claim on queue overload so completion can be retried", async () => {
    let queueAttempts = 0;
    let removed = false;
    const appObj = makeCompletionApp({
      mediaQueueManager: {
        scheduleFallbackCheck: async () => {
          queueAttempts += 1;
          return queueAttempts === 1
            ? { accepted: false, reason: "queue_full" }
            : { accepted: true, backend: "memory" };
        },
      },
      removePendingPresignedUploads: async () => {
        removed = true;
        return 1;
      },
    });

    const first = await request(appObj.app)
      .post("/api/uploads/complete")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({ fileId: appObj.file.id, storageKey: STORAGE_KEY });

    expect(first.status).toBe(503);
    expect(first.headers["retry-after"]).toBe("5");
    expect(first.body.retryable).toBe(true);
    expect(appObj.file.upload_completed_at).toBeTruthy();
    expect(removed).toBe(false);

    const retry = await request(appObj.app)
      .post("/api/uploads/complete")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({ fileId: appObj.file.id, storageKey: STORAGE_KEY });

    expect(retry.status).toBe(200);
    expect(queueAttempts).toBe(2);
    expect(removed).toBe(true);
  });

  test("accepts only an already marked completion after its claim is consumed", async () => {
    const appObj = makeCompletionApp({
      findPendingPresignedUpload: () => null,
    });

    const unmarked = await request(appObj.app)
      .post("/api/uploads/complete")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({ fileId: appObj.file.id, storageKey: STORAGE_KEY });
    expect(unmarked.status).toBe(403);

    appObj.file.upload_completed_at = new Date().toISOString();
    appObj.file.processing_status = "ready";
    const retry = await request(appObj.app)
      .post("/api/uploads/complete")
      .set("Cookie", [`sid=${SESSION_TOKEN}`])
      .send({ fileId: appObj.file.id, storageKey: STORAGE_KEY });

    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({
      success: true,
      status: "ready",
      deduped: true,
    });
  });

  test("awaits webhook persistence before acknowledging the callback", async () => {
    const events = [];
    const appObj = makeApp({
      deps: {
        webhookSecret: "webhook-completion-secret",
        findMessageFileById: () => ({
          id: 501,
          message_id: null,
          storage_key: STORAGE_KEY,
          processing_status: "pending",
        }),
        adminRun: async () => {
          events.push("update:start");
          await Promise.resolve();
          events.push("update:done");
        },
        adminSave: async () => {
          await Promise.resolve();
          events.push("save:done");
        },
      },
    });

    const result = await request(appObj.app)
      .post("/api/uploads/webhook/processed")
      .set("x-ouj-chat-webhook-secret", "webhook-completion-secret")
      .send({ fileId: 501, status: "ready" });

    expect(result.status).toBe(200);
    expect(events).toEqual(["update:start", "update:done", "save:done"]);
  });
});
