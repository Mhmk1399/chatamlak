import { ChevronDown, Lock, Mic, Send, Video } from "../../../icons/lucide.js";
import { t, useLocale } from "../../../i18n/locale.js";
import Tooltip from "../../common/Tooltip.jsx";
import { useId, useRef } from "react";

export default function RecordingButton({ mode, gesture, disabled, busy, onFocusCapture }) {
  useLocale();
  const helpId = useId();
  const lockedPress = useRef(false);
  const video = mode === "video";
  const label = gesture.locked ? t(video ? "Send video message" : "Send voice message") : t(video ? "Record video message" : "Record voice message");
  return <div className="relative shrink-0">
    <span id={helpId} className="sr-only">{t("Hold Space or Enter to record. Press Arrow Up to lock. Escape cancels.")}</span>
    {gesture.active && !gesture.locked && <div aria-hidden="true" className="pointer-events-none absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 flex-col items-center gap-2 rounded-full border border-brand-200 bg-white/95 px-3 py-3 text-brand-700 shadow-lg dark:border-brand-500/30 dark:bg-slate-900 dark:text-brand-200">
      <Lock size={17} style={{ opacity: 0.45 + gesture.progress * 0.55 }} />
      <ChevronDown size={16} className="rotate-180" />
    </div>}
    <Tooltip label={t("Tap to switch voice/video. Hold to record; swipe up to lock.")} asChild whenTruncated={false}>
      <button type="button" {...(!gesture.locked ? gesture.handlers : {})}
        onPointerDown={(event) => {
          onFocusCapture?.();
          lockedPress.current = gesture.locked;
          if (!gesture.locked) gesture.handlers.onPointerDown(event);
        }}
        onKeyDown={gesture.locked ? (event) => { if ([" ", "Enter"].includes(event.key)) lockedPress.current = true; } : gesture.handlers.onKeyDown}
        onKeyUp={gesture.locked ? (event) => { if (!lockedPress.current && [" ", "Enter"].includes(event.key)) event.preventDefault(); } : gesture.handlers.onKeyUp}
        onClick={gesture.locked ? (event) => {
          // The original hold can synthesize a click when its pointer is
          // released after locking. Only a new press activates Send.
          if (event.detail !== 0 && !lockedPress.current) return;
          lockedPress.current = false; gesture.finish();
        } : gesture.handlers.onClick}
        disabled={disabled || busy} aria-label={label} aria-describedby={helpId} aria-pressed={gesture.active} aria-busy={busy || undefined}
        className={`inline-flex h-11 w-14 touch-none select-none items-center justify-center rounded-2xl text-white shadow-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${gesture.active ? "bg-rose-500 shadow-rose-500/20 hover:bg-rose-600" : "bg-brand-600 shadow-brand-500/20 hover:bg-brand-500"}`}>
        {gesture.locked ? <Send size={23} /> : video ? <Video size={23} /> : <Mic size={23} />}
      </button>
    </Tooltip>
  </div>;
}
