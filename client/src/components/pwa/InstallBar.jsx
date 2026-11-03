import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { forwardRef } from "react";
import { Close, Download } from "../../icons/lucide.js";

const InstallBar = forwardRef(function InstallBar(
  { show, onDismiss, onInstall, iconSrc = "/ouj-logo.png" },
  ref,
) {
  useAppLocale();
  if (!show) return null;

  return (
    <div
      ref={ref}
      className="ouj-glass fixed inset-x-0 top-0 border-b border-brand-200 bg-white/95 shadow-xs shadow-brand-500/10 backdrop-blur-sm dark:border-brand-500/30 dark:bg-slate-950/95"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        zIndex: "var(--install-bar-z, 40)",
        opacity: "var(--install-bar-opacity, 1)",
        pointerEvents: "var(--install-bar-pe, auto)",
        transform: "translateY(var(--install-bar-translate, 0%))",
        transition: "transform 220ms ease, opacity 220ms ease",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label={localize("Dismiss install prompt")}
          >
            <Close size={16} className="icon-anim-pop" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-brand-200 bg-brand-50 shadow-xs dark:border-brand-500/30 dark:bg-slate-900">
            <img
              src={iconSrc}
              alt={localize("Ouj Real Estate logo")}
              className="h-full w-full object-contain p-1"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-brand-700 dark:text-brand-200">{localize("Ouj Chat")}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onInstall}
          className="inline-flex h-8 items-center gap-2 rounded-full bg-brand-600 px-4 text-xs font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-500 hover:shadow-brand-500/40"
        >
          <Download size={14} className="icon-anim-drop" />{localize("Install")}</button>
      </div>
    </div>
  );
});

export default InstallBar;
