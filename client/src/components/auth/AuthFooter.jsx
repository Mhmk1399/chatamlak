import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
export default function AuthFooter({ isLogin, canSignup, onSwitchMode }) {
  useAppLocale();
  if (!canSignup) return null;
  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-brand-100/70 bg-brand-50/70 p-3 text-xs text-brand-700 dark:border-brand-500/20 dark:bg-brand-900/40 dark:text-brand-200 sm:mt-6 sm:space-y-3 sm:p-4 sm:text-sm">
      <p className="font-semibold">
        {isLogin ? localize("Don't have an account?") : localize("Already have an account?")}
      </p>
      <button
        type="button"
        onClick={onSwitchMode}
        className="mt-2 w-full rounded-2xl border border-brand-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:border-brand-400 hover:shadow-[0_0_18px_rgba(102,48,141,0.24)] dark:border-brand-500/40 dark:bg-slate-900/60 dark:text-brand-200 sm:px-4 sm:py-2 sm:text-sm"
      >
        {isLogin ? localize("Create new account") : localize("Back to sign in")}
      </button>
    </div>
  );
}
