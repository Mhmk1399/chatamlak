import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { LoaderCircle } from "../../icons/lucide.js";

export default function AuthOverlay({ isLogin, show }) {
  useAppLocale();
  if (!show || !isLogin) return null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/85 backdrop-blur-xs dark:bg-slate-950/85">
      <LoaderCircle className="h-12 w-12 animate-spin text-brand-500" />
      <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">{localize("Signing in...")}</p>
    </div>
  );
}
