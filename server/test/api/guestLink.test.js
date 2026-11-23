import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { makeApp } from "../helpers/makeApp.js";

describe("cross-repository guest history linking", () => {
  it("starts only with explicit intent and a host-only HttpOnly transaction cookie", async () => {
    const start = vi.fn(async () => ({
      browserToken: "guest-link-browser-secret",
      authorizationUrl: "https://web.example.test/api/v1/support/guest-link/authorize",
      form: { version: "1", intent: "link_guest_history", state: "s".repeat(43) },
      expiresInSeconds: 300,
    }));
    const { app } = makeApp({ deps: {
      getSessionFromRequest: vi.fn(async () => ({ id: "chat-user", auth_kind: "web_federated", web_subject: "507f1f77bcf86cd799439011" })),
      startGuestHistoryLink: start,
    } });
    const response = await request(app).post("/api/integrations/support/guest-link/start")
      .send({ intent: "link_guest_history" }).expect(200);
    expect(response.headers["set-cookie"][0]).toContain("owj_chat_guest_link_tx=guest-link-browser-secret");
    expect(response.headers["set-cookie"][0]).toContain("Path=/api/integrations/support/guest-link");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ web_subject: "507f1f77bcf86cd799439011" }));
  });

  it("consumes the browser-bound callback and deletes its transaction cookie", async () => {
    const complete = vi.fn(async () => ({ convertedCount: 2 }));
    const { app } = makeApp({ deps: {
      getSessionFromRequest: vi.fn(async () => ({ id: "chat-user", auth_kind: "web_federated", web_subject: "507f1f77bcf86cd799439011" })),
      completeGuestHistoryLink: complete,
    } });
    const response = await request(app)
      .get(`/api/integrations/support/guest-link/callback?code=${"c".repeat(43)}&state=${"s".repeat(43)}`)
      .set("Cookie", "owj_chat_guest_link_tx=guest-link-browser-secret")
      .expect(200);
    expect(response.body).toMatchObject({ linked: true, convertedCount: 2 });
    expect(response.headers["set-cookie"].find((value) => value.startsWith("owj_chat_guest_link_tx=")))
      .toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ browserToken: "guest-link-browser-secret" }));
  });
});
