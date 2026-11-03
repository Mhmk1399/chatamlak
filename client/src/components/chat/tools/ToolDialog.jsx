import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../../hooks/useFocusTrap.js";
import { t, useLocale } from "../../../i18n/locale.js";

export const toolButton = "inline-flex min-h-9 items-center justify-center gap-1 rounded-full border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-500/30 dark:text-brand-200 dark:hover:bg-brand-500/10";
export const toolInput = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-brand-500 focus:outline-2 focus:outline-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function ToolDialog({ title, onClose, children }) {
  const ref = useRef(null);
  useLocale();
  useFocusTrap(ref, true);
  useEffect(() => {
    const prior = document.activeElement;
    const handleKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", handleKey, true);
    return () => { document.removeEventListener("keydown", handleKey, true); prior?.focus?.({ preventScroll: true }); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-320 flex items-center justify-center bg-black/40 p-3 sm:px-6" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={ref} role="dialog" aria-modal="true" aria-label={t(title)}
        className="ouj-glass flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t(title)}</h2>
          <button type="button" className={toolButton} onClick={onClose}>{t("Close")}</button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </section>
    </div>, document.body,
  );
}
