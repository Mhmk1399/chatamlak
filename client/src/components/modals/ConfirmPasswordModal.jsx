import { tError as localizeError } from "../../i18n/locale.js";
import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Close, Eye, EyeOff } from "../../icons/lucide.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

export default function ConfirmPasswordModal({
  open,
  title,
  description,
  confirmLabel = "Continue",
  deleteLabel = "Delete",
  onClose,
  onConfirm,
}) {
  useAppLocale();
  const [step, setStep] = useState("confirm");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      setPassword("");
      setShowPassword(false);
      setError("");
      setLoading(false);
    }
  }, [open]);

  const canSubmit = useMemo(
    () => Boolean(password.trim()) && !loading,
    [password, loading],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-320 flex items-center justify-center bg-black/40 px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-password-modal-title"
        className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between">
          <h3 id="confirm-password-modal-title" className="text-lg font-semibold text-rose-600 dark:text-rose-300">
            {localize(title)}
          </h3>
          <button
            type="button"
            onClick={() => {
              if (!loading) onClose?.();
            }}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {localize(description)}
        </p>

        {step === "confirm" ? (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="rounded-full border border-brand-200 bg-white px-4 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:shadow-[0_0_14px_rgba(102,48,141,0.2)] dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200"
            >{localize("Cancel")}</button>
            <button
              type="button"
              onClick={() => setStep("password")}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
            >
              {localize(confirmLabel)}
            </button>
          </div>
        ) : null}

        {step === "password" ? (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{localize("Password")}</span>
              <div className="relative mt-2">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={showPassword ? "12345678" : "********"}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 pr-20 text-base text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-brand-700 transition hover:bg-brand-100 hover:shadow-[0_0_18px_rgba(102,48,141,0.22)] dark:text-brand-200 dark:hover:bg-brand-500/10"
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

            {error ? (
              <p className="text-xs text-rose-600 dark:text-rose-200">
                {localizeError(error)}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="rounded-full border border-brand-200 bg-white px-4 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:shadow-[0_0_14px_rgba(102,48,141,0.2)] dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200"
                disabled={loading}
              >{localize("Cancel")}</button>
              <button
                type="button"
                onClick={async () => {
                  if (!canSubmit) return;
                  setLoading(true);
                  setError("");
                  try {
                    await onConfirm?.(password);
                    setLoading(false);
                    onClose?.();
                  } catch (err) {
                    setError(String(err?.message || "Unable to delete."));
                    setLoading(false);
                    return;
                  }
                }}
                disabled={!canSubmit}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
              >
                {loading ? localize("Deleting...") : deleteLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
