import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { Moon, Sun } from "../../icons/lucide.js";

export default function AuthHeader({
  isLogin,
  isDark,
  themeToggleAnimating,
  onToggleTheme,
  title,
  subtitle,
}) {
  useAppLocale();
  return (
    <div className="relative text-center">
      <p className="text-xs font-medium text-accent-700 dark:text-accent-300">
        {localize(subtitle || "Ouj Real Estate team workspace")}
      </p>
      <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">
        {localize(title || (isLogin ? "Welcome to Ouj" : "Join the Ouj team"))}
      </h1>
      <button
        type="button"
        onClick={onToggleTheme}
        className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-brand-200 bg-white/80 text-brand-700 transition dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200 sm:h-10 sm:w-10"
        aria-label={localize("Toggle dark mode")}
      >
        {isDark ? (
          <Sun
            key="theme-sun"
            size={18}
            className={`icon-anim-spin-dir ${themeToggleAnimating ? "icon-theme-enter-sun" : ""}`}
          />
        ) : (
          <Moon
            key="theme-moon"
            size={18}
            className={`icon-anim-spin-left ${themeToggleAnimating ? "icon-theme-enter-moon" : ""}`}
          />
        )}
      </button>
    </div>
  );
}
