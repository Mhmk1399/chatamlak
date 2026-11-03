import { useEffect, useState } from "react";
import { t, useLocale } from "../../../i18n/locale.js";

import { VOICE_SPEEDS as SPEEDS, readVoiceSpeed as readSpeed, writeVoiceSpeed } from "../../../utils/voicePlayback.js";

export default function VoicePlaybackControls({ audioRef, duration, progress, disabled, onSeek, children }) {
  useLocale();
  const [speed, setSpeed] = useState(readSpeed);
  useEffect(() => {
    const apply = () => {
      const value = readSpeed();
      setSpeed(value);
      if (audioRef.current) audioRef.current.playbackRate = value;
    };
    apply();
    const audio = audioRef.current;
    audio?.addEventListener("play", apply);
    window.addEventListener("songbird:voice-speed", apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener("songbird:voice-speed", apply);
      window.removeEventListener("storage", apply);
      audio?.removeEventListener("play", apply);
    };
  }, [audioRef]);
  return (
    <div className="flex min-w-0 items-center gap-2" dir="ltr">
      <div className="relative min-w-0 flex-1">
        <div aria-hidden="true">{children}</div>
        <input
          type="range"
          min="0" max={duration || 1} step="0.1"
          value={Math.min(duration || 1, Math.max(0, progress * duration))}
          disabled={disabled || !(duration > 0)}
          aria-label={t("Voice message playback position")}
          aria-valuetext={t("{position} of {duration} seconds", { position: Math.floor(progress * duration), duration: Math.floor(duration) })}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
          className="absolute inset-0 m-0 h-full min-h-9 w-full cursor-pointer opacity-0 focus-visible:opacity-100 disabled:cursor-not-allowed"
        />
      </div>
      <button type="button" disabled={disabled}
          aria-label={t(`Playback speed: ${speed} times. Change playback speed`)}
          onClick={(event) => {
            event.stopPropagation();
            const value = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
            setSpeed(value);
            if (audioRef.current) audioRef.current.playbackRate = value;
            writeVoiceSpeed(value);
          }}
          className="min-h-9 min-w-10 rounded-full px-1 text-[11px] font-semibold tabular-nums transition hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50 dark:hover:bg-brand-500/20">
        {speed}×
      </button>
    </div>
  );
}
