import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { USERNAME_INPUT_PATTERN, useNameLimits } from "../../utils/nameLimits.js";

export default function AuthFormFields({
  isLogin,
  canSignup,
  showPassword,
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  nicknameLength,
  setNicknameLength,
  usernameLength,
  setUsernameLength,
  loading,
  onSubmit,
  onReset,
}) {
  useAppLocale();
  const { nicknameMax: NICKNAME_MAX, usernameMax: USERNAME_MAX } = useNameLimits();
  const [nicknameHasPersian, setNicknameHasPersian] = useState(false);
  const [usernameHasPersian, setUsernameHasPersian] = useState(false);
  return (
    <form noValidate
      className="mt-4 space-y-3 sm:mt-6 sm:space-y-4"
      onSubmit={onSubmit}
      onReset={(event) => {
        setNicknameHasPersian(false);
        setUsernameHasPersian(false);
        onReset?.(event);
      }}
    >
      {!isLogin && canSignup ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">{localize("Nickname")}</span>
          <div className="relative mt-1 sm:mt-2">
            <input
              name="nickname"
              type="text"
              required
              placeholder={localize("Your full name")}
              maxLength={NICKNAME_MAX}
              onInput={(event) => {
                const value = String(event.currentTarget.value || "");
                setNicknameLength(value.length);
                setNicknameHasPersian(hasPersian(value));
              }}
              lang={nicknameHasPersian ? "fa" : "en"}
              dir={nicknameHasPersian ? "rtl" : "ltr"}
              className={`w-full rounded-2xl border border-brand-200 bg-white py-2 text-xs text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-950 dark:text-slate-100 sm:py-3 sm:text-sm ${
                nicknameHasPersian
                  ? "pl-3 pr-14 sm:pl-4 sm:pr-16"
                  : "pl-3 pr-14 sm:pl-4 sm:pr-16"
              } ${
                nicknameHasPersian ? "font-fa text-end" : "text-start"
              }`}
              style={{ unicodeBidi: "plaintext" }}
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-slate-500 sm:text-[11px]"
            >
              {nicknameLength}/{NICKNAME_MAX}
            </span>
          </div>
        </label>
      ) : null}

      <label className="block">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">{localize("Username")}</span>
        <div className="relative mt-1 sm:mt-2">
          <input
            name="username"
            type="text"
            required
            pattern={USERNAME_INPUT_PATTERN}
            title={localize("Use english letters, numbers, dot (.), and underscore (_).")}
            autoCapitalize="none"
            placeholder={"ali.ahmadi"}
            maxLength={USERNAME_MAX}
            onInput={(event) => {
              const value = String(event.currentTarget.value || "");
              setUsernameLength(value.length);
              setUsernameHasPersian(hasPersian(value));
            }}
            lang={usernameHasPersian ? "fa" : "en"}
            dir={usernameHasPersian ? "rtl" : "ltr"}
            className={`w-full rounded-2xl border border-brand-200 bg-white py-2 text-xs text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-950 dark:text-slate-100 sm:py-3 sm:text-sm ${
              usernameHasPersian
                ? "pl-3 pr-14 sm:pl-4 sm:pr-16"
                : "pl-3 pr-14 sm:pl-4 sm:pr-16"
            } ${
              usernameHasPersian ? "font-fa text-end" : "text-start"
            }`}
            style={{ unicodeBidi: "plaintext" }}
          />
          {!isLogin && canSignup ? (
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-slate-500 sm:text-[11px]"
            >
              {usernameLength}/{USERNAME_MAX}
            </span>
          ) : null}
        </div>
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">{localize("Password")}</span>
        <div className="relative mt-1 sm:mt-2">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={isLogin ? undefined : 6}
            placeholder={showPassword ? "12345678" : "********"}
            className="w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-950 dark:text-slate-100 sm:px-4 sm:py-3 sm:pr-20 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-brand-700 transition hover:bg-brand-100 hover:shadow-[0_0_18px_rgba(102,48,141,0.22)] dark:text-brand-200 dark:hover:bg-brand-500/10 sm:h-9 sm:w-9"
            aria-label={showPassword ? localize("Hide password") : localize("Show password")}
          >
            {showPassword ? (
              <EyeOff size={16} className="icon-anim-peek" />
            ) : (
              <Eye size={16} className="icon-anim-peek" />
            )}
          </button>
        </div>
      </label>

      {!isLogin && canSignup ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">{localize("Confirm password")}</span>
          <div className="relative mt-1 sm:mt-2">
            <input
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              required
              minLength={6}
              placeholder={showConfirmPassword ? "12345678" : "********"}
              className="w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-950 dark:text-slate-100 sm:px-4 sm:py-3 sm:pr-20 sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-brand-700 transition hover:bg-brand-100 hover:shadow-[0_0_18px_rgba(102,48,141,0.22)] dark:text-brand-200 dark:hover:bg-brand-500/10 sm:h-9 sm:w-9"
              aria-label={
                showConfirmPassword
                  ? localize("Hide confirm password")
                  : localize("Show confirm password")
              }
            >
              {showConfirmPassword ? (
                <EyeOff size={16} className="icon-anim-peek" />
              ) : (
                <Eye size={16} className="icon-anim-peek" />
              )}
            </button>
          </div>
        </label>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-500 hover:shadow-[0_0_20px_rgba(102,48,141,0.4)] disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:py-3 sm:text-sm"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {isLogin ? localize("Sign in") : localize("Create account")}
      </button>
    </form>
  );
}
