import { t, useLocale } from "../../i18n/locale.js";

export default function BrandIdentity({ compact = false }) {
  useLocale();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
    
      <div className="min-w-0 text-start">
        <p
          className={`${compact ? "text-sm" : "text-lg"} truncate font-bold text-slate-800 dark:text-slate-100`}
        >
          {t("Ouj Chat")}
        </p>
        {!compact && (
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t("Ouj Real Estate team workspace")}
          </p>
        )}
      </div>
    </div>
  );
}
