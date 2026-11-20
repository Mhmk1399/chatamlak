import { describe, expect, test, vi } from "vitest";
import { createSseHub } from "../../lib/sse.js";

function responseStub() {
  return {
    write: vi.fn(),
    end: vi.fn(),
  };
}

describe("SSE session revocation", () => {
  test("disconnects only streams authenticated by the revoked session", () => {
    const hub = createSseHub({ listChatMembers: () => [] });
    const revoked = responseStub();
    const other = responseStub();
    hub.addSseClient("alice", revoked, "raw-session-token-a");
    hub.addSseClient("alice", other, "raw-session-token-b");

    expect(hub.disconnectSession("raw-session-token-a")).toBe(1);
    expect(revoked.end).toHaveBeenCalledTimes(1);
    expect(other.end).not.toHaveBeenCalled();

    hub.emitSseEvent("alice", { type: "session-check" });
    expect(revoked.write).not.toHaveBeenCalled();
    expect(other.write).toHaveBeenCalledTimes(1);
    hub.close();
  });

  test("disconnects every stream for a banned or deleted username", () => {
    const hub = createSseHub({ listChatMembers: () => [] });
    const first = responseStub();
    const second = responseStub();
    hub.addSseClient("Alice", first, "raw-session-token-a");
    hub.addSseClient("alice", second, "raw-session-token-b");

    expect(hub.disconnectUsername("ALICE")).toBe(2);
    expect(first.end).toHaveBeenCalledTimes(1);
    expect(second.end).toHaveBeenCalledTimes(1);
    expect(hub.isUserConnected("alice")).toBe(false);
    hub.close();
  });
});
