import { useLayoutEffect, useRef, useState } from "react";
import { t, useLocale } from "../../i18n/locale.js";

const WIDTH_KEY = "ouj-chat-sidebar-width-v1";
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 560;
const RAIL_WIDTH = 76;
const MIN_CHAT_WIDTH = 360;
const clamp = (width, max) => Math.max(MIN_WIDTH, Math.min(max, width));

export default function ChatLayout({ children }) {
  const locale = useLocale(), containerRef = useRef(null), drag = useRef(null);
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem(WIDTH_KEY)); return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH; }
    catch { return DEFAULT_WIDTH; }
  });
  const [maxWidth, setMaxWidth] = useState(MAX_WIDTH);
  const [resizing, setResizing] = useState(false);
  const width = clamp(preferredWidth, maxWidth);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const update = () => setMaxWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, container.clientWidth - RAIL_WIDTH - MIN_CHAT_WIDTH)));
    update(); const observer = new ResizeObserver(update); observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const persist = (value) => {
    setPreferredWidth(value);
    try { localStorage.setItem(WIDTH_KEY, String(value)); } catch { /* Layout remains usable without storage. */ }
  };
  const stop = (event, cancelled = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null; setResizing(false);
    if (cancelled) setPreferredWidth(current.original);
    else persist(current.latest);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={containerRef} className={`ouj-desktop-shell relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden md:flex-row ${resizing ? "ouj-resizing" : ""}`}
    style={{ "--chat-sidebar-width": `${width}px`, "--chat-rail-width": `${RAIL_WIDTH}px`, height: "100%", paddingTop: "max(0px, env(safe-area-inset-top))", paddingLeft: "max(0px, env(safe-area-inset-left))", paddingRight: "max(0px, env(safe-area-inset-right))" }}>
    {children}
    <div role="separator" aria-orientation="vertical" aria-label={t("Resize chat list")} tabIndex={0}
      aria-valuemin={MIN_WIDTH} aria-valuemax={maxWidth} aria-valuenow={Math.round(width)}
      className="ouj-sidebar-resizer hidden md:block" title={t("Drag to resize. Double-click to reset.")}
      onDoubleClick={() => persist(clamp(DEFAULT_WIDTH, maxWidth))}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, original: preferredWidth, width, latest: width, direction: locale === "fa" ? -1 : 1 };
        setResizing(true);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.latest = clamp(current.width + (event.clientX - current.x) * current.direction, maxWidth); setPreferredWidth(current.latest);
      }}
      onPointerUp={event => stop(event)} onPointerCancel={event => stop(event, true)} onLostPointerCapture={event => stop(event, true)}
      onKeyDown={(event) => {
        const direction = locale === "fa" ? -1 : 1;
        const next = event.key === "ArrowRight" ? width + 16 * direction : event.key === "ArrowLeft" ? width - 16 * direction
          : event.key === "Home" ? MIN_WIDTH : event.key === "End" ? maxWidth : event.key === "Enter" ? DEFAULT_WIDTH : null;
        if (next !== null) { event.preventDefault(); persist(clamp(next, maxWidth)); }
        if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); stop({ ...event, pointerId: drag.current.pointerId, currentTarget: event.currentTarget }, true); }
      }} />
  </div>;
}
