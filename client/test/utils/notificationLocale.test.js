import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";

function worker({ focused = false } = {}) {
  const events = new Map();
  const values = new Map();
  const show = vi.fn(async () => {});
  const workerNavigator = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
  const openWindow = vi.fn(async () => {});
  const cache = { put: async (key, value) => values.set(key, value), match: async (key) => values.get(key)?.clone() };
  const context = {
    self: { addEventListener: (name, handler) => events.set(name, handler), clients: { matchAll: async () => focused ? [{ focused: true }] : [], openWindow }, registration: { showNotification: show }, location: { origin: "https://chat.example.test" } },
    caches: { open: async () => cache }, Response, URL, navigator: workerNavigator, console,
  };
  vm.runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), context);
  return { show, workerNavigator, openWindow, dispatch: async (name, payload) => {
    const pending = [];
    const event = { data: name === "push" ? { json: () => payload } : payload, notification: { close() {}, data: payload }, waitUntil: (promise) => pending.push(promise) };
    events.get(name)(event);
    await Promise.all(pending);
  } };
}
describe("background notification language", () => {
  test("ignores queued notifications for a different account or after logout", async () => {
    const subject = worker();
    await subject.dispatch("message", { type: "OUJ_ACCOUNT", accountId: "alice" });
    await subject.dispatch("push", { accountId: "bob", body: "Private report", badge: 8 });
    expect(subject.show).not.toHaveBeenCalled(); expect(subject.workerNavigator.setAppBadge).not.toHaveBeenCalled();
    await subject.dispatch("message", { type: "OUJ_ACCOUNT", accountId: null });
    await subject.dispatch("push", { accountId: "alice", body: "Old report", badge: 1 });
    expect(subject.show).not.toHaveBeenCalled(); expect(subject.workerNavigator.clearAppBadge).toHaveBeenCalled();
  });
  test("never opens an external URL supplied by notification data", async () => {
    const subject = worker(); await subject.dispatch("notificationclick", { url: "https://untrusted.example/path" });
    expect(subject.openWindow).toHaveBeenCalledWith("https://chat.example.test/chat");
  });
  test("badge API errors do not prevent a visible notification", async () => {
    const subject = worker(); subject.workerNavigator.setAppBadge.mockRejectedValue(new Error("Unsupported"));
    await subject.dispatch("push", { badge: 3, body: "Report" }); expect(subject.show).toHaveBeenCalledOnce();
  });
  test("updates the icon badge even while a window is focused", async () => {
    const subject = worker({ focused: true }); await subject.dispatch("push", { badge: 7 });
    expect(subject.workerNavigator.setAppBadge).toHaveBeenCalledWith(7);
    expect(subject.show).toHaveBeenCalledWith("گفتگوی اوج", expect.objectContaining({ silent: true }));
  });
  test("shows an explicitly requested test push while the app is focused", async () => {
    const subject = worker({ focused: true }); await subject.dispatch("push", { isTest: true, locale: "en" });
    expect(subject.show).toHaveBeenCalledWith("Ouj Chat", expect.objectContaining({ body: "Test notification. Message alerts are working." }));
  });
  test("clears the icon badge when the server reports zero unread messages", async () => {
    const subject = worker(); await subject.dispatch("push", { badge: 0 });
    expect(subject.workerNavigator.clearAppBadge).toHaveBeenCalledOnce();
  });
  test("opens the conversation carried by a background notification", async () => {
    const subject = worker(); await subject.dispatch("notificationclick", { chatId: "chat-42" });
    expect(subject.openWindow).toHaveBeenCalledWith("https://chat.example.test/chat?chatId=chat-42");
  });
  test("localizes private notifications without rewriting real message text", async () => {
    const subject = worker(); await subject.dispatch("push", { body: "New message", previewHidden: true, locale: "fa" });
    expect(subject.show).toHaveBeenCalledWith("گفتگوی اوج", expect.objectContaining({ body: "پیام جدید" }));
  });
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
  test("replaces a finished call with a quiet visible notice instead of silent push", async () => {
    const subject = worker(); await subject.dispatch("push", { data: { callPush: "dismiss", chatId: "chat" } });
    expect(subject.show).toHaveBeenCalledWith("گفتگوی اوج", expect.objectContaining({ body: "تماس پایان یافت.", silent: true, tag: "call-chat" }));
  });
});
