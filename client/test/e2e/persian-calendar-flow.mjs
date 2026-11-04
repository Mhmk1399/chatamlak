import assert from "node:assert/strict";
import { chromium } from "playwright";
import { today, toZoned } from "@internationalized/date";

// Use only a separately started local instance with a dedicated test database.
const baseURL = process.env.SONGBIRD_E2E_BASE_URL;
if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error("Set SONGBIRD_E2E_BASE_URL to an isolated local Songbird instance.");
}
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, timezoneId: "America/Los_Angeles", viewport: { width: 390, height: 844 } });
const peer = await browser.newContext({ baseURL });
const failures = [];
const suffix = Date.now().toString(36);
const owner = `qc${suffix}`, member = `qd${suffix}`;
async function api(session, method, url, data) {
  const response = await session.request.fetch(url, { method, data });
  const body = await response.json();
  assert(response.ok(), `${method} ${url}: ${response.status()}`);
  return body;
}
try {
  await context.addInitScript(() => localStorage.setItem("songbird-locale", "en"));
  await api(context, "POST", "/api/register", { username: owner, nickname: "Calendar QA", password: "calendar-qa-2026" });
  await api(peer, "POST", "/api/register", { username: member, nickname: "Calendar Peer", password: "calendar-qa-2026" });
  const chat = await api(context, "POST", "/api/chats/group", { creator: owner, nickname: "Calendar QA", username: `qcalendar${suffix}`, visibility: "private", members: [member] });
  await api(context, "POST", "/api/messages", { chatId: chat.id, username: owner, body: "calendar report", clientRequestId: `calendar:${suffix}` });
  const page = await context.newPage(); page.on("pageerror", error => failures.push(error.message));
  await page.addInitScript(chatId => sessionStorage.setItem("songbird-open-chat-id", chatId), chat.id);
  await page.goto("/chat");
  await page.getByRole("button", { name: "Close what's new" }).waitFor({ timeout: 5000 }).then(() => page.getByRole("button", { name: "Close what's new" }).click()).catch(() => {});
  await page.locator('textarea[name="message"]').waitFor();
  await page.getByRole("button", { name: "More chat actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Chat tools", exact: true }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Chat tools", exact: true });
  await form.getByRole("textbox", { name: "Message", exact: true }).fill("Jalali scheduling QA");
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  const calendar = page.getByRole("dialog", { name: "Persian calendar", exact: true });
  assert.match(await calendar.textContent(), /[\u0600-\u06ff]/);
  await calendar.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  await page.locator(".ouj-calendar-day[data-selected]").focus();
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("Enter");
  const nextDay = today("Asia/Tehran").add({ days: 1 });
  const expectedDue = toZoned(nextDay, "Asia/Tehran").set({ hour: 9, minute: 15 }).toDate().toISOString();
  await page.getByRole("button", { name: "Open clock: Time", exact: true }).click();
  await page.getByRole("button", { name: "Hour 9", exact: true }).click();
  await page.getByRole("button", { name: "Minute 15", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  let rejectSave = true;
  await page.route(`**/api/messaging/chats/${chat.id}/scheduled`, async route => {
    if (route.request().method() === "POST" && rejectSave) {
      rejectSave = false; await route.fulfill({ status: 502, contentType: "text/html", body: "<html>Gateway unavailable</html>" });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Schedule message", exact: true }).click();
  await form.getByRole("alert").filter({ hasText: "Unable to complete this operation." }).waitFor();
  assert.equal(await form.getByRole("textbox", { name: "Message", exact: true }).inputValue(), "Jalali scheduling QA");
  assert.equal(await page.getByRole("button", { name: "Clear Date", exact: true }).count(), 1);
  const saved = page.waitForResponse(response => response.url().endsWith(`/chats/${chat.id}/scheduled`) && response.request().method() === "POST" && response.status() === 201);
  await page.getByRole("button", { name: "Schedule message", exact: true }).click(); await saved;
  const scheduled = (await api(context, "GET", `/api/messaging/chats/${chat.id}/scheduled`)).messages.find(item => item.body === "Jalali scheduling QA");
  assert(scheduled); assert.equal(scheduled.due_at, expectedDue);
  await page.reload(); await page.locator('textarea[name="message"]').waitFor();
  await page.getByRole("button", { name: "More chat actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Chat tools", exact: true }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByText("Jalali scheduling QA", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel scheduled message", exact: true }).click();
  await page.getByText("Jalali scheduling QA", { exact: true }).waitFor({ state: "hidden" });
  assert.equal((await api(context, "GET", `/api/messaging/chats/${chat.id}/scheduled`)).messages.length, 0);
  await form.getByRole("button", { name: "Search", exact: true }).click();
  for (const label of ["From date", "To date"]) {
    await page.getByRole("button", { name: `Open calendar ${label}`, exact: true }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
  }
  const searched = page.waitForRequest(request => request.url().includes("/api/messaging/search?") && new URL(request.url()).searchParams.get("q") === "calendar report");
  await page.getByRole("textbox", { name: "Search messages", exact: true }).fill("calendar report");
  const params = new URL((await searched).url()).searchParams;
  const day = today("Asia/Tehran");
  assert.equal(params.get("after"), toZoned(day, "Asia/Tehran").toDate().toISOString());
  assert.equal(params.get("before"), new Date(toZoned(day.add({ days: 1 }), "Asia/Tehran").toDate().getTime() - 1).toISOString());
  await form.getByText("calendar report", { exact: true }).waitFor();
  assert.deepEqual(failures, []);
  console.log("Jalali calendar: mobile English UI, Tehran scheduling from a US device zone, failed-save recovery, Mongo persistence after reload, cancellation and inclusive date search passed.");
} finally { await browser.close(); }
