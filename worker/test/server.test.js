import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import {
  AsyncQueue,
  createWorkerServer as createWorkerServerImpl,
  isLoopbackUrl,
  hasEncryptedMagic,
  encryptThumbnail,
  validateResolvedWorkerJobPayload,
} from "../index.js";
import { createServiceAuthHeaders } from "../../shared/serviceAuth.js";
import { isEncryptedFileBuffer } from "../encryption.js";

const createWorkerServer = (options = {}) =>
  createWorkerServerImpl({
    requireSignedRequests: false,
    allowLoopbackUrls: true,
    ...options,
  });

describe("Media Worker HTTP Server", () => {
  it("does not log raw worker errors that can contain presigned credentials", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const queue = new AsyncQueue(1, 1);

    queue.push(async () => {
      throw new Error("download failed: https://storage.example/file?token=private-token");
    });
    await vi.waitFor(() => expect(queue.pending).toBe(0));

    const serialized = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("https://storage.example");
    errorSpy.mockRestore();
  });

  it("GET /health returns 200 OK with worker status and queue metrics", async () => {
    const server = createWorkerServer();
    const res = await request(server).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("ouj-chat-media-worker");
    expect(res.body.queue).toBeDefined();
    expect(typeof res.body.queue.concurrency).toBe("number");
  });

  it("POST /transcode rejects unauthorized requests when webhookSecret is configured", async () => {
    const server = createWorkerServer({
      webhookSecret: "secret-key-12345",
    });

    const res = await request(server)
      .post("/transcode")
      .send({ fileId: 1, storageKey: "uploads/clip.mp4" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("requires fresh one-time signed service credentials in strict mode", async () => {
    const secret = "strict-worker-secret-123456789";
    const headers = createServiceAuthHeaders({
      secret,
      method: "POST",
      path: "/transcode",
      nonce: "strict-nonce-123456",
    });
    const strictServer = createWorkerServerImpl({
      webhookSecret: secret,
      requireSignedRequests: true,
      processTranscodeJob: vi.fn().mockResolvedValue(true),
    });

    const accepted = await request(strictServer)
      .post("/transcode")
      .set(headers)
      .send({ fileId: "signed-1", storageKey: "uploads/signed.mp4" });
    const replayed = await request(strictServer)
      .post("/transcode")
      .set(headers)
      .send({ fileId: "signed-1", storageKey: "uploads/signed.mp4" });
    const legacyOnly = await request(strictServer)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", secret)
      .send({ fileId: "signed-2", storageKey: "uploads/signed.mp4" });

    expect(accepted.status).toBe(202);
    expect(replayed.status).toBe(401);
    expect(replayed.body.code).toBe("SERVICE_AUTH_REPLAYED");
    expect(legacyOnly.status).toBe(401);
  });

  it("rejects hostnames resolving to private addresses", async () => {
    await expect(validateResolvedWorkerJobPayload(
      { downloadUrl: "https://rebinding.example/video" },
      { lookup: async () => [{ address: "127.0.0.1", family: 4 }] },
    )).resolves.toEqual({
      status: 400,
      error: "downloadUrl resolves to a private or reserved address.",
    });
  });

  it("rejects loopback job destinations by default even for a signed request", async () => {
    const secret = "strict-worker-secret-123456789";
    const headers = createServiceAuthHeaders({
      secret,
      method: "POST",
      path: "/transcode",
      nonce: "loopback-nonce-12345",
    });
    const strictServer = createWorkerServerImpl({
      webhookSecret: secret,
      requireSignedRequests: true,
      processTranscodeJob: vi.fn(),
    });
    const response = await request(strictServer)
      .post("/transcode")
      .set(headers)
      .send({
        fileId: "signed-loopback",
        downloadUrl: "http://127.0.0.1:5174/private",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/loopback/i);
  });

  it("POST /transcode fails closed when webhookSecret is not configured", async () => {
    const server = createWorkerServer({ webhookSecret: "" });

    const res = await request(server).post("/transcode").send({ fileId: null });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it("POST /transcode rejects invalid request with missing fileId or storageKey", async () => {
    const server = createWorkerServer({ webhookSecret: "valid-secret" });

    const res = await request(server)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", "valid-secret")
      .send({ fileId: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("required");
  });

  it("POST /transcode accepts valid job with 202 and queues it", async () => {
    const mockProcessJob = vi.fn().mockResolvedValue(true);
    const server = createWorkerServer({
      webhookSecret: "valid-secret",
      processTranscodeJob: mockProcessJob,
    });

    const res = await request(server)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", "valid-secret")
      .send({
        fileId: "file-99",
        storageKey: "uploads/video.mp4",
        storedName: "video.mp4",
        mimeType: "video/mp4",
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.fileId).toBe("file-99");
  });

  it("uses the authenticated secret instead of a caller-selected callback secret", async () => {
    const mockProcessJob = vi.fn().mockResolvedValue(true);
    const server = createWorkerServer({
      webhookSecret: "trusted-secret",
      processTranscodeJob: mockProcessJob,
    });

    const res = await request(server)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", "trusted-secret")
      .send({
        fileId: "file-1",
        storageKey: "uploads/video.mp4",
        webhookSecret: "attacker-selected-secret",
      });

    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(mockProcessJob).toHaveBeenCalledTimes(1));
    expect(mockProcessJob.mock.calls[0][0].webhookSecret).toBe("trusted-secret");
  });

  it("rejects metadata-network URLs and unsafe storage endpoints", async () => {
    const mockProcessJob = vi.fn().mockResolvedValue(true);
    const server = createWorkerServer({
      webhookSecret: "trusted-secret",
      processTranscodeJob: mockProcessJob,
    });

    const downloadResponse = await request(server)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", "trusted-secret")
      .send({
        fileId: "file-1",
        downloadUrl: "http://169.254.169.254/latest/meta-data",
      });
    const storageResponse = await request(server)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", "trusted-secret")
      .send({
        fileId: "file-2",
        storageKey: "uploads/video.mp4",
        storageConfig: { endpoint: "http://169.254.169.254/storage" },
      });

    expect(downloadResponse.status).toBe(400);
    expect(downloadResponse.body.error).toMatch(/downloadUrl/i);
    expect(storageResponse.status).toBe(400);
    expect(storageResponse.body.error).toMatch(/storageConfig\.endpoint/i);
    expect(mockProcessJob).not.toHaveBeenCalled();
  });

  it("rejects mirror jobs above the configured processing cap", async () => {
    const processMirrorJob = vi.fn().mockResolvedValue(true);
    const server = createWorkerServer({
      webhookSecret: "trusted-secret",
      maxInputBytes: 1024,
      processMirrorJob,
    });

    const res = await request(server)
      .post("/mirror-media")
      .set("x-ouj-chat-webhook-secret", "trusted-secret")
      .send({
        jobId: "job-1",
        storageKey: "uploads/file.bin",
        maxBytes: 2048,
      });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/processing limit/i);
    expect(processMirrorJob).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before queuing work", async () => {
    const mockProcessJob = vi.fn().mockResolvedValue(true);
    const server = createWorkerServer({
      webhookSecret: "trusted-secret",
      processTranscodeJob: mockProcessJob,
    });

    const res = await request(server)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", "trusted-secret")
      .send({
        fileId: "file-1",
        storageKey: "uploads/video.mp4",
        padding: "x".repeat(1024 * 1024),
      });

    expect(res.status).toBe(413);
    expect(mockProcessJob).not.toHaveBeenCalled();
  });

  it("returns overload without acknowledging a job when the queue is full", async () => {
    const mockProcessJob = vi.fn().mockResolvedValue(true);
    const fullQueue = {
      pending: 4,
      size: 32,
      concurrency: 4,
      maxDepth: 32,
      push: vi.fn(() => false),
    };
    const server = createWorkerServer({
      webhookSecret: "trusted-secret",
      processTranscodeJob: mockProcessJob,
      jobQueue: fullQueue,
    });

    const res = await request(server)
      .post("/transcode")
      .set("x-ouj-chat-webhook-secret", "trusted-secret")
      .send({ fileId: "file-1", storageKey: "uploads/video.mp4" });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/queue is full/i);
    expect(fullQueue.push).toHaveBeenCalledTimes(1);
    expect(mockProcessJob).not.toHaveBeenCalled();
  });

  it("handles 404 for unknown endpoints", async () => {
    const server = createWorkerServer({ webhookSecret: "" });
    const res = await request(server).get("/unknown-endpoint");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });

  describe("isLoopbackUrl", () => {
    it("identifies only explicit local loopback hosts as loopback", () => {
      expect(isLoopbackUrl("http://127.0.0.1:5174/api/uploads/webhook/processed")).toBe(true);
      expect(isLoopbackUrl("http://localhost:5174/api/uploads/webhook/processed")).toBe(true);
      expect(isLoopbackUrl("http://0.0.0.0:8080/api/uploads/webhook/processed")).toBe(false);
    });

    it("identifies public/remote domains as non-loopback", () => {
      expect(isLoopbackUrl("https://ouj-chat-web.onrender.com/api/uploads/webhook/processed")).toBe(false);
      expect(isLoopbackUrl("https://api.example.com/webhook")).toBe(false);
      expect(isLoopbackUrl(null)).toBe(false);
      expect(isLoopbackUrl("not-a-valid-url")).toBe(false);
    });
  });

  describe("hasEncryptedMagic", () => {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ouj-magic-test-"));
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("detects the encrypted-file header regardless of the flag", () => {
      const p = path.join(tmpDir, "enc.mov");
      fs.writeFileSync(
        p,
        Buffer.concat([Buffer.from("OUJENC1\0", "utf8"), Buffer.alloc(64, 1)]),
      );
      expect(hasEncryptedMagic(p)).toBe(true);
    });

    it("returns false for plain video bytes and missing files", () => {
      const plain = path.join(tmpDir, "plain.mov");
      fs.writeFileSync(
        plain,
        Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
      );
      expect(hasEncryptedMagic(plain)).toBe(false);
      expect(hasEncryptedMagic(path.join(tmpDir, "nope.mov"))).toBe(false);
      expect(hasEncryptedMagic(null)).toBe(false);
    });
  });

  describe("encryptThumbnail", () => {
    let tmpDir;
    const originalKey = process.env.STORAGE_ENCRYPTION_KEY;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ouj-thumbenc-test-"));
      process.env.STORAGE_ENCRYPTION_KEY = "thumb-test-key";
    });
    afterEach(() => {
      if (originalKey === undefined) delete process.env.STORAGE_ENCRYPTION_KEY;
      else process.env.STORAGE_ENCRYPTION_KEY = originalKey;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("encrypts the thumbnail in place when the video is encrypted", () => {
      const p = path.join(tmpDir, "t.jpg");
      fs.writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
      expect(encryptThumbnail(p, true)).toBe(true);
      expect(isEncryptedFileBuffer(fs.readFileSync(p))).toBe(true);
    });

    it("leaves the thumbnail untouched when the video is plaintext", () => {
      const p = path.join(tmpDir, "t.jpg");
      const plain = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      fs.writeFileSync(p, plain);
      expect(encryptThumbnail(p, false)).toBe(false);
      expect(fs.readFileSync(p).equals(plain)).toBe(true);
    });

    it("is a no-op without a key or a file", () => {
      delete process.env.STORAGE_ENCRYPTION_KEY;
      const p = path.join(tmpDir, "t.jpg");
      const plain = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      fs.writeFileSync(p, plain);
      expect(encryptThumbnail(p, true)).toBe(false);
      expect(fs.readFileSync(p).equals(plain)).toBe(true);
      expect(encryptThumbnail(path.join(tmpDir, "nope.jpg"), true)).toBe(
        false,
      );
    });
  });
});
