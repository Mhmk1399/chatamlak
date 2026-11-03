import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";

function worker() {
  const events = new Map();
  const values = new Map();
  const show = vi.fn(async () => {});
  const cache = { put: async (key, value) => values.set(key, value), match: async (key) => values.get(key)?.clone() };
  const context = {
    self: { addEventListener: (name, handler) => events.set(name, handler), clients: { matchAll: async () => [] }, registration: { showNotification: show }, location: { origin: "https://chat.example.test" } },
    caches: { open: async () => cache }, Response, URL, navigator: {}, console,
  };
  vm.runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), context);
  return { show, dispatch: async (name, payload) => {
    const pending = [];
    const event = { data: name === "push" ? { json: () => payload } : payload, waitUntil: (promise) => pending.push(promise) };
    events.get(name)(event);
    await Promise.all(pending);
  } };
}
describe("background notification language", () => {
  test("uses Persian by default and preserves the sender's message", async () => {
    const subject = worker();
    await subject.dispatch("push", { body: "Save", data: { chatId: "chat" } });
    expect(subject.show).toHaveBeenCalledWith("گفتگوی اوج", expect.objectContaining({ body: "Save", icon: "/ouj-icons/icon-192.png" }));
  });
  test("remembers English for notifications after the app closes", async () => {
    const subject = worker();
    await subject.dispatch("message", { type: "OUJ_LOCALE", locale: "en" });
    await subject.dispatch("push", {});
    expect(subject.show).toHaveBeenCalledWith("Ouj Chat", expect.objectContaining({ body: "New message" }));
  });
  test("localizes incoming calls without translating the caller's name", async () => {
    const subject = worker();
    await subject.dispatch("push", { title: "Incoming voice call from Sara", body: "Tap to answer", data: { callPush: "incoming", callType: "voice", chatId: "chat" } });
    expect(subject.show).toHaveBeenCalledWith("تماس صوتی از Sara", expect.objectContaining({ body: "برای پاسخ بزنید" }));
  });
});
