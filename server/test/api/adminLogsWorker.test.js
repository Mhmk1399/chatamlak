import { describe, test, expect } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

function makeAdminApp({ owner = true } = {}) {
  const admin = {
    id: "a0000000-0000-4000-8000-000000000001",
    username: "admin",
    nickname: "Admin",
    role: "owner",
  };
  const user = {
    id: "b0000000-0000-4000-8000-000000000002",
    username: "bob",
    nickname: "Bob",
    role: "user",
  };
  const sessionStore = makeSessionStore();
  sessionStore.createSession(admin.id, "admin-session");
  sessionStore.createSession(user.id, "user-session");
  const { app } = makeApp({
    sessionStore,
    userStore: makeUserStore([admin, user]),
    deps: {
      isUserAdmin: (userId) => userId === admin.id,
      isUserOwner: (userId) => owner && userId === admin.id,
      operatorApiToken: "logs-operator-token",
    },
  });
  return app;
}

describe("GET /api/admin/logs/worker", () => {
  test("returns the standard system-log shape for an owner with operator step-up", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/worker")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", "logs-operator-token");
    expect(res.status).toBe(200);
    expect(typeof res.body.available).toBe("boolean");
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  test("rejects unauthenticated requests", async () => {
    const app = makeAdminApp();
    const res = await request(app).get("/api/admin/logs/worker");
    expect(res.status).toBe(401);
  });

  test("rejects non-admin users", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/worker")
      .set("Cookie", "sid=user-session");
    expect(res.status).toBe(403);
  });

  test("rejects a non-owner admin even with the operator credential", async () => {
    const app = makeAdminApp({ owner: false });
    const res = await request(app)
      .get("/api/admin/logs/worker")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", "logs-operator-token");
    expect(res.status).toBe(403);
  });

  test("rejects an owner without operator step-up", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/worker")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(401);
  });

  test("rejects an invalid operator credential", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/worker")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", "wrong-operator-token");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/logs/sources", () => {
  test("includes the worker source so the UI can gray it out when remote", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/sources")
      .set("Cookie", "sid=admin-session")
      .set("x-ouj-chat-operator-token", "logs-operator-token");
    expect(res.status).toBe(200);
    expect(res.body.sources.worker).toBeDefined();
    expect(typeof res.body.sources.worker.available).toBe("boolean");
  });
});
