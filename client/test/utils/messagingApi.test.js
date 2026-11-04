import { afterEach, expect, test, vi } from "vitest";
import { messagingRequest } from "../../src/api/messagingApi.js";
import { setLocale, t } from "../../src/i18n/locale.js";

afterEach(() => { vi.unstubAllGlobals(); setLocale("en"); });
test.each(["", "<html>Bad gateway</html>"])("reports a recoverable error instead of a JSON parser exception for %j", async (body) => {
  setLocale("en"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 502 })));
  await expect(messagingRequest("/chats/example/scheduled")).rejects.toMatchObject({ message: "Unable to complete this operation.", status: 502 });
});
test("localizes malformed response failures in Persian", async () => {
  setLocale("fa"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
  await expect(messagingRequest("/search")).rejects.toMatchObject({ message: t("Unable to complete this operation."), status: 500 });
});

test("does not treat an empty successful response as a saved operation", async () => {
  setLocale("en"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
  await expect(messagingRequest("/chats/example/scheduled", { method: "POST", body: {} })).rejects.toMatchObject({ message: "The server returned an invalid response. Please try again.", status: 200 });
});
test("accepts explicit no-content responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  await expect(messagingRequest("/scheduled/example", { method: "DELETE" })).resolves.toEqual({});
});
test("keeps cancellation distinguishable from a network error", async () => {
  const abort = new DOMException("Cancelled", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
  await expect(messagingRequest("/search")).rejects.toBe(abort);
});
test("network failures have actionable localized copy", async () => {
  setLocale("fa"); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await expect(messagingRequest("/search")).rejects.toMatchObject({ message: t("Connection failed. Check your internet connection and try again.") });
});
