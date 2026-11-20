import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { makeApp } from "../helpers/makeApp.js";
import { createUploadTools } from "../../lib/uploads.js";

const ALICE_ID = "10000000-0000-4000-8000-000000000001";
const BOB_ID = "10000000-0000-4000-8000-000000000002";
const MESSAGE_ID = "20000000-0000-4000-8000-000000000001";
const PRIVATE_CHAT_ID = "30000000-0000-4000-8000-000000000001";
const PUBLIC_CHAT_ID = "30000000-0000-4000-8000-000000000002";

function makeMediaApp({ publicChannel = false, members = [] } = {}) {
  const chatId = publicChannel ? PUBLIC_CHAT_ID : PRIVATE_CHAT_ID;
  const file = {
    id: 41,
    message_id: MESSAGE_ID,
    stored_name: "private-photo.jpg",
    original_name: "private-photo.jpg",
    mime_type: "image/jpeg",
    storage_driver: "s3",
    storage_key: "uploads/messages/private-photo.jpg",
    thumb_storage_key: "uploads/messages/private-photo-thumb.jpg",
    encryption_type: "none",
  };
  const message = { id: MESSAGE_ID, chat_id: chatId, user_id: ALICE_ID };
  const chat = {
    id: chatId,
    type: publicChannel ? "channel" : "group",
    group_visibility: publicChannel ? "public" : "private",
  };
  const storageProvider = {
    type: "s3",
    getDownloadUrl: vi.fn(
      async (key) => `https://bucket.example/${key}?signature=test`,
    ),
  };
  const appObj = makeApp({
    deps: {
      storageProvider,
      findMessageFileById: (id) =>
        String(id) === String(file.id) ? file : null,
      findMessageById: (id) => (String(id) === MESSAGE_ID ? message : null),
      findChatById: (id) => (String(id) === chatId ? chat : null),
      isMember: (_chatId, userId) => members.includes(userId),
      adminGetRow: (query) => {
        const sql = String(query?.toSQL?.().sql || query || "");
        if (sql.includes("chat_message_files")) return file;
        if (sql.includes("chat_messages")) return message;
        if (sql.includes("chats")) return chat;
        return null;
      },
    },
  });
  appObj.userStore.users.set("alice", {
    id: ALICE_ID,
    username: "alice",
    password_hash: "hash",
    nickname: "Alice",
    role: "user",
    status: "online",
  });
  appObj.userStore.users.set("bob", {
    id: BOB_ID,
    username: "bob",
    password_hash: "hash",
    nickname: "Bob",
    role: "user",
    status: "online",
  });
  appObj.sessionStore.createSession(ALICE_ID, "alice-session");
  appObj.sessionStore.createSession(BOB_ID, "bob-session");
  return { ...appObj, file, message, chat, storageProvider };
}

describe("private message media authorization", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("denies anonymous and nonmember direct file-id enumeration", async () => {
    const appObj = makeMediaApp();

    const anonymous = await request(appObj.app).get("/api/uploads/file/41");
    expect(anonymous.status).toBe(401);

    const nonmember = await request(appObj.app)
      .get("/api/uploads/file/41")
      .set("Cookie", ["sid=bob-session"]);
    expect(nonmember.status).toBe(403);
    expect(appObj.storageProvider.getDownloadUrl).not.toHaveBeenCalled();
  });

  test("rechecks current membership so a removed member loses access", async () => {
    const members = [ALICE_ID];
    const appObj = makeMediaApp({ members });

    const allowed = await request(appObj.app)
      .get("/api/uploads/file/41")
      .set("Cookie", ["sid=alice-session"]);
    expect(allowed.status).toBe(302);

    members.splice(0, members.length);
    const removed = await request(appObj.app)
      .get("/api/uploads/file/41")
      .set("Cookie", ["sid=alice-session"]);
    expect(removed.status).toBe(403);
  });

  test("protects thumbnails with the same current-membership check", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    const appObj = makeMediaApp({ members: [ALICE_ID] });

    expect(
      (await request(appObj.app).get("/api/uploads/thumbs/41")).status,
    ).toBe(401);

    const allowed = await request(appObj.app)
      .get("/api/uploads/thumbs/41")
      .set("Cookie", ["sid=alice-session"]);
    expect(allowed.status).toBe(200);
    expect(allowed.headers["cache-control"]).toContain("private");
  });

  test("allows anonymous media only for an explicitly public channel", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    const appObj = makeMediaApp({ publicChannel: true });

    const file = await request(appObj.app).get("/api/uploads/file/41");
    expect(file.status).toBe(302);
    const thumb = await request(appObj.app).get("/api/uploads/thumbs/41");
    expect(thumb.status).toBe(200);
    expect(thumb.headers["cache-control"]).toContain("public");
  });
});

describe("stored-name and byte-range authorization", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ouj-media-auth-"));
    fs.writeFileSync(path.join(tmpDir, "private.txt"), Buffer.from("secret-data"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function registerStoredNameRoute(appObj, members) {
    const row = {
      id: 52,
      message_id: MESSAGE_ID,
      stored_name: "private.txt",
      original_name: "private.txt",
      mime_type: "text/plain",
      storage_driver: "local",
      storage_key: "uploads/messages/private.txt",
    };
    const message = {
      id: MESSAGE_ID,
      chat_id: PRIVATE_CHAT_ID,
      user_id: ALICE_ID,
    };
    const chat = {
      id: PRIVATE_CHAT_ID,
      type: "group",
      group_visibility: "private",
    };
    const adminGetRow = () => row;
    const tools = createUploadTools({
      fs,
      path,
      crypto: awaitImportPlaceholder,
      multer,
      adminGetRow,
      uploadRootDir: tmpDir,
      avatarUploadRootDir: tmpDir,
      fileUploadMaxSize: 1024,
      fileUploadMaxFiles: 2,
      fileUploadMaxTotalSize: 2048,
      storageEncryption: {
        getDecryptedFileSize: (target) => fs.statSync(target).size,
        decryptFileRange: (target, start, end) =>
          fs.readFileSync(target).subarray(start, end + 1),
        decryptFileToBuffer: (target) => fs.readFileSync(target),
      },
      storageProvider: { type: "local" },
    });
    tools.registerUploadRoutes(appObj.app, {
      adminGetRow,
      requireSession: appObj.deps.requireSession,
      getSessionFromRequest: appObj.deps.getSessionFromRequest,
      findMessageById: () => message,
      findChatById: () => chat,
      isMember: (_chatId, userId) => members.includes(userId),
    });
  }

  test("denies anonymous ranges and serves them to a current member", async () => {
    const appObj = makeMediaApp({ members: [ALICE_ID] });
    registerStoredNameRoute(appObj, [ALICE_ID]);

    const anonymous = await request(appObj.app)
      .get("/api/uploads/messages/private.txt")
      .set("Range", "bytes=0-5");
    expect(anonymous.status).toBe(401);

    const allowed = await request(appObj.app)
      .get("/api/uploads/messages/private.txt")
      .set("Cookie", ["sid=alice-session"])
      .set("Range", "bytes=0-5");
    expect(allowed.status).toBe(206);
    expect(allowed.text).toBe("secret");
    expect(allowed.headers["cache-control"]).toContain("private");
  });
});

// createUploadTools only passes this value into multer's disk-storage setup;
// the stored-name tests do not invoke an upload middleware.
const awaitImportPlaceholder = {
  randomBytes: () => Buffer.alloc(8),
};
