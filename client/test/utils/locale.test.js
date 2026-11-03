import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  const values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe("Ouj language preferences and messages", () => {
  test("starts in Persian, then restores an explicit English choice", async () => {
    const first = await import("../../src/i18n/locale.js");
    expect(first.getLocale()).toBe("fa");
    expect(first.t("Ouj Chat")).toBe("گفتگوی اوج");
    first.setLocale("en");
    vi.resetModules();
    const restored = await import("../../src/i18n/locale.js");
    expect(restored.getLocale()).toBe("en");
    expect(restored.t("Ouj Chat")).toBe("Ouj Chat");
  });
  test("keeps language switching usable when preference storage is unavailable", async () => {
    localStorage.getItem = () => { throw new Error("Disabled"); };
    localStorage.setItem = () => { throw new Error("Quota"); };
    const locale = await import("../../src/i18n/locale.js");
    expect(locale.getLocale()).toBe("fa");
    locale.setLocale("en");
    expect(locale.t("Send message")).toBe("Send message");
  });
  test("formats dynamic validation errors while preserving entered identifiers", async () => {
    const { t, tError, setLocale } = await import("../../src/i18n/locale.js");
    expect(tError("Message must be at most 4000 characters.")).toContain("۴٬۰۰۰");
    expect(t("Reply to {value0}", { value0: "ali.ahmadi" })).toBe("پاسخ به ali.ahmadi");
    expect(tError("Invalid credentials.")).toBe("نام کاربری یا رمز عبور درست نیست.");
    setLocale("en");
    expect(tError("Message must be at most 4000 characters.")).toBe("Message must be at most 4000 characters.");
  });
  test("shows a Persian recovery message for unknown technical failures", async () => {
    const { tError, setLocale } = await import("../../src/i18n/locale.js");
    expect(tError(new Error("ECONNRESET at private-internal-host"))).not.toMatch(/ECONNRESET|private-internal-host/);
    expect(tError(new Error("ECONNRESET"))).toContain("دوباره تلاش کنید");
    setLocale("en");
    expect(tError(new Error("ECONNRESET"))).toBe("ECONNRESET");
  });
  test("preserves whitespace between translated text and adjacent content", async () => {
    const { t } = await import("../../src/i18n/locale.js");
    expect(t(" Join ")).toBe(" پیوستن ");
    expect(t("garbage-user-content-xyz")).toBe("garbage-user-content-xyz");
  });
});
