import { describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";
import { RemoteStorageProvider } from "../../lib/storage/RemoteStorageProvider.js";

describe("POST /api/messages/upload with storageKeys", () => {
  let appObj;
  let mockRemoteProvider;
  let emittedEvents = [];
  let sessionToken = "test-session-token-storage-keys";
  let userId;
  let chatId = "c0c0c0c0-d1d1-4e2e-af3f-060606060606";
  const clientRequestId = "upload-storage-keys-request";

  beforeEach(() => {
    emittedEvents = [];
    mockRemoteProvider = new RemoteStorageProvider({
      STORAGE_BUCKET: "test-bucket",
      STORAGE_REGION: "us-east-1",
      STORAGE_ACCESS_KEY_ID: "test-key",
      STORAGE_SECRET_ACCESS_KEY: "test-secret",
    });

    vi.spyOn(mockRemoteProvider, "getDownloadUrl").mockImplementation(
      async (key) => {
        return `https://test-bucket.s3.amazonaws.com/${key}?download=true`;
      },
    );

    let persistedFiles = [];
    appObj = makeApp({
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: chatId, name: "test-chat", type: "group" }),
        emitChatEvent: (_chatId, payload) => emittedEvents.push(payload),
        emitSseEvent: (_username, payload) => emittedEvents.push(payload),
        storageProvider: mockRemoteProvider,
        createMessageFiles: (messageId, files) => {
          persistedFiles = files.map((file, index) => ({
            ...file,
            id: `file-uuid-${index + 1}`,
            message_id: messageId,
            original_name: file.originalName,
            stored_name: file.storedName,
            mime_type: file.mimeType,
            size_bytes: file.sizeBytes,
            storage_driver: file.storageDriver,
            storage_key: file.storageKey,
            processing_status: file.processingStatus,
          }));
          return persistedFiles.map((file) => file.id);
        },
        listMessageFilesByMessageIds: () => persistedFiles,
        MESSAGE_FILE_LIMITS: {
          maxFiles: 3,
          maxFileSizeBytes: 50 * 1024 * 1024,
          maxTotalBytes: 10 * 1024 * 1024,
        },
      },
    });

    userId = appObj.userStore.createUser(
      "remoteuser",
      "hash",
      "S3 User",
      null,
      "#10b981",
    );
    appObj.sessionStore.createSession(userId, sessionToken);
  });

  const bindPendingUpload = (targetApp, targetUserId, storageKey) =>
    targetApp.deps.recordPendingPresignedUpload({
      storageKey,
      userId: targetUserId,
      chatId,
      clientRequestId,
      purpose: "message",
    });

  test("accepts storageKeys array and attaches files to created message", async () => {
    bindPendingUpload(appObj, userId, "uploads/doc123.pdf");
    const res = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "remoteuser",
        clientRequestId,
        body: "Here is the uploaded document",
        storageKeys: ["uploads/doc123.pdf"],
        fileMeta: JSON.stringify([
          { originalName: "doc123.pdf", mimeType: "application/pdf", sizeBytes: 2048 },
        ]),
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].name).toBe("doc123.pdf");
    expect(res.body.files[0].url).toBe("/api/uploads/file/file-uuid-1");
    expect(emittedEvents.length).toBeGreaterThan(0);
    expect(emittedEvents[0].files[0].url).toBe("/api/uploads/file/file-uuid-1");
  });

  test("preserves the circular video kind through remote upload and SSE", async () => {
    bindPendingUpload(appObj, userId, "uploads/video-note.webm");
    const res = await request(appObj.app).post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({ chatId, username: "remoteuser", clientRequestId, uploadType: "video_note", storageKeys: [{
        storageKey: "uploads/video-note.webm", originalName: "video-message.webm", mimeType: "video/webm",
        sizeBytes: 20480, width: 480, height: 480, durationSeconds: 3,
      }] });
    expect(res.status).toBe(200);
    expect(res.body.files[0]).toMatchObject({ kind: "video_note", width: 480, height: 480, durationSeconds: 3 });
    expect(emittedEvents[0].files[0].kind).toBe("video_note");
  });

  test("rejects nonvideo attachments masquerading as a circular video", async () => {
    bindPendingUpload(appObj, userId, "uploads/image.png");
    const res = await request(appObj.app).post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({ chatId, username: "remoteuser", clientRequestId, uploadType: "video_note", storageKeys: [{
        storageKey: "uploads/image.png", mimeType: "image/png", sizeBytes: 100,
      }] });
    expect(res.status).toBe(400);
    expect(emittedEvents).toHaveLength(0);
  });

  test("accepts storageKeys as JSON stringified array or object array", async () => {
    bindPendingUpload(appObj, userId, "uploads/image.png");
    const res = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "remoteuser",
        clientRequestId,
        body: "Check out this image",
        storageKeys: JSON.stringify([
          {
            storageKey: "uploads/image.png",
            originalName: "image.png",
            mimeType: "image/png",
            sizeBytes: 4096,
            widthPx: 800,
            heightPx: 600,
          },
        ]),
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].name).toBe("image.png");
    expect(res.body.files[0].width).toBe(800);
    expect(res.body.files[0].height).toBe(600);
    expect(res.body.files[0].url).toBe("/api/uploads/file/file-uuid-1");
  });

  test("rejects when no files or storageKeys are provided", async () => {
    const res = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "remoteuser",
        body: "No files",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("At least one file is required");
  });

  test("rejects when file count exceeds maxFiles limit", async () => {
    const res = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "remoteuser",
        storageKeys: [
          "uploads/file1.png",
          "uploads/file2.png",
          "uploads/file3.png",
          "uploads/file4.png",
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Maximum 3 files per message");
  });

  test("rejects when total presigned size exceeds maxTotalBytes limit", async () => {
    bindPendingUpload(appObj, userId, "uploads/huge.zip");
    const res = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "remoteuser",
        clientRequestId,
        storageKeys: [
          {
            storageKey: "uploads/huge.zip",
            sizeBytes: 20 * 1024 * 1024, // 20MB > 10MB limit
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Total upload size cannot exceed");
  });

  test("rejects dangerous file types in storageKeys", async () => {
    const customApp = makeApp({
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: chatId, name: "test-chat", type: "group" }),
        isDangerousUploadFile: (name) => name.endsWith(".exe"),
        storageProvider: mockRemoteProvider,
      },
    });
    const uId = customApp.userStore.createUser("testuser", "pass", "Test", null, "#fff");
    customApp.sessionStore.createSession(uId, sessionToken);
    bindPendingUpload(customApp, uId, "uploads/malware.exe");

    const res = await request(customApp.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "testuser",
        clientRequestId,
        storageKeys: ["uploads/malware.exe"],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("security reasons");
  });

  test("does not enqueue video transcode job or call worker when FILE_UPLOAD_TRANSCODE_VIDEOS is false", async () => {
    const enqueueJobMock = vi.fn();
    const customApp = makeApp({
      overrides: {
        settings: {
          FILE_UPLOAD_TRANSCODE_VIDEOS: false,
        },
      },
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: chatId, name: "test-chat", type: "group" }),
        storageProvider: mockRemoteProvider,
        enqueueVideoTranscodeJob: enqueueJobMock,
      },
    });
    const uId = customApp.userStore.createUser("testuser2", "pass", "Test", null, "#fff");
    customApp.sessionStore.createSession(uId, sessionToken);
    bindPendingUpload(customApp, uId, "uploads/clip.mp4");

    const res = await request(customApp.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "testuser2",
        clientRequestId,
        body: "Here is a video clip",
        storageKeys: [
          {
            storageKey: "uploads/clip.mp4",
            originalName: "clip.mp4",
            mimeType: "video/mp4",
            sizeBytes: 1024 * 1024,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });
});
