export const VIDEO_NOTE_MAX_SECONDS = 60;
export const VIDEO_NOTE_SIZE = 480;

export function isVideoNote(file) {
  return file?.kind === "video_note" && String(file?.mimeType || "").startsWith("video/");
}

export function videoNoteMimeType(Recorder = globalThis.MediaRecorder) {
  return ["video/webm;codecs=vp8,opus", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm", "video/mp4"]
    .find((type) => Recorder?.isTypeSupported?.(type)) || "";
}

export function mediaTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Record the same central square visible in the circular preview. Keep audio
// from the original stream; only the preview is mirrored, never the saved file.
export function captureVideoNote(source, video) {
  const canvas = document.createElement("canvas");
  if (!canvas.captureStream) {
    return { stream: source, width: video.videoWidth, height: video.videoHeight, dispose() {} };
  }
  canvas.width = canvas.height = VIDEO_NOTE_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Video recording is not supported in this browser.");
  let frame;
  let lastFrame = -Infinity;
  const draw = (now) => {
    if (video.readyState >= 2 && now - lastFrame >= 1000 / 24) {
      const side = Math.min(video.videoWidth, video.videoHeight);
      context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, VIDEO_NOTE_SIZE, VIDEO_NOTE_SIZE);
      lastFrame = now;
    }
    frame = requestAnimationFrame(draw);
  };
  const stream = canvas.captureStream(24);
  source.getAudioTracks().forEach((track) => stream.addTrack(track));
  draw(performance.now());
  return {
    stream, width: VIDEO_NOTE_SIZE, height: VIDEO_NOTE_SIZE,
    dispose() {
      cancelAnimationFrame(frame);
      stream.getVideoTracks().forEach((track) => track.stop());
    },
  };
}
