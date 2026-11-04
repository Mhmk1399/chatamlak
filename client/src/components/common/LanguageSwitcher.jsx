import { setLocale, t, useLocale } from "../../i18n/locale.js";

export default function LanguageSwitcher({ compact = false }) {
  const locale = useLocale();
  return (
    <button
      type="button"
      aria-label={t("Language")}
      title={t("Change language")}
      onClick={() => setLocale(locale === "fa" ? "en" : "fa")}
      className="  min-h-9  items-center justify-center rounded-full border border-slate-200 bg-white/65 px-3 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-brand-500/10"
    >
      <span lang={locale === "fa" ? "en" : "fa"}>
        {compact
          ? locale === "fa"
            ? "EN"
            : "فا"
          : locale === "fa"
            ? t("English")
            : "فارسی"}
      </span>
    </button>
  );
}
