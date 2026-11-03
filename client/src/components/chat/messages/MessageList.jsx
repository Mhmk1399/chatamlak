import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { MessageTimeline } from "./MessageTimeline.jsx";

export function OfflineHistoryBanner({ isOffline, hasOlderMessages, loadingOlderMessages }) {
  useAppLocale();
  if (!isOffline || hasOlderMessages || loadingOlderMessages) return null;
  return (
    <div
      className="flex justify-center px-3 pb-3 pt-1 text-center md:px-0"
      data-testid="offline-history-banner"
    >
      <div className="inline-flex w-max items-center justify-center rounded-full border border-brand-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-brand-700 shadow-xs dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200">
        <span className="leading-none">{localize("Reached top of cached history — connect to load older messages")}</span>
      </div>
    </div>
  );
}

export function MessageList(props) {
  return <MessageTimeline {...props} />;
}
