import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { Close } from "../../icons/lucide.js";

export default function InstallGuideModal({
  open,
  onClose,
  iconSrc = "/icons/icon-192.png",
  isDesktop = false,
}) {
  useAppLocale();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-6 shadow-2xl dark:border-brand-500/30 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-brand-700 dark:text-brand-200">{localize("Install Ouj Chat")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label={localize("Close install instructions")}
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-3">
            <span className="relative -top-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v12" />
                <path d="M8 7l4-4 4 4" />
                <rect x="5" y="11" width="14" height="10" rx="2" />
              </svg>
            </span>
            <span>
              {isDesktop
                ? localize("Open the browser menu.")
                : localize("Tap the Share button.")}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <span className="relative -top-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="5" width="14" height="14" rx="2" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            </span>
            <span>
              {isDesktop
                ? localize("Choose \"Install app\".")
                : localize("Select \"Add to Home Screen\".")}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <span className="relative -top-0.5 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              <img
                src={iconSrc}
                alt=""
                className="h-full w-full scale-110 object-cover"
              />
            </span>
            <span>{localize("Open Ouj Chat from your home screen.")}</span>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-500 hover:shadow-brand-500/40"
          >{localize("Done")}</button>
        </div>
      </div>
    </div>
  );
}
