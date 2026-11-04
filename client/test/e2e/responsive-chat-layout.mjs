import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.SONGBIRD_E2E_BASE_URL;
if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Use an isolated local server with a dedicated test database.");
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 850 } });
const peer = await browser.newContext({ baseURL });
const suffix = Date.now().toString(36), username = `ql${suffix}`, other = `qm${suffix}`, password = "layout-test-password-2026";
const errors = [];
async function api(session, method, url, data) {
  const response = await session.request.fetch(url, { method, data });
  assert(response.ok(), `${method} ${url}: ${response.status()}`); return response.json();
}
async function eventually(check, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(label);
}
try {
  await context.addInitScript(() => { if (!localStorage.getItem("songbird-locale")) localStorage.setItem("songbird-locale", "en"); });
  await api(context, "POST", "/api/register", { username, nickname: "Layout QA", password });
  await api(peer, "POST", "/api/register", { username: other, nickname: "Layout Peer", password });
  const groups = [];
  for (let index = 0; index < 4; index++) {
    const chat = await api(context, "POST", "/api/chats/group", { creator: username, nickname: `Ouj reports ${index + 1}`, username: `qg${index}${suffix}`, visibility: "private", members: [other] });
    groups.push(chat);
    await api(context, "PUT", `/api/messaging/chats/${chat.id}/preference`, { folder: `Office ${index + 1}` });
  }
  const chat = groups[0];
  await api(peer, "POST", "/api/messages", { chatId: chat.id, username: other, body: "Daily report: property files are ready.", clientRequestId: `layout-report:${suffix}` });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/chat?chatId=${chat.id}`);
  await page.getByRole("button", { name: "Close what's new" }).waitFor({ timeout: 4000 }).then(() => page.getByRole("button", { name: "Close what's new" }).click()).catch(() => {});
  await page.locator('textarea[name="message"]').waitFor();
  const divider = page.getByRole("separator", { name: "Resize chat list", exact: true });
  const sidebar = page.locator(".ouj-chat-sidebar");
  const initial = await sidebar.evaluate(element => element.getBoundingClientRect().width);
  const bounds = await divider.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, 350); await page.mouse.down(); await page.mouse.move(bounds.x + 104, 350, { steps: 8 }); await page.mouse.up();
  const widened = await sidebar.evaluate(element => element.getBoundingClientRect().width);
  assert(widened > initial + 90, "Pointer resize must widen the desktop chat list.");
  await page.goto(`/chat?chatId=${chat.id}`); await page.locator('textarea[name="message"]').waitFor();
  assert.equal(await sidebar.evaluate(element => element.getBoundingClientRect().width), widened);
  const nav = page.getByRole("navigation", { name: "Chat folders", exact: true });
  assert.equal(await nav.evaluate(element => !!element.closest("aside")), false);

  const more = page.getByRole("button", { name: "More chat actions", exact: true });
  await more.click(); await page.getByRole("menuitem", { name: "Pin chat", exact: true }).click();
  await eventually(async () => (await api(context, "GET", "/api/messaging/preferences")).preferences.some(item => item.chat_id === chat.id && item.pinned), "Pinned preference must persist.");
  await more.click(); await page.getByRole("menuitem", { name: "Folder", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "Chat tools", exact: true });
  await tools.getByRole("textbox", { name: "Folder", exact: true }).fill("Sales team");
  await tools.getByRole("button", { name: "Save", exact: true }).click(); await tools.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  await tools.getByRole("button", { name: "Close", exact: true }).click();
  await nav.getByRole("button", { name: /^Sales team/ }).waitFor();
  await more.click(); await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await eventually(async () => (await api(context, "GET", "/api/messaging/preferences")).preferences.some(item => item.chat_id === chat.id && item.archived), "Archive preference must persist.");
  await more.click(); await page.getByRole("menuitem", { name: "Unarchive", exact: true }).click();
  await more.click(); await page.getByRole("menuitem", { name: "Delete chat", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete chats", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
  const messages = await api(context, "GET", `/api/messages?chatId=${chat.id}&username=${username}`); assert(messages.messages.length > 0);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await tools.getByRole("textbox", { name: "Search messages", exact: true }).fill("property");
  await tools.getByText("Daily report: property files are ready.", { exact: false }).waitFor();
  await tools.getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({ path: "client/.vitest/layout-desktop-en.png" });

  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  const rtlDivider = page.getByRole("separator", { name: "تغییر عرض فهرست گفتگوها", exact: true });
  const rtlBounds = await rtlDivider.boundingBox();
  await page.mouse.move(rtlBounds.x + 4, 350); await page.mouse.down(); await page.mouse.move(rtlBounds.x - 46, 350, { steps: 6 }); await page.mouse.up();
  const rtlWidth = await sidebar.evaluate(element => element.getBoundingClientRect().width);
  assert(rtlWidth > widened + 40, "RTL drag to the left must widen the list.");
  const cancelBounds = await rtlDivider.boundingBox();
  await page.mouse.move(cancelBounds.x + 4, 350); await page.mouse.down(); await page.mouse.move(cancelBounds.x + 54, 350, { steps: 5 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  assert.equal(await sidebar.evaluate(element => element.getBoundingClientRect().width), rtlWidth, "Escape must cancel a resize.");
  await page.locator('textarea[name="message"]').waitFor({ timeout: 2000 });
  await rtlDivider.dblclick(); assert.equal(await sidebar.evaluate(element => element.getBoundingClientRect().width), 360);
  await page.getByRole("button", { name: "حالت تاریک", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  assert.equal(await sidebar.evaluate(element => element.getBoundingClientRect().width), 360);
  await page.screenshot({ path: "client/.vitest/layout-desktop-fa.png" });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "بازگشت به گفتگوها", exact: true }).click();
  const tabs = page.getByRole("navigation", { name: "پوشه‌های گفتگو", exact: true });
  assert.equal(await tabs.evaluate(element => !!element.closest("aside")), true);
  const geometry = await tabs.evaluate(element => ({ scrollWidth: element.scrollWidth, width: element.clientWidth, rows: [...new Set([...element.querySelectorAll("button")].map(button => Math.round(button.getBoundingClientRect().y)))] }));
  assert(geometry.scrollWidth > geometry.width); assert.equal(geometry.rows.length, 1);
  await tabs.getByRole("button", { name: /^Sales team/ }).click();
  await page.screenshot({ path: "client/.vitest/layout-mobile-fa.png" });
  assert.deepEqual(errors, []);
  console.log("Responsive layout: actual LTR/RTL pointer resize, persistence, cancel/reset, separate desktop rail, real pin/archive/folder saves, delete cancellation, message search, and horizontally scrolling mobile folders passed.");
} catch (error) { console.error("Browser errors:", errors); await context.pages()[0]?.screenshot({ path: "client/.vitest/layout-failure.png" }).catch(() => {}); throw error; }
finally { await browser.close(); }
