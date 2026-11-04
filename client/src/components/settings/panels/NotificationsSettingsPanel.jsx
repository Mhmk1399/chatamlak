import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { Bell, BellOff, MessageCircleMore, MessageCircleX } from "../../../icons/lucide.js";
import { PERMISSION_SETUP_EVENT } from "../../../utils/devicePermissions.js";

export function NotificationsSettingsPanel({
  notificationsActive,
  notificationsDisabled,
  notificationStatusLabel,
  onToggleNotifications,
  messagePreviewEnabled,
  onToggleMessagePreview,
  debugLine = "",
}) {
  useAppLocale();
  const buttonBase =
    "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-start text-sm font-semibold transition";
  const buttonHover =
    "hover:border-brand-300 hover:bg-brand-50 hover:shadow-[0_0_18px_rgba(102,48,141,0.18)] dark:hover:bg-brand-500/10";
  const buttonTheme =
    "border-brand-200/70 bg-white/90 text-brand-700 dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-brand-200";
  const disabledTheme =
    "cursor-not-allowed opacity-60 hover:bg-transparent hover:shadow-none";
  const showDebug =
    typeof window !== "undefined" &&
    window.localStorage?.getItem("sb-debug-push") === "1";

  const previewDisabled = notificationsDisabled || !notificationsActive;

  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new Event(PERMISSION_SETUP_EVENT))}
        className="mb-3 min-h-11 rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 dark:border-brand-500/30 dark:text-brand-200">{localize("Set up device permissions")}</button>
      <button
        type="button"
        onClick={onToggleNotifications}
        disabled={notificationsDisabled}
        role="switch"
        aria-checked={notificationsActive}
        className={`${buttonBase} ${buttonTheme} ${buttonHover} ${
          notificationsDisabled ? disabledTheme : ""
        }`}
      >
        <span className="flex items-center gap-3">
          {notificationsActive ? (
            <Bell size={18} className="icon-anim-sway" />
          ) : (
            <BellOff size={18} className="icon-anim-sway" />
          )}{localize("Show notifications")}</span>
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
            notificationsActive
              ? "bg-brand-600 justify-end"
              : "bg-slate-300 dark:bg-slate-700 justify-start"
          }`}
        >
          <span className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" />
        </span>
      </button>
      {notificationsDisabled ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {notificationStatusLabel}
        </p>
      ) : null}
      {showDebug && debugLine ? (
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {debugLine}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onToggleMessagePreview}
        disabled={previewDisabled}
        role="switch"
        aria-checked={messagePreviewEnabled}
        className={`mt-3 ${buttonBase} ${buttonTheme} ${buttonHover} ${
          previewDisabled ? disabledTheme : ""
        }`}
      >
        <span className="flex items-center gap-3">
          {messagePreviewEnabled ? (
            <MessageCircleMore size={18} className="icon-anim-sway" />
          ) : (
            <MessageCircleX size={18} className="icon-anim-sway" />
          )}{localize("Message preview")}</span>
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
            messagePreviewEnabled
              ? "bg-brand-600 justify-end"
              : "bg-slate-300 dark:bg-slate-700 justify-start"
          }`}
        >
          <span className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" />
        </span>
      </button>
    </>
  );
}
