import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageComposer } from "../../../src/components/chat/messages/MessageComposer.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

const releases = [];
afterEach(() => { releases.splice(0).forEach((release) => release()); vi.restoreAllMocks(); setLocale("en"); });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function mediaStream(video = false) {
  const audio = new AudioContext();
  const output = audio.createMediaStreamDestination(), oscillator = audio.createOscillator();
  oscillator.connect(output); oscillator.start(); void audio.resume();
  const resume = () => { void audio.resume(); };
  document.addEventListener("pointerdown", resume);
  const stream = output.stream;
  let interval;
  if (video) {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
    const draw = () => { const ctx = canvas.getContext("2d"); ctx.fillStyle = "#66308d"; ctx.fillRect(0, 0, 640, 480); };
    draw(); interval = setInterval(draw, 35);
    canvas.captureStream(24).getVideoTracks().forEach((track) => stream.addTrack(track));
  }
  releases.push(() => { document.removeEventListener("pointerdown", resume); clearInterval(interval); stream.getTracks().forEach((track) => track.stop()); oscillator.stop(); void audio.close(); });
  return stream;
}
function props(extra = {}) { return { activeChatId: "gesture-chat-a", isDesktop: true, fileUploadEnabled: true, pendingUploadFiles: [], setShowUploadMenu: vi.fn(), onVoiceRecorded: vi.fn(), handleSend: vi.fn().mockResolvedValue(true), ...extra }; }
function down(button, pointerId = 41) { button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId, clientX: 150, clientY: 550, pointerType: "touch" })); }
function up(pointerId = 41) { window.dispatchEvent(new PointerEvent("pointerup", { pointerId, clientY: 550, pointerType: "touch" })); }
function lock(pointerId = 41) { window.dispatchEvent(new PointerEvent("pointermove", { pointerId, clientY: 450, pointerType: "touch" })); }

describe("one-button voice and video capture", () => {
  test("short taps alternate modes without requesting devices", async () => {
    const gum = vi.spyOn(navigator.mediaDevices, "getUserMedia");
    await render(<MessageComposer {...props()} />);
    await expect.element(page.getByRole("button", { name: "Record video message", exact: true })).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Record voice message", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Record video message", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Record video message", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Record voice message", exact: true })).toBeVisible();
    expect(gum).not.toHaveBeenCalled();
  });
  test("holds to record audio and releases to send one real file", async () => {
    const stream = mediaStream(); vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const p = props(); await render(<MessageComposer {...p} />);
    down(page.getByRole("button", { name: "Record voice message", exact: true }).element());
    await expect.element(page.getByText("Release to send; swipe up to lock", { exact: true })).toBeVisible();
    await expect.poll(() => stream.getAudioTracks()[0].readyState).toBe("live");
    await wait(1000); up();
    await expect.poll(() => p.handleSend.mock.calls.length).toBe(1);
    expect(p.handleSend.mock.calls[0][1]).toMatchObject({ kind: "voice", file: expect.any(File) });
    expect(p.handleSend.mock.calls[0][1].file.size).toBeGreaterThan(0);
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
    expect(p.onVoiceRecorded).not.toHaveBeenCalled();
  });
  test("dragging up locks voice capture until explicit Send", async () => {
    const stream = mediaStream(); vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const p = props(); await render(<MessageComposer {...p} />);
    down(page.getByRole("button", { name: "Record voice message", exact: true }).element());
    await expect.element(page.getByRole("button", { name: "Lock recording", exact: true })).toBeVisible();
    lock(); up();
    await expect.element(page.getByText("Recording locked", { exact: true })).toBeVisible();
    page.getByRole("button", { name: "Send voice message", exact: true }).element().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await expect.element(page.getByText("Recording locked", { exact: true })).toBeVisible();
    await wait(450); expect(p.handleSend).not.toHaveBeenCalled();
    expect(stream.getAudioTracks()[0].readyState).toBe("live");
    await page.getByRole("button", { name: "Send voice message", exact: true }).click();
    await expect.poll(() => p.handleSend.mock.calls.length).toBe(1);
  });
  test("pointer cancellation discards capture instead of sending", async () => {
    const stream = mediaStream(); vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const p = props(); await render(<MessageComposer {...p} />);
    down(page.getByRole("button", { name: "Record voice message", exact: true }).element());
    await expect.element(page.getByRole("button", { name: "Lock recording", exact: true })).toBeVisible();
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 41 }));
    await wait(350); expect(p.handleSend).not.toHaveBeenCalled();
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
  });
  test("a permission request released before completion cannot publish later", async () => {
    let grant; vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const p = props(); await render(<MessageComposer {...p} />);
    down(page.getByRole("button", { name: "Record voice message", exact: true }).element());
    await expect.poll(() => Boolean(grant)).toBe(true); up();
    const stream = mediaStream(); grant(stream);
    await expect.poll(() => stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
    expect(p.handleSend).not.toHaveBeenCalled();
  });
  test("switching conversation cancels a locked voice without sending it to the new chat", async () => {
    const stream = mediaStream(); vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const p = props(), view = await render(<MessageComposer {...p} />);
    down(page.getByRole("button", { name: "Record voice message", exact: true }).element());
    await expect.element(page.getByRole("button", { name: "Lock recording", exact: true })).toBeVisible(); lock(); up();
    await view.rerender(<MessageComposer {...p} activeChatId="gesture-chat-b" />);
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
    expect(p.handleSend).not.toHaveBeenCalled();
  });
  test("retains voice bytes for retry if the durable queue rejects automatic sending", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(mediaStream());
    const p = props({ handleSend: vi.fn().mockResolvedValue(false) }); await render(<MessageComposer {...p} />);
    down(page.getByRole("button", { name: "Record voice message", exact: true }).element());
    await expect.element(page.getByText("Release to send; swipe up to lock", { exact: true })).toBeVisible(); await wait(450); up();
    await expect.poll(() => p.onVoiceRecorded.mock.calls.length).toBe(1);
    await expect.element(page.getByRole("alert")).toHaveTextContent("The voice message could not be queued. Please try sending again.");
  });
  test("video hold starts the centered camera and release queues one circular video", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(mediaStream(true));
    const p = props(); await render(<MessageComposer {...p} />);
    await page.getByRole("button", { name: "Record voice message", exact: true }).click();
    down(page.getByRole("button", { name: "Record video message", exact: true }).element());
    await expect.element(page.getByRole("button", { name: "Review video", exact: true })).toBeVisible();
    await wait(450); up();
    await expect.poll(() => p.handleSend.mock.calls.length).toBe(1);
    expect(p.handleSend.mock.calls[0][1]).toMatchObject({ kind: "video_note", width: 480, height: 480 });
    await expect.element(page.getByRole("dialog", { name: "Record video message" })).not.toBeInTheDocument();
  });
  test("Persian recording labels follow the active locale", async () => {
    setLocale("fa"); await render(<MessageComposer {...props()} />);
    await page.getByRole("button", { name: t("Record voice message"), exact: true }).click();
    await expect.element(page.getByRole("button", { name: t("Record video message"), exact: true })).toBeVisible();
  });
  test("locks video with a drag and keeps recording after release", async () => {
    const stream = mediaStream(true); vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const p = props(); await render(<MessageComposer {...p} />);
    await page.getByRole("button", { name: "Record voice message", exact: true }).click();
    down(page.getByRole("button", { name: "Record video message", exact: true }).element());
    await expect.element(page.getByRole("button", { name: "Review video", exact: true })).toBeVisible();
    lock(); up();
    await expect.element(page.getByText("Recording locked", { exact: true })).toBeVisible(); await wait(450);
    expect(p.handleSend).not.toHaveBeenCalled(); expect(stream.getVideoTracks()[0].readyState).toBe("live");
    await page.getByRole("dialog", { name: "Record video message" }).getByRole("button", { name: "Send video message", exact: true }).click();
    await expect.poll(() => p.handleSend.mock.calls.length).toBe(1);
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
  });
  test("keyboard hold and Arrow Up lock provide a non-drag recording path", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(mediaStream());
    const p = props(); await render(<MessageComposer {...p} />);
    const button = page.getByRole("button", { name: "Record voice message", exact: true }).element();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    await expect.element(page.getByRole("button", { name: "Lock recording", exact: true })).toBeVisible();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    button.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }));
    await expect.element(page.getByText("Recording locked", { exact: true })).toBeVisible();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect.element(page.getByText("Recording locked", { exact: true })).not.toBeInTheDocument();
    expect(p.handleSend).not.toHaveBeenCalled();
  });
  test("a denied microphone request shows recovery text without sending", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const p = props(); await render(<MessageComposer {...p} />);
    down(page.getByRole("button", { name: "Record voice message", exact: true }).element());
    await expect.element(page.getByRole("alert")).toHaveTextContent("Allow microphone access in your browser settings, then try again.");
    up(); expect(p.handleSend).not.toHaveBeenCalled();
  });
  test("a released video gesture can recover from camera denial using Record again", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError")).mockImplementation(() => Promise.resolve(mediaStream(true)));
    const p = props(); await render(<MessageComposer {...p} />);
    await page.getByRole("button", { name: "Record voice message", exact: true }).click();
    down(page.getByRole("button", { name: "Record video message", exact: true }).element());
    await expect.element(page.getByRole("alert")).toBeVisible(); up();
    await page.getByRole("button", { name: "Record again", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Start recording", exact: true })).toBeVisible();
    expect(p.handleSend).not.toHaveBeenCalled();
  });
  test("keyboard video capture can lock and release after focus moves into the camera dialog", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(mediaStream(true));
    const p = props(); await render(<MessageComposer {...p} />);
    await page.getByRole("button", { name: "Record voice message", exact: true }).click();
    page.getByRole("button", { name: "Record video message", exact: true }).element().dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    await expect.element(page.getByRole("button", { name: "Review video", exact: true })).toBeVisible();
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    document.activeElement.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }));
    await expect.element(page.getByText("Recording locked", { exact: true })).toBeVisible();
    expect(p.handleSend).not.toHaveBeenCalled();
  });
});
