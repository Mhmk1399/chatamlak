import assert from "node:assert/strict";
import { chromium } from "playwright";
import { today, toZoned } from "@internationalized/date";

const baseURL = process.env.OUJ_CHAT_E2E_BASE_URL;
if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Use an isolated local server with a dedicated test database.");
// The headless shell does not implement the service-worker BadgeService.
// Use Chromium's full headless browser for notification/badging integration.
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
const peer = await browser.newContext({ baseURL });
const suffix = Date.now().toString(36), username = `qp${suffix}`, password = "pwa-test-password-2026";
const errors = [];
async function api(session, method, url, data) {
  const response = await session.request.fetch(url, { method, data });
  assert(response.ok(), `${method} ${url}: ${response.status()}`); return response.json();
}
async function eventually(check, label, timeout = 12000) {
  const deadline = Date.now() + timeout; let last;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${label}: ${last?.message || "not ready"}`);
}
try {
  await context.addInitScript(() => {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    localStorage.setItem("ouj-chat-locale", "en");
    window.deviceChecks = { notifications: 0, media: 0, stopped: 0 };
    const notifications = { permission: "default", requestPermission: async () => { window.deviceChecks.notifications++; notifications.permission = "denied"; return "denied"; } };
    Object.defineProperty(window, "Notification", { value: notifications, configurable: true });
    navigator.mediaDevices.getUserMedia = async () => { window.deviceChecks.media++; return { getTracks: () => [{ stop: () => window.deviceChecks.stopped++ }] }; };
    const nativeQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = options => ["camera", "microphone"].includes(options.name)
      ? Promise.resolve({ state: "prompt", addEventListener() {}, removeEventListener() {} }) : nativeQuery(options);
  });
  let page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto("/signup");
  await page.locator('input[name="nickname"]').fill("Device QA");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL("**/login");
  assert.deepEqual(await page.evaluate(() => window.deviceChecks), { notifications: 0, media: 0, stopped: 0 });
  await page.locator('input[name="username"]').fill(username); await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  const setup = page.getByRole("dialog", { name: "Set up your device", exact: true }); await setup.waitFor();
  assert.deepEqual(await page.evaluate(() => window.deviceChecks), { notifications: 0, media: 0, stopped: 0 });
  await setup.getByRole("button", { name: "Allow microphone", exact: true }).click();
  await setup.getByRole("button", { name: "Allow camera", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.deviceChecks), { notifications: 0, media: 2, stopped: 2 });
  await setup.getByRole("button", { name: "Enable notifications", exact: true }).click();
  await setup.getByRole("alert").waitFor(); assert.equal(await page.evaluate(() => window.deviceChecks.notifications), 1);
  await setup.getByRole("button", { name: "Continue to chat", exact: true }).click();
  await page.getByRole("button", { name: "Close what's new" }).waitFor({ timeout: 5000 }).then(() => page.getByRole("button", { name: "Close what's new" }).click()).catch(() => {});
  const user = await api(context, "GET", "/api/me");
  const other = `qr${suffix}`;
  await api(peer, "POST", "/api/register", { username: other, nickname: "Device Peer", password });
  const chat = await api(context, "POST", "/api/chats/group", { creator: username, nickname: "Device reports", username: `qd${suffix}`, visibility: "private", members: [other] });
  await page.goto(`/chat?chatId=${chat.id}`);
  const input = page.locator('textarea[name="message"]'); await input.waitFor();
  assert.equal(await setup.count(), 0, "Setup must not reappear after it was completed.");
  await input.fill("PWA scheduled report");
  await page.getByRole("button", { name: "Send message", exact: true }).click({ delay: 650 });
  const scheduling = page.getByRole("dialog", { name: "Schedule message", exact: true }); await scheduling.waitFor();
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  const current = today("Asia/Tehran"), next = current.add({ days: 1 });
  const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tehran" });
  if (formatter.formatToParts(current.toDate("Asia/Tehran")).find(part => part.type === "month").value !== formatter.formatToParts(next.toDate("Asia/Tehran")).find(part => part.type === "month").value) await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page.getByRole("button", { name: formatter.format(next.toDate("Asia/Tehran")), exact: false }).click();
  await page.getByRole("button", { name: "Open clock: Time", exact: true }).click();
  await page.getByRole("button", { name: "Hour 9", exact: true }).click(); await page.getByRole("button", { name: "Minute 15", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await scheduling.getByRole("button", { name: "Schedule message", exact: true }).click(); await scheduling.waitFor({ state: "hidden" });
  const scheduled = (await api(context, "GET", `/api/messaging/chats/${chat.id}/scheduled`)).messages;
  assert.equal(scheduled.length, 1); assert.equal(scheduled[0].body, "PWA scheduled report");
  assert.equal(scheduled[0].due_at, toZoned(next, "Asia/Tehran").set({ hour: 9, minute: 15 }).toDate().toISOString());
  const messages = await api(context, "GET", `/api/messages?chatId=${chat.id}&username=${username}`);
  assert(!messages.messages.some(message => message.body === "PWA scheduled report"));
  assert.equal(await input.inputValue(), "");
  await api(context, "DELETE", `/api/messaging/scheduled/${scheduled[0].id}`);

  // Chromium's official DevTools push injection exercises the real installed
  // service worker with all application windows closed, without a cloud push provider.
  const registrations = new Map(); const cdp = await context.newCDPSession(page);
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations: updates }) => updates.forEach(reg => registrations.set(reg.registrationId, reg)));
  await cdp.send("ServiceWorker.enable"); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const registration = await eventually(() => [...registrations.values()].find(reg => reg.scopeURL === `${baseURL}/`), "service worker registration");
  await context.grantPermissions(["notifications"]);
  const blank = await context.newPage(); const delivery = await context.newCDPSession(blank); await delivery.send("ServiceWorker.enable");
  await page.close();
  await delivery.send("ServiceWorker.deliverPushMessage", { origin: baseURL, registrationId: registration.registrationId,
    data: JSON.stringify({ accountId: user.id, locale: "en", title: "Device Peer", body: "Background report QA", badge: 2, data: { chatId: chat.id } }) });
  await eventually(async () => {
    for (const worker of context.serviceWorkers()) {
      const notifications = await worker.evaluate(async () => (await self.registration.getNotifications()).map(item => ({ body: item.body, data: item.data })));
      if (notifications.some(item => item.body === "Background report QA" && item.data.chatId === chat.id)) return true;
    }
    return false;
  }, "visible background notification with no app windows");
  page = await context.newPage(); await page.goto(`/chat?chatId=${chat.id}`); await page.locator('textarea[name="message"]').waitFor();
  assert.deepEqual(errors, []);
  console.log("PWA: UI signup/login, account-scoped optional permissions, explicit requests, released media tracks, persisted hold-to-schedule, chat deep links, and injected push into a real service worker with app windows closed passed.");
} catch (error) {
  console.error("Browser errors:", errors.slice(-8));
  throw error;
} finally { await browser.close(); }
