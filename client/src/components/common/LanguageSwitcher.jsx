import { Languages } from "../../icons/lucide.js";
import { setLocale, t, useLocale } from "../../i18n/locale.js";

export default function LanguageSwitcher({ compact = false }) {
  const locale = useLocale();
  return <button type="button" aria-label={t("Language")} title={t("Change language")}
    onClick={() => setLocale(locale === "fa" ? "en" : "fa")}
    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/65 px-3 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-brand-500/10">
    <Languages size={15} aria-hidden="true" />
    <span lang={locale === "fa" ? "en" : "fa"}>{compact ? locale === "fa" ? "EN" : "فا" : locale === "fa" ? t("English") : "فارسی"}</span>
  </button>;
}
