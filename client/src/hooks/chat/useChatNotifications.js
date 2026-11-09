import { useCallback, useEffect, useRef, useState } from "react";
import { t, tError, useLocale } from "../../i18n/locale.js";
import { NOTIFICATIONS_ENABLED_KEY, NOTIFICATION_MESSAGE_PREVIEW_KEY } from "../../utils/chatPageConstants.js";

const PUSH_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PUSH_RESUBSCRIBE_DEBOUNCE_MS = 2 * 60 * 1000;
const PUSH_SUB_CREATED_KEY = "ouj-push-sub-ts";

const toBase64 = (value) =>
  String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = toBase64(base64String) + padding;
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const getVapidKeyLength = (key) => {
  try {
    const arr = urlBase64ToUint8Array(String(key || ""));
    return arr?.length || 0;
  } catch {
    return 0;
  }
};

export function useChatNotifications({
  user,
  settingsPanel,
  fetchPushPublicKey,
  subscribePush,
  unsubscribePush,
  sendPushTest,
}) {
  const locale = useLocale();
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const [pushSwReady, setPushSwReady] = useState(false);
  const [pushVapidReady, setPushVapidReady] = useState(null);
  const [pushVapidLength, setPushVapidLength] = useState(null);
  const [pushSubscribeStatus, setPushSubscribeStatus] = useState(null);
  const [pushSubscribeError, setPushSubscribeError] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    return stored === "0" ? false : true;
  });
  const [messagePreviewEnabled, setMessagePreviewEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(NOTIFICATION_MESSAGE_PREVIEW_KEY);
    return stored === "0" ? false : true;
  });
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  });
  const getCurrentPermission = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  }, []);

  const uaString =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isStandaloneDisplay =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone);
  const isSecureContext =
    typeof window !== "undefined" && Boolean(window.isSecureContext);
  const hasNotificationApi =
    typeof window !== "undefined" && "Notification" in window;
  const isIOS = /iPhone|iPad|iPod/i.test(uaString) || (/Macintosh/i.test(uaString) && navigator.maxTouchPoints > 1);
  const mobileRequiresStandalone = isIOS && !isStandaloneDisplay;
  const notificationsSupported =
    hasNotificationApi && isSecureContext && !mobileRequiresStandalone && "serviceWorker" in navigator && "PushManager" in window;
  const notificationsAllowed = notificationPermission === "granted";
  const notificationsActive = notificationsEnabled && notificationsAllowed && pushSubscribeStatus === "ok";
  const notificationStatusLabel = t(!isSecureContext
    ? "Connection is not secure."
    : mobileRequiresStandalone
      ? "Require Home screen installation."
      : !hasNotificationApi
        ? "Not supported in this browser."
        : notificationPermission === "denied"
          ? "Blocked in browser settings."
          : !notificationsSupported ? "Not supported in this browser." : "");
  const notificationsDisabled = Boolean(notificationStatusLabel);
  const notificationsDebugLine = `secure:${isSecureContext ? "yes" : "no"} | support:${
    notificationsSupported ? "yes" : "no"
  } | perm:${notificationPermission} | sw:${pushSwReady ? "ready" : "no"} | vapid:${
    pushVapidReady === null ? "..." : pushVapidReady ? "ok" : "missing"
  }${pushVapidLength ? "(" + pushVapidLength + ")" : ""} | sub:${
    pushSubscribeStatus || "..."
  }${pushSubscribeError ? " | err:" + pushSubscribeError : ""}`;

  const pushRegistrationRef = useRef(null);
  const lastPushRefreshRef = useRef(0);
  const subscriptionTask = useRef(null);

  const persistNotificationsEnabled = useCallback((value) => {
    setNotificationsEnabled(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, value ? "1" : "0");
    }
  }, []);

  const persistMessagePreviewEnabled = useCallback((value) => {
    setMessagePreviewEnabled(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NOTIFICATION_MESSAGE_PREVIEW_KEY, value ? "1" : "0");
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!notificationsSupported) return;
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      return result;
    } catch {
      return getCurrentPermission();
      // ignore
    }
  }, [getCurrentPermission, notificationsSupported]);

  const performPushSubscription = useCallback(async ({ messagePreview } = {}) => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      setPushSubscribeStatus("no-sw");
      return null;
    }
    if (!notificationsSupported) {
      setPushSubscribeStatus("unsupported");
      return null;
    }
    const permission = getCurrentPermission();
    if (permission !== notificationPermission) {
      setNotificationPermission(permission);
    }
    if (permission !== "granted") {
      setPushSubscribeStatus("no-perm");
      return null;
    }
    if (!user?.username) {
      setPushSubscribeStatus("no-user");
      return null;
    }

    const effectiveMessagePreview =
      messagePreview !== undefined ? messagePreview : messagePreviewEnabled;
    const shouldRetryAfterError = (error) => {
      const message = String(error?.message || error || "").toLowerCase();
      if (!message) return false;
      return (
        message.includes("push service error") ||
        message.includes("invalidstate") ||
        message.includes("invalid state") ||
        message.includes("registration failed")
      );
    };
    const cleanupExistingSubscription = async (reg) => {
      try {
        const existing = await reg.pushManager.getSubscription();
        if (!existing) return;
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        if (endpoint) {
          await unsubscribePush({ username: user?.username, endpoint });
        }
      } catch {
        // ignore cleanup failures
      }
    };
    const subscribeWithRetry = async (reg, applicationServerKey) => {
      const freshSubscribe = async () => {
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        window.localStorage.setItem(PUSH_SUB_CREATED_KEY, String(Date.now()));
        return subscription;
      };
      try {
        const existing = await reg.pushManager.getSubscription();
        const existingKey = existing?.options?.applicationServerKey;
        const wrongKey = existingKey && String(new Uint8Array(existingKey)) !== String(applicationServerKey);
        const expired = existing?.expirationTime && existing.expirationTime <= Date.now();
        if (existing && (wrongKey || expired)) {
          await cleanupExistingSubscription(reg);
          return freshSubscribe();
        }
        if (!existing) {
          return freshSubscribe();
        }
        return existing;
      } catch (error) {
        if (!shouldRetryAfterError(error)) throw error;
        await cleanupExistingSubscription(reg);
        return freshSubscribe();
      }
    };
    try {
      setPushSubscribeStatus(current => current === "ok" ? current : "...");
      setPushSubscribeError("");
      const reg =
        pushRegistrationRef.current || (await navigator.serviceWorker.ready);
      if (!reg?.pushManager) {
        setPushSubscribeStatus("no-push");
        return null;
      }
      const keyRes = await fetchPushPublicKey();
      const keyData = await keyRes.json();
      if (!keyRes.ok || !keyData?.publicKey) {
        setPushSubscribeStatus("no-key");
        return null;
      }
      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      setPushVapidLength(getVapidKeyLength(keyData.publicKey));
      if (!applicationServerKey || applicationServerKey.length !== 65) {
        setPushSubscribeStatus("bad-key");
        return null;
      }
      const subscription = await subscribeWithRetry(reg, applicationServerKey);
      if (!subscription) {
        setPushSubscribeStatus("no-sub");
        return null;
      }
      const json = subscription.toJSON();
      const res = await subscribePush({
        username: user?.username,
        subscription: json,
        messagePreview: effectiveMessagePreview, locale,
      });
      if (!res.ok) {
        setPushSubscribeStatus("err");
        setPushSubscribeError(String(res.status || "err"));
        return null;
      }
      setPushSubscribeStatus("ok");
      return subscription;
    } catch (err) {
      setPushSubscribeStatus("err");
      const message = String(err?.message || err || "subscribe failed");
      setPushSubscribeError(message);
      return null;
    }
  }, [
    fetchPushPublicKey,
    locale,
    getCurrentPermission,
    messagePreviewEnabled,
    notificationPermission,
    notificationsSupported,
    subscribePush,
    unsubscribePush,
    user,
  ]);

  const ensurePushSubscription = useCallback((options = {}) => {
    const key = `${user?.id}:${locale}:${options.messagePreview ?? messagePreviewEnabled}`;
    const run = () => {
      const pending = subscriptionTask.current;
      if (pending) return pending.key === key ? pending.promise : pending.promise.catch(() => {}).then(run);
      const task = { key };
      task.promise = performPushSubscription(options).finally(() => { if (subscriptionTask.current === task) subscriptionTask.current = null; });
      subscriptionTask.current = task;
      return task.promise;
    };
    return run();
  }, [performPushSubscription, user?.id, locale, messagePreviewEnabled]);

  const maybeRefreshPushSubscription = useCallback(
    async (reason = "resume") => {
      if (typeof window === "undefined") return;
      if (!notificationsSupported) return;
      if (notificationPermission !== "granted") return;
      if (!notificationsEnabled) return;
      const now = Date.now();
      const minInterval =
        reason === "interval"
          ? PUSH_REFRESH_INTERVAL_MS
          : PUSH_RESUBSCRIBE_DEBOUNCE_MS;
      if (now - lastPushRefreshRef.current < minInterval) return;
      lastPushRefreshRef.current = now;
      await ensurePushSubscription();
    },
    [
      ensurePushSubscription,
      notificationPermission,
      notificationsEnabled,
      notificationsSupported,
    ],
  );

  const removePushSubscription = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = pushRegistrationRef.current || await navigator.serviceWorker.getRegistration?.();
      if (!reg?.pushManager) return;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (endpoint) {
        await unsubscribePush({ username: user?.username, endpoint });
      }
    } catch {
      // ignore
    }
  }, [unsubscribePush, user]);

  const handleToggleNotifications = useCallback(async () => {
    if (!notificationsSupported) return;
    if (notificationPermission === "denied") {
      persistNotificationsEnabled(false);
      return;
    }
    if (notificationsActive) {
      persistNotificationsEnabled(false);
      await removePushSubscription();
      return;
    }
    if (!notificationsEnabled) {
      persistNotificationsEnabled(true);
    }
    let permission = notificationPermission;
    if (permission !== "granted") {
      permission = await requestNotificationPermission();
    }
    if (permission !== "granted") return;
    await ensurePushSubscription();
  }, [
    ensurePushSubscription,
    notificationPermission,
    notificationsActive,
    notificationsEnabled,
    notificationsSupported,
    persistNotificationsEnabled,
    removePushSubscription,
    requestNotificationPermission,
  ]);

  const handleToggleMessagePreview = useCallback(async () => {
    const next = !messagePreviewEnabled;
    persistMessagePreviewEnabled(next);
    // Re-subscribe to push with the updated preference if currently active.
    // Pass `next` explicitly to avoid the stale closure on messagePreviewEnabled.
    if (notificationsActive) {
      await ensurePushSubscription({ messagePreview: next });
    }
  }, [
    ensurePushSubscription,
    messagePreviewEnabled,
    notificationsActive,
    persistMessagePreviewEnabled,
  ]);

  const enableNotifications = useCallback(async () => {
    if (!notificationsSupported || getCurrentPermission() === "denied") return false;
    persistNotificationsEnabled(true);
    const permission = getCurrentPermission() === "granted" ? "granted" : await requestNotificationPermission();
    if (permission !== "granted") return false;
    return Boolean(await ensurePushSubscription());
  }, [ensurePushSubscription, getCurrentPermission, notificationsSupported, persistNotificationsEnabled, requestNotificationPermission]);

  const handleTestPush = useCallback(async () => {
    setTestNotificationSent(false);
    if (!await enableNotifications()) return false;
    try {
      const response = await sendPushTest({ username: user?.username });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send test notification.");
      setTestNotificationSent(true); return true;
    } catch (error) { setPushSubscribeError(tError(error)); return false; }
  }, [enableNotifications, sendPushTest, user]);

  const clearPushForLogout = useCallback(async () => {
    navigator.serviceWorker?.controller?.postMessage({ type: "OUJ_ACCOUNT", accountId: null });
    try { await Promise.race([removePushSubscription(), new Promise(resolve => setTimeout(resolve, 2000))]); } catch { /* Logout remains available. */ }
  }, [removePushSubscription]);

  useEffect(() => {
    if (!notificationsSupported) return;
    const syncPermission = () => {
      setNotificationPermission(Notification.permission);
    };
    syncPermission();
    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);
    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, [notificationsSupported]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let active = true;
    navigator.serviceWorker.ready.then((reg) => {
      if (!active) return;
      pushRegistrationRef.current = reg; setPushSwReady(true);
      reg.active?.postMessage({ type: "OUJ_ACCOUNT", accountId: user?.id || null });
    }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!notificationsModalOpen && settingsPanel !== "notifications") return;
    if (typeof window === "undefined") return;
    let active = true;
    fetchPushPublicKey()
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const key = data?.publicKey ? String(data.publicKey) : "";
        setPushVapidReady(Boolean(key));
        setPushVapidLength(key ? getVapidKeyLength(key) : 0);
      })
      .catch(() => {
        if (!active) return;
        setPushVapidReady(false);
        setPushVapidLength(0);
      });
    return () => {
      active = false;
    };
  }, [fetchPushPublicKey, notificationsModalOpen, settingsPanel]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    if (notificationPermission !== "granted") return;
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      void ensurePushSubscription();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ensurePushSubscription, notificationPermission, notificationsEnabled]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    if (notificationPermission !== "granted") return;
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => {
      void maybeRefreshPushSubscription("interval");
    }, PUSH_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [
    maybeRefreshPushSubscription,
    notificationPermission,
    notificationsEnabled,
  ]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined")
      return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void maybeRefreshPushSubscription("resume");
      }
    };
    const handleFocus = () => {
      void maybeRefreshPushSubscription("focus");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [maybeRefreshPushSubscription]);

  return {
    notificationsModalOpen,
    setNotificationsModalOpen,
    testNotificationSent,
    pushSwReady,
    pushVapidReady,
    pushVapidLength,
    pushSubscribeStatus,
    pushSubscribeError,
    notificationsEnabled,
    notificationPermission,
    notificationsSupported,
    notificationsActive,
    notificationsDisabled,
    notificationStatusLabel,
    notificationsDebugLine,
    messagePreviewEnabled,
    handleToggleNotifications,
    handleToggleMessagePreview,
    handleTestPush, enableNotifications, clearPushForLogout,
  };
}
