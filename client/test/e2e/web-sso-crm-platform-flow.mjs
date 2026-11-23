import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const MARKER = "owj-sprint4-synthetic-only-v1";
const PORT = "28088";
const ADMIN_ID = "64b000000000000000000001";
const CUSTOMER_ID = "64b000000000000000000002";
const CONSULTANT_ID = "64b000000000000000000003";
const CALL_HARNESS_ID = randomUUID();

if (
  process.env.OWJ_SYNTHETIC_DATA_MARKER !== MARKER ||
  process.env.OWJ_INTEGRATION_PORT !== PORT ||
  process.env.OWJ_CHAT_DB_NAME !== "owj_chat_e2e" ||
  process.env.OWJ_WEB_DB_NAME !== "owj_web_e2e"
) throw new Error("Refusing to run outside the isolated Sprint 5 synthetic project");

const jwtSecret = process.env.OWJ_WEB_JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error("Synthetic Web JWT secret is unavailable");

const proxyOrigin = process.env.OWJ_E2E_BASE_URL || "http://localhost:28088";
const webOrigin = `http://owj.localhost:${PORT}`;
const chatOrigin = `http://chat.owj.localhost:${PORT}`;
const browserPath = process.env.OWJ_E2E_BROWSER || "/usr/bin/google-chrome";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function webToken(subject, role) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    id: subject, role, name: `Sprint 5 ${role}`, iat: now, exp: now + 600,
  })}`;
  return `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function restartSyntheticChat() {
  const webRoot = process.env.OWJ_WEB_REPO_ROOT || process.cwd();
  const result = spawnSync("docker", [
    "compose", "--project-name", "owj-sprint4-synthetic",
    "--env-file", "integration/.env.synthetic",
    "-f", "integration/compose.yaml",
    "-f", "integration/synthetic.compose.yaml",
    "-f", "/tmp/owj-sprint5-chat.override.yaml",
    "restart", "chat",
  ], { cwd: webRoot, encoding: "utf8", timeout: 60_000 });
  if (result.status !== 0) throw new Error(`isolated Chat restart failed: ${String(result.stderr || result.stdout).slice(0, 300)}`);
}

async function waitForSession(page, expectedId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const me = await browserRequest(page, "/api/me").catch(() => ({ status: 0 }));
    if (me.status === 200 && me.body.id === expectedId) return;
    await page.waitForTimeout(500);
  }
  throw new Error("federated Chat session did not survive the isolated Chat restart");
}

async function browserRequest(page, path, { method = "GET", headers = {}, body } = {}) {
  return page.evaluate(async ({ path, method, headers, body }) => {
    const response = await fetch(path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
      correlationId: response.headers.get("x-correlation-id"),
    };
  }, { path, method, headers, body });
}

async function signIn(context, subject, role) {
  const page = await context.newPage();
  await page.goto(webOrigin, { waitUntil: "domcontentloaded" });
  await page.evaluate((token) => localStorage.setItem("token", token), webToken(subject, role));
  await page.goto(`${chatOrigin}/login`, { waitUntil: "domcontentloaded" });

  let transactionCookie = null;
  await page.route(`${webOrigin}/api/v1/chat/authorize`, async (route) => {
    transactionCookie = (await context.cookies(`${chatOrigin}/api/auth/web/start`))
      .find((cookie) => cookie.name === "owj_chat_auth_tx") || null;
    await route.continue();
  });
  await page.getByRole("button", { name: /Owj|اوج/i }).click();
  await page.waitForURL(`${chatOrigin}/chat`, { timeout: 20_000 });
  const me = await browserRequest(page, "/api/me");
  assert(me.status === 200 && me.body.authKind === "web_federated", `${role} SSO did not create a federated Chat session`);
  assert(transactionCookie?.httpOnly === true, "Chat authorization transaction cookie was not HttpOnly");
  assert(transactionCookie?.path === "/api/auth/web", "Chat authorization transaction cookie path changed");
  assert(!transactionCookie?.domain?.startsWith("."), "Chat authorization transaction cookie became cross-host");
  const transactionAfterCallback = (await context.cookies(`${chatOrigin}/api/auth/web/callback`))
    .find((cookie) => cookie.name === "owj_chat_auth_tx");
  assert(!transactionAfterCallback, "Chat authorization transaction cookie survived the successful callback");
  return { page, context, me: me.body };
}

async function installCallHarness(page, label, sendsInitialOffer = false) {
  await page.evaluate(async ({ label, sendsInitialOffer }) => {
    const events = [];
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (String(payload.type || "").startsWith("call:")) events.push(payload);
      } catch { /* ignore non-JSON realtime frames */ }
    });
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("call websocket failed")), { once: true });
    });

    const pc = new RTCPeerConnection({ iceServers: [] });
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const painter = canvas.getContext("2d");
    painter.fillStyle = label === "admin" ? "#66308d" : "#0f766e";
    painter.fillRect(0, 0, 32, 32);
    const videoTrack = canvas.captureStream(5).getVideoTracks()[0];
    videoTrack.enabled = false;
    const stream = new MediaStream([destination.stream.getAudioTracks()[0], videoTrack]);
    const remoteStream = new MediaStream();
    if (sendsInitialOffer) {
      stream.getTracks().forEach((track) => pc.addTransceiver(track, {
        direction: "sendrecv",
        streams: [stream],
      }));
    }
    pc.addEventListener("track", (event) => {
      const tracks = [event.track, ...event.streams.flatMap((remote) => remote.getTracks())];
      tracks.filter(Boolean).forEach((track) => {
        if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) remoteStream.addTrack(track);
      });
    });
    window.s5Call = { ws, events, pc, stream, remoteStream, audioContext, oscillator };
  }, { label, sendsInitialOffer });
}

async function sendCallSignal(page, signalType, chatId, data = {}) {
  await page.evaluate(({ signalType, chatId, data }) => {
    window.s5Call.ws.send(JSON.stringify({ action: "call_signal", signalType, chatId, data }));
  }, { signalType, chatId, data });
}

async function takeCallEvent(page, type, chatId, harnessId = null) {
  await page.waitForFunction(({ type, chatId, harnessId }) => window.s5Call?.events?.some((event) =>
    event.type === type && event.chatId === chatId && (!harnessId || event.harnessId === harnessId)),
  { type, chatId, harnessId }, { timeout: 15_000 });
  return page.evaluate(({ type, chatId, harnessId }) => {
    const index = window.s5Call.events.findIndex((event) =>
      event.type === type && event.chatId === chatId && (!harnessId || event.harnessId === harnessId));
    return window.s5Call.events.splice(index, 1)[0];
  }, { type, chatId, harnessId });
}

async function completeIce(page) {
  await page.waitForFunction(() => window.s5Call.pc.iceGatheringState === "complete", null, { timeout: 10_000 });
  return page.evaluate(() => window.s5Call.pc.localDescription.toJSON());
}

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
});
const contexts = [];

try {
  const adminContext = await browser.newContext({ baseURL: proxyOrigin });
  const consultantContext = await browser.newContext({ baseURL: proxyOrigin });
  const customerContext = await browser.newContext({ baseURL: proxyOrigin });
  contexts.push(adminContext, consultantContext, customerContext);

  const admin = await signIn(adminContext, ADMIN_ID, "admin");
  const consultant = await signIn(consultantContext, CONSULTANT_ID, "consultant");
  const customer = await signIn(customerContext, CUSTOMER_ID, "user");
  assert(admin.me.webScopes.includes("chat:access"), "admin session lacks chat:access");
  assert(consultant.me.webScopes.includes("chat:call"), "consultant session lacks chat:call");

  const dm = await browserRequest(admin.page, "/api/chats/dm", {
    method: "POST",
    body: { from: admin.me.username, to: consultant.me.username },
  });
  assert(dm.status === 200 && dm.body.id, `direct conversation creation returned ${dm.status}`);

  const messageMarker = `Sprint 5 synthetic ${randomUUID()}`;
  const sent = await browserRequest(admin.page, "/api/messages", {
    method: "POST",
    body: {
      chatId: dm.body.id,
      username: admin.me.username,
      body: messageMarker,
      clientRequestId: `s5-${randomUUID()}`,
    },
  });
  assert(sent.status === 200 && sent.body.id, `native message send returned ${sent.status}`);

  const consultantChats = await browserRequest(
    consultant.page,
    `/api/chats?username=${encodeURIComponent(consultant.me.username)}`,
  );
  assert(consultantChats.status === 200 && consultantChats.body.chats.some((chat) => chat.id === dm.body.id), "peer could not load the authorized conversation");
  const customerChats = await browserRequest(
    customer.page,
    `/api/chats?username=${encodeURIComponent(customer.me.username)}`,
  );
  assert(customerChats.status === 200 && !customerChats.body.chats.some((chat) => chat.id === dm.body.id), "unrelated Web user could see the private conversation");

  // Keep the real federated browser sessions/cookies, but close the pages that
  // mounted ChatPage's call hook before opening isolated harness tabs. A plain
  // navigation can leave its WebSocket alive long enough to answer the same
  // relayed offer, making the caller select that stale recv-only answer.
  await Promise.all([admin, consultant, customer].map(async (actor) => {
    await actor.page.close();
    actor.page = await actor.context.newPage();
    const page = actor.page;
    await page.route(`${chatOrigin}/s5-call-harness`, (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main>Sprint 5 isolated call harness</main>",
    }));
    await page.goto(`${chatOrigin}/s5-call-harness`, { waitUntil: "domcontentloaded" });
  }));
  await installCallHarness(admin.page, "admin", true);
  await installCallHarness(consultant.page, "consultant");
  await installCallHarness(customer.page, "customer");
  await sendCallSignal(customer.page, "start", dm.body.id, { type: "voice" });
  const unauthorizedCall = await takeCallEvent(customer.page, "call:error", dm.body.id);
  assert(/member/i.test(unauthorizedCall.error), "non-member call attempt was not denied");

  await sendCallSignal(admin.page, "start", dm.body.id, { type: "voice" });
  const incomingCall = await takeCallEvent(consultant.page, "call:incoming", dm.body.id);
  assert(incomingCall.callType === "voice", "peer did not receive the voice invitation");
  await sendCallSignal(consultant.page, "accept", dm.body.id);
  await takeCallEvent(admin.page, "call:accepted", dm.body.id);

  const offer = await admin.page.evaluate(async () => {
    const value = await window.s5Call.pc.createOffer();
    await window.s5Call.pc.setLocalDescription(value);
    return value.type;
  });
  assert(offer === "offer", "caller could not create an SDP offer");
  await sendCallSignal(admin.page, "offer", dm.body.id, {
    sdp: await completeIce(admin.page),
    harnessId: CALL_HARNESS_ID,
  });
  const relayedOffer = await takeCallEvent(consultant.page, "call:offer", dm.body.id, CALL_HARNESS_ID);
  await consultant.page.evaluate(async (sdp) => {
    await window.s5Call.pc.setRemoteDescription(sdp);
    for (const transceiver of window.s5Call.pc.getTransceivers()) {
      const localTrack = window.s5Call.stream.getTracks()
        .find((track) => track.kind === transceiver.receiver.track.kind);
      if (!localTrack) throw new Error(`missing synthetic ${transceiver.receiver.track.kind} track`);
      await transceiver.sender.replaceTrack(localTrack);
      transceiver.sender.setStreams(window.s5Call.stream);
      transceiver.direction = "sendrecv";
    }
    const answer = await window.s5Call.pc.createAnswer();
    await window.s5Call.pc.setLocalDescription(answer);
  }, relayedOffer.sdp);
  await sendCallSignal(consultant.page, "answer", dm.body.id, {
    sdp: await completeIce(consultant.page),
    harnessId: CALL_HARNESS_ID,
  });
  const relayedAnswer = await takeCallEvent(admin.page, "call:answer", dm.body.id, CALL_HARNESS_ID);
  await admin.page.evaluate((sdp) => window.s5Call.pc.setRemoteDescription(sdp), relayedAnswer.sdp);
  try {
    await Promise.all([admin.page, consultant.page].map((page) => page.waitForFunction(() =>
      ["connected", "completed"].includes(window.s5Call.pc.iceConnectionState)
        && window.s5Call.remoteStream.getAudioTracks().length === 1
        && window.s5Call.remoteStream.getVideoTracks().length === 1,
    null, { timeout: 30_000 })));
  } catch (error) {
    const states = await Promise.all([admin.page, consultant.page].map((page) => page.evaluate(() => ({
      connection: window.s5Call.pc.connectionState,
      ice: window.s5Call.pc.iceConnectionState,
      signaling: window.s5Call.pc.signalingState,
      remoteAudio: window.s5Call.remoteStream.getAudioTracks().length,
      remoteVideo: window.s5Call.remoteStream.getVideoTracks().length,
      transceivers: window.s5Call.pc.getTransceivers().map((item) => ({
        mid: item.mid,
        direction: item.direction,
        currentDirection: item.currentDirection,
        sender: item.sender.track?.kind || null,
        receiver: item.receiver.track ? {
          kind: item.receiver.track.kind,
          readyState: item.receiver.track.readyState,
          muted: item.receiver.track.muted,
        } : null,
      })),
      remoteDirections: String(window.s5Call.pc.remoteDescription?.sdp || "")
        .split("\n").filter((line) => /^m=|^a=(sendrecv|sendonly|recvonly|inactive)/.test(line.trim())),
    }))));
    throw new Error(`loopback media connection timed out: ${JSON.stringify(states)}`, { cause: error });
  }

  const toggles = await admin.page.evaluate(() => {
    const audio = window.s5Call.stream.getAudioTracks()[0];
    const video = window.s5Call.stream.getVideoTracks()[0];
    audio.enabled = false;
    const muted = !audio.enabled;
    audio.enabled = true;
    video.enabled = true;
    return { muted, unmuted: audio.enabled, videoEnabled: video.enabled };
  });
  assert(toggles.muted && toggles.unmuted && toggles.videoEnabled, "synthetic media toggles failed");
  await sendCallSignal(admin.page, "camera-state", dm.body.id, { cameraOff: false });
  const cameraOn = await takeCallEvent(consultant.page, "call:camera-state", dm.body.id);
  assert(cameraOn.cameraOff === false, "camera-on state was not relayed");
  await admin.page.evaluate(() => { window.s5Call.stream.getVideoTracks()[0].enabled = false; });
  await sendCallSignal(admin.page, "camera-state", dm.body.id, { cameraOff: true });
  const cameraOff = await takeCallEvent(consultant.page, "call:camera-state", dm.body.id);
  assert(cameraOff.cameraOff === true, "camera-off state was not relayed");
  await sendCallSignal(admin.page, "end", dm.body.id);
  await takeCallEvent(consultant.page, "call:ended", dm.body.id);
  const incomingAfterEnd = await browserRequest(consultant.page, "/api/calls/incoming");
  assert(incomingAfterEnd.status === 200 && incomingAfterEnd.body.call === null, "ended call retained server state");
  await Promise.all([admin.page, consultant.page].map((page) => page.evaluate(async () => {
    window.s5Call.pc.close();
    window.s5Call.ws.close();
    window.s5Call.stream.getTracks().forEach((track) => track.stop());
    window.s5Call.oscillator.stop();
    await window.s5Call.audioContext.close();
  })));

  const secondTab = await adminContext.newPage();
  await secondTab.goto(`${chatOrigin}/chat`, { waitUntil: "domcontentloaded" });
  const secondTabMe = await browserRequest(secondTab, "/api/me");
  assert(secondTabMe.status === 200 && secondTabMe.body.id === admin.me.id, "second tab did not retain the opaque Chat session");

  const crmKey = `chat:s5:${randomUUID()}`;
  const crmBody = {
    conversationId: dm.body.id,
    task: {
      type: "call",
      title: "Synthetic Sprint 5 Chat follow-up",
      priority: "normal",
      assignedUserId: CONSULTANT_ID,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      instructions: "Synthetic local acceptance only",
      steps: [{ title: "Call", required: true }],
    },
  };
  assert(!JSON.stringify(crmBody).match(/message|transcript|phone|customer/i), "CRM command contains forbidden conversation/contact data");
  const crmHeaders = { "idempotency-key": crmKey, "x-correlation-id": `s5-${randomUUID()}` };
  const created = await browserRequest(admin.page, "/api/integrations/crm/tasks", { method: "POST", headers: crmHeaders, body: crmBody });
  assert(
    created.status === 201 && created.body.task?.id,
    `Chat-to-Web CRM create returned ${created.status} ${String(created.body?.error?.code || created.body?.error || "UNKNOWN")}`,
  );
  restartSyntheticChat();
  await Promise.all([
    waitForSession(admin.page, admin.me.id),
    waitForSession(secondTab, admin.me.id),
    waitForSession(consultant.page, consultant.me.id),
  ]);
  const durableMessages = await browserRequest(
    admin.page,
    `/api/messages?chatId=${encodeURIComponent(dm.body.id)}&username=${encodeURIComponent(admin.me.username)}&limit=100`,
  );
  assert(
    durableMessages.status === 200 && durableMessages.body.messages.some((message) => message.body === messageMarker),
    "message was not durable across the isolated Chat restart",
  );
  const repeated = await browserRequest(admin.page, "/api/integrations/crm/tasks", { method: "POST", headers: crmHeaders, body: crmBody });
  assert(repeated.status === 200 && repeated.body.deduped === true, "Chat-to-Web CRM retry was not deduplicated");
  assert(repeated.body.task.id === created.body.task.id, "CRM retry returned a different canonical task");
  const conflict = await browserRequest(admin.page, "/api/integrations/crm/tasks", {
    method: "POST", headers: crmHeaders, body: { ...crmBody, task: { ...crmBody.task, title: "Changed request" } },
  });
  assert(conflict.status === 409, `changed CRM retry returned ${conflict.status}`);

  const logout = await browserRequest(admin.page, "/api/logout", { method: "POST" });
  assert(logout.status === 200, "logout failed");
  assert((await browserRequest(admin.page, "/api/me")).status === 401, "logged-out tab retained access");
  assert((await browserRequest(secondTab, "/api/me")).status === 401, "second tab retained a revoked Chat session");

  console.log(JSON.stringify({
    status: "passed",
    sso: "actual-web-browser-integrated",
    message: "actual-chat-api",
    crm: "actual-web-integrated",
    call: "actual-federated-session-websocket-loopback-media",
    taskId: created.body.task.id,
  }));
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
}
