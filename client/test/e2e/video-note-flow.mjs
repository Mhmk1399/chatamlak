import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.SONGBIRD_E2E_BASE_URL;
if (!baseURL || !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) throw new Error("Use an isolated local server with SONGBIRD_E2E_BASE_URL.");
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const context = await browser.newContext({ baseURL, permissions: ["camera", "microphone"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => { if (!localStorage.getItem("songbird-locale")) localStorage.setItem("songbird-locale", "en"); });
const failures = [];
const uploads = [];
const suffix = Date.now().toString(36);
const username = `vn${suffix}`;
async function api(method, url, data) {
  const response = await context.request.fetch(url, { method, data });
  const value = await response.json();
  assert(response.ok(), `${method} ${url}: ${response.status()}`);
  return value;
}
async function eventually(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(label);
}
try {
  await api("POST", "/api/register", { username, nickname: "Video QA", password: "test-video-note-2026" });
  const chat = await api("POST", "/api/chats/group", { creator: username, nickname: "Video notes QA", username: `vg${suffix}`, visibility: "private", members: [] });
  const page = await context.newPage();
  const touch = await context.newCDPSession(page);
  async function hold(name) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    assert(box, `Recording button missing: ${name}`);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    return point;
  }
  async function lockAndRelease(point) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, y: point.y - 100 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async function release() { await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => { if (response.url().includes("/api/messages/upload")) uploads.push(response.status()); });
  await page.addInitScript((id) => sessionStorage.setItem("songbird-open-chat-id", id), chat.id);
  await page.goto("/chat");
  await page.getByRole("button", { name: "Close what's new" }).waitFor({ timeout: 5000 }).then(() => page.getByRole("button", { name: "Close what's new" }).click()).catch(() => {});
  await page.getByRole("button", { name: "Record voice message", exact: true }).tap();
  const firstHold = await hold("Record video message");
  await page.getByRole("button", { name: "Review video", exact: true }).waitFor();
  const circle = await page.getByTestId("video-note-camera").boundingBox();
  assert(Math.abs(circle.x + circle.width / 2 - 195) < 2, "camera should be horizontally centered on the phone");
  assert(Math.abs(circle.y + circle.height / 2 - 422) < 2, "camera should be vertically centered on the phone");
  await page.screenshot({ path: path.join(os.tmpdir(), "ouj-video-note-record-mobile.png") });
  await lockAndRelease(firstHold);
  await page.getByText("Recording locked", { exact: true }).waitFor();
  assert.equal((await api("GET", `/api/messages?chatId=${chat.id}&username=${username}`)).messages.length, 0, "locking and releasing must not publish");
  await eventually(() => page.getByRole("button", { name: "Review video", exact: true }).isEnabled(), "minimum recording duration");
  await page.getByRole("button", { name: "Pause recording", exact: true }).click();
  await page.getByRole("button", { name: "Resume recording", exact: true }).click();
  await page.getByRole("button", { name: "Review video", exact: true }).click();
  const preview = page.getByLabel("Video message preview", { exact: true });
  await preview.waitFor();
  await eventually(() => preview.evaluate((video) => video.readyState >= 2 && video.videoWidth === 480 && video.videoHeight === 480), "recorded square video must decode");
  // Sending offline must commit to IndexedDB, survive reload and deliver once.
  await context.setOffline(true);
  await page.getByRole("dialog", { name: "Record video message" }).getByRole("button", { name: "Send video message", exact: true }).click();
  await page.getByRole("dialog", { name: "Record video message" }).waitFor({ state: "hidden" });
  await context.setOffline(false);
  await page.reload();
  await eventually(async () => {
    const data = await api("GET", `/api/messages?chatId=${chat.id}&username=${username}`);
    return data.messages.filter((message) => message.files?.some((file) => file.kind === "video_note")).length === 1;
  }, "video note should survive offline send and reload", 30000);
  const round = page.getByTestId("video-note-message").last();
  await round.waitFor();
  await round.getByRole("button", { name: "Play video message", exact: true }).click();
  await eventually(() => round.locator("video").evaluate((video) => !video.paused && video.currentTime > 0 && video.videoWidth === 480), "inline playback must run");
  await round.getByRole("button", { name: "Mute video message", exact: true }).click();
  await eventually(() => round.locator("video").evaluate((video) => video.muted), "mute should update the video element");
  await round.getByRole("slider").evaluate((input) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "0.5");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await eventually(() => round.locator("video").evaluate((video) => video.currentTime >= 0.45), "seek should update actual video");
  await page.screenshot({ path: path.join(os.tmpdir(), "ouj-video-note-chat-mobile.png") });
  await page.getByRole("button", { name: "Record voice message", exact: true }).tap();
  const cancelHold = await hold("Record video message");
  await page.getByRole("button", { name: "Review video", exact: true }).waitFor();
  await lockAndRelease(cancelHold);
  await page.getByRole("button", { name: "Cancel video message", exact: true }).click();
  const messages = await api("GET", `/api/messages?chatId=${chat.id}&username=${username}`);
  assert.equal(messages.messages.filter((message) => message.files?.some((file) => file.kind === "video_note")).length, 1);
  // A real touch release must automatically persist both media kinds once.
  await hold("Record video message");
  await page.getByRole("button", { name: "Review video", exact: true }).waitFor();
  await page.waitForTimeout(1200); await release();
  await eventually(async () => (await api("GET", `/api/messages?chatId=${chat.id}&username=${username}`)).messages.filter((message) => message.files?.some((file) => file.kind === "video_note")).length === 2, "touch release should send one video note");
  await page.getByRole("button", { name: "Record video message", exact: true }).tap();
  await hold("Record voice message");
  await page.getByText("Release to send; swipe up to lock", { exact: true }).waitFor();
  await page.waitForTimeout(800);
  await context.setOffline(true); await release();
  await eventually(() => page.getByRole("button", { name: "Cancel recording", exact: true }).count().then((count) => count === 0), "voice should enter the durable queue");
  await context.setOffline(false); await page.reload();
  await eventually(async () => (await api("GET", `/api/messages?chatId=${chat.id}&username=${username}`)).messages.filter((message) => message.files?.some((file) => file.mimeType?.startsWith("audio/"))).length === 1, "recorded voice should survive offline queue and reload", 30000);
  await eventually(() => page.getByTestId("video-note-message").count().then((count) => count === 2), "both saved video notes should render after reload");
  for (const note of await page.getByTestId("video-note-message").all()) {
    // Probe the restored source independently of the timeline's intentional
    // pause-on-scroll behavior while queued rows are being reconciled.
    const width = await note.locator("video").evaluate(async (video) => {
      const probe = document.createElement("video"); probe.src = video.currentSrc || video.src; probe.muted = true;
      try { await probe.play(); return probe.videoWidth; }
      finally { probe.pause(); probe.removeAttribute("src"); probe.load(); }
    });
    assert.equal(width, 480, "restored video bytes must still decode");
  }
  const wav = Buffer.alloc(44 + 8000 * 4 * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < 32000; i++) wav.writeInt16LE(Math.round(1000 * Math.sin(i / 12)), 44 + i * 2);
  const voice = await context.request.post("/api/messages/upload", { multipart: { chatId: chat.id, username, uploadType: "media", fileMeta: JSON.stringify([{ durationSeconds: 4 }]), files: { name: "voice.wav", mimeType: "audio/wav", buffer: wav } } });
  assert(voice.ok());
  await page.reload();
  await page.getByRole("button", { name: "Play voice message", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Language", exact: true }).first().click();
  await eventually(() => page.evaluate(() => document.documentElement.dir === "rtl"), "Persian layout");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(os.tmpdir(), "ouj-media-mobile-fa.png") });
  const bars = await page.locator(".ouj-voice-message [aria-hidden='true'] span").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
  assert(bars.length >= 32 && bars.every((width) => width > 0), "voice waveform bars must remain visible inside a compact RTL bubble");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "حالت تاریک", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await eventually(() => page.evaluate(() => document.documentElement.classList.contains("dark")), "dark theme");
  await page.getByRole("button", { name: "پخش ویس", exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "ouj-media-mobile-dark-fa.png") });
  await page.getByRole("button", { name: "ضبط ویس", exact: true }).tap();
  const persianHold = await hold("ضبط ویدیو مسیج");
  await page.getByRole("button", { name: "بازبینی ویدیو", exact: true }).waitFor();
  await lockAndRelease(persianHold);
  await page.screenshot({ path: path.join(os.tmpdir(), "ouj-video-recorder-dark-fa.png") });
  await page.getByRole("button", { name: "لغو ویدیو مسیج", exact: true }).click();
  await page.getByRole("button", { name: "بازگشت به گفتگوها", exact: true }).click();
  for (const locale of ["fa", "en"]) {
    if (locale === "en") {
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.getByRole("button", { name: "زبان", exact: true }).first().click();
    }
    const labels = locale === "fa" ? { create: "ساختن", group: "گروه جدید", channel: "کانال جدید", cancel: "انصراف" } : { create: "Create", group: "New group", channel: "New channel", cancel: "Cancel" };
    for (const width of [390, 1366]) {
      await page.setViewportSize({ width, height: 844 });
      for (const action of [labels.group, labels.channel]) {
        await page.getByRole("button", { name: labels.create, exact: true }).click();
        const item = page.getByRole("menuitem", { name: action, exact: true });
        const rect = await item.boundingBox();
        assert(rect.x >= 0 && rect.x + rect.width <= width, "creation menu must fit the viewport");
        await item.click();
        const dialog = page.getByRole("dialog", { name: action, exact: true });
        await dialog.waitFor();
        const modal = await dialog.boundingBox();
        assert(Math.abs(modal.x + modal.width / 2 - width / 2) < 2, "creation dialog must be centered in either direction");
        assert(modal.y >= 0 && modal.y + modal.height <= 844, "creation dialog must fit the viewport vertically");
        await page.screenshot({ path: path.join(os.tmpdir(), `ouj-create-${locale}-${width}-${action === labels.group ? "group" : "channel"}.png`) });
        await dialog.getByRole("button", { name: labels.cancel, exact: true }).click();
      }
    }
  }
  assert.deepEqual(failures, []);
  console.log("Passed: real touch hold/drag/lock/release, centered mobile camera, video/audio capture, pause/resume/review, automatic release send, offline voice/video queue and reload, inline playback/mute/seek, cancellation, Persian light/dark layouts.");
} catch (error) {
  console.error("Upload responses:", uploads);
  console.error("Queue diagnostics:", await context.pages()[0]?.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("songbird-cache"); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    const rows = await new Promise((resolve, reject) => { const req = db.transaction("outbox").objectStore("outbox").getAll(); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    return { online: navigator.onLine, focus: document.hasFocus(), visibility: document.visibilityState, rows: rows.map(({ data }) => ({ delivery: data._delivery, attempts: data._attempts, nextAttempt: data._nextAttemptAt, error: data._lastError, files: data._files?.map(({ file }) => ({ bytes: file?.size, type: file?.type })) })) };
  }).catch(() => null));
  await context.pages()[0]?.screenshot({ path: path.join(os.tmpdir(), "ouj-recording-e2e-failure.png") }).catch(() => {});
  throw error;
} finally { await context.close(); await browser.close(); }
