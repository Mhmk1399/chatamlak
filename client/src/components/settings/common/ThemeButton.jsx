import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "../../../icons/lucide.js";

export function ThemeButton({ isDark, toggleTheme, setIsDark, thick = false }) {
  useAppLocale();
  const [themeToggleAnimating, setThemeToggleAnimating] = useState(false);
  const themeAnimTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (themeAnimTimeoutRef.current) {
        clearTimeout(themeAnimTimeoutRef.current);
      }
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        setThemeToggleAnimating(true);
        if (themeAnimTimeoutRef.current) {
          clearTimeout(themeAnimTimeoutRef.current);
        }
        if (toggleTheme) {
          toggleTheme();
        } else {
          setIsDark((prev) => !prev);
        }
        themeAnimTimeoutRef.current = setTimeout(() => {
          setThemeToggleAnimating(false);
        }, 520);
      }}
      className={`flex w-full items-center gap-2 rounded-xl px-3 text-start text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 dark:text-slate-100 dark:hover:bg-brand-500/10 dark:hover:text-brand-200 ${
        thick ? "py-3 text-base font-medium" : "py-2.5 text-sm font-semibold"
      }`}
    >
      {isDark ? (
        <Sun
          key="theme-sun"
          size={18}
          className={`shrink-0 text-brand-500 icon-anim-spin-dir ${themeToggleAnimating ? "icon-theme-enter-sun" : ""}`}
        />
      ) : (
        <Moon
          key="theme-moon"
          size={18}
          className={`shrink-0 text-brand-500 icon-anim-spin-left ${themeToggleAnimating ? "icon-theme-enter-moon" : ""}`}
        />
      )}
      {isDark ? localize("Light mode") : localize("Dark mode")}
    </button>
  );
}
