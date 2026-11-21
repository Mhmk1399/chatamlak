import { describe, expect, test } from "vitest";

import {
  createServiceAuthHeaders,
  createServiceReplayGuard,
  verifyServiceAuth,
} from "../../../shared/serviceAuth.js";

const SECRET = "test-service-secret-that-is-long-enough";

describe("timestamped service authentication", () => {
  test("accepts an authentic request once", () => {
    const now = 1_800_000_000_000;
    const replayGuard = createServiceReplayGuard({ maxEntries: 4, now: () => now });
    const headers = createServiceAuthHeaders({
      secret: SECRET,
      method: "POST",
      path: "/transcode",
      timestampMs: now,
      nonce: "nonce-1234567890",
    });

    expect(verifyServiceAuth({
      headers,
      secret: SECRET,
      method: "POST",
      path: "/transcode",
      now: () => now,
      replayGuard,
    })).toEqual({ ok: true });
  });

  test("rejects expired, altered, and replayed credentials", () => {
    let now = 1_800_000_000_000;
    const replayGuard = createServiceReplayGuard({ maxEntries: 4, now: () => now });
    const headers = createServiceAuthHeaders({
      secret: SECRET,
      method: "POST",
      path: "/transcode",
      timestampMs: now,
      nonce: "nonce-abcdefghij",
    });

    expect(verifyServiceAuth({ headers, secret: SECRET, method: "POST", path: "/mirror-media", now: () => now, replayGuard })).toEqual({ ok: false, code: "SERVICE_AUTH_SIGNATURE_INVALID" });
    expect(verifyServiceAuth({ headers, secret: SECRET, method: "POST", path: "/transcode", now: () => now, replayGuard })).toEqual({ ok: true });
    expect(verifyServiceAuth({ headers, secret: SECRET, method: "POST", path: "/transcode", now: () => now, replayGuard })).toEqual({ ok: false, code: "SERVICE_AUTH_REPLAYED" });

    now += 301_000;
    const staleHeaders = createServiceAuthHeaders({ secret: SECRET, method: "POST", path: "/transcode", timestampMs: now - 301_000, nonce: "nonce-stale-12345" });
    expect(verifyServiceAuth({ headers: staleHeaders, secret: SECRET, method: "POST", path: "/transcode", now: () => now, replayGuard, maxSkewMs: 300_000 })).toEqual({ ok: false, code: "SERVICE_AUTH_EXPIRED" });
  });

  test("bounds replay memory and fails closed on malformed input", () => {
    let now = 1_800_000_000_000;
    const replayGuard = createServiceReplayGuard({ maxEntries: 2, ttlMs: 1_000, now: () => now });
    expect(replayGuard.consume("one", now)).toBe(true);
    expect(replayGuard.consume("two", now)).toBe(true);
    expect(replayGuard.consume("three", now)).toBe(true);
    expect(replayGuard.size()).toBe(2);

    now += 1_001;
    expect(replayGuard.consume("two", now)).toBe(true);
    expect(verifyServiceAuth({ headers: {}, secret: SECRET, method: "POST", path: "/transcode", now: () => now, replayGuard })).toEqual({ ok: false, code: "SERVICE_AUTH_REQUIRED" });
    expect(() => createServiceAuthHeaders({ secret: "", method: "POST", path: "/transcode" })).toThrow(/secret/i);
  });
});
