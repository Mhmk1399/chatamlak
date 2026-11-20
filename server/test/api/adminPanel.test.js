import { describe, test, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";
import { userEvents } from "../../lib/workers/autoAddWorker.js";

const temporaryPaths = [];
const TEST_OPERATOR_TOKEN = "test-operator-step-up-token";

afterEach(() => {
  temporaryPaths.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

function makeAdminApp(deps = {}, { role = "admin" } = {}) {
  const admin = { id: "a0000000-0000-4000-8000-000000000001", username: "admin", nickname: "Admin", role };
  const sessionStore = makeSessionStore();
  sessionStore.createSession(admin.id, "admin-session");
  return makeApp({
    sessionStore,
    userStore: makeUserStore([
      admin,
      { id: "b0000000-0000-4000-8000-000000000002", username: "bob", nickname: "Bob", role: "user" },
      { id: "c0000000-0000-4000-8000-000000000003", username: "carol", nickname: "Carol", role: "user" },
    ]),
    deps: {
      isUserAdmin: (userId) => userId === admin.id,
      isUserOwner: (userId) => userId === admin.id && role === "owner",
      findChatById: () => ({ id: "d0000000-0000-4000-8000-000000000009", name: "Test Group", type: "group" }),
      ...deps,
    },
  });
}

const operatorHeaders = (requestBuilder) =>
  requestBuilder
    .set("Cookie", "sid=admin-session")
    .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN);

describe("POST /api/admin/chats/:id/members", () => {
  test("creates and broadcasts a join system message for a newly added group member", async () => {
    const createMessage = vi.fn();
    const emitChatEvent = vi.fn();
    const { app } = makeAdminApp({
      addChatMember: () => 1,
      createMessage,
      emitChatEvent,
    });

    const res = await request(app)
      .post("/api/admin/chats/d0000000-0000-4000-8000-000000000009/members")
      .set("Cookie", "sid=admin-session")
      .send({ userId: "b0000000-0000-4000-8000-000000000002" });

    expect(res.status).toBe(200);
    expect(createMessage).toHaveBeenCalledWith(
      "d0000000-0000-4000-8000-000000000009",
      "a0000000-0000-4000-8000-000000000001",
      "[[system:joined:Bob]]",
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true },
    );
    expect(emitChatEvent).toHaveBeenCalledWith("d0000000-0000-4000-8000-000000000009", {
      type: "chat_message",
      chatId: "d0000000-0000-4000-8000-000000000009",
      username: "admin",
      userId: "a0000000-0000-4000-8000-000000000001",
      body: "[[system:joined:Bob]]",
    });
  });

  test("creates a join system message for every bulk-added group member", async () => {
    const createMessage = vi.fn();
    const emitChatEvent = vi.fn();
    const { app } = makeAdminApp({
      addAllEligibleChatMembers: () => ({
        addedUsers: [
          { id: "b0000000-0000-4000-8000-000000000002", username: "bob", nickname: "Bob" },
          { id: "c0000000-0000-4000-8000-000000000003", username: "carol", nickname: "Carol" },
        ],
        skippedLeftCount: 1,
      }),
      createMessage,
      emitChatEvent,
    });

    const res = await request(app)
      .post("/api/admin/chats/d0000000-0000-4000-8000-000000000009/members")
      .set("Cookie", "sid=admin-session")
      .send({ all: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ addedCount: 2, skippedLeftCount: 1 });
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(emitChatEvent).toHaveBeenCalledWith("d0000000-0000-4000-8000-000000000009", {
      type: "chat_message",
      chatId: "d0000000-0000-4000-8000-000000000009",
      username: "admin",
      userId: "a0000000-0000-4000-8000-000000000001",
      body: "[[system:joined:Bob]]",
    });
    expect(emitChatEvent).toHaveBeenCalledWith("d0000000-0000-4000-8000-000000000009", {
      type: "chat_message",
      chatId: "d0000000-0000-4000-8000-000000000009",
      username: "admin",
      userId: "a0000000-0000-4000-8000-000000000001",
      body: "[[system:joined:Carol]]",
    });
  });
});

describe("PostgreSQL maintenance actions", () => {
  test("reports PostgreSQL-specific capabilities", async () => {
    const { app } = makeAdminApp({ dbConfig: { client: "postgres" } });

    const res = await request(app)
      .get("/api/admin/maintenance/info")
      .set("Cookie", "sid=admin-session");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      engine: "postgres",
      backupExtension: ".dump",
      offlineRestoreRequired: true,
      offlineDeleteRequired: true,
    });
  });

  test("keeps high-risk database actions out of the general admin role", async () => {
    const reset = vi.fn(async () => ({}));
    const backup = vi.fn(async () => {});
    const { app } = makeAdminApp({
      operatorApiToken: TEST_OPERATOR_TOKEN,
      adminResetDatabase: reset,
      dbConfig: { client: "postgres" },
      postgresMaintenance: { backup },
    });

    const resetRes = await request(app)
      .post("/api/admin/maintenance/reset")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN)
      .send({ confirm: "reset everything" });
    const exportRes = await request(app)
      .get("/api/admin/maintenance/download-db")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN);

    expect(resetRes.status).toBe(403);
    expect(exportRes.status).toBe(403);
    expect(reset).not.toHaveBeenCalled();
    expect(backup).not.toHaveBeenCalled();
  });

  test("fails closed when owner step-up authentication is not configured", async () => {
    const reset = vi.fn(async () => ({}));
    const { app } = makeAdminApp(
      { operatorApiToken: "", adminResetDatabase: reset },
      { role: "owner" },
    );

    const res = await request(app)
      .post("/api/admin/maintenance/reset")
      .set("Cookie", "sid=admin-session")
      .send({ confirm: "reset everything" });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
    expect(reset).not.toHaveBeenCalled();
  });

  test("requires a valid operator step-up token from an owner", async () => {
    const reset = vi.fn(async () => ({}));
    const { app } = makeAdminApp(
      { operatorApiToken: TEST_OPERATOR_TOKEN, adminResetDatabase: reset },
      { role: "owner" },
    );

    const missing = await request(app)
      .post("/api/admin/maintenance/reset")
      .set("Cookie", "sid=admin-session")
      .send({ confirm: "reset everything" });
    const wrong = await request(app)
      .post("/api/admin/maintenance/reset")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", "wrong-token")
      .send({ confirm: "reset everything" });

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(reset).not.toHaveBeenCalled();
  });

  test("uses native PostgreSQL maintenance dependencies for backup, vacuum, and reset", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ouj-chat-admin-panel-"));
    temporaryPaths.push(directory);
    const backup = vi.fn(async (target) => fs.writeFileSync(target, "archive"));
    const vacuum = vi.fn(async () => {});
    const reset = vi.fn(async () => ({ storedNames: ["message.bin"] }));
    const removeStoredFileNames = vi.fn();
    const { app } = makeAdminApp(
      {
        operatorApiToken: TEST_OPERATOR_TOKEN,
        dbConfig: { client: "postgres" },
        postgresMaintenance: { backup, vacuum },
        adminResetDatabase: reset,
        removeStoredFileNames,
        fs,
        path,
        dataDir: directory,
      },
      { role: "owner" },
    );

    const backupRes = await operatorHeaders(
      request(app).get("/api/admin/maintenance/download-db"),
    );
    expect(backupRes.status).toBe(200);
    expect(backup).toHaveBeenCalledTimes(1);
    expect(backup.mock.calls[0][0]).toMatch(/\.dump$/);
    expect(fs.existsSync(backup.mock.calls[0][0])).toBe(false);

    const vacuumRes = await operatorHeaders(
      request(app).post("/api/admin/maintenance/vacuum"),
    );
    expect(vacuumRes.status).toBe(200);
    expect(vacuum).toHaveBeenCalledTimes(1);

    const resetRes = await request(app)
      .post("/api/admin/maintenance/reset")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN)
      .send({ confirm: "reset everything" });
    expect(resetRes.status).toBe(200);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(removeStoredFileNames).toHaveBeenCalledWith(["message.bin"]);
  });

  test("does not persist raw PostgreSQL backup errors in the admin audit log", async () => {
    const privateError = "pg_dump failed for private-db.example/customer";
    const writeAdminAuditLog = vi.fn();
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "ouj-chat-admin-log-redaction-"),
    );
    temporaryPaths.push(directory);
    const { app } = makeAdminApp(
      {
        operatorApiToken: TEST_OPERATOR_TOKEN,
        dbConfig: { client: "postgres" },
        postgresMaintenance: {
          backup: vi.fn(async () => {
            throw new Error(privateError);
          }),
        },
        writeAdminAuditLog,
        fs,
        path,
        dataDir: directory,
      },
      { role: "owner" },
    );

    const res = await operatorHeaders(
      request(app).get("/api/admin/maintenance/download-db"),
    );

    expect(res.status).toBe(500);
    const audit = JSON.stringify(writeAdminAuditLog.mock.calls);
    expect(audit).not.toContain(privateError);
    expect(audit).toContain("postgres_backup_failed");
  });

  test("awaits clear-messages work before removing files", async () => {
    const clearMessages = vi.fn(async () => ({ storedNames: ["message.bin"] }));
    const removeStoredFileNames = vi.fn();
    const { app } = makeAdminApp(
      {
        operatorApiToken: TEST_OPERATOR_TOKEN,
        dbConfig: { client: "postgres" },
        adminClearAllMessages: clearMessages,
        removeStoredFileNames,
      },
      { role: "owner" },
    );

    const res = await request(app)
      .post("/api/admin/maintenance/clear-messages")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN)
      .send({ confirm: "clear messages" });

    expect(res.status).toBe(200);
    expect(removeStoredFileNames).toHaveBeenCalledWith(["message.bin"]);
  });

  test("keeps destructive PostgreSQL restore and deletion offline-only", async () => {
    const restore = vi.fn(async () => {});
    const dropDatabase = vi.fn(async () => {});
    const { app } = makeAdminApp(
      {
        operatorApiToken: TEST_OPERATOR_TOKEN,
        dbConfig: { client: "postgres" },
        postgresMaintenance: { restore, dropDatabase },
      },
      { role: "owner" },
    );

    const restoreRes = await request(app)
      .post("/api/admin/maintenance/restore")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN)
      .attach("database", Buffer.from("archive"), "ouj-chat.dump");
    expect(restoreRes.status).toBe(409);
    expect(restore).not.toHaveBeenCalled();

    const deleteRes = await request(app)
      .post("/api/admin/maintenance/delete")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN)
      .send({ confirm: "delete postgres database" });
    expect(deleteRes.status).toBe(409);
    expect(dropDatabase).not.toHaveBeenCalled();
  });

  test("restores SQLite database through restoreDatabase and reloads settings", async () => {
    const restoreDatabase = vi.fn(async () => {});
    const loadSettings = vi.fn(async () => {});
    const broadcastAll = vi.fn();
    const { app } = makeAdminApp(
      {
        operatorApiToken: TEST_OPERATOR_TOKEN,
        restoreDatabase,
        loadSettings,
        broadcastAll,
      },
      { role: "owner" },
    );

    const validHeader = Buffer.from("SQLite format 3\0");
    const mockDbBuffer = Buffer.concat([validHeader, Buffer.alloc(100)]);

    const res = await request(app)
      .post("/api/admin/maintenance/restore")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN)
      .attach("database", mockDbBuffer, "backup.db");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(restoreDatabase).toHaveBeenCalledWith(expect.any(Buffer));
    expect(loadSettings).toHaveBeenCalled();
    expect(broadcastAll).toHaveBeenCalledWith({ type: "session_revoked" });
  });

  test("cleans up stale WAL and SHM files in SQLite restore fallback", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ouj-chat-admin-restore-"));
    temporaryPaths.push(tempDir);
    const dbPath = path.join(tempDir, "ouj-chat.db");
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    fs.writeFileSync(dbPath, "OLD_DB");
    fs.writeFileSync(walPath, "OLD_WAL");
    fs.writeFileSync(shmPath, "OLD_SHM");

    const reloadDatabase = vi.fn();
    const { app } = makeAdminApp(
      {
        operatorApiToken: TEST_OPERATOR_TOKEN,
        dataDir: tempDir,
        fs,
        path,
        restoreDatabase: null,
        reloadDatabase,
      },
      { role: "owner" },
    );

    const validHeader = Buffer.from("SQLite format 3\0");
    const newDbBuffer = Buffer.concat([validHeader, Buffer.from("NEW_RESTORED_DB")]);

    const res = await request(app)
      .post("/api/admin/maintenance/restore")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", TEST_OPERATOR_TOKEN)
      .attach("database", newDbBuffer, "backup.db");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(fs.existsSync(walPath)).toBe(false);
    expect(fs.existsSync(shmPath)).toBe(false);
    expect(fs.readFileSync(dbPath)).toEqual(newDbBuffer);
    expect(reloadDatabase).toHaveBeenCalled();
  });
});

describe("host operations", () => {
  test("requires owner operator step-up before exposing integration secrets or infrastructure logs", async () => {
    const { app } = makeAdminApp(
      { operatorApiToken: TEST_OPERATOR_TOKEN },
      { role: "owner" },
    );

    const secrets = await request(app)
      .get("/api/admin/secrets")
      .set("Cookie", "sid=admin-session");
    const serviceLog = await request(app)
      .get("/api/admin/logs/service")
      .set("Cookie", "sid=admin-session");

    expect(secrets.status).toBe(401);
    expect(serviceLog.status).toBe(401);
  });

  test("reports in-process service and nginx controls as infrastructure-managed", async () => {
    const { app } = makeAdminApp(
      { operatorApiToken: TEST_OPERATOR_TOKEN },
      { role: "owner" },
    );

    const available = await request(app)
      .get("/api/admin/service/available")
      .set("Cookie", "sid=admin-session");
    const restart = await operatorHeaders(
      request(app).post("/api/admin/service/restart"),
    );
    const nginx = await operatorHeaders(
      request(app).post("/api/admin/nginx/reload"),
    );

    expect(available.status).toBe(200);
    expect(available.body).toMatchObject({
      available: false,
      managedBy: "infrastructure",
    });
    expect(restart.status).toBe(503);
    expect(restart.body.error).toMatch(/infrastructure/i);
    expect(nginx.status).toBe(503);
    expect(nginx.body.error).toMatch(/infrastructure/i);
  });
});

describe("admin settings audit redaction", () => {
  test("records the setting key without persisting its value", async () => {
    const privateValue = "https://worker.example/path?token=private-token";
    const writeAdminAuditLog = vi.fn();
    const { app } = makeAdminApp({
      writeAdminAuditLog,
      setSetting: vi.fn(() => ({ ok: true, value: privateValue })),
      getAllSettings: vi.fn(() => []),
    });

    const res = await request(app)
      .put("/api/admin/settings/WORKER_URL")
      .set("Cookie", "sid=admin-session")
      .send({ value: privateValue });

    expect(res.status).toBe(200);
    const audit = JSON.stringify(writeAdminAuditLog.mock.calls);
    expect(audit).toContain("WORKER_URL");
    expect(audit).not.toContain(privateValue);
  });
});

describe("account session invalidation", () => {
  test("closes existing realtime sockets when an administrator bans a user", async () => {
    const disconnectUserSessions = vi.fn();
    const { app } = makeAdminApp({
      adminBanUser: vi.fn(async () => {}),
      setUserRole: vi.fn(async () => {}),
      disconnectUserSessions,
    });

    const res = await request(app)
      .post("/api/admin/users/b0000000-0000-4000-8000-000000000002/ban")
      .set("Cookie", "sid=admin-session")
      .send({ banned: true });

    expect(res.status).toBe(200);
    expect(disconnectUserSessions).toHaveBeenCalledWith("bob", "banned");
  });
});

describe("async PostgreSQL admin dependencies", () => {
  test("/api/admin/chats awaits the async chat list result", async () => {
    const chats = [{ id: "d0000000-0000-4000-8000-000000000009", name: "Async Group", type: "group" }];
    const { app } = makeAdminApp({
      adminListChats: vi.fn().mockResolvedValue({ chats, total: 1 }),
    });

    const res = await request(app)
      .get("/api/admin/chats")
      .set("Cookie", "sid=admin-session");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chats, total: 1 });
  });
});

describe("admin presence overlays", () => {
  test("/api/admin/users marks connected online users with online: 1", async () => {
    const { app } = makeAdminApp({
      adminListUsers: () => ({
        users: [{ id: "b0000000-0000-4000-8000-000000000002", username: "bob", status: "online", role: "user", banned: 0, verified: 0 }],
        total: 1,
      }),
      isConnected: () => true,
    });

    const res = await request(app)
      .get("/api/admin/users")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(res.body.users[0].online).toBe(1);
  });

  test("/api/admin/stats reports live onlineUsers from getOnlineCount", async () => {
    const { app } = makeAdminApp({
      getAdminStats: () => ({ onlineUsers: 0, totalUsers: 1 }),
      getOnlineCount: () => 1,
    });

    const res = await request(app)
      .get("/api/admin/stats")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(res.body.onlineUsers).toBe(1);
  });
});

describe("POST /api/admin/users verified status", () => {
  test("creates user with verified=1 when verified: true is passed", async () => {
    const adminRun = vi.fn();
    let calls = 0;
    const adminGetRow = vi.fn().mockImplementation((sql) => {
      const lower = String(sql || "").toLowerCase();
      if (lower.includes("users")) {
        calls += 1;
        if (calls === 1) return null;
        return { id: "u0000000-0000-4000-8000-000000000099", username: "newverified", nickname: "Verified User", color: "#10b981", role: "user", verified: 1 };
      }
      return null;
    });

    const { app } = makeAdminApp({
      adminRun,
      adminGetRow,
    });

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", "sid=admin-session")
      .send({
        username: "newverified",
        nickname: "Verified User",
        password: "password123",
        verified: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: "newverified", verified: 1 });
    expect(adminRun).toHaveBeenCalledWith(
      expect.stringMatching(/insert into/i),
      expect.arrayContaining([1]),
    );
  });

  test("emits user:created event when admin creates a user", async () => {
    const adminRun = vi.fn();
    let calls = 0;
    const adminGetRow = vi.fn().mockImplementation((sql) => {
      const lower = String(sql || "").toLowerCase();
      if (lower.includes("users")) {
        calls += 1;
        if (calls === 1) return null;
        return { id: "u0000000-0000-4000-8000-000000000099", username: "admincreated", nickname: "Admin Created", color: "#10b981", role: "user", verified: 0 };
      }
      return null;
    });

    const { app } = makeAdminApp({ adminRun, adminGetRow });
    const emitted = [];
    const handler = (data) => emitted.push(data);
    userEvents.on("user:created", handler);

    try {
      const res = await request(app)
        .post("/api/admin/users")
        .set("Cookie", "sid=admin-session")
        .send({
          username: "admincreated",
          nickname: "Admin Created",
          password: "password123",
        });

      expect(res.status).toBe(201);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].userId).toBeDefined();
    } finally {
      userEvents.off("user:created", handler);
    }
  });
});
