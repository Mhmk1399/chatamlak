import { describe, expect, test } from "vitest";
import { isVideoNote, mediaTime, videoNoteMimeType } from "../../src/utils/videoNote.js";

describe("video note format", () => {
  test("keeps ordinary videos and documents distinct from circular messages", () => {
    expect(isVideoNote({ kind: "video_note", mimeType: "video/webm" })).toBe(true);
    expect(isVideoNote({ kind: "media", mimeType: "video/webm" })).toBe(false);
    expect(isVideoNote({ kind: "video_note", mimeType: "image/png" })).toBe(false);
  });
  test("chooses a recording container supported by the browser, including Safari MP4", () => {
    expect(videoNoteMimeType({ isTypeSupported: (type) => type.startsWith("video/mp4") })).toContain("video/mp4");
    expect(videoNoteMimeType({ isTypeSupported: (type) => type.startsWith("video/webm") })).toContain("video/webm");
    expect(videoNoteMimeType({})).toBe("");
  });
  test("formats recording and playback time consistently", () => {
    expect(mediaTime(65.8)).toBe("1:05");
    expect(mediaTime(-5)).toBe("0:00");
  });
});
