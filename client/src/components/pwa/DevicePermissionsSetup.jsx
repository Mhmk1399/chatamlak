import { useEffect, useState } from "react";
import ToolDialog from "../chat/tools/ToolDialog.jsx";
import { toolButton } from "../chat/tools/toolStyles.js";
import { Bell, Mic, Video, CheckCheck } from "../../icons/lucide.js";
import { notificationCapabilities, requestDeviceMediaPermission } from "../../utils/devicePermissions.js";
import { t, useLocale } from "../../i18n/locale.js";

export default function DevicePermissionsSetup({ onClose, onInstall, onEnableNotifications, onTestNotification,
  notificationsActive, notificationsDisabled, notificationStatusLabel, pushSubscribeStatus }) {
  useLocale();
  const capabilities = notificationCapabilities();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tested, setTested] = useState(false);
  const [media, setMedia] = useState({ microphone: "prompt", camera: "prompt" });
  useEffect(() => {
    let active = true;
    const statuses = [];
    for (const name of ["microphone", "camera"]) {
      navigator.permissions?.query({ name }).then(status => {
        if (!active) return;
        const update = () => { if (active) setMedia(previous => ({ ...previous, [name]: status.state })); };
        update(); status.addEventListener?.("change", update); statuses.push([status, update]);
      }).catch(() => {});
    }
    return () => { active = false; statuses.forEach(([status, update]) => status.removeEventListener?.("change", update)); };
  }, []);
  const run = async (kind, operation) => {
    if (busy) return;
    setBusy(kind); setError("");
    try {
      if (!await operation()) setError(t(pushSubscribeStatus === "no-key" ? "Push notifications are not configured on the server. Contact your administrator." : "Could not enable this feature. Check the browser permission and try again."));
    } catch (failure) {
      if (failure.name === "NotAllowedError") {
        if (["camera", "microphone"].includes(kind)) setMedia(previous => ({ ...previous, [kind]: "denied" }));
        setError(t("Permission is blocked. Change it in your browser or phone settings."));
      } else setError(t("The device is unavailable. Check it and try again."));
    } finally { setBusy(""); }
  };
  return <ToolDialog title="Set up your device" onClose={onClose} closeDisabled={!!busy}>
    <p className="mb-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{t("Choose the features you want. Your browser asks separately for each permission.")}</p>
    <div className="space-y-3">
      <section className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell size={19} className="text-brand-600 dark:text-brand-300" />{t("Message notifications")}</h3>
        <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">{t("Receive message alerts even when Ouj Chat is closed. Delivery depends on your phone and notification settings.")}</p>
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">{t(capabilities.badge ? "The app icon shows unread messages where your phone supports badges." : "Your phone may show a notification dot instead of a number on the app icon.")}</p>
        {capabilities.requiresInstall && <p role="status" className="text-xs leading-6 text-brand-700 dark:text-brand-200">{t("On iPhone or iPad, add Ouj Chat to the Home Screen, open it there, then enable notifications. Requires iOS 16.4 or later.")}</p>}
        {notificationStatusLabel && <p className="text-xs text-slate-600 dark:text-slate-300">{notificationStatusLabel}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={toolButton} disabled={!!busy || notificationsDisabled || notificationsActive || capabilities.requiresInstall || !capabilities.secure}
            onClick={() => run("notifications", onEnableNotifications)}>{t(busy === "notifications" ? "Enabling…" : notificationsActive ? "Notifications enabled" : "Enable notifications")}</button>
          {notificationsActive && <button type="button" className={toolButton} disabled={!!busy} onClick={() => run("test", async () => {
            const result = await onTestNotification(); setTested(result); return result;
          })}>{t("Send test notification")}</button>}
          {!capabilities.installed && <button type="button" className={toolButton} disabled={!!busy} onClick={onInstall}>{t("Install app")}</button>}
        </div>
        {tested && <p role="status" className="text-xs text-accent-700 dark:text-accent-300">{t("Test notification sent. Check your phone's notifications.")}</p>}
      </section>
      {[["microphone", Mic, "Microphone", "For voice messages and calls you start.", "Allow microphone"], ["camera", Video, "Camera", "For video messages and video calls you start.", "Allow camera"]].map(([kind, Icon, label, description, action]) =>
        <section key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="min-w-0 flex-1"><h3 className="flex items-center gap-2 text-sm font-semibold"><Icon size={18} className="text-brand-600 dark:text-brand-300" />{t(label)}</h3>
            <p className="mt-2 text-xs leading-6 text-slate-600 dark:text-slate-300">{t(description)}</p>
            {media[kind] === "denied" && <p className="text-xs text-rose-600 dark:text-rose-300">{t("Blocked in browser settings.")}</p>}
            {!capabilities.media && <p className="text-xs text-slate-500">{t("Not supported in this browser.")}</p>}
          </div>
          <button type="button" className={toolButton} disabled={!!busy || !capabilities.media || !capabilities.secure || media[kind] === "granted" || media[kind] === "denied"}
            onClick={() => run(kind, async () => { await requestDeviceMediaPermission(kind); setMedia(previous => ({ ...previous, [kind]: "granted" })); return true; })}>
            {media[kind] === "granted" && <CheckCheck size={14} />}{t(busy === kind ? "Requesting…" : media[kind] === "granted" ? "Allowed" : action)}</button>
        </section>)}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    <p className="mt-4 text-xs leading-6 text-slate-500 dark:text-slate-400">{t("Camera and microphone checks stop immediately. You control when recording starts. You can change these choices in notification settings.")}</p>
    <div className="mt-4 flex justify-end"><button type="button" className={toolButton} disabled={!!busy} onClick={onClose}>{t("Continue to chat")}</button></div>
  </ToolDialog>;
}
