import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export function useVoiceRecording({ contextKey, maxBytes = Infinity, onSend, onReview, onComplete }) {
  const latest = useRef({ contextKey, onSend, onReview, onComplete });
  useLayoutEffect(() => { latest.current = { contextKey, onSend, onReview, onComplete }; });
  const current = useRef(null);
  const alive = useRef(true);
  const [status, setStatus] = useState("idle");
  const [milliseconds, setMilliseconds] = useState(0);
  const [error, setError] = useState("");
  const release = useCallback((session) => {
    clearInterval(session?.timer);
    session?.stream?.getTracks().forEach((track) => track.stop());
  }, []);
  const cancel = useCallback(() => {
    const session = current.current; current.current = null;
    if (session?.recorder) {
      session.recorder.onstop = session.recorder.ondataavailable = session.recorder.onerror = null;
      if (session.recorder.state !== "inactive") { try { session.recorder.stop(); } catch { /* Already stopped. */ } }
    }
    release(session);
    if (alive.current) { setStatus("idle"); setMilliseconds(0); }
  }, [release]);
  useEffect(() => {
    alive.current = true; setError(""); setStatus("idle"); setMilliseconds(0);
    return () => { alive.current = false; cancel(); };
  }, [cancel, contextKey]);
  const stop = useCallback((intent = "send") => {
    const session = current.current;
    if (!session?.recorder) { cancel(); return; }
    if (session.recorder.state === "inactive" || session.finished) return;
    session.intent = intent; session.duration = Math.max(0, performance.now() - session.started);
    clearInterval(session.timer); setStatus("stopping");
    session.recorder.stop(); release(session);
  }, [cancel, release]);
  const start = useCallback(async () => {
    if (current.current) return false;
    const session = { contextKey, chunks: [], bytes: 0, intent: "send" };
    current.current = session; setError(""); setStatus("requesting");
    const isCurrent = () => alive.current && current.current === session && latest.current.contextKey === session.contextKey;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error("unsupported");
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent()) { release(session); return false; }
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : {}); session.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (!isCurrent() || !event.data.size) return;
        session.bytes += event.data.size;
        if (session.bytes > maxBytes) { session.oversized = true; stop(); return; }
        session.chunks.push(event.data);
      };
      recorder.onerror = () => { if (isCurrent()) { cancel(); setError("Could not record the voice message. Please try again."); latest.current.onComplete?.(); } };
      recorder.onstop = async () => {
        if (!isCurrent() || session.finished) return;
        session.finished = true; release(session);
        try {
          if (session.oversized) { setError("The voice message exceeds the server upload limit. Record a shorter message."); return; }
          if (!session.chunks.length || session.duration < 250) { setError("Hold a little longer to record a message."); return; }
          const type = (recorder.mimeType || session.chunks[0].type || "audio/webm").split(";")[0];
          const file = new globalThis.File(session.chunks, `voice-message-${Date.now()}.${type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm"}`, { type });
          const payload = { file, mimeType: type, durationSeconds: Math.max(0.25, session.duration / 1000), kind: "voice" };
          if (session.intent === "review") { latest.current.onReview?.(payload); return; }
          setStatus("sending");
          try { if (await latest.current.onSend(payload) !== true) throw new Error("not queued"); }
          catch { if (isCurrent()) { latest.current.onReview?.(payload); setError("The voice message could not be queued. Please try sending again."); } }
        } finally {
          if (isCurrent()) { current.current = null; setStatus("idle"); latest.current.onComplete?.(); }
        }
      };
      recorder.start(150); session.started = performance.now(); setMilliseconds(0); setStatus("recording");
      session.timer = setInterval(() => { if (isCurrent()) setMilliseconds(performance.now() - session.started); }, 100);
      return true;
    } catch (failure) {
      if (!isCurrent()) { release(session); return false; }
      cancel();
      setError(failure.name === "NotAllowedError" ? "Allow microphone access in your browser settings, then try again." : failure.name === "NotFoundError" ? "A microphone is required to record a voice message." : "Could not record the voice message. Please try again.");
      latest.current.onComplete?.(); return false;
    }
  }, [cancel, contextKey, maxBytes, release, stop]);
  return { status, milliseconds, error, start, stop, cancel };
}
