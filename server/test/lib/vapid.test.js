import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureValidVapidKeys } from "../../lib/vapid.js";

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", undefined);
  vi.stubEnv("VAPID_PRIVATE_KEY", undefined);
  vi.stubEnv("VAPID_SUBJECT", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("vapid helper", () => {
  test("generates VAPID keys if missing or invalid", () => {
    let written = "";
    const mockFs = {
      existsSync: () => false,
      readFileSync: () => "",
      writeFileSync: (p, c) => {
        written += c;
      },
    };
    const mockWebpush = {
      setVapidDetails: () => {},
      generateVAPIDKeys: () => ({
        publicKey:
          "pub-key-65-chars-1234567890123456789012345678901234567890123456789",
        privateKey: "priv-key-32-chars-12345678901234",
      }),
    };
    const result = ensureValidVapidKeys({
      projectRootDir: "/tmp",
      fs: mockFs,
      path: { join: (...args) => args.join("/") },
      webpush: mockWebpush,
    });

    expect(result.publicKey).toBeTruthy();
    expect(result.privateKey).toBeTruthy();
    expect(process.env.VAPID_PUBLIC_KEY).toBe(result.publicKey);
    expect(process.env.VAPID_PRIVATE_KEY).toBe(result.privateKey);
  });
});
