import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "../../../icons/lucide.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { mediaTime } from "../../../utils/videoNote.js";

export default function VideoNotePlayer({ file, onLoaded }) {
  useLocale();
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(Number(file.durationSeconds) || 0);
  const [time, setTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = file.url || file._localUrl || "";
  useEffect(() => {
    const video = videoRef.current;
    // Pause media that leaves the timeline viewport, including virtualized rows.
    const observer = globalThis.IntersectionObserver ? new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) video?.pause();
    }) : null;
    if (video) observer?.observe(video);
    const pauseOther = (event) => { if (event.detail !== video) video?.pause(); };
    const hidden = () => { if (document.hidden) video?.pause(); };
    window.addEventListener("songbird:media-play", pauseOther);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      observer?.disconnect();
      window.removeEventListener("songbird:media-play", pauseOther);
      document.removeEventListener("visibilitychange", hidden);
      video?.pause();
    };
  }, [src]);
  async function togglePlay() {
    const video = videoRef.current;
    if (!video || !src) return;
    if (!video.paused) { video.pause(); return; }
    try {
      setFailed(false);
      await video.play();
    } catch { setFailed(true); }
  }
  return (
    <div className="video-note-message" data-testid="video-note-message" dir="ltr">
      <div className="relative aspect-square w-full">
        <video ref={videoRef} src={src || undefined} playsInline muted={muted} preload="metadata"
          poster={file.thumbUrl || file.posterUrl || undefined}
          className="absolute inset-0 h-full w-full rounded-full bg-slate-900 object-cover"
          aria-label={t("Video message")}
          onLoadedData={() => onLoaded?.()}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDuration(value);
            onLoaded?.();
          }}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onPlay={(event) => { setPlaying(true); window.dispatchEvent(new CustomEvent("songbird:media-play", { detail: event.currentTarget })); }}
          onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onError={() => { setFailed(true); setPlaying(false); onLoaded?.(); }} />
        <button type="button" onClick={(event) => { event.stopPropagation(); void togglePlay(); }} disabled={!src || file.processing}
          aria-label={t(playing ? "Pause video message" : "Play video message")}
          className={`absolute inset-0 flex items-center justify-center rounded-full text-white outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500 ${playing ? "opacity-0 hover:opacity-100 focus-visible:opacity-100" : "bg-black/10"}`}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">{playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="translate-x-0.5" />}</span>
        </button>
        <button type="button" onClick={(event) => { event.stopPropagation(); setMuted((value) => !value); }} aria-label={t(muted ? "Unmute video message" : "Mute video message")} className="absolute start-1/2 top-2 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <span className="absolute bottom-1 left-1 rounded-lg bg-slate-950/65 px-2 py-0.5 text-xs tabular-nums text-white backdrop-blur-sm">{mediaTime(time || duration)} <span aria-hidden="true" className="ms-1 inline-block h-1.5 w-1.5 rounded-full bg-white" /></span>
        <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49" fill="none" stroke="var(--color-accent-500)" strokeWidth="1" pathLength="100" strokeDasharray={`${duration ? time / duration * 100 : 0} 100`} /></svg>
      </div>
      <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(duration || 1, time)} disabled={!src || !(duration > 0)} aria-label={t("Video message playback position")}
        aria-valuetext={t("{position} of {duration} seconds", { position: Math.floor(time), duration: Math.floor(duration) })}
        onPointerDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
        onChange={(event) => { const value = Number(event.currentTarget.value); if (videoRef.current) videoRef.current.currentTime = value; setTime(value); }} className="mt-1 h-6 w-full accent-brand-600" />
      {failed && <p role="status" className="text-center text-xs text-rose-700 dark:text-rose-200">{t("Video unavailable. Check your connection or download the file.")} {src && <a href={src} download={file.name} className="underline">{t("Download")}</a>}</p>}
    </div>
  );
}
