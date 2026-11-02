import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

// Run against an isolated local server, never against a deployed account.
const baseURL = process.env.SONGBIRD_E2E_BASE_URL;
if (!baseURL || !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) {
  throw new Error("Set SONGBIRD_E2E_BASE_URL to an isolated local Songbird instance.");
}
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const contextA = await browser.newContext({ baseURL, permissions: ["microphone", "camera"] });
const contextB = await browser.newContext({ baseURL, permissions: ["microphone", "camera"] });
const failures = [];
const suffix = Date.now().toString(36);
const alice = `qa${suffix}`;
const bob = `qb${suffix}`;
async function api(context, method, url, data) {
  const response = await context.request.fetch(url, { method, data });
  const value = await response.json();
  assert(response.ok(), `${method} ${url}: ${response.status()} ${JSON.stringify(value)}`);
  return value;
}
async function eventually(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${label}: ${last?.message || "condition was not met"}`);
}
try {
  const userA = await api(contextA, "POST", "/api/register", { username: alice, nickname: "QA Alice", password: "qa-password-2026" });
  await api(contextB, "POST", "/api/register", { username: bob, nickname: "QA Bob", password: "qa-password-2026" });
  const chat = await api(contextA, "POST", "/api/chats/group", { creator: alice, nickname: "QA Messaging", username: `qg${suffix}`, visibility: "private", members: [bob] });
  const sent = await api(contextA, "POST", "/api/messages", { chatId: chat.id, username: alice, body: "سلام پیام آزمایشی", clientRequestId: `qa:${suffix}:first` });
  await api(contextB, "PUT", `/api/messaging/chats/${chat.id}/reaction`, { messageId: sent.id, emoji: "❤️", active: true });
  await api(contextA, "PUT", `/api/messaging/chats/${chat.id}/pin`, { messageId: sent.id, active: true });
  await api(contextA, "PUT", `/api/messaging/chats/${chat.id}/preference`, { pinned: true, folder: "Work" });
  const extras = await api(contextA, "GET", `/api/messaging/chats/${chat.id}`);
  assert(extras.pins.includes(sent.id));
  assert.equal(extras.reactions[0].emoji, "❤️");
  const search = await api(contextA, "GET", `/api/messaging/search?q=${encodeURIComponent("پیام")}&chatId=${chat.id}`);
  assert(search.messages.some((message) => message.id === sent.id));
  const poll = await api(contextA, "POST", `/api/messaging/chats/${chat.id}/polls`, { question: "Which option?", options: ["First", "Second"] });
  await api(contextB, "PUT", `/api/messaging/polls/${poll.id}/vote`, { option: 1 });
  const voted = await api(contextA, "GET", `/api/messaging/chats/${chat.id}`);
  assert.deepEqual(voted.polls.find((item) => item.id === poll.id).counts, [0, 1]);
  const topic = await api(contextA, "POST", `/api/messaging/chats/${chat.id}/topics`, { title: "Plans" });
  await api(contextA, "PUT", `/api/messaging/chats/${chat.id}/topic`, { messageId: sent.id, topicId: topic.topic.id });
  const devices = await api(contextA, "GET", "/api/messaging/devices");
  assert(devices.devices.some((device) => device.current && device.id.length === 64));
  assert(devices.devices.every((device) => !("token" in device)));
  const secondDevice = await browser.newContext({ baseURL });
  try {
    await api(secondDevice, "POST", "/api/login", { username: alice, password: "qa-password-2026" });
    const activeDevices = await api(contextA, "GET", "/api/messaging/devices");
    const otherDevice = activeDevices.devices.find((device) => !device.current);
    assert(otherDevice, "A second login must appear in the active device list");
    await api(contextA, "DELETE", `/api/messaging/devices/${otherDevice.id}`);
    assert.equal((await secondDevice.request.get("/api/me")).status(), 401);
    assert((await api(contextA, "GET", "/api/me")).id, "Revoking another device must preserve the current session");
  } finally { await secondDevice.close(); }
  await api(contextA, "PUT", `/api/messaging/chats/${chat.id}/policy`, { slowSeconds: 0, membersCanSend: false, membersCanUpload: false });
  const deniedPost = await contextB.request.post("/api/messages", { data: { chatId: chat.id, username: bob, body: "Must be denied" } });
  assert.equal(deniedPost.status(), 403);
  await api(contextA, "PUT", `/api/messaging/chats/${chat.id}/policy`, { slowSeconds: 0, membersCanSend: true, membersCanUpload: true });
  assert.deepEqual((await api(contextA, "GET", `/api/messaging/chats/${chat.id}/media`)).files, []);
  const schedule = await api(contextA, "POST", `/api/messaging/chats/${chat.id}/scheduled`, { body: "Scheduled QA", dueAt: new Date(Date.now() + 12000).toISOString() });
  assert(schedule.id);
  console.log("API: preferences, reactions, pins, encrypted search, polls, topics, devices, media and scheduling accepted.");

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  for (const page of [pageA, pageB]) {
    page.on("pageerror", (error) => failures.push(error.message));
    await page.addInitScript((chatId) => sessionStorage.setItem("songbird-open-chat-id", chatId), chat.id);
    await page.goto("/chat");
    await page.getByRole("button", { name: "Close what's new" }).waitFor({ timeout: 5000 }).then(() => page.getByRole("button", { name: "Close what's new" }).click()).catch(() => {});
  }
  const inputA = pageA.locator('textarea[name="message"]');
  await inputA.waitFor();
  await pageB.locator('textarea[name="message"]').waitFor();
  await pageA.getByRole("combobox", { name: "Topics", exact: true }).selectOption(topic.topic.id);
  await inputA.fill("Topic bound QA");
  await pageA.getByRole("button", { name: "Send message", exact: true }).click();
  await eventually(async () => {
    const messages = await api(contextA, "GET", `/api/messages?chatId=${chat.id}&username=${alice}&topicId=${topic.topic.id}`);
    return messages.messages.some((message) => message.body === "Topic bound QA") && !messages.messages.some((message) => message.id === poll.messageId);
  }, "posting and fetching a topic with server-side filtering");
  await pageA.getByRole("combobox", { name: "Topics", exact: true }).selectOption("");
  await inputA.fill("پیش‌نویس ماندگار");
  await pageA.reload();
  await eventually(async () => (await inputA.inputValue()) === "پیش‌نویس ماندگار", "draft restoration");
  await contextA.setOffline(true);
  await inputA.fill("Offline durable QA");
  await pageA.getByRole("button", { name: "Send message", exact: true }).click();
  await eventually(async () => (await inputA.inputValue()) === "", "durable acceptance before clearing composer");
  await pageA.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await contextA.setOffline(false);
  await pageA.goto("/chat");
  await eventually(async () => {
    const messages = await api(contextA, "GET", `/api/messages?chatId=${chat.id}&username=${alice}`);
    return messages.messages.filter((message) => message.body === "Offline durable QA").length === 1;
  }, "outbox restoration and exactly one recorded message", 25000);
  await eventually(async () => {
    const messages = await api(contextA, "GET", `/api/messages?chatId=${chat.id}&username=${alice}`);
    return messages.messages.some((message) => message.body === "Scheduled QA");
  }, "scheduled delivery", 25000);
  assert((await api(contextA, "GET", "/api/messaging/sync?after=0")).events.length > 0);
  console.log("Browser: draft restoration, offline queue/reload, deduplication and scheduled delivery passed.");

  await contextB.setOffline(true);
  await api(contextA, "POST", "/api/messages/edit", { chatId: chat.id, username: alice, messageId: sent.id, body: "Recovered old edit QA" });
  await contextB.setOffline(false);
  await pageB.evaluate(() => window.dispatchEvent(new Event("online")));
  await eventually(() => pageB.getByText("Recovered old edit QA", { exact: true }).last().isVisible(), "recovering an edit missed while offline", 25000);

  // A real PCM recording exercises the actual pooled audio player and seek path.
  const samples = 8000 * 8;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) wav.writeInt16LE(Math.round(1000 * Math.sin(index / 12)), 44 + index * 2);
  const upload = await contextA.request.post("/api/messages/upload", { multipart: { chatId: chat.id, username: alice, uploadType: "media", clientRequestId: `qa:${suffix}:voice`, files: { name: "qa-voice.wav", mimeType: "audio/wav", buffer: wav } } });
  assert(upload.ok(), await upload.text());
  await pageA.evaluate(() => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__qaPlayingAudio = this; return original.call(this); };
  });
  await pageA.getByRole("button", { name: "Play voice message", exact: true }).click();
  await eventually(() => pageA.evaluate(() => window.__qaPlayingAudio?.duration > 7), "real voice metadata");
  await pageA.getByRole("button", { name: /Playback speed:/ }).click();
  assert.equal(await pageA.evaluate(() => window.__qaPlayingAudio.playbackRate), 1.25);
  const seek = pageA.getByRole("slider", { name: "Voice message playback position", exact: true });
  await seek.evaluate((element) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, "4");
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert(await pageA.evaluate(() => Math.abs(window.__qaPlayingAudio.currentTime - 4) < 0.75));
  await pageA.getByRole("button", { name: "Pause voice message", exact: true }).click();
  console.log("Browser: topic publishing, missed edit recovery, real voice speed and seeking passed.");

  // The test uses fake browser capture devices, while negotiation is real WebRTC.
  for (const page of [pageA, pageB]) {
    await page.getByRole("button", { name: "Group call", exact: true }).click();
    await page.getByRole("button", { name: "Join call", exact: true }).click();
  }
  await eventually(async () => {
    const peers = await api(contextA, "GET", `/api/messaging/chats/${chat.id}/call`);
    return peers.peers.length === 2;
  }, "group call membership");
  await eventually(async () => pageA.locator("audio").evaluateAll((elements) => elements.some((audio) => audio.srcObject?.getAudioTracks().some((track) => track.readyState === "live"))), "group call remote audio", 25000);
  await pageA.getByRole("button", { name: "Leave call", exact: true }).click();
  await pageB.getByRole("button", { name: "Leave call", exact: true }).click();
  console.log("Browser: two participants connected real WebRTC audio and left the group call.");
  await pageA.getByRole("button", { name: "Close", exact: true }).click();
  await pageB.getByRole("button", { name: "Close", exact: true }).click();
  await api(contextA, "POST", "/api/messages/delete", { chatId: chat.id, username: alice, messageId: sent.id, scope: "self" });
  await eventually(async () => await pageA.getByRole("button", { name: /📌 Recovered old edit QA/ }).count() === 0, "immediate personal pin removal across the realtime stream", 4000);
  const hiddenExtras = await api(contextA, "GET", `/api/messaging/chats/${chat.id}`);
  assert(!hiddenExtras.pins.includes(sent.id), "A personally hidden message must also disappear from the pinned preview");
  assert((await api(contextB, "GET", `/api/messaging/chats/${chat.id}`)).pins.includes(sent.id), "A personal hide must not hide another member's pin");
  await pageA.getByRole("button", { name: "Language", exact: true }).click();
  assert.equal(await pageA.locator("html").getAttribute("dir"), "rtl");
  assert(await pageA.getByText("۲ عضو", { exact: true }).isVisible());
  assert.equal(await pageA.getByText("0:04 / 0:08", { exact: true }).evaluate((element) => getComputedStyle(element).direction), "ltr");
  await pageA.setViewportSize({ width: 390, height: 844 });
  await pageA.getByRole("button", { name: "ابزارهای گفتگو", exact: true }).click();
  await pageA.keyboard.press("Escape");
  assert.equal(await pageA.getByRole("dialog").count(), 0);
  assert(await pageA.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Persian mobile layout must fit the viewport");
  assert.deepEqual(failures, [], "No application runtime exceptions");
  const screenshot = path.join(os.tmpdir(), "songbird-messaging-desktop.png");
  await pageA.screenshot({ path: screenshot, fullPage: true });
  console.log(`Screenshot: ${screenshot}`);
  console.log(`Isolated user: ${userA.id}`);
} finally {
  await browser.close();
}
