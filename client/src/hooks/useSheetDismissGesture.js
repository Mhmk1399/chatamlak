import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const interactive = "button, a, input, textarea, select, [role='button'], [contenteditable]";
const easing = "cubic-bezier(.22, 1, .36, 1)";
const readOffset = (sheet) => parseFloat(getComputedStyle(sheet).translate.split(/\s+/)[1]) || 0;

export function useSheetDismissGesture(sheetRef, headerRef, overlayRef, enabled, onClose) {
  const closeRef = useRef(onClose);
  const controllerRef = useRef(null);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const sheet = sheetRef.current, header = headerRef.current, overlay = overlayRef.current;
    if (!enabled || !sheet || !header) return;
    let alive = true, closing = false, gesture = null, frame = null, animation = null, fade = null;
    let swallowClick = false;
    const initialTranslate = sheet.style.translate, initialWillChange = sheet.style.willChange;
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const setOffset = (offset) => { sheet.style.translate = `0 ${offset}px`; };
    const cancelFrame = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
    const cancelAnimation = () => { animation?.cancel(); animation = null; };
    const removeGestureListeners = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("pointerdown", otherPointer, true);
      window.removeEventListener("blur", cancel);
    };
    const stopGesture = () => {
      cancelFrame(); removeGestureListeners();
      if (gesture && header.hasPointerCapture?.(gesture.id)) header.releasePointerCapture(gesture.id);
      gesture = null;
    };
    const settle = () => {
      const offset = readOffset(sheet);
      cancelAnimation();
      const finish = () => {
        if (!alive || closing) return;
        sheet.style.translate = initialTranslate;
        sheet.style.willChange = initialWillChange;
        delete sheet.dataset.dismissState;
      };
      if (!offset || reduced()) { finish(); return; }
      sheet.dataset.dismissState = "settling";
      const settling = sheet.animate([{ translate: `0 ${offset}px` }, { translate: "0 0px" }], { duration: 320, easing, fill: "forwards" });
      animation = settling;
      settling.finished.then(() => { if (animation === settling) { cancelAnimation(); finish(); } }).catch(() => {});
    };
    const close = () => {
      if (!alive || closing) return;
      const offset = readOffset(sheet);
      stopGesture(); cancelAnimation(); closing = true;
      sheet.dataset.dismissState = "closing";
      if (reduced()) { closeRef.current(); return; }
      sheet.style.willChange = "translate";
      const options = { duration: 320, easing, fill: "forwards" };
      animation = sheet.animate([{ translate: `0 ${offset}px` }, { translate: `0 ${sheet.getBoundingClientRect().height + 24}px` }], options);
      if (overlay) fade = overlay.animate([{ opacity: getComputedStyle(overlay).opacity }, { opacity: 0 }], options);
      animation.finished.then(() => { if (alive) closeRef.current(); }).catch(() => {});
    };
    function move(event) {
      if (!gesture || event.pointerId !== gesture.id || closing) return;
      const down = event.clientY - gesture.y, across = event.clientX - gesture.x;
      if (!gesture.started) {
        if ((Math.abs(across) > 10 && Math.abs(across) > Math.abs(down)) || down < -8) { stopGesture(); settle(); return; }
        if (down < 6) return;
        gesture.started = true; sheet.dataset.dismissState = "dragging"; sheet.style.willChange = "translate";
      }
      if (event.cancelable) event.preventDefault();
      gesture.offset = Math.min(window.innerHeight, Math.max(0, gesture.base + down));
      if (frame === null) frame = requestAnimationFrame(() => { frame = null; if (gesture) setOffset(gesture.offset); });
    }
    function release(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const { offset, started } = gesture;
      swallowClick = started;
      if (started) setOffset(offset);
      const threshold = Math.min(120, Math.max(72, sheet.getBoundingClientRect().height * .2));
      stopGesture();
      if (started && offset >= threshold) close(); else settle();
    }
    function cancel(event) {
      if (!gesture || (event?.pointerId !== undefined && event.pointerId !== gesture.id)) return;
      swallowClick = gesture.started; stopGesture(); settle();
    }
    function otherPointer(event) { if (gesture && event.pointerType === "touch" && event.pointerId !== gesture.id) cancel(); }
    const start = (event) => {
      swallowClick = false;
      if (closing || gesture || event.button !== 0 || event.isPrimary === false || event.target.closest(interactive)) return;
      const base = readOffset(sheet); cancelAnimation(); setOffset(base);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, base, offset: base, started: false };
      try { header.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers do not have native capture. */ }
      window.addEventListener("pointermove", move, { capture: true, passive: false });
      window.addEventListener("pointerup", release, true);
      window.addEventListener("pointercancel", cancel, true);
      window.addEventListener("pointerdown", otherPointer, true);
      window.addEventListener("blur", cancel);
    };
    const click = (event) => { if (swallowClick && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } swallowClick = false; };
    header.addEventListener("pointerdown", start);
    header.addEventListener("click", click, true);
    controllerRef.current = { close };
    return () => {
      alive = false; stopGesture(); cancelAnimation(); fade?.cancel();
      header.removeEventListener("pointerdown", start); header.removeEventListener("click", click, true);
      sheet.style.translate = initialTranslate; sheet.style.willChange = initialWillChange;
      delete sheet.dataset.dismissState; controllerRef.current = null;
    };
  }, [enabled, headerRef, overlayRef, sheetRef]);

  return useCallback(() => {
    if (enabled && controllerRef.current) controllerRef.current.close();
    else closeRef.current();
  }, [enabled]);
}
