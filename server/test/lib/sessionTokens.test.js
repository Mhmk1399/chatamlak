import { describe, expect, test } from "vitest";
import {
  sessionDeviceId,
  sessionTokenLookupValues,
  sessionTokenMatches,
  sessionTokenStorageValue,
} from "../../lib/sessionTokens.js";

describe("session token storage", () => {
  test("stores an irreversible digest and can still find a legacy raw token", () => {
    const stored = sessionTokenStorageValue("browser-secret");
    expect(stored).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stored).not.toContain("browser-secret");
    expect(sessionTokenLookupValues("browser-secret")).toEqual([
      stored,
      "browser-secret",
    ]);
  });

  test("normalizes device ids and comparisons for hashed and legacy rows", () => {
    const stored = sessionTokenStorageValue("browser-secret");
    expect(sessionDeviceId(stored)).toBe(sessionDeviceId("browser-secret"));
    expect(sessionTokenMatches(stored, "browser-secret")).toBe(true);
    expect(sessionTokenMatches("browser-secret", "browser-secret")).toBe(true);
    expect(sessionTokenMatches(stored, "other-secret")).toBe(false);
  });

  test("never accepts a stored digest as a browser bearer credential", () => {
    const stored = sessionTokenStorageValue("browser-secret");

    expect(sessionTokenLookupValues(stored)).toEqual([]);
    expect(sessionTokenMatches(stored, stored)).toBe(false);
    expect(
      sessionTokenLookupValues(stored, { acceptStored: true }),
    ).toEqual([stored]);
  });
});
