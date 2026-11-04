import { beforeEach, expect, test, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const USER = "11111111-1111-4111-8111-111111111111";
let app, deps;
beforeEach(() => {
  deps = { upsertPushSubscription: vi.fn(async () => {}), deletePushSubscription: vi.fn(async () => {}), VAPID_PUBLIC_KEY: "configured" };
  const fixture = makeApp({ userStore: makeUserStore([{ id: USER, username: "alice" }]), deps });
  fixture.sessionStore.createSession(USER, "push-session"); app = fixture.app;
});
test("waits for MongoDB to persist a subscription before returning success", async () => {
  let release;
  deps.upsertPushSubscription.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  let finished = false;
  const response = request(app).post("/api/push/subscribe").set("Cookie", "sid=push-session")
    .send({ username: "alice", subscription: { endpoint: "https://push.example.test/sub", keys: { p256dh: "key", auth: "auth" } } }).then(value => { finished = true; return value; });
  await vi.waitFor(() => expect(deps.upsertPushSubscription).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 25));
  try { expect(finished).toBe(false); } finally { release(); }
  expect((await response).status).toBe(200);
});
test("limits unsubscription to the signed-in account", async () => {
  const response = await request(app).post("/api/push/unsubscribe").set("Cookie", "sid=push-session").send({ username: "alice", endpoint: "https://push.example.test/sub" });
  expect(response.status).toBe(200); expect(deps.deletePushSubscription).toHaveBeenCalledWith("https://push.example.test/sub", USER);
});
