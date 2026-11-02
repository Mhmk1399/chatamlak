import { AlertCircle } from "../../../icons/lucide.js";
import { t, useLocale } from "../../../i18n/locale.js";

export function InlineError({ message }) {
  useLocale();
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
      <AlertCircle size={14} className="shrink-0 self-center" />
      <span>{t(message)}</span>
    </p>
  );
}
