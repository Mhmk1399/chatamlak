import { describe, test, expect, vi } from "vitest";
import { createSessionHelpers } from "../../lib/sessions.js";

// ─── Minimal stubs ────────────────────────────────────────────────────────────

const makeHelpers = (overrides = {}) =>
  createSessionHelpers({
    getSession: overrides.getSession ?? (() => null),
    touchSession: overrides.touchSession ?? (() => {}),
    deleteSession: overrides.deleteSession ?? (() => {}),
    isProduction: overrides.isProduction ?? false,
    sessionIdleTimeoutMs: overrides.sessionIdleTimeoutMs,
    sessionAbsoluteTimeoutMs: overrides.sessionAbsoluteTimeoutMs,
    now: overrides.now,
  });

const makeReq = (overrides = {}) => ({
  headers: {},
  secure: false,
  ...overrides,
});

// Minimal res stub — captures Set-Cookie header
const makeRes = () => {
  let cookie = null;
  const res = {
    _cookie: () => cookie,
    setHeader: (_name, value) => {
      cookie = value;
    },
    status: function (code) {
      this._code = code;
      return this;
    },
    json: function (body) {
      this._body = body;
      return this;
    },
  };
  return res;
};

// ─── parseCookies ─────────────────────────────────────────────────────────────

describe("parseCookies", () => {
  const { parseCookies } = makeHelpers();

  test("returns empty object when no cookie header", () => {
    expect(parseCookies(makeReq())).toEqual({});
  });

  test("parses a single cookie", () => {
    const req = makeReq({ headers: { cookie: "sid=abc123" } });
    expect(parseCookies(req)).toEqual({ sid: "abc123" });
  });

  test("parses multiple cookies", () => {
    const req = makeReq({ headers: { cookie: "sid=abc; theme=dark" } });
    const result = parseCookies(req);
    expect(result.sid).toBe("abc");
    expect(result.theme).toBe("dark");
  });

  test("decodes URI-encoded values", () => {
    const req = makeReq({
      headers: { cookie: `sid=${encodeURIComponent("tok en")}` },
    });
    expect(parseCookies(req).sid).toBe("tok en");
  });

  test("handles cookies with = signs in the value", () => {
    const req = makeReq({ headers: { cookie: "data=a=b=c" } });
    expect(parseCookies(req).data).toBe("a=b=c");
  });

  test("trims whitespace around whole cookie string but not the name itself", () => {
    // The implementation trims the full cookie string, then splits on =.
    // "  sid  =xyz" → trim → "sid  =xyz" → name is "sid  " (with trailing spaces)
    const req = makeReq({ headers: { cookie: "  sid=xyz  " } });
    expect(parseCookies(req).sid).toBe("xyz");
  });
});

// ─── isHttpsRequest ───────────────────────────────────────────────────────────

describe("isHttpsRequest", () => {
  const { isHttpsRequest } = makeHelpers();

  test("returns false for null", () => {
    expect(isHttpsRequest(null)).toBe(false);
  });

  test("returns true when req.secure is true", () => {
    expect(isHttpsRequest(makeReq({ secure: true }))).toBe(true);
  });

  test('returns true when X-Forwarded-Proto is "https"', () => {
    const req = makeReq({ headers: { "x-forwarded-proto": "https" } });
    expect(isHttpsRequest(req)).toBe(true);
  });

  test("returns true when X-Forwarded-Proto has multiple values and first is https", () => {
    const req = makeReq({ headers: { "x-forwarded-proto": "https,http" } });
    expect(isHttpsRequest(req)).toBe(true);
  });

  test('returns false when X-Forwarded-Proto is "http"', () => {
    const req = makeReq({ headers: { "x-forwarded-proto": "http" } });
    expect(isHttpsRequest(req)).toBe(false);
  });

  test("is case-insensitive for the forwarded proto", () => {
    const req = makeReq({ headers: { "x-forwarded-proto": "HTTPS" } });
    expect(isHttpsRequest(req)).toBe(true);
  });

  test("returns false when no secure indicators are present", () => {
    expect(isHttpsRequest(makeReq())).toBe(false);
  });
});

// ─── shouldUseSecureCookie ────────────────────────────────────────────────────

describe("shouldUseSecureCookie", () => {
  test("returns false in development regardless of HTTPS", () => {
    const { shouldUseSecureCookie } = makeHelpers({ isProduction: false });
    expect(shouldUseSecureCookie(makeReq({ secure: true }))).toBe(false);
  });

  test("returns false in production over plain HTTP", () => {
    const { shouldUseSecureCookie } = makeHelpers({ isProduction: true });
    expect(shouldUseSecureCookie(makeReq())).toBe(false);
  });

  test("returns true in production over HTTPS", () => {
    const { shouldUseSecureCookie } = makeHelpers({ isProduction: true });
    expect(shouldUseSecureCookie(makeReq({ secure: true }))).toBe(true);
  });

  test("returns true in production with X-Forwarded-Proto https", () => {
    const { shouldUseSecureCookie } = makeHelpers({ isProduction: true });
    const req = makeReq({ headers: { "x-forwarded-proto": "https" } });
    expect(shouldUseSecureCookie(req)).toBe(true);
  });
});

// ─── setSessionCookie ─────────────────────────────────────────────────────────

describe("setSessionCookie", () => {
  test("sets the sid cookie with correct attributes", () => {
    const { setSessionCookie } = makeHelpers();
    const res = makeRes();
    setSessionCookie(makeReq(), res, "mytoken");
    const cookie = res._cookie();
    expect(cookie).toContain("sid=mytoken");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=1209600");
  });

  test("URI-encodes the token", () => {
    const { setSessionCookie } = makeHelpers();
    const res = makeRes();
    setSessionCookie(makeReq(), res, "tok en");
    expect(res._cookie()).toContain("sid=tok%20en");
  });

  test("does not include Secure in development over HTTP", () => {
    const { setSessionCookie } = makeHelpers({ isProduction: false });
    const res = makeRes();
    setSessionCookie(makeReq(), res, "token");
    expect(res._cookie()).not.toContain("Secure");
  });

  test("includes Secure in production over HTTPS", () => {
    const { setSessionCookie } = makeHelpers({ isProduction: true });
    const res = makeRes();
    setSessionCookie(makeReq({ secure: true }), res, "token");
    expect(res._cookie()).toContain("Secure");
  });
});

// ─── clearSessionCookie ───────────────────────────────────────────────────────

describe("clearSessionCookie", () => {
  test("sets sid to empty and Max-Age=0", () => {
    const { clearSessionCookie } = makeHelpers();
    const res = makeRes();
    clearSessionCookie(makeReq(), res);
    const cookie = res._cookie();
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toContain("Max-Age=0");
  });

  test("does not include Secure in development", () => {
    const { clearSessionCookie } = makeHelpers({ isProduction: false });
    const res = makeRes();
    clearSessionCookie(makeReq(), res);
    expect(res._cookie()).not.toContain("Secure");
  });
});

// ─── getSessionFromRequest ────────────────────────────────────────────────────

describe("getSessionFromRequest", () => {
  test("applies the same expiration and revocation rules to token-only consumers", async () => {
    const deleteSession = vi.fn(async () => {});
    const touchSession = vi.fn(async () => {});
    const { getSessionFromToken } = makeHelpers({
      getSession: async () => ({
        id: "11111111-1111-4111-a111-111111111111",
        username: "alice",
        session_created_at: "2026-01-01T00:00:00.000Z",
        session_last_seen: "2026-01-01T00:00:10.000Z",
      }),
      deleteSession,
      touchSession,
      sessionIdleTimeoutMs: 5_000,
      sessionAbsoluteTimeoutMs: 60_000,
      now: () => Date.parse("2026-01-01T00:00:20.000Z"),
    });

    expect(await getSessionFromToken("expired-ws-token")).toBeNull();
    expect(deleteSession).toHaveBeenCalledWith("expired-ws-token");
    expect(touchSession).not.toHaveBeenCalled();
  });

  test("returns null when no sid cookie", () => {
    const { getSessionFromRequest } = makeHelpers();
    expect(getSessionFromRequest(makeReq())).toBeNull();
  });

  test("returns the session when sid cookie matches", () => {
    const session = { id: "11111111-1111-4111-a111-111111111111", username: "alice" };
    const { getSessionFromRequest } = makeHelpers({
      getSession: (token) => (token === "abc" ? session : null),
    });
    const req = makeReq({ headers: { cookie: "sid=abc" } });
    expect(getSessionFromRequest(req)).toEqual(session);
  });

  test("returns null when sid does not match any session", () => {
    const { getSessionFromRequest } = makeHelpers({ getSession: () => null });
    const req = makeReq({ headers: { cookie: "sid=nosuchtoken" } });
    expect(getSessionFromRequest(req)).toBeNull();
  });

  test("calls touchSession when session is found", () => {
    const touchSession = vi.fn();
    const { getSessionFromRequest } = makeHelpers({
      getSession: () => ({ id: "11111111-1111-4111-a111-111111111111", username: "alice" }),
      touchSession,
    });
    const req = makeReq({ headers: { cookie: "sid=abc" } });
    getSessionFromRequest(req);
    expect(touchSession).toHaveBeenCalledWith("abc");
  });

  test("can revalidate a live transport without extending the idle lifetime", async () => {
    const touchSession = vi.fn();
    const session = {
      id: "11111111-1111-4111-a111-111111111111",
      username: "alice",
      session_created_at: "2026-01-01T00:00:00.000Z",
      session_last_seen: "2026-01-01T00:00:10.000Z",
    };
    const { getSessionFromToken } = makeHelpers({
      getSession: async () => session,
      touchSession,
      sessionIdleTimeoutMs: 60_000,
      sessionAbsoluteTimeoutMs: 120_000,
      now: () => Date.parse("2026-01-01T00:00:20.000Z"),
    });

    await expect(getSessionFromToken("transport-token", { touch: false }))
      .resolves.toEqual(session);
    expect(touchSession).not.toHaveBeenCalled();
  });

  test("does not call touchSession when session is not found", () => {
    const touchSession = vi.fn();
    const { getSessionFromRequest } = makeHelpers({
      getSession: () => null,
      touchSession,
    });
    const req = makeReq({ headers: { cookie: "sid=abc" } });
    getSessionFromRequest(req);
    expect(touchSession).not.toHaveBeenCalled();
  });

  test("rejects and revokes a session that exceeded its idle lifetime", async () => {
    const touchSession = vi.fn();
    const deleteSession = vi.fn();
    const { getSessionFromRequest } = makeHelpers({
      getSession: async () => ({
        id: "11111111-1111-4111-a111-111111111111",
        username: "alice",
        session_created_at: "2026-01-01T00:00:00.000Z",
        session_last_seen: "2026-01-01T00:00:10.000Z",
      }),
      touchSession,
      deleteSession,
      sessionIdleTimeoutMs: 5_000,
      sessionAbsoluteTimeoutMs: 60_000,
      now: () => Date.parse("2026-01-01T00:00:20.000Z"),
    });

    expect(await getSessionFromRequest(
      makeReq({ headers: { cookie: "sid=expired" } }),
    )).toBeNull();
    expect(deleteSession).toHaveBeenCalledWith("expired");
    expect(touchSession).not.toHaveBeenCalled();
  });

  test("rejects and revokes a session that exceeded its absolute lifetime", async () => {
    const deleteSession = vi.fn();
    const { getSessionFromRequest } = makeHelpers({
      getSession: async () => ({
        id: "11111111-1111-4111-a111-111111111111",
        username: "alice",
        session_created_at: "2026-01-01T00:00:00.000Z",
        session_last_seen: "2026-01-01T00:00:19.000Z",
      }),
      deleteSession,
      sessionIdleTimeoutMs: 60_000,
      sessionAbsoluteTimeoutMs: 15_000,
      now: () => Date.parse("2026-01-01T00:00:20.000Z"),
    });

    expect(await getSessionFromRequest(
      makeReq({ headers: { cookie: "sid=absolute-expired" } }),
    )).toBeNull();
    expect(deleteSession).toHaveBeenCalledWith("absolute-expired");
  });

  test("keeps legacy sessions without timestamps compatible", async () => {
    const touchSession = vi.fn();
    const session = { id: "11111111-1111-4111-a111-111111111111", username: "alice" };
    const { getSessionFromRequest } = makeHelpers({
      getSession: async () => session,
      touchSession,
      sessionIdleTimeoutMs: 1,
      sessionAbsoluteTimeoutMs: 1,
      now: () => Date.parse("2026-01-01T00:00:20.000Z"),
    });

    expect(await getSessionFromRequest(
      makeReq({ headers: { cookie: "sid=legacy" } }),
    )).toEqual(session);
    expect(touchSession).toHaveBeenCalledWith("legacy");
  });
});

// ─── requireSessionUsernameMatch ─────────────────────────────────────────────

describe("requireSessionUsernameMatch", () => {
  const { requireSessionUsernameMatch } = makeHelpers();
  const session = { username: "alice" };

  test("returns true when usernames match", () => {
    const res = makeRes();
    expect(requireSessionUsernameMatch(res, session, "alice")).toBe(true);
  });

  test("is case-insensitive", () => {
    const res = makeRes();
    expect(requireSessionUsernameMatch(res, session, "ALICE")).toBe(true);
  });

  test("returns true when supplied username is empty (no username check)", () => {
    const res = makeRes();
    expect(requireSessionUsernameMatch(res, session, "")).toBe(true);
  });

  test("returns false and responds 403 when usernames do not match", () => {
    const res = makeRes();
    const result = requireSessionUsernameMatch(res, session, "bob");
    expect(result).toBe(false);
    expect(res._code).toBe(403);
  });
});
