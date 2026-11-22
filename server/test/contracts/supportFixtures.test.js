import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  createServiceAuthHeaders,
  createServiceReplayGuard,
  verifyServiceAuth,
} from "../../../shared/serviceAuth.js";
import { SUPPORT_COOKIE, SUPPORT_COOKIE_PATH } from "../../api/support.js";

const fixtureDirectory = fileURLToPath(
  new URL("../../../docs/platform/fixtures/support-v1/", import.meta.url),
);

async function load(name) {
  return JSON.parse(await readFile(`${fixtureDirectory}/${name}`, "utf8"));
}

describe("Sprint 2.5 support-v1 contract fixtures", () => {
  test("manifest covers every parseable JSON fixture and contains no signing key", async () => {
    const names = (await readdir(fixtureDirectory))
      .filter((name) => name.endsWith(".json"))
      .sort();
    const manifest = await load("manifest.json");

    expect(names).toEqual(["manifest.json", ...manifest.files].sort());
    expect(manifest.security).toEqual({
      containsProductionSecrets: false,
      containsPrivateSigningKeys: false,
      jwtSignaturesMustBeGeneratedByWeb: true,
    });
    for (const name of names) {
      const raw = await readFile(`${fixtureDirectory}/${name}`, "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(raw).not.toMatch(/-----BEGIN (?:RSA )?PRIVATE KEY-----/);
    }
  });

  test("freezes exact RS256 token-use and scope policies without a private key", async () => {
    const fixture = await load("assertion-policies.json");

    expect(fixture.algorithm).toBe("RS256");
    expect(fixture.audience).toBe("owj-chat");
    expect(fixture.requiredClaims).toEqual(expect.arrayContaining([
      "iss", "sub", "aud", "iat", "exp", "jti", "token_use", "scope",
    ]));
    expect(fixture.policies.registered).toMatchObject({
      tokenUse: "support_registered",
      maximumLifetimeSeconds: 300,
      exactScopes: ["support:conversation:create"],
    });
    expect(fixture.policies.guest).toMatchObject({
      tokenUse: "support_guest",
      maximumLifetimeSeconds: 600,
      exactScopes: ["support:conversation:create"],
    });
    expect(fixture.policies.agent).toMatchObject({
      tokenUse: "support_agent",
      maximumLifetimeSeconds: 300,
      exactScopes: ["support:agent", "support:conversation:create"],
    });
    for (const example of Object.values(fixture.decodedExamples)) {
      expect(example.header).toMatchObject({ alg: "RS256", kid: expect.any(String) });
      expect(example.payload.aud).toBe("owj-chat");
      expect(example.payload.exp).toBeGreaterThan(example.payload.iat);
    }
  });

  test("HMAC vector reproduces Chat's timestamp/nonce protocol and replay denial", async () => {
    const fixture = await load("bootstrap-hmac.json");
    const generated = createServiceAuthHeaders({
      secret: fixture.syntheticSecret,
      method: fixture.method,
      path: fixture.path,
      timestampMs: Number(fixture.timestamp),
      nonce: fixture.nonce,
    });

    expect(generated["x-ouj-service-auth-signature"]).toBe(fixture.signature);
    expect(generated).toMatchObject({
      "x-ouj-service-auth-version": fixture.headers["X-Ouj-Service-Auth-Version"],
      "x-ouj-service-auth-timestamp": fixture.headers["X-Ouj-Service-Auth-Timestamp"],
      "x-ouj-service-auth-nonce": fixture.headers["X-Ouj-Service-Auth-Nonce"],
      "x-ouj-service-auth-signature": fixture.headers["X-Ouj-Service-Auth-Signature"],
    });
    const replayGuard = createServiceReplayGuard({ now: () => Number(fixture.timestamp) });
    const verification = {
      headers: generated,
      secret: fixture.syntheticSecret,
      method: fixture.method,
      path: fixture.path,
      now: () => Number(fixture.timestamp),
      replayGuard,
    };
    expect(verifyServiceAuth(verification)).toEqual({ ok: true });
    expect(verifyServiceAuth(verification)).toEqual({ ok: false, code: "SERVICE_AUTH_REPLAYED" });
  });

  test("recovery resumes one conversation with a fresh assertion and may rotate the session secret", async () => {
    const fixture = await load("bootstrap-recovery.json");
    const first = fixture.firstAttempt;
    const retry = fixture.ambiguousRetry;

    expect(retry.assertionJti).not.toBe(first.assertionJti);
    expect(retry.response.conversationId).toBe(first.response.conversationId);
    expect(retry.response.supportSessionCredential).not.toBe(first.response.supportSessionCredential);
    expect(first.response.supportSessionCredential).toMatch(/^ocs_[A-Za-z0-9_-]{43,128}$/);
    expect(retry.response.supportSessionCredential).toMatch(/^ocs_[A-Za-z0-9_-]{43,128}$/);
    expect(retry).toMatchObject({
      sameIdempotencyKey: true,
      freshAssertionRequired: true,
      sameAssertionMustFailAsReplay: true,
    });
    expect(fixture.invariants).toMatchObject({
      sameLogicalConversation: true,
      plaintextSessionCredentialMayChange: true,
      consumedAssertionJtiRemainsRejectedAfterRestart: true,
    });
  });

  test("cookie fixture matches Chat and forbids URL or bearer browser credentials", async () => {
    const fixture = await load("cookie.json");

    expect(fixture).toMatchObject({
      name: SUPPORT_COOKIE,
      path: SUPPORT_COOKIE_PATH,
      httpOnly: true,
      sameSite: "Lax",
      secureWhenHttps: true,
      browserCredentialSources: ["cookie"],
    });
    expect(fixture.forbiddenCredentialSources).toEqual(expect.arrayContaining([
      "authorization-header", "query-token", "query-sid", "query-supportSession",
    ]));
  });

  test("status fixture preserves assertion-bound revocation and bounded authorization", async () => {
    const fixture = await load("identity-status.json");
    const request = fixture.request.body;

    expect(fixture.path).toBe("/api/internal/v1/identity/status");
    expect(fixture.authentication).toMatchObject({
      scheme: "Bearer",
      dedicatedCredential: "Chat-to-Web",
      minimumCredentialCharacters: 32,
    });
    expect(request).toEqual({
      subject: "507f1f77bcf86cd799439011",
      tokenIssuedAt: 1795161600,
      jti: "fixture-registered-jti-1",
    });
    expect(fixture.request.headers).toMatchObject({
      "X-Owj-Service": "ouj-chat",
      "X-Correlation-Id": "fixture-chat-correlation-1",
    });
    expect(fixture.request.headers).not.toHaveProperty("X-Ouj-Service");
    expect([
      fixture.responses.activeCustomer.body.role,
      fixture.responses.activeStaff.body.role,
      fixture.responses.staffRoleDenied.body.role,
    ]).toEqual(["user", "admin", "user"]);
    for (const scenario of Object.values(fixture.responses)) {
      expect(scenario.body.requestId ?? scenario.body.error?.requestId).toBe(
        fixture.request.headers["X-Correlation-Id"],
      );
      if (scenario.statusCode === 200) {
        expect(scenario.body.subject).toBe(request.subject);
        expect(scenario.body.authorizationCacheMaxAgeSeconds).toBe(60);
      }
    }
    expect(fixture.responses.activeCustomer.body.support).toEqual({ allowed: true, staff: false });
    expect(fixture.responses.activeStaff.body.support).toEqual({ allowed: true, staff: true });
    expect(fixture.responses.disabled.body.error.code).toBe("ACCOUNT_DISABLED");
    expect(fixture.responses.revoked.body.error.code).toBe("TOKEN_REVOKED");
    expect(fixture.responses.unknown.body.error.code).toBe("IDENTITY_NOT_FOUND");
    expect(fixture.invariants).toMatchObject({
      guestRequestsForbidden: true,
      ordinaryCacheMaximumSeconds: 60,
      sensitiveBootstrapAndStaffMutationsBypassCache: true,
    });
  });

  test("message fixtures keep Chat's body/clientRequestId command and hint-only realtime envelope", async () => {
    const messages = await load("messages.json");
    const realtime = await load("realtime.json");

    expect(messages.sendRequest.body).toEqual({
      body: "Hello from the support fixture",
      clientRequestId: "fixture-client-request-1",
    });
    expect(messages.sendRequest.body).not.toHaveProperty("conversationId");
    expect(messages.sendRequest.body).not.toHaveProperty("text");
    expect(messages.sendAcknowledgement.body).toMatchObject({ version: 1, deduped: false });
    expect(messages.duplicateAcknowledgement).toMatchObject({
      statusCode: 200,
      body: { deduped: true },
    });
    expect(messages.historyResponse.messages.map((message) => message.authorKind))
      .toEqual(["customer", "agent"]);

    expect(realtime.transports).toEqual({
      websocket: "/support/v1/ws",
      sse: "/support/v1/events",
    });
    expect(realtime.messageNotification).toMatchObject({
      version: 1,
      type: "chat_message",
      eventId: expect.stringMatching(/^message:/),
    });
    expect(realtime.messageNotification).not.toHaveProperty("body");
    expect(realtime.sseConnected.type).toBe("connected");
    expect(realtime.replayComplete.type).toBe("replay_complete");
    expect(realtime.replayGap).toMatchObject({ gap: true });
    expect(realtime.replayGap).not.toHaveProperty("requiredClientAction");
    expect(realtime.sseSessionRevoked).toMatchObject({
      type: "session_revoked",
      conversationId: expect.any(String),
    });
    expect(realtime.websocketSessionRevoked).toMatchObject({ type: "session_revoked" });
    expect(realtime.websocketSessionRevoked).not.toHaveProperty("conversationId");
    expect(realtime.invariants).toMatchObject({
      nativeWebSocketNotSocketIo: true,
      sseUsesNamedEvents: true,
      messageNotificationDoesNotContainBody: true,
      credentialsNeverAppearInUrl: true,
    });
  });
});
