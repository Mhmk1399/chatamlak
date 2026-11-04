import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../i18n/locale.js";

export default function AnchoredMenu({ anchorRef, onClose, children, id, label, placement = "bottom", align = "end", autoFocus = true, variant = "actions" }) {
  const locale = useLocale();
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const menu = menuRef.current, anchor = anchorRef.current;
    if (!menu || !anchor) return;
    function place() {
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 8, topEdge = (viewport?.offsetTop || 0) + 8;
      const rightEdge = leftEdge + (viewport?.width || window.innerWidth) - 16;
      const bottomEdge = topEdge + (viewport?.height || window.innerHeight) - 16;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(menu.offsetWidth, rightEdge - leftEdge);
      const height = menu.scrollHeight + menu.offsetHeight - menu.clientHeight;
      const rightAligned = align === "start" ? locale === "fa" : locale !== "fa";
      const desiredLeft = rightAligned ? rect.right - width : rect.left;
      const above = Math.max(0, rect.top - 8 - topEdge), below = Math.max(0, bottomEdge - rect.bottom - 8);
      const useAbove = placement === "top" ? above >= height || (below < height && above >= below) : below < height && above > below;
      const maxHeight = Math.min(bottomEdge - topEdge, useAbove ? above : below);
      const displayedHeight = Math.min(height, maxHeight);
      const desiredTop = useAbove ? rect.top - 8 - displayedHeight : rect.bottom + 8;
      setPosition({ left: Math.max(leftEdge, Math.min(desiredLeft, rightEdge - width)), top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - displayedHeight)), maxHeight, maxWidth: rightEdge - leftEdge });
    }
    place();
    let positionFrame;
    const schedulePlacement = () => {
      cancelAnimationFrame(positionFrame);
      positionFrame = requestAnimationFrame(place);
    };
    const frame = autoFocus ? requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true })) : null;
    const observer = new ResizeObserver(schedulePlacement); observer.observe(anchor); observer.observe(menu);
    for (let ancestor = anchor.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) observer.observe(ancestor);
    window.addEventListener("resize", schedulePlacement); window.addEventListener("scroll", schedulePlacement, true);
    window.visualViewport?.addEventListener("resize", schedulePlacement); window.visualViewport?.addEventListener("scroll", schedulePlacement);
    const outside = (event) => { if (!menu.contains(event.target) && !anchor.contains(event.target)) onClose(false); };
    document.addEventListener("pointerdown", outside, true);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame); observer.disconnect();
      cancelAnimationFrame(positionFrame);
      window.removeEventListener("resize", schedulePlacement); window.removeEventListener("scroll", schedulePlacement, true);
      window.visualViewport?.removeEventListener("resize", schedulePlacement); window.visualViewport?.removeEventListener("scroll", schedulePlacement);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [align, anchorRef, autoFocus, locale, onClose, placement]);

  return createPortal(<div ref={menuRef} id={id} role="menu" aria-label={label} dir={locale === "fa" ? "rtl" : "ltr"}
    className={`ouj-glass fixed z-120 ${variant === "account" || variant === "conversation" ? "w-72" : "w-48"} max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-2xl border border-brand-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-brand-950/10 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100`}
    style={{ ...position, visibility: position ? "visible" : "hidden" }}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Tab") onClose(false);
    }}>{children}</div>, document.body);
}
