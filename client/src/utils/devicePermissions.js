export const PERMISSION_SETUP_EVENT = "ouj:permission-setup";
export const INSTALL_GUIDE_EVENT = "ouj:install-guide";
const SIGNUP_PENDING_KEY = "ouj-permissions-signup-pending";
const INSTALL_PENDING_KEY = "songbird-pwa-permissions-prompt";
const completedKey = (user) => `ouj-permissions-setup-v1:${user?.id || user?.username}`;

export function markSignupPermissionsPending(username) {
  try { sessionStorage.setItem(SIGNUP_PENDING_KEY, String(username).trim().toLowerCase()); } catch { /* Settings remain available. */ }
}
export function permissionSetupPending(user) {
  if (!user?.username) return false;
  try {
    const signup = sessionStorage.getItem(SIGNUP_PENDING_KEY) === String(user.username).toLowerCase();
    const installed = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone;
    return signup || localStorage.getItem(INSTALL_PENDING_KEY) === "pending" || (Boolean(installed) && localStorage.getItem(completedKey(user)) !== "done");
  } catch { return false; }
}
export function completePermissionSetup(user) {
  try {
    if (sessionStorage.getItem(SIGNUP_PENDING_KEY) === String(user.username).toLowerCase()) sessionStorage.removeItem(SIGNUP_PENDING_KEY);
    localStorage.setItem(completedKey(user), "done"); localStorage.setItem(INSTALL_PENDING_KEY, "done");
  } catch { /* User can reopen device setup from notification settings. */ }
}
export function notificationCapabilities() {
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const installed = Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone);
  return { ios, installed, requiresInstall: ios && !installed, badge: "setAppBadge" in navigator,
    secure: window.isSecureContext, media: Boolean(navigator.mediaDevices?.getUserMedia) };
}

export async function requestDeviceMediaPermission(kind) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(kind === "microphone" ? { audio: true } : { video: true, audio: false });
    return "granted";
  } finally { stream?.getTracks().forEach(track => track.stop()); }
}
