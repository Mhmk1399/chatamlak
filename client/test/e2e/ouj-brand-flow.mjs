import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.SONGBIRD_E2E_BASE_URL;
if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Use an isolated local Songbird instance.");
const browser = await chromium.launch();
const contexts = [];
const errors = [];
async function context() {
  const value = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  await value.addInitScript(() => { localStorage.setItem("songbird-pwa-install-dismissed", "1"); if (!localStorage.getItem("songbird-theme")) localStorage.setItem("songbird-theme", "light"); });
  contexts.push(value); return value;
}
async function api(client, method, url, data) {
  const response = await client.request.fetch(url, { method, data });
  assert(response.ok(), `${method} ${url}: ${response.status()}`);
  return response.json();
}
async function screenshot(page, name) {
  const destination = path.join(os.tmpdir(), `ouj-${name}.png`);
  await page.screenshot({ path: destination, fullPage: true });
  console.log(`Preview: ${destination}`);
}
async function pageFor(client) {
  const page = await client.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}
async function eventually(check, name, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check().catch(() => false)) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error(name);
}
try {
  const anonymous = await context();
  const login = await pageFor(anonymous);
  await login.goto("/login");
  await login.getByRole("heading", { name: "به اوج خوش آمدید" }).waitFor();
  assert.equal(await login.locator("html").getAttribute("lang"), "fa");
  assert.equal(await login.locator("html").getAttribute("dir"), "rtl");
  await screenshot(login, "login-light-fa");
  await login.locator('input[name="username"]').fill(`missing${Date.now()}`);
  await login.locator('input[name="password"]').fill("incorrect-password");
  await login.getByRole("button", { name: "ورود", exact: true }).click();
  await login.getByText("نام کاربری یا رمز عبور درست نیست.", { exact: true }).waitFor();
  await login.getByRole("button", { name: "زبان", exact: true }).click();
  await login.getByRole("heading", { name: "Welcome to Ouj" }).waitFor();
  await login.getByText("Invalid credentials.", { exact: true }).waitFor();
  assert.equal(await login.locator("html").getAttribute("dir"), "ltr");
  await screenshot(login, "login-light-en");
  await login.getByRole("button", { name: "Toggle dark mode" }).click();
  await login.getByRole("button", { name: "Language", exact: true }).click();
  assert(await login.locator("html").evaluate((element) => element.classList.contains("dark")));
  await screenshot(login, "login-dark-fa");
  await login.setViewportSize({ width: 390, height: 844 });
  assert(await login.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await screenshot(login, "login-mobile-fa");
  console.log("Authentication: Persian default, English switching, retained validation errors and both themes passed.");

  const alice = await context(); const bob = await context();
  const suffix = Date.now().toString(36);
  const username = `ouja${suffix}`;
  const peerUsername = `oujb${suffix}`;
  const owner = await api(alice, "POST", "/api/register", { username, nickname: "سارا احمدی", password: "ouj-qa-password" });
  await api(bob, "POST", "/api/register", { username: peerUsername, nickname: "علی رضایی", password: "ouj-qa-password" });
  const group = await api(alice, "POST", "/api/chats/group", { creator: username, nickname: "گزارش‌های مشاوران", username: `oujg${suffix}`, visibility: "private", members: [peerUsername] });
  const workspace = await pageFor(alice);
  await workspace.addInitScript((id) => sessionStorage.setItem("songbird-open-chat-id", id), group.id);
  await workspace.goto("/chat");
  await workspace.getByRole("button", { name: "بستن تازه‌ها", exact: true }).waitFor({ timeout: 5000 }).then(() => workspace.getByRole("button", { name: "بستن تازه‌ها", exact: true }).click()).catch(() => {});
  const composer = workspace.locator('textarea[name="message"]');
  await composer.fill("گزارش امروز: بازدید ملک انجام شد و فایل آمادهٔ بررسی سرپرست است.");
  await workspace.getByRole("button", { name: "Send message", exact: true }).or(workspace.getByRole("button", { name: "ارسال پیام", exact: true })).click();
  await workspace.getByRole("log").getByText("گزارش امروز: بازدید ملک انجام شد و فایل آمادهٔ بررسی سرپرست است.", { exact: true }).waitFor();
  await screenshot(workspace, "chat-light-fa");
  await workspace.getByRole("button", { name: "زبان", exact: true }).first().click();
  await workspace.getByRole("button", { name: "More chat actions", exact: true }).click();
  await workspace.getByRole("menuitem", { name: "Chat tools", exact: true }).click();
  await workspace.getByRole("button", { name: "Devices", exact: true }).waitFor();
  await workspace.getByRole("button", { name: "Close", exact: true }).click();
  await workspace.getByRole("button", { name: "Language", exact: true }).first().click();
  await workspace.getByRole("button", { name: "حالت تاریک", exact: true }).click();
  assert(await workspace.locator("html").evaluate((element) => element.classList.contains("dark")));
  await workspace.reload();
  await composer.waitFor();
  assert(await workspace.locator("html").evaluate((element) => element.classList.contains("dark")));
  await screenshot(workspace, "chat-dark-fa");
  await workspace.setViewportSize({ width: 390, height: 844 });
  assert(await workspace.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await screenshot(workspace, "chat-mobile-fa");

  // The token belongs only to the isolated local test server. Never print it.
  const envFile = new URL("../../../.env", import.meta.url);
  const token = process.env.ADMIN_API_TOKEN || (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").match(/^ADMIN_API_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") : null);
  assert(token, "The isolated test server needs a bootstrap admin token");
  if (!["admin", "owner"].includes(owner.role)) await api(alice, "POST", "/api/admin/claim", { token });
  await workspace.setViewportSize({ width: 1440, height: 1000 });
  await workspace.goto("/admin");
  await workspace.getByRole("button", { name: "تنظیمات", exact: true }).first().click();
  await workspace.getByText("ثبت گزارش‌های فنی", { exact: true }).waitFor();
  await screenshot(workspace, "admin-dark-fa");
  await workspace.getByRole("button", { name: "زبان", exact: true }).last().click();
  await workspace.getByText("Debug logging", { exact: true }).waitFor();
  assert.equal(await workspace.locator("html").getAttribute("dir"), "ltr");
  assert.deepEqual(errors, []);
  console.log("Workspace: report sending, Persian/English tools, responsive themes and live admin settings translation passed.");
} finally { await Promise.all(contexts.map((value) => value.close())); await browser.close(); }
