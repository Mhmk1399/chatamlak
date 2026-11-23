import { describe, expect, it, vi } from "vitest";
import { createNativeWebIdentityClient } from "../../lib/nativeWebIdentityClient.js";

const ok = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

describe("native Web identity client", () => {
  it("exchanges a one-time PKCE code without leaking the service token into the body", async () => {
    const fetchImpl = vi.fn(async () => ok({
      version: 1,
      subject: "507f1f77bcf86cd799439011",
      accountStatus: "active",
      scopes: ["chat:access", "chat:call"],
      authorizationEstablishedAt: "2026-11-23T08:00:00.000Z",
      sessionExpiresAt: "2099-11-23T09:00:00.000Z",
      authorizationCacheMaxAgeSeconds: 60,
      crmActorAuthorization: "delegated-proof",
    }));
    const client = createNativeWebIdentityClient({
      exchangeUrl: "https://web.example.test/api/internal/v1/chat/exchange",
      statusUrl: "https://web.example.test/api/internal/v1/chat/identity/status",
      serviceToken: "x".repeat(32),
      fetchImpl,
    });

    const result = await client.exchange({
      code: "authorization-code",
      redirectUri: "https://chat.example.test/auth/web/callback",
      codeVerifier: "v".repeat(64),
      state: "s".repeat(43),
    });

    expect(result.subject).toBe("507f1f77bcf86cd799439011");
    const [, request] = fetchImpl.mock.calls[0];
    expect(request.headers.authorization).toBe(`Bearer ${"x".repeat(32)}`);
    expect(request.headers["x-owj-service"]).toBe("owj-chat-native");
    expect(request.body).not.toContain("x".repeat(32));
  });

  it("accepts the real Web delegated CRM proof envelope and retains only its token", async () => {
    const fetchImpl = vi.fn(async () => ok({
      version: 1,
      subject: "507f1f77bcf86cd799439011",
      accountStatus: "active",
      scopes: ["chat:access", "chat:call"],
      authorizationEstablishedAt: "2026-11-23T08:00:00.000Z",
      sessionExpiresAt: "2099-11-23T09:00:00.000Z",
      authorizationCacheMaxAgeSeconds: 60,
      crmActorAuthorization: {
        token: "delegated-proof",
        expiresInSeconds: 300,
      },
    }));
    const client = createNativeWebIdentityClient({
      exchangeUrl: "https://web.example.test/api/internal/v1/chat/exchange",
      statusUrl: "https://web.example.test/api/internal/v1/chat/identity/status",
      serviceToken: "x".repeat(32),
      fetchImpl,
    });

    const result = await client.exchange({
      code: "authorization-code",
      redirectUri: "https://chat.example.test/auth/web/callback",
      codeVerifier: "v".repeat(64),
      state: "s".repeat(43),
    });

    expect(result.crmActorAuthorization).toBe("delegated-proof");
  });

  it("fails closed when Web returns a revoked identity", async () => {
    const client = createNativeWebIdentityClient({
      exchangeUrl: "https://web.example.test/exchange",
      statusUrl: "https://web.example.test/status",
      serviceToken: "x".repeat(32),
      fetchImpl: vi.fn(async () => ok({ error: "TOKEN_REVOKED" }, 401)),
    });
    await expect(client.status({
      subject: "507f1f77bcf86cd799439011",
      authorizationEstablishedAt: "2026-11-23T08:00:00.000Z",
    })).rejects.toMatchObject({ code: "TOKEN_REVOKED", status: 401 });
  });
});
