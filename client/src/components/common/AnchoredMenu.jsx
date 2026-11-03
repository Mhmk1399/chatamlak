import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../i18n/locale.js";

export default function AnchoredMenu({ anchorRef, onClose, children, id, label }) {
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
      const height = Math.min(menu.scrollHeight, bottomEdge - topEdge);
      const desiredLeft = locale === "fa" ? rect.left : rect.right - width;
      const below = rect.bottom + 8;
      const desiredTop = below + height > bottomEdge && rect.top - height - 8 >= topEdge ? rect.top - height - 8 : below;
      setPosition({ left: Math.max(leftEdge, Math.min(desiredLeft, rightEdge - width)), top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - height)), maxHeight: bottomEdge - topEdge });
    }
    place();
    const frame = requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true }));
    const observer = new ResizeObserver(place); observer.observe(anchor); observer.observe(menu);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    const outside = (event) => { if (!menu.contains(event.target) && !anchor.contains(event.target)) onClose(false); };
    document.addEventListener("pointerdown", outside, true);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [anchorRef, locale, onClose]);

  return createPortal(<div ref={menuRef} id={id} role="menu" aria-label={label} dir={locale === "fa" ? "rtl" : "ltr"}
    className="ouj-glass fixed z-120 w-48 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-brand-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-brand-950/10 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100"
    style={{ ...position, visibility: position ? "visible" : "hidden" }}
    onKeyDown={(event) => {
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
