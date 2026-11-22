import { describe, expect, test, vi } from "vitest";
import { createWebIdentityStatusClient } from "../../lib/webIdentityStatusClient.js";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");
const SUBJECT = "507f1f77bcf86cd799439011";
const TOKEN_ISSUED_AT = Math.floor(NOW / 1_000) - 5;
const JTI = "assertion-jti-1";

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => JSON.stringify(body) };
}

function activeStatus(overrides = {}) {
  return {
    version: 1,
    subject: SUBJECT,
    status: "active",
    role: "USER",
    support: { allowed: true, staff: false },
    authorizationCacheMaxAgeSeconds: 60,
    checkedAt: "2026-11-20T08:00:00.000Z",
    requestId: "web-status-request-1",
    ...overrides,
  };
}

function authorizeInput(overrides = {}) {
  return {
    kind: "registered",
    webUserId: SUBJECT,
    operation: "support:message:send",
    tokenIssuedAt: TOKEN_ISSUED_AT,
    jti: JTI,
    ...overrides,
  };
}

function makeClient(overrides = {}) {
  return createWebIdentityStatusClient({
    endpoint: "https://web.ouj.example/api/internal/v1/identity/status",
    serviceCredential: "test-service-credential-at-least-32-characters",
    fetchImpl: vi.fn(async () => response(activeStatus())),
    now: () => NOW,
    cacheTtlMs: 60_000,
    requestIdFactory: () => "chat-correlation-1",
    ...overrides,
  });
}

describe("Web identity status client", () => {
  test("sends Web's exact revocation contract and bounds caching by Web's response", async () => {
    const fetchImpl = vi.fn(async () => response(activeStatus({
      authorizationCacheMaxAgeSeconds: 5,
    })));
    const client = makeClient({ fetchImpl, cacheTtlMs: 600_000 });

    await expect(client.authorize(authorizeInput()))
      .resolves.toMatchObject({ authorized: true, status: "active", staff: false });
    await client.authorize(authorizeInput());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer test-service-credential-at-least-32-characters",
        "content-type": "application/json",
        "x-owj-service": "ouj-chat",
        "x-correlation-id": "chat-correlation-1",
      }),
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      subject: SUBJECT,
      tokenIssuedAt: TOKEN_ISSUED_AT,
      jti: JTI,
    });
    expect(client.inspect().cacheTtlMs).toBe(60_000);
    expect(client.inspect().cacheSize).toBe(1);
  });

  test("keys authorization by assertion, supports forced refresh, and never checks guests", async () => {
    const fetchImpl = vi.fn(async () => response(activeStatus()));
    const client = makeClient({ fetchImpl });

    await client.authorize(authorizeInput());
    await client.authorize(authorizeInput({ jti: "assertion-jti-2" }));
    await client.authorize(authorizeInput({ jti: "assertion-jti-2", forceRefresh: true }));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await expect(client.authorize(authorizeInput({ kind: "guest" })))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_SUBJECT_INVALID" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("revalidates after the Web-bounded cache entry expires", async () => {
    let current = NOW;
    const fetchImpl = vi.fn(async () => response(activeStatus({
      authorizationCacheMaxAgeSeconds: 1,
    })));
    const client = makeClient({ fetchImpl, now: () => current });

    await client.authorize(authorizeInput());
    current += 999;
    await client.authorize(authorizeInput());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    current += 2;
    await client.authorize(authorizeInput());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("coalesces concurrent checks for one assertion and bounds distinct upstream requests", async () => {
    let release;
    const pendingResponse = new Promise((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async () => pendingResponse);
    const client = makeClient({ fetchImpl, maxConcurrentRequests: 1 });

    const first = client.authorize(authorizeInput());
    const coalesced = client.authorize(authorizeInput());
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await expect(client.authorize(authorizeInput({
      webUserId: "507f1f77bcf86cd799439012",
      jti: "distinct-jti-1",
    }))).rejects.toMatchObject({ code: "IDENTITY_STATUS_BUSY", status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    release(response(activeStatus()));
    await expect(Promise.all([first, coalesced])).resolves.toHaveLength(2);
    expect(client.inspect()).toMatchObject({
      activeRequests: 0,
      inFlightRequests: 0,
      maxConcurrentRequests: 1,
    });
  });

  test("requires Web's current staff authorization for agent sessions", async () => {
    const onIdentityRevoked = vi.fn(async () => {});
    const client = makeClient({ onIdentityRevoked });

    await expect(client.authorize(authorizeInput({
      kind: "agent",
      operation: "support:agent",
      requireStaff: true,
    }))).rejects.toMatchObject({ code: "IDENTITY_SUPPORT_DENIED", status: 403 });
    expect(onIdentityRevoked).toHaveBeenCalledWith(expect.objectContaining({
      webUserId: SUBJECT,
      status: "role_denied",
      kind: "agent",
    }));
  });

  test("revokes local authorization for definitive Web identity errors", async () => {
    const onIdentityRevoked = vi.fn(async () => {});
    const disabled = makeClient({
      onIdentityRevoked,
      fetchImpl: vi.fn(async () => response({
        error: { code: "ACCOUNT_DISABLED", requestId: "web-error-1" },
      }, { ok: false, status: 403 })),
    });

    await expect(disabled.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_SUBJECT_DISABLED", status: 403 });
    expect(onIdentityRevoked).toHaveBeenCalledWith(expect.objectContaining({
      webUserId: SUBJECT,
      status: "disabled",
      upstreamCode: "ACCOUNT_DISABLED",
      kind: "registered",
    }));

    const deleted = makeClient({
      onIdentityRevoked,
      fetchImpl: vi.fn(async () => response({ error: { code: "IDENTITY_NOT_FOUND" } }, {
        ok: false,
        status: 404,
      })),
    });
    await expect(deleted.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_SUBJECT_DISABLED", status: 403 });

    const revoked = makeClient({
      onIdentityRevoked,
      fetchImpl: vi.fn(async () => response({ error: { code: "TOKEN_REVOKED" } }, {
        ok: false,
        status: 401,
      })),
    });
    await expect(revoked.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_SUBJECT_DISABLED", status: 403 });
    expect(onIdentityRevoked).toHaveBeenCalledWith(expect.objectContaining({
      webUserId: SUBJECT,
      status: "revoked",
      upstreamCode: "TOKEN_REVOKED",
    }));
  });

  test("fails closed without revoking on service failures or malformed success responses", async () => {
    const onIdentityRevoked = vi.fn(async () => {});
    const mismatch = makeClient({
      onIdentityRevoked,
      fetchImpl: vi.fn(async () => response(activeStatus({ subject: "507f191e810c19729de860ea" }))),
    });
    await expect(mismatch.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_RESPONSE_INVALID" });

    const serviceAuthFailure = makeClient({
      onIdentityRevoked,
      fetchImpl: vi.fn(async () => response({ error: { code: "SERVICE_UNAUTHENTICATED" } }, {
        ok: false,
        status: 401,
      })),
    });
    await expect(serviceAuthFailure.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_UNAVAILABLE", status: 503 });

    const outage = makeClient({
      onIdentityRevoked,
      fetchImpl: vi.fn(async () => { throw new Error("secret upstream body"); }),
    });
    await expect(outage.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_UNAVAILABLE", status: 503 });

    expect(onIdentityRevoked).not.toHaveBeenCalled();
  });

  test("stops reading an oversized streamed response before buffering it", async () => {
    const cancel = vi.fn(async () => {});
    const chunks = [new Uint8Array(20 * 1_024), new Uint8Array(20 * 1_024)];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: vi.fn(async () => chunks.length
            ? { done: false, value: chunks.shift() }
            : { done: true, value: undefined }),
          cancel,
        }),
      },
      text: vi.fn(() => {
        throw new Error("streaming path must be used");
      }),
    }));
    const client = makeClient({ fetchImpl });

    await expect(client.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_RESPONSE_INVALID", status: 503 });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((await fetchImpl.mock.results[0].value).text).not.toHaveBeenCalled();
  });

  test("keeps the request deadline active while the response body is stalled", async () => {
    const fetchImpl = vi.fn(async (_url, options) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: () => new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          }),
          cancel: vi.fn(async () => {}),
        }),
      },
    }));
    const client = makeClient({ fetchImpl, requestTimeoutMs: 100 });
    const outcome = client.authorize(authorizeInput()).then(
      () => ({ state: "resolved" }),
      (error) => ({ state: "rejected", code: error.code }),
    );

    await expect(Promise.race([
      outcome,
      new Promise((resolve) => setTimeout(() => resolve({ state: "still-pending" }), 250)),
    ])).resolves.toEqual({ state: "rejected", code: "IDENTITY_STATUS_UNAVAILABLE" });
    expect(client.inspect()).toMatchObject({ activeRequests: 0, inFlightRequests: 0 });
  });

  test("cancels a declared oversized response body before rejecting it", async () => {
    const cancel = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === "content-length" ? String(33 * 1_024) : null },
      body: { cancel },
    }));
    const client = makeClient({ fetchImpl });

    await expect(client.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_RESPONSE_INVALID" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("rejects missing assertion metadata before calling Web", async () => {
    const fetchImpl = vi.fn();
    const client = makeClient({ fetchImpl });

    await expect(client.authorize(authorizeInput({ tokenIssuedAt: undefined })))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_REFERENCE_INVALID", status: 400 });
    await expect(client.authorize(authorizeInput({ jti: "bad jti" })))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_REFERENCE_INVALID", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fails closed when the local authorization clock is invalid", async () => {
    const fetchImpl = vi.fn();
    const client = makeClient({ fetchImpl, now: () => Number.NaN });

    await expect(client.authorize(authorizeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_UNAVAILABLE", status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("supports explicit invalidation and a bounded cache size", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      const { subject } = JSON.parse(options.body);
      return response(activeStatus({ subject }));
    });
    const client = makeClient({ fetchImpl, maxCacheEntries: 2 });
    for (const [subject, jti] of [
      ["507f1f77bcf86cd799439011", "jti-1"],
      ["507f1f77bcf86cd799439012", "jti-2"],
      ["507f1f77bcf86cd799439013", "jti-3"],
    ]) {
      await client.authorize(authorizeInput({ webUserId: subject, jti }));
    }
    expect(client.inspect().cacheSize).toBe(2);
    expect(client.invalidate("507f1f77bcf86cd799439013")).toBe(1);
    expect(client.inspect().cacheSize).toBe(1);
  });
});
