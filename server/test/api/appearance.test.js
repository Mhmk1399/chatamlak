import { describe, expect, test, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const alice = "11111111-1111-4111-a111-111111111111";
function setup(result = { appearance: { wallpaperId: "courtyard", revision: 1 }, changed: true }, emit = vi.fn()) {
  const userStore = makeUserStore([{ id: alice, username: "alice", password_hash: "hash", chat_appearance: { wallpaperId: "leaves", revision: 3 } }]);
  const update = vi.fn().mockResolvedValue(result);
  const app = makeApp({ userStore, deps: { mongoRepository: { updateChatAppearance: update }, emitSseEvent: emit } });
  app.sessionStore.createSession(alice, "alice-session");
  return { ...app, update, emit };
}
const put = (app, data) => request(app).put("/api/profile/appearance").set("Cookie", "sid=alice-session").send(data);
describe("private account chat appearance", () => {
  test("requires authentication before accessing preferences", async () => {
    const { app, update } = setup();
    expect((await request(app).put("/api/profile/appearance").send({ wallpaperId: "leaves", revision: 0 })).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });
  test.each([{ wallpaperId: "https://elsewhere/image.svg", revision: 0 }, { wallpaperId: "plain", revision: "0" }, { wallpaperId: "plain", revision: -1 }, {}])("rejects invalid or untrusted preference data: %j", async (data) => {
    const { app, update } = setup(); expect((await put(app, data)).status).toBe(400); expect(update).not.toHaveBeenCalled();
  });
  test("uses only the authenticated account and broadcasts only to that account", async () => {
    const { app, update, emit } = setup();
    const response = await put(app, { wallpaperId: "courtyard", revision: 0, userId: "someone-else", username: "bob" });
    expect(response.status).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(update).toHaveBeenCalledWith(alice, "courtyard", 0);
    expect(emit).toHaveBeenCalledExactlyOnceWith("alice", expect.objectContaining({ type: "chat_appearance_updated", userId: alice }));
  });
  test("returns the authoritative preference on a stale edit and does not broadcast", async () => {
    const appearance = { wallpaperId: "leaves", revision: 3 };
    const { app, emit } = setup({ conflict: appearance });
    const response = await put(app, { wallpaperId: "plain", revision: 0 });
    expect(response.status).toBe(409); expect(response.body.chatAppearance).toEqual(appearance); expect(emit).not.toHaveBeenCalled();
  });
  test("does not invalidate cache or broadcast for an unchanged choice", async () => {
    const { app, emit } = setup({ appearance: { wallpaperId: "plain", revision: 0 }, changed: false });
    expect((await put(app, { wallpaperId: "plain", revision: 0 })).status).toBe(200); expect(emit).not.toHaveBeenCalled();
  });
  test("keeps a committed save successful if live broadcast fails", async () => {
    const { app } = setup(undefined, vi.fn().mockRejectedValue(new Error("disconnected")));
    expect((await put(app, { wallpaperId: "plain", revision: 0 })).status).toBe(200);
  });
  test("includes saved appearance in the existing private session response without exposing it in public profiles", async () => {
    const { app } = setup();
    const session = await request(app).get("/api/me").set("Cookie", "sid=alice-session");
    expect(session.body.chatAppearance).toMatchObject({ wallpaperId: "leaves", revision: 3 });
    expect(session.headers["cache-control"]).toBe("private, no-store");
    const profile = await request(app).get("/api/profile?username=alice").set("Cookie", "sid=alice-session");
    expect(profile.body).not.toHaveProperty("chatAppearance"); expect(profile.body).not.toHaveProperty("chat_appearance");
  });
});
