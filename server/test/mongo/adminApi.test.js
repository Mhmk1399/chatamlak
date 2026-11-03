import { test, expect } from "vitest";
import request from "supertest";
import { gunzipSync } from "node:zlib";
import { R, alice, group } from "./helpers.js";
import { createSessionHelpers } from "../../lib/sessions.js";
import { makeApp } from "../helpers/makeApp.js";

test("exposes native maintenance, owner details and backups through the authenticated admin panel", async () => {
  await R.setUserRole(alice, "owner"); await R.createSession(alice, "mongo-admin-test");
  const chat = await group();
  const sessions = createSessionHelpers({ getSession: R.getSession, touchSession: R.touchSession, isProduction: false });
  const { app } = makeApp({ deps: { ...R, ...sessions, mongoRepository: R, dbConfig: { client: "mongodb" } } });
  const cookie = "sid=mongo-admin-test";
  const info = await request(app).get("/api/admin/maintenance/info").set("Cookie", cookie);
  expect(info.status).toBe(200);
  expect(info.body).toMatchObject({ engine: "mongodb", backupExtension: ".json.gz", offlineRestoreRequired: true });
  const users = await request(app).get("/api/admin/users").set("Cookie", cookie);
  expect(users.status).toBe(200); expect(users.body.users).toHaveLength(2);
  expect(users.body.users.every((user) => !("password_hash" in user))).toBe(true);
  const chats = await request(app).get("/api/admin/chats").set("Cookie", cookie);
  expect(chats.status).toBe(200); expect(chats.body.chats.find((row) => row.id === chat)).toMatchObject({ owner_id: alice, owner_role: "owner" });
  const backup = await request(app).get("/api/admin/maintenance/download-db").set("Cookie", cookie).buffer(true).parse((response, done) => {
    const chunks = []; response.on("data", (chunk) => chunks.push(chunk)); response.on("end", () => done(null, Buffer.concat(chunks)));
  });
  expect(backup.status).toBe(200); expect(backup.headers["content-disposition"]).toContain(".json.gz");
  expect(JSON.parse(gunzipSync(backup.body).toString()).format).toBe("ouj-chat-mongodb-backup");
  const restore = await request(app).post("/api/admin/maintenance/restore").set("Cookie", cookie);
  expect(restore.status).toBe(409);
  expect(await R.store.count("users")).toBe(2);
});
