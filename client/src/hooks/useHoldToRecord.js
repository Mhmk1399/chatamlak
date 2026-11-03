import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const RECORD_HOLD_MS = 250;
export const RECORD_LOCK_DISTANCE = 72;

export function useHoldToRecord({ disabled, contextKey, onStart, onFinish, onCancel, onTap }) {
  const callbacks = useRef({ disabled, onStart, onFinish, onCancel, onTap });
  useLayoutEffect(() => { callbacks.current = { disabled, onStart, onFinish, onCancel, onTap }; });
  const session = useRef(null);
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const reset = useCallback(() => {
    if (session.current) clearTimeout(session.current.timer);
    session.current = null; setPhase("idle"); setProgress(0);
  }, []);
  const cancel = useCallback(() => {
    const current = session.current;
    reset();
    if (current?.started) callbacks.current.onCancel?.();
  }, [reset]);
  const lock = useCallback(() => {
    if (!session.current?.started) return;
    session.current.locked = true; setProgress(1); setPhase("locked");
  }, []);
  const finish = useCallback(() => {
    const started = session.current?.started;
    reset();
    if (started) callbacks.current.onFinish?.();
  }, [reset]);
  const begin = useCallback((pointerId, y) => {
    if (callbacks.current.disabled || session.current) return;
    const current = { pointerId, y, started: false, locked: false, latestY: y, keyHeld: pointerId === "keyboard" };
    session.current = current; setPhase("pressing");
    current.timer = setTimeout(() => {
      if (session.current !== current) return;
      current.started = true; setPhase("held");
      if (current.y - current.latestY >= RECORD_LOCK_DISTANCE) lock();
      Promise.resolve(callbacks.current.onStart?.()).then((started) => {
        if (started === false && session.current === current) reset();
      }).catch(() => { if (session.current === current) cancel(); });
    }, RECORD_HOLD_MS);
  }, [cancel, lock, reset]);

  useEffect(() => {
    const move = (event) => {
      const current = session.current;
      if (!current || current.locked || current.pointerId !== event.pointerId) return;
      current.latestY = event.clientY;
      const distance = Math.max(0, current.y - current.latestY);
      if (current.started) { setProgress(Math.min(1, distance / RECORD_LOCK_DISTANCE)); if (distance >= RECORD_LOCK_DISTANCE) lock(); }
    };
    const release = (event) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId || current.locked) return;
      if (current.started) finish();
      else { reset(); callbacks.current.onTap?.(); }
    };
    const interrupted = (event) => {
      if (session.current?.pointerId === event.pointerId && !session.current.locked) cancel();
    };
    const hidden = () => { if (document.hidden) cancel(); };
    const escape = (event) => { if (event.key === "Escape" && session.current) { event.preventDefault(); cancel(); } };
    // Opening the camera moves focus into its dialog. Keep ownership of the
    // original keyboard hold until keyup, even when its button loses focus.
    const keydown = (event) => {
      const current = session.current;
      if (current?.pointerId !== "keyboard" || !current.keyHeld) return;
      if (event.key === "ArrowUp" && current.started) { event.preventDefault(); lock(); }
      if ([" ", "Enter"].includes(event.key)) event.preventDefault();
    };
    const keyup = (event) => {
      const current = session.current;
      if (current?.pointerId !== "keyboard" || !current.keyHeld || ![" ", "Enter"].includes(event.key)) return;
      event.preventDefault(); current.keyHeld = false;
      if (current.locked) return;
      if (current.started) finish(); else { reset(); callbacks.current.onTap?.(); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", release); window.addEventListener("pointercancel", interrupted);
    document.addEventListener("visibilitychange", hidden); document.addEventListener("keydown", escape);
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", interrupted);
      document.removeEventListener("visibilitychange", hidden); document.removeEventListener("keydown", escape);
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup);
      const current = session.current;
      if (current) clearTimeout(current.timer);
      session.current = null;
      if (current?.started) callbacks.current.onCancel?.();
    };
  }, [cancel, contextKey, finish, lock, reset]);
  useEffect(() => { setPhase("idle"); setProgress(0); }, [contextKey]);

  return {
    phase, progress, active: phase === "held" || phase === "locked", locked: phase === "locked", reset, cancel, lock, finish,
    handlers: {
      onPointerDown(event) {
        if (event.button !== 0 || session.current || callbacks.current.disabled) return;
        event.preventDefault();
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic events and older browsers use window listeners. */ }
        begin(event.pointerId, event.clientY);
      },
      onKeyDown(event) {
        if (event.key === "ArrowUp" && session.current?.started) { event.preventDefault(); lock(); }
        if (![" ", "Enter"].includes(event.key)) return;
        event.preventDefault(); if (!event.repeat) begin("keyboard", 0);
      },
      onClick(event) { if (event.detail === 0 && !session.current && !callbacks.current.disabled) callbacks.current.onTap?.(); },
      onContextMenu(event) { event.preventDefault(); },
    },
  };
}
