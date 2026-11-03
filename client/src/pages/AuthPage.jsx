import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AuthFooter from "../components/auth/AuthFooter.jsx";
import AuthFormFields from "../components/auth/AuthFormFields.jsx";
import AuthHeader from "../components/auth/AuthHeader.jsx";
import AuthOverlay from "../components/auth/AuthOverlay.jsx";
import AuthStatusBanner from "../components/auth/AuthStatusBanner.jsx";
import { t, useLocale } from "../i18n/locale.js";
import { ArrowUpLeft, Files, MessageSquare, ShieldCheck } from "../icons/lucide.js";

export default function AuthPage({
  mode,
  isDark,
  onToggleTheme,
  onSubmit,
  onSwitchMode,
  status,
  loading,
  showSigningOverlay = false,
  allowSignup = true,
  title,
  subtitle,
  children,
}) {
  useLocale();
  const isLogin = mode === "login";
  const canSignup = Boolean(allowSignup);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [themeToggleAnimating, setThemeToggleAnimating] = useState(false);
  const [nicknameLength, setNicknameLength] = useState(0);
  const [usernameLength, setUsernameLength] = useState(0);
  const themeAnimTimeoutRef = useRef(null);
  const cardRef = useRef(null);
  const [fitsViewport, setFitsViewport] = useState(true);

  useEffect(() => {
    return () => {
      if (themeAnimTimeoutRef.current) {
        clearTimeout(themeAnimTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node || typeof window === "undefined") return;

    const measure = () => {
      const parentHeight = Number(node.parentElement?.clientHeight || 0);
      const viewportHeight = Number(window.visualViewport?.height || window.innerHeight || 0);
      const availableHeight = parentHeight || viewportHeight;
      const cardHeight = Math.ceil(node.getBoundingClientRect().height);
      setFitsViewport(cardHeight <= Math.max(availableHeight - 8, 0));
    };

    measure();
    const rafId = window.requestAnimationFrame(measure);
    const timeoutId = window.setTimeout(measure, 120);
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => measure())
        : null;
    observer?.observe(node);
    if (node.parentElement) {
      observer?.observe(node.parentElement);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [isLogin, canSignup, loading, showConfirmPassword, showPassword, status]);

  const handleToggleTheme = () => {
    setThemeToggleAnimating(true);
    if (themeAnimTimeoutRef.current) {
      clearTimeout(themeAnimTimeoutRef.current);
    }
    onToggleTheme();
    themeAnimTimeoutRef.current = setTimeout(() => {
      setThemeToggleAnimating(false);
    }, 520);
  };

  return (
    <div className="ouj-auth-layout">
      <aside className="ouj-auth-story hidden lg:block">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-200/70 bg-accent-50/70 px-3 py-1.5 text-xs font-medium text-accent-800 dark:border-accent-500/20 dark:bg-accent-500/10 dark:text-accent-300"><span className="h-1.5 w-1.5 rounded-full bg-accent-500" />{t("Built for the Ouj team")}</div>
        <h2 className="font-bold text-slate-900 dark:text-slate-100">{t("A closer team.")}<br /><span className="text-brand-600 dark:text-brand-300">{t("A clearer path forward.")}</span></h2>
        <p className="mt-5 max-w-md text-sm leading-8 text-slate-500 dark:text-slate-400">{t("One calm workspace for consultants, supervisors and managers to share reports, property files and everyday conversations.")}</p>
        <div className="mt-8 flex flex-wrap gap-3">{[[MessageSquare, "Daily reports"], [Files, "Property files"], [ShieldCheck, "Team coordination"]].map(([Icon, label]) => <div key={label} className="ouj-glass flex items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-medium text-slate-600 dark:text-slate-300"><Icon size={16} className="text-brand-500 dark:text-brand-300" /><span>{t(label)}</span></div>)}</div>
        <a href="https://oujamlak.ir/" target="_blank" rel="noreferrer" className="mt-10 inline-flex min-h-10 items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-300">{t("Visit Ouj Real Estate")}<ArrowUpLeft size={15} className="ouj-directional" /></a>
      </aside>
    <section
      ref={cardRef}
      className={`ouj-auth-card ouj-glass relative w-full max-w-md border p-6 sm:p-9 ${
        fitsViewport ? "my-auto self-center" : "my-0 self-start"
      }`}
    >
      <AuthHeader
        isLogin={isLogin}
        isDark={isDark}
        themeToggleAnimating={themeToggleAnimating}
        onToggleTheme={handleToggleTheme}
        title={t(title)}
        subtitle={subtitle}
      />

      {children ? (
        children
      ) : (
        <AuthFormFields
          isLogin={isLogin}
          canSignup={canSignup}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          showConfirmPassword={showConfirmPassword}
          setShowConfirmPassword={setShowConfirmPassword}
          nicknameLength={nicknameLength}
          setNicknameLength={setNicknameLength}
          usernameLength={usernameLength}
          setUsernameLength={setUsernameLength}
          loading={loading}
          onSubmit={onSubmit}
          onReset={() => {
            setNicknameLength(0);
            setUsernameLength(0);
          }}
        />
      )}

      <AuthStatusBanner status={status} />

      {!children && (
        <AuthFooter
          isLogin={isLogin}
          canSignup={canSignup}
          onSwitchMode={onSwitchMode}
        />
      )}

      <AuthOverlay isLogin={isLogin} show={showSigningOverlay} />
    </section>
    </div>
  );
}


