import {
  createSign,
  generateKeyPairSync,
} from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { createWebIdentityVerifier } from "../../lib/webIdentityVerifier.js";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");
const ISSUER = "https://identity.ouj.example";

function keyPair(kid) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    kid,
    privateKey,
    jwk: {
      ...publicKey.export({ format: "jwk" }),
      kid,
      alg: "RS256",
      use: "sig",
    },
  };
}

function jwt(key, payload = {}, header = {}) {
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: key.kid, ...header }),
  ).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify({
    iss: ISSUER,
    sub: "web-user-1",
    aud: "owj-chat",
    iat: Math.floor(NOW / 1000) - 5,
    exp: Math.floor(NOW / 1000) + 240,
    jti: "assertion-1",
    token_use: "support_registered",
    scope: "support:conversation:create",
    ...payload,
  })).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .end()
    .sign(key.privateKey)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

function jwksResponse(keys) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "public, max-age=300" },
    text: async () => JSON.stringify({ keys }),
  };
}

function verifier(options = {}) {
  const { keys, fetchImpl, now = () => NOW, ...rest } = options;
  return createWebIdentityVerifier({
    expectedIssuer: ISSUER,
    expectedAudience: "owj-chat",
    jwksUrl: `${ISSUER}/.well-known/jwks.json`,
    fetchImpl: fetchImpl || vi.fn(async () => jwksResponse(keys)),
    consumeJti: Object.hasOwn(options, "consumeJti")
      ? options.consumeJti
      : vi.fn(async () => true),
    now,
    ...rest,
  });
}

async function expectCode(promise, code) {
  await expect(promise).rejects.toMatchObject({
    name: "PlatformIdentityError",
    code,
  });
}

describe("Web RS256 identity assertion verifier", () => {
  test("verifies a registered bootstrap and consumes its one-time jti", async () => {
    const key = keyPair("key-1");
    const consumeJti = vi.fn(async () => true);
    const subject = verifier({ keys: [key.jwk], consumeJti });

    await expect(subject.verify(jwt(key))).resolves.toMatchObject({
      issuer: ISSUER,
      subject: "web-user-1",
      audience: ["owj-chat"],
      scopes: ["support:conversation:create"],
      issuedAt: NOW - 5_000,
      expiresAt: NOW + 240_000,
      jti: "assertion-1",
      keyId: "key-1",
      tokenUse: "support_registered",
      kind: "registered",
      status: "active",
    });
    expect(consumeJti).toHaveBeenCalledWith(expect.objectContaining({
      issuer: ISSUER,
      jti: "assertion-1",
      expiresAt: new Date(NOW + 240_000),
    }));
  });

  test("accepts only the bounded guest bootstrap contract", async () => {
    const key = keyPair("guest-key");
    const subject = verifier({ keys: [key.jwk] });
    const token = jwt(key, {
      sub: "guest-opaque-1",
      iat: Math.floor(NOW / 1000),
      exp: Math.floor(NOW / 1000) + 600,
      jti: "guest-1",
      token_use: "support_guest",
    });

    await expect(subject.verify(token)).resolves.toMatchObject({
      kind: "guest",
      tokenUse: "support_guest",
      scopes: ["support:conversation:create"],
    });
    await expectCode(
      subject.verify(jwt(key, {
        jti: "guest-2",
        token_use: "support_guest",
        scope: "support:conversation:create admin:*",
      })),
      "IDENTITY_SCOPE_EXCESSIVE",
    );
  });

  test("accepts an agent bootstrap only with the staff scope allowlist", async () => {
    const key = keyPair("agent-key");
    const subject = verifier({ keys: [key.jwk] });
    await expect(subject.verify(jwt(key, {
      jti: "agent-1",
      token_use: "support_agent",
      scope: "support:agent support:conversation:create",
    }))).resolves.toMatchObject({
      kind: "agent",
      tokenUse: "support_agent",
      scopes: ["support:agent", "support:conversation:create"],
    });
  });

  test("rejects an agent token on a customer bootstrap before consuming its jti", async () => {
    const key = keyPair("agent-key");
    const consumeJti = vi.fn(async () => true);
    const subject = verifier({ keys: [key.jwk], consumeJti });
    await expectCode(subject.verify(jwt(key, {
      jti: "agent-customer-confusion",
      token_use: "support_agent",
      scope: "support:agent",
    }), {
      allowedTokenUses: ["support_registered", "support_guest"],
      requiredScopes: ["support:conversation:create"],
    }), "IDENTITY_TOKEN_USE_INVALID");
    expect(consumeJti).not.toHaveBeenCalled();
  });

  test.each([
    ["wrong issuer", { iss: "https://evil.example", jti: "bad-iss" }, {}, "IDENTITY_ISSUER_INVALID"],
    ["wrong audience", { aud: "owj-analytics", jti: "bad-aud" }, {}, "IDENTITY_AUDIENCE_INVALID"],
    ["expired", { exp: Math.floor(NOW / 1000) - 30, jti: "expired" }, {}, "IDENTITY_EXPIRED"],
    ["future issued", { iat: Math.floor(NOW / 1000) + 60, jti: "future" }, {}, "IDENTITY_NOT_YET_VALID"],
    ["missing scope", { scope: "", jti: "no-scope" }, {}, "IDENTITY_SCOPE_DENIED"],
    ["wrong algorithm", { jti: "alg" }, { alg: "HS256" }, "IDENTITY_ALGORITHM_INVALID"],
    ["missing token type", { token_use: undefined, jti: "no-use" }, {}, "IDENTITY_TOKEN_USE_INVALID"],
    ["unsupported claims version", { ver: 2, jti: "bad-ver" }, {}, "IDENTITY_CLAIMS_VERSION_INVALID"],
    ["long registered lifetime", { exp: Math.floor(NOW / 1000) + 301, jti: "too-long" }, {}, "IDENTITY_LIFETIME_INVALID"],
  ])("rejects %s", async (_label, payload, header, code) => {
    const key = keyPair("key-1");
    const subject = verifier({ keys: [key.jwk] });
    await expectCode(subject.verify(jwt(key, payload, header)), code);
  });

  test("rejects an invalid signature, an unknown key, and a replay", async () => {
    const trusted = keyPair("trusted");
    const attacker = keyPair("trusted");
    const unknown = keyPair("unknown");
    const replay = verifier({
      keys: [trusted.jwk],
      consumeJti: vi.fn(async () => false),
    });

    await expectCode(replay.verify(jwt(attacker)), "IDENTITY_SIGNATURE_INVALID");
    await expectCode(replay.verify(jwt(unknown)), "IDENTITY_KEY_UNKNOWN");
    await expectCode(replay.verify(jwt(trusted)), "IDENTITY_ASSERTION_REPLAYED");
  });

  test("refreshes a bounded JWKS cache when a rotated kid appears", async () => {
    const first = keyPair("first");
    const rotated = keyPair("rotated");
    let clock = NOW;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jwksResponse([first.jwk]))
      .mockResolvedValueOnce(jwksResponse([first.jwk, rotated.jwk]));
    const subject = verifier({
      fetchImpl,
      now: () => clock,
      minimumRefreshIntervalMs: 100,
    });

    await expect(subject.verify(jwt(first))).resolves.toMatchObject({ keyId: "first" });
    clock += 101;
    await expect(subject.verify(jwt(rotated, { jti: "rotated-jti" })))
      .resolves.toMatchObject({ keyId: "rotated" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("fails closed when replay persistence is unavailable", async () => {
    const key = keyPair("key-1");
    const subject = verifier({ keys: [key.jwk], consumeJti: null });
    await expectCode(subject.verify(jwt(key)), "IDENTITY_REPLAY_STORE_UNAVAILABLE");
  });
});
