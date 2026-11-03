import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import VideoMessageRecorder from "../../../src/components/chat/media/VideoMessageRecorder.jsx";
import { MessageComposer } from "../../../src/components/chat/messages/MessageComposer.jsx";
import "../../../src/index.css";

const resources = [];
afterEach(() => {
  resources.splice(0).forEach((release) => release());
  vi.restoreAllMocks();
});

function cameraStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 480;
  const context = canvas.getContext("2d");
  const draw = () => { context.fillStyle = "#66308d"; context.fillRect(0, 0, 640, 480); };
  draw();
  const stream = canvas.captureStream(24);
  const interval = setInterval(draw, 40);
  const audio = new AudioContext();
  const destination = audio.createMediaStreamDestination();
  const oscillator = audio.createOscillator();
  oscillator.connect(destination); oscillator.start();
  const resume = () => { void audio.resume(); };
  document.addEventListener("pointerdown", resume, { once: true });
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  resources.push(() => { document.removeEventListener("pointerdown", resume); clearInterval(interval); oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); void audio.close(); });
  return stream;
}

describe("video message recording", () => {
  test("closes the camera when switching the active conversation", async () => {
    const stream = cameraStream();
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const props = { fileUploadEnabled: true, pendingUploadFiles: [], setShowUploadMenu: vi.fn(), handleSend: vi.fn(), isDesktop: false };
    const view = await render(<MessageComposer {...props} activeChatId="chat-a" />);
    await page.getByRole("button", { name: "Record voice message", exact: true }).click();
    page.getByRole("button", { name: "Record video message", exact: true }).element().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 53, clientY: 500 }));
    await expect.element(page.getByRole("button", { name: "Review video", exact: true })).toBeVisible();
    await view.rerender(<MessageComposer {...props} activeChatId="chat-b" />);
    await expect.element(page.getByRole("dialog", { name: "Record video message" })).not.toBeInTheDocument();
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
    await view.rerender(<MessageComposer {...props} activeChatId="chat-a" />);
    await expect.element(page.getByRole("dialog", { name: "Record video message" })).not.toBeInTheDocument();
  });
  test("records a real square video with audio, pauses, reviews and sends once", async () => {
    const stream = cameraStream();
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    let accept;
    const onSend = vi.fn(() => new Promise((resolve) => { accept = resolve; }));
    const onClose = vi.fn();
    await render(<VideoMessageRecorder onClose={onClose} onSend={onSend} />);
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Pause recording", exact: true })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Review video", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Pause recording", exact: true }).click();
    await page.getByRole("button", { name: "Resume recording", exact: true }).click();
    // Wait for encoded chunks, rather than synthesizing a MediaRecorder result.
    await expect.poll(() => stream.getVideoTracks()[0].readyState).toBe("live");
    await page.getByRole("button", { name: "Review video", exact: true }).click();
    await expect.element(page.getByLabelText("Video message preview", { exact: true })).toBeVisible();
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
    await page.getByRole("button", { name: "Send video message", exact: true }).click();
    const payload = onSend.mock.calls[0][0];
    expect(payload.file).toBeInstanceOf(File);
    expect(payload.file.size).toBeGreaterThan(0);
    expect(payload.mimeType).toMatch(/^video\//);
    expect(payload.file.type).not.toContain(";");
    expect(payload.width).toBe(480); expect(payload.height).toBe(480);
    await expect.element(page.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled();
    expect(onSend).toHaveBeenCalledTimes(1);
    accept(true);
    await expect.poll(() => onClose.mock.calls.length).toBe(1);
  });
  test("stops a stream whose permission request resolves after closing", async () => {
    let grant;
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const view = await render(<VideoMessageRecorder onClose={vi.fn()} onSend={vi.fn()} />);
    await view.unmount();
    const stream = cameraStream();
    grant(stream);
    await expect.poll(() => stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
  });
  test("handles denied permission and releases the camera on cancellation", async () => {
    const gum = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const view = await render(<VideoMessageRecorder onClose={vi.fn()} onSend={vi.fn()} />);
    await expect.element(page.getByRole("alert")).toHaveTextContent("Allow camera and microphone access in your browser settings, then try again.");
    const stream = cameraStream();
    gum.mockResolvedValue(stream);
    await page.getByRole("button", { name: "Record again", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Start recording", exact: true })).toBeVisible();
    await view.unmount();
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
  });
  test("retains review when the durable queue rejects the send", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(cameraStream());
    const onClose = vi.fn();
    await render(<VideoMessageRecorder onClose={onClose} onSend={vi.fn().mockResolvedValue(false)} />);
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await page.getByRole("button", { name: "Review video", exact: true }).click();
    await page.getByRole("button", { name: "Send video message", exact: true }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("The video message could not be queued. Please try sending again.");
    await expect.element(page.getByRole("button", { name: "Send video message", exact: true })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });
  test("stops recording at sixty active seconds", async () => {
    const stream = cameraStream();
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const onSend = vi.fn().mockResolvedValue(true);
    await render(<VideoMessageRecorder onClose={vi.fn()} onSend={onSend} />);
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Review video", exact: true })).toBeEnabled();
    const now = performance.now();
    const clock = vi.spyOn(performance, "now").mockReturnValue(now + 61000);
    await expect.element(page.getByLabelText("Video message preview", { exact: true })).toBeVisible();
    clock.mockRestore();
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
    await page.getByRole("button", { name: "Send video message", exact: true }).click();
    expect(onSend.mock.calls[0][0].durationSeconds).toBe(60);
  });
  test("stops and frees the devices when recording exceeds the upload limit", async () => {
    const stream = cameraStream();
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const onSend = vi.fn();
    await render(<VideoMessageRecorder maxBytes={1} onClose={vi.fn()} onSend={onSend} />);
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("The video message exceeds the server upload limit. Record a shorter message.");
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });
});
