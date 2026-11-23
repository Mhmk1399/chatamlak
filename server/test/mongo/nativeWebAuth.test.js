import { describe, expect, test } from "vitest";
import { R, db } from "./helpers.js";

describe("native Web auth persistence on isolated MongoDB", () => {
  test("consumes a browser-bound PKCE transaction exactly once", async () => {
    await R.createNativeWebAuthTransaction({
      id: "auth-transaction-1",
      stateDigest: `sha256:${"a".repeat(64)}`,
      browserTokenDigest: `sha256:${"b".repeat(64)}`,
      codeVerifier: "v".repeat(64),
      redirectUri: "https://chat.example.test/auth/web/callback",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const results = await Promise.all(Array.from({ length: 4 }, () => R.consumeNativeWebAuthTransaction({
      stateDigest: `sha256:${"a".repeat(64)}`,
      browserTokenDigest: `sha256:${"b".repeat(64)}`,
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject({ code_verifier: "v".repeat(64) });
  });

  test("provisions one isolated Chat user and reuses the explicit identity link", async () => {
    const subject = "507f1f77bcf86cd799439011";
    const results = await Promise.all(Array.from({ length: 3 }, () => R.provisionNativeWebUser({ webUserId: subject })));
    expect(new Set(results.map((result) => result.user.id)).size).toBe(1);
    expect(results[0].user.username).toMatch(/^w[a-f0-9]{15}$/);
    expect(results[0].user.password_hash).toBe("!web-federated!");
    expect(await db.collection("platform_identity_links").countDocuments({ web_user_id: subject })).toBe(1);
  });

  test("persists federated session metadata without returning the opaque token", async () => {
    const account = await R.provisionNativeWebUser({ webUserId: "507f191e810c19729de860ea" });
    await R.createSession(account.user.id, "opaque-browser-token", {
      authKind: "web_federated",
      webSubject: "507f191e810c19729de860ea",
      webScopes: ["chat:access", "chat:call"],
      authorizationEstablishedAt: "2026-11-23T08:00:00.000Z",
      sessionExpiresAt: "2099-11-23T09:00:00.000Z",
      authorizationCheckedAt: "2026-11-23T08:00:01.000Z",
      authorizationCacheMaxAgeSeconds: 60,
      crmActorAuthorization: "delegated-proof",
    });
    const session = await R.getSession("opaque-browser-token");
    expect(session).toMatchObject({
      auth_kind: "web_federated",
      web_subject: "507f191e810c19729de860ea",
      web_scopes: ["chat:access", "chat:call"],
    });
    expect(session).not.toHaveProperty("token");
  });
});
