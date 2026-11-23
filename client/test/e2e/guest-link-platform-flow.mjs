import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const MARKER = "owj-sprint4-synthetic-only-v1";
const PORT = "28088";
const WEB_SUBJECT = "64b000000000000000000001";

if (
  process.env.OWJ_SYNTHETIC_DATA_MARKER !== MARKER ||
  process.env.OWJ_INTEGRATION_PORT !== PORT ||
  process.env.OWJ_CHAT_DB_NAME !== "owj_chat_e2e" ||
  process.env.OWJ_WEB_DB_NAME !== "owj_web_e2e"
) throw new Error("Refusing to run guest linking outside the isolated Sprint 5 synthetic project");

const jwtSecret = process.env.OWJ_WEB_JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error("Synthetic Web JWT secret is unavailable");

const webOrigin = `http://owj.localhost:${PORT}`;
const chatOrigin = `http://chat.owj.localhost:${PORT}`;
const browserPath = process.env.OWJ_E2E_BROWSER || "/usr/bin/google-chrome";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function webToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    id: WEB_SUBJECT, role: "admin", name: "Sprint 5 guest-link user", iat: now, exp: now + 900,
  })}`;
  return `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
}

function mongoEvidence(conversationId) {
  const webRoot = process.env.OWJ_WEB_REPO_ROOT || process.cwd();
  const script = `
    const chat = db.getSiblingDB("owj_chat_e2e");
    const row = chat.support_conversations.findOne({id:${JSON.stringify(conversationId)}});
    const link = chat.support_guest_identity_links.findOne({conversation_id:${JSON.stringify(conversationId)}});
    print(JSON.stringify({
      registered: row?.identity_kind === "registered",
      webSubjectMatches: row?.web_user_id === ${JSON.stringify(WEB_SUBJECT)},
      nativeChatIdentity: typeof row?.chat_user_id === "string" && row.chat_user_id.length > 0,
      guestActorPreserved: typeof row?.conversion_from_guest_actor_id === "string",
      proofRecorded: typeof row?.conversion_proof_id === "string" && row.conversion_proof_id.length > 0,
      linkMatches: link?.web_user_id === ${JSON.stringify(WEB_SUBJECT)} && link?.conversation_id === ${JSON.stringify(conversationId)},
      activeGuestSessions: chat.support_sessions.countDocuments({conversation_id:${JSON.stringify(conversationId)},principal_kind:"guest",status:"active"})
    }));`;
  const result = spawnSync("docker", [
    "compose", "--project-name", "owj-sprint4-synthetic",
    "--env-file", "integration/.env.synthetic",
    "-f", "integration/compose.yaml", "-f", "integration/synthetic.compose.yaml",
    "-f", "/tmp/owj-sprint5-chat.override.yaml",
    "exec", "-T", "mongo", "bash", "-lc",
    "mongosh --quiet --host 127.0.0.1 --port 27017 -u \"$MONGO_INITDB_ROOT_USERNAME\" -p \"$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin --eval \"$1\"", "--", script,
  ], { cwd: webRoot, encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) throw new Error(`Synthetic Mongo evidence failed: ${String(result.stderr || result.stdout).slice(0, 300)}`);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

async function request(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { path, options });
}

const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"] });
const context = await browser.newContext();
const page = await context.newPage();
let conversationId = "";

try {
  await page.goto(webOrigin, { waitUntil: "domcontentloaded" });
  const guest = await request(page, "/api/v1/support/session", {
    method: "POST",
    body: { requestId: crypto.randomUUID(), bootstrapType: "customer", locale: "fa-IR", context: { page: "/sprint-5-closure" } },
  });
  assert(guest.status === 200 && typeof guest.body.conversationId === "string",
    `Web guest support bootstrap failed: ${JSON.stringify(guest)}`);
  conversationId = guest.body.conversationId;
  assert(!String(await page.evaluate(() => document.cookie)).includes("owj_support"), "Web support cookie became JavaScript-visible");

  await page.evaluate((token) => localStorage.setItem("token", token), webToken());
  await page.goto(`${chatOrigin}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Owj|اوج/i }).click();
  try {
    await page.waitForURL(`${chatOrigin}/chat`, { timeout: 20_000 });
  } catch (error) {
    throw new Error(`Native Chat SSO did not complete: ${page.url()} ${String(await page.locator("body").innerText()).slice(-500)}`, { cause: error });
  }
  assert((await request(page, "/api/me")).status === 200, "Native Chat SSO session is unavailable");

  const start = await request(page, "/api/integrations/support/guest-link/start", {
    method: "POST", body: { intent: "link_guest_history" },
  });
  assert(start.status === 200 && start.body.form?.intent === "link_guest_history", "Chat guest-link start failed");
  const transaction = (await context.cookies(`${chatOrigin}/api/integrations/support/guest-link/start`))
    .find((cookie) => cookie.name === "owj_chat_guest_link_tx");
  assert(transaction?.httpOnly && transaction.path === "/api/integrations/support/guest-link", "Guest-link transaction cookie is not host-only HttpOnly scoped");

  await page.evaluate(({ action, fields }) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = action;
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = name; input.value = value; form.append(input);
    }
    document.body.append(form); form.submit();
  }, { action: start.body.authorizationUrl, fields: start.body.form });
  await page.waitForURL((url) => url.origin === webOrigin && url.pathname === "/support/guest-link/authorize", { timeout: 20_000 });
  let authorizeResponse = null;
  page.on("response", async (response) => {
    if (response.url() === `${webOrigin}/api/v1/support/guest-link/authorize` && response.request().method() === "POST") {
      authorizeResponse = { status: response.status(), body: await response.text().catch(() => "") };
    }
  });
  await page.getByRole("button", { name: "تأیید و اتصال سابقه" }).click();
  try {
    await page.waitForURL((url) => url.origin === chatOrigin && url.pathname === "/api/integrations/support/guest-link/callback", { timeout: 20_000 });
  } catch (error) {
    throw new Error(`Web guest-link confirmation did not reach Chat: ${page.url()} response=${JSON.stringify(authorizeResponse)} body=${String(await page.locator("body").innerText()).slice(-800)}`, { cause: error });
  }
  const callbackUrl = page.url();
  const callback = JSON.parse(await page.locator("body").innerText());
  assert(callback.version === 1 && callback.linked === true && callback.convertedCount >= 1,
    `Chat did not consume the one-time guest-link proof: ${JSON.stringify(callback)}`);
  assert(!(await context.cookies(callbackUrl)).some((cookie) => cookie.name === "owj_chat_guest_link_tx"), "Guest-link transaction cookie survived callback");

  await page.goto(callbackUrl, { waitUntil: "domcontentloaded" });
  const replay = JSON.parse(await page.locator("body").innerText());
  assert(replay.error?.code === "GUEST_LINK_TRANSACTION_INVALID", "Guest-link callback replay did not fail closed");
  assert((await request(page, "/api/me")).status === 200, "Rejected replay weakened the native Chat session boundary");

  const evidence = mongoEvidence(conversationId);
  assert(evidence.registered && evidence.webSubjectMatches && evidence.nativeChatIdentity, "Mongo conversion identity binding is incomplete");
  assert(evidence.guestActorPreserved && evidence.proofRecorded && evidence.linkMatches, "Mongo guest history/proof evidence is incomplete");
  assert(evidence.activeGuestSessions === 0, "Converted guest support sessions remained active");
  console.log(JSON.stringify({
    browser: "Chrome",
    classification: "chat-owned-guest-link-browser-integrated",
    passed: [
      "Chat start", "host-only HttpOnly transaction", "Web confirmation", "PKCE/state exchange",
      "subject/native/guest binding", "one-time proof", "callback replay rejection",
      "guest-session revocation", "native-session preservation", "JavaScript proof isolation",
    ],
    conversationId,
    evidence,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
