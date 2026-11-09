import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.OUJ_CHAT_E2E_BASE_URL;
if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Use an isolated local server with OUJ_CHAT_E2E_BASE_URL.");
const browser = await chromium.launch();
const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })));
for (const context of contexts) await context.addInitScript(() => { if (!localStorage.getItem("ouj-chat-locale")) localStorage.setItem("ouj-chat-locale", "en"); });
const [owner, secondDevice, peer] = contexts;
const errors = [], requests = [], assets = [];
const suffix = Date.now().toString(36);
const username = `wall${suffix}`, otherUsername = `wp${suffix}`;
async function api(context, method, url, data) {
  const response = await context.request.fetch(url, { method, data });
  const body = await response.json(); assert(response.ok(), `${method} ${url}: ${response.status()}`); return body;
}
async function until(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error(label);
}
const canvas = (page) => page.getByTestId("conversation-canvas").locator("[data-wallpaper]");
async function openGallery(page, locale = "en") {
  const fa = locale === "fa";
  await page.getByRole("button", { name: fa ? "منوی کاربر" : "User menu", exact: true }).first().click();
  await page.getByRole("menuitem", { name: fa ? "تنظیمات" : "Settings", exact: true }).click();
  await page.getByRole("button", { name: fa ? "پس‌زمینهٔ گفتگو" : "Chat background", exact: true }).click();
  await page.getByRole("button", { name: fa ? "پیش‌نمایش حیاط ایرانی" : "Preview Persian courtyard", exact: true }).waitFor();
}
try {
  await api(owner, "POST", "/api/register", { username, nickname: "Wallpaper QA", password: "qa-background-password" });
  await api(peer, "POST", "/api/register", { username: otherUsername, nickname: "Other account", password: "qa-background-password" });
  await api(secondDevice, "POST", "/api/login", { username, password: "qa-background-password" });
  const group = await api(owner, "POST", "/api/chats/group", { creator: username, nickname: "Daily reports", username: `wg${suffix}`, visibility: "private", members: [otherUsername] });
  const pages = [];
  for (const context of contexts) {
    const page = await context.newPage(); pages.push(page);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((id) => { if (!sessionStorage.getItem("ouj-chat-open-chat-id")) sessionStorage.setItem("ouj-chat-open-chat-id", id); }, group.id);
  }
  const [page, devicePage, peerPage] = pages;
  page.on("request", (request) => { if (request.url().includes("/api/profile/appearance")) requests.push(request.method()); });
  const pattern = /\/(arches|contours|courtyard|blueprint|leaves|ribbons|constellation|brickwork)-[^/]+\.svg/;
  page.on("response", (response) => { if (pattern.test(response.url())) assets.push({ url: response.url(), cache: response.headers()["cache-control"] }); });
  for (const page of pages) {
    await page.goto("/chat");
    await page.getByRole("button", { name: "Close what's new" }).waitFor({ timeout: 4000 }).then(() => page.getByRole("button", { name: "Close what's new" }).click()).catch(() => {});
    await canvas(page).waitFor({ state: "attached" });
  }
  assert.equal(await canvas(page).getAttribute("data-wallpaper"), "default");
  assert.deepEqual(requests, [], "wallpaper must not add a startup preference request");
  assert(assets.length > 0 && assets.every(({ url }) => url.includes("/arches-")), "only the selected pattern should load before opening the gallery");
  assert(assets.every(({ cache }) => cache?.includes("immutable")), "build-hashed patterns need immutable asset caching");
  const composer = page.locator('textarea[name="message"]'); await composer.fill("Unsent property report");
  await openGallery(page);
  await page.getByRole("button", { name: "Preview Persian courtyard", exact: true }).click();
  assert.equal(await canvas(page).getAttribute("data-wallpaper"), "default", "preview must not commit");
  await page.screenshot({ path: path.join(os.tmpdir(), "ouj-wallpaper-gallery-light-en.png"), animations: "disabled" });
  const previewBounds = await page.getByTestId("wallpaper-preview").boundingBox();
  const sidebarBounds = await page.locator("aside").boundingBox();
  assert(previewBounds.x >= sidebarBounds.x && previewBounds.x + previewBounds.width <= sidebarBounds.x + sidebarBounds.width, "the background gallery must stay inside its sidebar after the slide transition");
  await page.getByRole("button", { name: "Apply background", exact: true }).click();
  await until(async () => await canvas(page).getAttribute("data-wallpaper") === "courtyard", "saved wallpaper must apply");
  await until(async () => await canvas(devicePage).getAttribute("data-wallpaper") === "courtyard", "other device should receive the private live/replay event");
  assert.equal(await canvas(peerPage).getAttribute("data-wallpaper"), "default", "another member's background must not change");
  await page.reload(); await canvas(page).waitFor({ state: "attached" });
  await until(async () => await canvas(page).getAttribute("data-wallpaper") === "courtyard", "saved wallpaper should restore on reload");
  await until(async () => await composer.inputValue() === "Unsent property report", "changing background must preserve message drafts");
  assert.deepEqual(requests, ["PUT"], "reload should reuse /api/me without a wallpaper fetch");
  assert.equal((await api(owner, "GET", "/api/me")).chatAppearance.revision, 1);
  const dm = await api(owner, "POST", "/api/chats/dm", { from: username, to: otherUsername });
  const channel = await api(owner, "POST", "/api/chats/group", { creator: username, type: "channel", nickname: "Agency updates", username: `wc${suffix}`, visibility: "private", members: [] });
  for (const id of [dm.id, channel.id, group.id]) {
    await page.evaluate((chatId) => sessionStorage.setItem("ouj-chat-open-chat-id", chatId), id);
    await page.reload(); await canvas(page).waitFor({ state: "attached" });
    await until(async () => await canvas(page).getAttribute("data-wallpaper") === "courtyard", "wallpaper should be shared across DMs, channels and groups");
  }
  const stale = await secondDevice.request.put("/api/profile/appearance", { data: { wallpaperId: "plain", revision: 0 } });
  assert.equal(stale.status(), 409);
  await api(secondDevice, "PUT", "/api/profile/appearance", { wallpaperId: "leaves", revision: 1 });
  await until(async () => await canvas(page).getAttribute("data-wallpaper") === "leaves", "remote edit must replace only the cached account preference");
  await openGallery(page); await page.getByRole("button", { name: "Preview Quiet contours", exact: true }).click();
  await owner.setOffline(true); await page.getByRole("button", { name: "Apply background", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Could not save your background" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Preview Quiet contours", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await canvas(page).getAttribute("data-wallpaper"), "leaves");
  await owner.setOffline(false); await page.getByRole("button", { name: "Apply background", exact: true }).click();
  await until(async () => await canvas(page).getAttribute("data-wallpaper") === "contours", "retry must save the preserved preview");
  await page.getByRole("button", { name: "Back to settings", exact: true }).click();
  await page.getByRole("button", { name: "User menu", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Chats", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).first().click();
  await page.getByRole("button", { name: "حالت تاریک", exact: true }).first().click();
  await openGallery(page, "fa");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "پیش‌نمایش حیاط ایرانی", exact: true }).waitFor();
  await page.getByRole("heading", { name: "پس‌زمینهٔ گفتگو", exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(os.tmpdir(), "ouj-wallpaper-gallery-dark-fa-mobile.png"), animations: "disabled" });
  await page.getByRole("button", { name: "لغو پیش‌نمایش", exact: true }).count().then(async (count) => { if (count) await page.getByRole("button", { name: "لغو پیش‌نمایش", exact: true }).click(); });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  assert(await page.locator(".ouj-wallpaper-pattern").first().evaluate((element) => getComputedStyle(element).display === "none"));
  assert.deepEqual(errors, []);
  console.log("Passed: account-private wallpaper selection/preview, real MongoDB persistence, reload and draft preservation, no extra startup preference request, immutable vector caching, second-device sync, conflict/offline recovery and Persian mobile dark/forced-color layouts.");
} catch (error) {
  await owner.pages()[0]?.screenshot({ path: path.join(os.tmpdir(), "ouj-wallpaper-e2e-failure.png") }).catch(() => {});
  throw error;
} finally { await Promise.all(contexts.map((context) => context.close())); await browser.close(); }
