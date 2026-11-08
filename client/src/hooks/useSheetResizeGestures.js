import { useEffect } from "react";

const RESIZE_THRESHOLD = 48;
const GESTURE_IDLE_MS = 180;

export function useSheetResizeGestures(sheetRef, enabled, onSizeChange) {
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || !sheet) return;
    let amount = 0;
    let direction = 0;
    let previousTime = 0;
    let touch = null;

    const reset = () => { amount = 0; direction = 0; previousTime = 0; };
    const accumulate = (delta) => {
      if (!Number.isFinite(delta) || !delta) return;
      const now = performance.now();
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction || now - previousTime > GESTURE_IDLE_MS) amount = 0;
      direction = nextDirection;
      previousTime = now;
      amount = Math.min(RESIZE_THRESHOLD, amount + Math.abs(delta));
      if (amount < RESIZE_THRESHOLD) return;
      amount = 0;
      onSizeChange(direction > 0 ? "full" : "half");
    };
    const wheel = (event) => {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? sheet.clientHeight : 1;
      accumulate(event.deltaY * unit);
    };
    const touchStart = (event) => {
      reset();
      const first = event.touches.length === 1 ? event.touches[0] : null;
      touch = first ? { id: first.identifier, x: first.clientX, y: first.clientY } : null;
    };
    const touchMove = (event) => {
      if (!touch || event.touches.length !== 1) { touch = null; reset(); return; }
      const next = event.touches[0];
      if (next.identifier !== touch.id) { touch = null; reset(); return; }
      const deltaX = next.clientX - touch.x;
      const deltaY = touch.y - next.clientY;
      touch.x = next.clientX;
      touch.y = next.clientY;
      // Native content scrolling: an upward finger stroke scrolls down the list.
      if (Math.abs(deltaY) > Math.abs(deltaX)) accumulate(deltaY);
    };
    const touchEnd = () => { touch = null; reset(); };
    const options = { passive: true };
    sheet.addEventListener("wheel", wheel, options);
    sheet.addEventListener("touchstart", touchStart, options);
    sheet.addEventListener("touchmove", touchMove, options);
    sheet.addEventListener("touchend", touchEnd, options);
    sheet.addEventListener("touchcancel", touchEnd, options);
    return () => {
      sheet.removeEventListener("wheel", wheel);
      sheet.removeEventListener("touchstart", touchStart);
      sheet.removeEventListener("touchmove", touchMove);
      sheet.removeEventListener("touchend", touchEnd);
      sheet.removeEventListener("touchcancel", touchEnd);
    };
  }, [enabled, onSizeChange, sheetRef]);
}
