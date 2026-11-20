import { describe, expect, it } from "vitest";

import {
  buildHttpRequestLog,
  safeErrorCode,
  normalizeRequestId,
  sanitizeStructuredFields,
} from "../../lib/requestLogging.js";

describe("safe request logging", () => {
  it("emits only allowlisted request metadata", () => {
    const entry = buildHttpRequestLog({
      requestId: "req-12345678",
      method: "POST",
      endpoint: "/api/messages",
      status: 401,
      durationMs: 17.8,
      errorCode: "invalid_session",
      request: {
        originalUrl: "/api/messages?token=query-secret",
        body: { message: "private message", password: "body-secret" },
        headers: { cookie: "session=secret", authorization: "Bearer secret" },
      },
      response: { token: "response-secret", message: "private response" },
    });

    expect(entry).toEqual({
      event: "http.request",
      service: "ouj-chat",
      requestId: "req-12345678",
      operation: "POST /api/messages",
      method: "POST",
      endpoint: "/api/messages",
      status: 401,
      durationMs: 18,
      errorCode: "invalid_session",
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("private message");
    expect(serialized).not.toContain("body-secret");
    expect(serialized).not.toContain("session=secret");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("response-secret");
  });

  it("drops non-allowlisted fields from auxiliary structured logs", () => {
    expect(
      sanitizeStructuredFields({
        requestId: "req-12345678",
        operation: "worker.dispatch",
        endpoint: "/api/internal/job",
        status: 202,
        durationMs: 3,
        errorCode: "",
        jobId: "job-1",
        count: 2,
        body: { message: "private" },
        cookie: "secret",
        token: "secret",
      }),
    ).toEqual({
      requestId: "req-12345678",
      operation: "worker.dispatch",
      endpoint: "/api/internal/job",
      status: 202,
      durationMs: 3,
      errorCode: "",
      jobId: "job-1",
      count: 2,
    });
  });

  it("accepts bounded request IDs and rejects unsafe caller-controlled values", () => {
    expect(normalizeRequestId(" req-ABC_123456 ")).toBe("req-ABC_123456");
    expect(normalizeRequestId("short")).toBe("");
    expect(normalizeRequestId("bad id\nforged-log-entry")).toBe("");
    expect(normalizeRequestId("x".repeat(129))).toBe("");
  });

  it("derives an error code without serializing an error message or URL", () => {
    const error = new Error(
      "request failed for https://storage.example/file?token=private-token",
    );
    error.code = "ERR_STORAGE_FETCH";

    expect(safeErrorCode(error)).toBe("ERR_STORAGE_FETCH");
    expect(safeErrorCode(new Error("private message text"))).toBe("Error");
  });
});
