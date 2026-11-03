import { Moon, Sun } from "../../icons/lucide.js";
import { t, useLocale } from "../../i18n/locale.js";

export default function ThemeSwitcher({ isDark, onToggle }) {
  useLocale();
  if (!onToggle) return null;
  const Icon = isDark ? Sun : Moon;
  return <button type="button" onClick={onToggle} aria-label={t(isDark ? "Light mode" : "Dark mode")} title={t(isDark ? "Light mode" : "Dark mode")}
    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/65 text-slate-600 transition hover:border-brand-300 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-brand-300"><Icon size={16} /></button>;
}
