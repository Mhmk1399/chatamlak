import { describe, expect, test, vi } from "vitest";
import { createWebIdentityStatusClient } from "../../lib/webIdentityStatusClient.js";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => JSON.stringify(body) };
}

function makeClient(overrides = {}) {
  return createWebIdentityStatusClient({
    endpoint: "https://web.ouj.example/api/internal/v1/identity/status",
    serviceCredential: "test-service-credential",
    fetchImpl: vi.fn(async () => response({
      version: 1,
      subject: { webUserId: "web-user-1", status: "active" },
      authorized: true,
      revision: 7,
    })),
    now: () => NOW,
    cacheTtlMs: 60_000,
    ...overrides,
  });
}

describe("Web identity status client", () => {
  test("authenticates Chat, validates the subject, and caches for no more than 60 seconds", async () => {
    const fetchImpl = vi.fn(async () => response({
      version: 1,
      subject: { webUserId: "web-user-1", status: "active" },
      authorized: true,
    }));
    const client = makeClient({ fetchImpl, cacheTtlMs: 600_000 });

    await expect(client.authorize({ webUserId: "web-user-1", operation: "support:message:send" }))
      .resolves.toMatchObject({ authorized: true, status: "active" });
    await client.authorize({ webUserId: "web-user-1", operation: "support:message:send" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer test-service-credential",
        "content-type": "application/json",
        "x-owj-service": "ouj-chat",
      }),
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      version: 1,
      subject: { provider: "owj-web", webUserId: "web-user-1" },
      operation: "support:message:send",
    });
    expect(client.inspect().cacheTtlMs).toBe(60_000);
  });

  test("does not call Web for guests", async () => {
    const fetchImpl = vi.fn();
    const client = makeClient({ fetchImpl });
    await expect(client.authorize({ kind: "guest", webUserId: "guest-1" }))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_SUBJECT_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fails closed for disabled users, mismatched responses, outages, and missing credentials", async () => {
    const onIdentityRevoked = vi.fn(async () => {});
    const disabled = makeClient({
      onIdentityRevoked,
      fetchImpl: vi.fn(async () => response({
        version: 1,
        subject: { webUserId: "web-user-1", status: "disabled" },
        authorized: false,
      })),
    });
    await expect(disabled.authorize({ webUserId: "web-user-1", operation: "support:message:send" }))
      .rejects.toMatchObject({ code: "IDENTITY_SUBJECT_DISABLED", status: 403 });
    expect(onIdentityRevoked).toHaveBeenCalledWith({
      webUserId: "web-user-1",
      status: "disabled",
      revision: null,
    });

    const mismatch = makeClient({
      fetchImpl: vi.fn(async () => response({
        version: 1,
        subject: { webUserId: "another-user", status: "active" },
        authorized: true,
      })),
    });
    await expect(mismatch.authorize({ webUserId: "web-user-1", operation: "support:message:send" }))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_RESPONSE_INVALID" });

    const outage = makeClient({ fetchImpl: vi.fn(async () => { throw new Error("secret upstream body"); }) });
    await expect(outage.authorize({ webUserId: "web-user-1", operation: "support:message:send" }))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_UNAVAILABLE", status: 503 });

    const unconfigured = makeClient({ serviceCredential: "" });
    await expect(unconfigured.authorize({ webUserId: "web-user-1", operation: "support:message:send" }))
      .rejects.toMatchObject({ code: "IDENTITY_STATUS_UNAVAILABLE", status: 503 });
  });

  test("supports explicit revocation invalidation and bounded cache size", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      const webUserId = JSON.parse(options.body).subject.webUserId;
      return response({
        version: 1,
        subject: { webUserId, status: "active" },
        authorized: true,
      });
    });
    const client = makeClient({ fetchImpl, maxCacheEntries: 2 });
    for (const id of ["user-1", "user-2", "user-3"]) {
      await client.authorize({ webUserId: id, operation: "support:conversation:read" });
    }
    expect(client.inspect().cacheSize).toBe(2);
    expect(client.invalidate("user-3")).toBe(1);
    expect(client.inspect().cacheSize).toBe(1);
  });
});
