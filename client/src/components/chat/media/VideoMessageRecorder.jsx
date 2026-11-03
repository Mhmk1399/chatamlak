import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Close, Lock, Pause, Play, Send, Video, Rotate } from "../../../icons/lucide.js";
import { useFocusTrap } from "../../../hooks/useFocusTrap.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { captureVideoNote, mediaTime, videoNoteMimeType, VIDEO_NOTE_MAX_SECONDS } from "../../../utils/videoNote.js";

function cameraError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "Allow camera and microphone access in your browser settings, then try again.";
  if (error?.name === "NotFoundError") return "A camera and microphone are required to record a video message.";
  if (error?.name === "NotReadableError") return "Your camera or microphone is busy. Close other apps and try again.";
  return "Could not record the video message. Please try again.";
}

export default function VideoMessageRecorder({ onClose, onSend, maxBytes = Infinity, gesture = null, onGestureLock }) {
  useLocale();
  const dialogRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const clockRef = useRef({ elapsed: 0, started: 0 });
  const aliveRef = useRef(false);
  const urlRef = useRef("");
  const totalBytesRef = useRef(0);
  const oversizedRef = useRef(false);
  const sendingRef = useRef(false);
  const finishIntentRef = useRef("review");
  const [status, setStatus] = useState("requesting");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [payload, setPayload] = useState(null);
  const [manualRetry, setManualRetry] = useState(false);
  const captureGesture = manualRetry ? null : gesture;
  useFocusTrap(dialogRef, true);

  function releaseCamera() {
    captureRef.current?.dispose();
    captureRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    async function acquire() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
        setError("Video recording needs HTTPS or localhost and a supported browser.");
        setStatus("error");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 }, frameRate: { ideal: 24, max: 30 } },
        });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) {
          stream.getTracks().forEach((track) => track.stop());
          throw Object.assign(new Error(), { name: "NotFoundError" });
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        releaseCamera();
        setError(cameraError(err));
        setStatus("error");
      }
    }
    void acquire();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
        if (recorder.state !== "inactive") { try { recorder.stop(); } catch { /* already stopped */ } }
      }
      releaseCamera();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [attempt]);

  useEffect(() => {
    const keydown = (event) => {
      if (event.key === "Escape" && !sendingRef.current) { event.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      const elapsed = clockRef.current.elapsed + performance.now() - clockRef.current.started;
      setSeconds(Math.min(VIDEO_NOTE_MAX_SECONDS, elapsed / 1000));
      if (elapsed >= VIDEO_NOTE_MAX_SECONDS * 1000) {
        clockRef.current.elapsed = VIDEO_NOTE_MAX_SECONDS * 1000;
        clockRef.current.started = 0;
        setStatus("stopping");
        recorderRef.current?.stop();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [status]);

  const sendPayload = useCallback(async (recorded) => {
    if (sendingRef.current) return;
    sendingRef.current = true; setStatus("sending"); setError("");
    try {
      if (await onSend(recorded) === false) throw new Error();
      if (aliveRef.current) onClose();
    } catch {
      if (aliveRef.current) { setError("The video message could not be queued. Please try sending again."); setStatus("review"); }
    } finally { sendingRef.current = false; }
  }, [onClose, onSend]);

  const start = useCallback(() => {
    try {
      if (!(videoRef.current?.videoWidth > 0)) { setError("The camera is warming up. Try again in a moment."); return; }
      setError("");
      captureRef.current = captureVideoNote(streamRef.current, videoRef.current);
      const { stream, width, height } = captureRef.current;
      const mimeType = videoNoteMimeType();
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 });
      recorderRef.current = recorder;
      chunksRef.current = [];
      totalBytesRef.current = 0;
      oversizedRef.current = false;
      finishIntentRef.current = "review";
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        totalBytesRef.current += event.data.size;
        if (totalBytesRef.current > maxBytes) {
          oversizedRef.current = true;
          chunksRef.current = [];
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recorder.onstop = null;
        releaseCamera();
        setError("Could not record the video message. Please try again.");
        setStatus("error");
      };
      recorder.onstop = () => {
        releaseCamera();
        if (!aliveRef.current) return;
        const duration = Math.min(VIDEO_NOTE_MAX_SECONDS, (clockRef.current.elapsed + (clockRef.current.started ? performance.now() - clockRef.current.started : 0)) / 1000);
        if (oversizedRef.current || !chunksRef.current.length) {
          setError(oversizedRef.current ? "The video message exceeds the server upload limit. Record a shorter message." : "Could not record the video message. Please try again.");
          setStatus("error");
          return;
        }
        // Codec parameters from MediaRecorder can be invalid unquoted MIME
        // parameters in multipart headers. Upload the standard container type.
        const type = (recorder.mimeType || chunksRef.current[0].type || "video/webm").split(";")[0].trim();
        const file = new globalThis.File(chunksRef.current, `video-message-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`, { type });
        chunksRef.current = [];
        urlRef.current = URL.createObjectURL(file);
        const recorded = { file, mimeType: type, durationSeconds: Math.max(0.1, duration), width, height, previewUrl: urlRef.current, kind: "video_note" };
        setPayload(recorded);
        setSeconds(duration);
        if (finishIntentRef.current === "send") void sendPayload(recorded);
        else setStatus("review");
      };
      recorder.start(250);
      clockRef.current = { elapsed: 0, started: performance.now() };
      setStatus("recording");
    } catch {
      releaseCamera();
      setError("Could not record the video message. Please try again.");
      setStatus("error");
    }
  }, [maxBytes, sendPayload]);

  function pauseOrResume() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      clockRef.current.elapsed += performance.now() - clockRef.current.started;
      clockRef.current.started = 0;
      recorder.pause();
      setStatus("paused");
    } else if (recorder?.state === "paused") {
      recorder.resume();
      clockRef.current.started = performance.now();
      setStatus("recording");
    }
  }

  const stop = useCallback((intent = "review") => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    finishIntentRef.current = intent;
    clockRef.current.elapsed += clockRef.current.started ? performance.now() - clockRef.current.started : 0;
    clockRef.current.started = 0;
    setStatus("stopping");
    recorderRef.current?.stop();
  }, []);

  async function send() {
    await sendPayload(payload);
  }

  useEffect(() => {
    if (!captureGesture) return;
    if (captureGesture === "send") {
      if (status === "recording" || status === "paused") stop("send");
      else if (status === "requesting" || status === "ready") onClose();
    } else if (status === "ready") start();
  }, [captureGesture, onClose, start, status, stop]);

  const recording = status === "recording" || status === "paused";
  const review = status === "review" || status === "sending";
  return createPortal(
    <div className="video-note-overlay fixed inset-0 z-320 flex items-center justify-center bg-black/40 px-6" onClick={(event) => { if (event.target === event.currentTarget && !sendingRef.current) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("Record video message")} className="video-note-dialog" tabIndex={-1}>
        <header className="ouj-glass flex items-center justify-between gap-3 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <span className="inline-flex items-center gap-2"><Video size={18} />{t("Video message")}</span>
          <button type="button" onClick={onClose} disabled={status === "sending"} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-200/50 dark:hover:bg-white/10" aria-label={t("Cancel video message")}><Close size={20} /></button>
        </header>
        <div className="video-note-camera" data-testid="video-note-camera">
          <video ref={videoRef} muted playsInline autoPlay className={`h-full w-full object-cover ${review || status === "error" ? "hidden" : "-scale-x-100"}`} aria-label={t("Camera preview")} />
          {review && <video key={payload.previewUrl} src={payload.previewUrl} playsInline controls className="h-full w-full object-cover" aria-label={t("Video message preview")} />}
          {status === "requesting" && <span role="status" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{t("Opening camera…")}</span>}
          {status === "error" && <Video size={64} className="absolute inset-0 m-auto text-white/60" />}
          <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49" fill="none" stroke="var(--color-accent-500)" strokeWidth="1" pathLength="100" strokeDasharray={`${Math.min(100, seconds / VIDEO_NOTE_MAX_SECONDS * 100)} 100`} /></svg>
        </div>
        <div className="ouj-glass rounded-3xl border border-white/15 p-3 text-slate-800 shadow-xl dark:text-slate-100">
          <div className="mb-3 flex items-center justify-center gap-2 text-sm tabular-nums" dir="ltr">
            {recording && <span className={`h-2 w-2 rounded-full bg-rose-500 ${status === "recording" ? "animate-pulse" : ""}`} />}
            <span>{mediaTime(seconds)} / {mediaTime(VIDEO_NOTE_MAX_SECONDS)}</span>
          </div>
          {error && <p role="alert" className="mb-3 text-center text-sm text-rose-700 dark:text-rose-200">{t(error)}</p>}
          <div className="flex items-center justify-center gap-3">
            {status === "ready" && <button type="button" onClick={start} className="video-note-primary"><Video size={19} />{t("Start recording")}</button>}
            {recording && <>
              <button type="button" onClick={pauseOrResume} className="video-note-secondary">{status === "paused" ? <Play size={19} /> : <Pause size={19} />}{t(status === "paused" ? "Resume recording" : "Pause recording")}</button>
              <button type="button" onClick={() => stop()} disabled={seconds < 1} className="video-note-primary">{t("Review video")}</button>
              {captureGesture === "locked" && <button type="button" onClick={() => stop("send")} disabled={seconds < 0.25} className="video-note-primary"><Send size={19} />{t("Send video message")}</button>}
              {captureGesture === "hold" && <button type="button" onClick={onGestureLock} className="video-note-secondary" aria-label={t("Lock recording")}><Lock size={19} /></button>}
            </>}
            {(review || status === "error") && <button type="button" disabled={status === "sending"} onClick={() => { setManualRetry(true); setPayload(null); setSeconds(0); setError(""); setStatus("requesting"); setAttempt((value) => value + 1); }} className="video-note-secondary"><Rotate size={18} />{t("Record again")}</button>}
            {review && <button type="button" disabled={status === "sending"} onClick={send} className="video-note-primary"><Send size={19} />{t(status === "sending" ? "Sending…" : "Send video message")}</button>}
          </div>
          {status === "ready" && <p className="mt-3 text-center text-xs text-slate-600 dark:text-slate-300">{t("Record a circular video, up to 60 seconds.")}</p>}
          {recording && captureGesture && <p role="status" className="mt-3 text-center text-xs text-slate-600 dark:text-slate-300">{t(captureGesture === "locked" ? "Recording locked" : "Release to send; swipe up to lock")}</p>}
        </div>
      </section>
    </div>, document.body,
  );
}
