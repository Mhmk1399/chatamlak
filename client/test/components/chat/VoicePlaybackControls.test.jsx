import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import VoicePlaybackControls from "../../../src/components/chat/media/VoicePlaybackControls.jsx";
import { writeVoiceSpeed } from "../../../src/utils/voicePlayback.js";
import { MessageFiles } from "../../../src/components/chat/media/MessageFiles.jsx";

afterEach(() => { vi.restoreAllMocks(); writeVoiceSpeed(1); });
describe("voice playback controls", () => {
  test("keeps numeric voice times left to right inside a Persian conversation", async () => {
    await render(<div dir="rtl"><MessageFiles files={[{ id: "rtl-voice", mimeType: "audio/wav", name: "Voice", durationSeconds: 60, url: "data:audio/wav;base64,UklGRg==" }]}
      isDesktop={false} loadedMediaThumbs={new Set()} mediaAspectByKey={{}} videoPosterByUrl={{}} getFileRenderType={() => "audio"} /></div>);
    const duration = page.getByText("1:00", { exact: true });
    await expect.element(duration).toHaveAttribute("dir", "ltr");
  });
  test("applies and remembers playback speed on the actual audio element", async () => {
    const audioRef = { current: new Audio() };
    const screen = await render(<VoicePlaybackControls audioRef={audioRef} duration={60} progress={0} onSeek={vi.fn()}><span>Waveform</span></VoicePlaybackControls>);
    await page.getByRole("button", { name: /Playback speed/ }).click();
    expect(audioRef.current.playbackRate).toBe(1.25);
    await screen.unmount();
    const next = { current: new Audio() };
    await render(<VoicePlaybackControls audioRef={next} duration={60} progress={0} onSeek={vi.fn()} />);
    expect(next.current.playbackRate).toBe(1.25);
  });
  test("uses a native accessible seek control and forwards its time", async () => {
    const onSeek = vi.fn();
    render(<VoicePlaybackControls audioRef={{ current: new Audio() }} duration={120} progress={0.5} onSeek={onSeek} />);
    const slider = page.getByRole("slider", { name: "Voice message playback position" });
    await expect.element(slider).toHaveValue("60");
    const element = slider.element();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, "35");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onSeek).toHaveBeenCalledWith(35);
  });
  test("retains the selected speed when browser storage rejects writes", async () => {
    localStorage.setItem("songbird-voice-speed", "1");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    const audioRef = { current: new Audio() };
    const screen = await render(<VoicePlaybackControls audioRef={audioRef} duration={60} progress={0} onSeek={vi.fn()} />);
    await page.getByRole("button", { name: /Playback speed/ }).click();
    expect(audioRef.current.playbackRate).toBe(1.25);
    await screen.unmount();
    const next = { current: new Audio() };
    await render(<VoicePlaybackControls audioRef={next} duration={60} progress={0} onSeek={vi.fn()} />);
    expect(next.current.playbackRate).toBe(1.25);
  });
});
