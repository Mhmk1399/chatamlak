import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "w0123456789abcde",
  nickname: null,
  avatar_url: null,
  color: "#66308d",
  status: "online",
  role: "user",
  banned: false,
};

describe("native Web authentication API", () => {
  it("starts PKCE authorization using a host-only HttpOnly transaction cookie", async () => {
    const { app } = makeApp({
      deps: {
        nativeAuthMode: "federated",
        startNativeWebAuthorization: vi.fn(async () => ({
          browserToken: "browser-secret",
          authorizationUrl: "https://web.example.test/api/v1/chat/authorize",
          form: {
            version: "1",
            redirectUri: "https://chat.example.test/auth/web/callback",
            state: "s".repeat(43),
            codeChallenge: "c".repeat(43),
            codeChallengeMethod: "S256",
          },
          expiresInSeconds: 300,
        })),
      },
    });

    const response = await request(app).post("/api/auth/web/start").expect(200);
    expect(response.body).not.toHaveProperty("browserToken");
    expect(response.headers["set-cookie"][0]).toContain("owj_chat_auth_tx=browser-secret");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).not.toContain("Domain=");
  });

  it("exchanges the callback for an opaque Chat session", async () => {
    const complete = vi.fn(async (input) => ({
      sessionToken: "opaque-chat-session",
      user: USER,
      provisioned: true,
      scopes: ["chat:access"],
    }));
    const { app } = makeApp({
      userStore: makeUserStore([USER]),
      deps: { nativeAuthMode: "federated", completeNativeWebAuthorization: complete },
    });

    const response = await request(app)
      .post("/api/auth/web/callback")
      .set("Cookie", "owj_chat_auth_tx=browser-secret")
      .send({ code: "one-time-code", state: "s".repeat(43) })
      .expect(200);

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      browserToken: "browser-secret",
      code: "one-time-code",
    }));
    expect(response.headers["set-cookie"].join("\n")).toContain("sid=opaque-chat-session");
    expect(response.body.user).not.toHaveProperty("webToken");
  });

  it("keeps local password sign-in behind explicit local test mode", async () => {
    const { app } = makeApp({ deps: { nativeAuthMode: "federated" } });
    const login = await request(app).post("/api/login")
      .send({ username: "alice", password: "secret123" }).expect(403);
    const register = await request(app).post("/api/register")
      .send({ username: "alice", password: "secret123" }).expect(403);
    expect(login.body.code).toBe("LOCAL_NATIVE_AUTH_DISABLED");
    expect(register.body.code).toBe("LOCAL_NATIVE_AUTH_DISABLED");
  });
});
