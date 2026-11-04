const CACHE_VERSION = "0.13.2-ouj.3";
const CACHE_NAME = `songbird-${CACHE_VERSION}`;
const PREFERENCES_CACHE = "ouj-preferences-v1";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/manifest.en.webmanifest",
  "/ouj-logo.png",
  "/ouj-icons/icon-192.png",
  "/ouj-icons/icon-512.png",
];
async function notificationLocale() {
  try { const response = await (await caches.open(PREFERENCES_CACHE)).match("/__ouj_locale"); return await response?.text() === "en" ? "en" : "fa"; }
  catch { return "fa"; }
}
async function applyAppBadge(value) {
  if (!Number.isFinite(Number(value)) || value === undefined || value === null) return;
  const count = Math.max(0, Math.floor(Number(value)));
  try {
    if (count > 0 && navigator.setAppBadge) await navigator.setAppBadge(count);
    else if (!count && navigator.clearAppBadge) await navigator.clearAppBadge();
  } catch { /* Device/OS support does not affect notification delivery. */ }
}
async function activePushAccount() {
  try { return await (await (await caches.open(PREFERENCES_CACHE)).match("/__ouj_account"))?.text(); }
  catch { return null; }
}
async function acceptsPush(payload) {
  const account = await activePushAccount();
  return account !== "signed-out" && (!account || !payload.accountId || account === String(payload.accountId));
}

const isCacheableAssetPath = (pathname) => {
  if (pathname.startsWith("/assets/")) return true;
  if (pathname.startsWith("/icons/")) return true;
  return (
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  );
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => null),
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "OUJ_ACCOUNT") {
    event.waitUntil((async () => {
      const account = event.data.accountId ? String(event.data.accountId) : "signed-out";
      await (await caches.open(PREFERENCES_CACHE)).put("/__ouj_account", new Response(account));
      if (account === "signed-out") {
        await applyAppBadge(0);
        try { (await self.registration.getNotifications()).forEach(notification => notification.close()); } catch { /* Best effort. */ }
      }
    })());
  }
  if (event?.data?.type === "OUJ_BADGE") {
    event.waitUntil((async () => {
      if (await acceptsPush(event.data)) await applyAppBadge(event.data.count);
    })());
  }
  if (event?.data?.type === "OUJ_LOCALE" && ["fa", "en"].includes(event.data.locale)) {
    event.waitUntil(caches.open(PREFERENCES_CACHE).then((cache) => cache.put("/__ouj_locale", new Response(event.data.locale))).catch(() => {}));
  }
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("songbird-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;
  const isNavigation = event.request.mode === "navigate";
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (isNavigation) {
        const network = await fetch(event.request, { cache: "no-store" })
          .then((response) => {
            if (response && response.ok) {
              cache.put("/index.html", response.clone());
              self.clients
                .matchAll({ type: "window", includeUncontrolled: true })
                .then((clientsArr) => {
                  clientsArr.forEach((client) =>
                    client.postMessage({ type: "APP_SHELL_UPDATED" }),
                  );
                })
                .catch(() => null);
            }
            return response;
          })
          .catch(() => null);
        if (network) return network;
        const cachedIndex = await cache.match("/index.html");
        return cachedIndex || Response.error();
      }

      if (!isCacheableAssetPath(url.pathname)) {
        return fetch(event.request).catch(() => Response.error());
      }

      const cached = await cache.match(event.request);
      const revalidate = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);
      event.waitUntil(revalidate);
      if (cached) return cached;
      const network = await revalidate;
      return network || cached || Response.error();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text?.() || "" };
  }
  const data = payload.data || {};

  // Every accepted push produces a visible notification (required by WebKit).
  // Active windows and finished calls use quiet notifications.
  if (data.callPush === "incoming" || data.callPush === "dismiss") {
    const callTag = `call-${data.chatId || "unknown"}`;
    event.waitUntil(
      (async () => {
        if (!await acceptsPush(payload)) return;
        if (data.callPush === "dismiss") {
          const locale = ["fa", "en"].includes(payload.locale) ? payload.locale : await notificationLocale();
          await self.registration.showNotification(locale === "fa" ? "گفتگوی اوج" : "Ouj Chat", {
            body: locale === "fa" ? "تماس پایان یافت." : "Call ended.", data, tag: callTag, silent: true,
            icon: "/ouj-icons/icon-192.png", badge: "/ouj-icons/icon-192.png",
          });
          return;
        }
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const appFocused = clients.some((client) =>
          "focused" in client
            ? Boolean(client.focused)
            : false,
        );
        const locale = ["fa", "en"].includes(payload.locale) ? payload.locale : await notificationLocale();
        const caller = payload.title?.match(/^Incoming (?:voice|video) call from (.+)$/)?.[1];
        const title = locale === "fa" && caller ? `تماس ${data.callType === "video" ? "تصویری" : "صوتی"} از ${caller}` : payload.title || (locale === "fa" ? "گفتگوی اوج" : "Ouj Chat");
        await self.registration.showNotification(title, {
          body: locale === "fa" ? "برای پاسخ بزنید" : payload.body || "Tap to answer",
          data,
          tag: callTag,
          renotify: !appFocused,
          silent: appFocused,
          requireInteraction: !appFocused,
          badge: "/ouj-icons/icon-192.png",
          icon: "/ouj-icons/icon-192.png",
        });
      })(),
    );
    return;
  }

  const badgeCount = payload.badge;
  const tag = data.chatId ? `chat-${data.chatId}` : "songbird";
  const options = {
    data,
    tag,
    renotify: true,
    badge: "/ouj-icons/icon-192.png",
    icon: "/ouj-icons/icon-192.png",
  };
  event.waitUntil(
    (async () => {
      if (!await acceptsPush(payload)) return;
      await applyAppBadge(badgeCount);
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const appFocused = clients.some((client) =>
        "focused" in client
          ? Boolean(client.focused)
          : false,
      );
      options.silent = appFocused && !payload.isTest;
      options.renotify = !options.silent;
      const locale = ["fa", "en"].includes(payload.locale) ? payload.locale : await notificationLocale();
      const title = payload.isTest ? (locale === "fa" ? "گفتگوی اوج" : "Ouj Chat") : payload.title || (locale === "fa" ? "گفتگوی اوج" : "Ouj Chat");
      // Notification bodies containing user-written messages stay unchanged.
      options.body = payload.isTest ? (locale === "fa" ? "اعلان آزمایشی؛ دریافت پیام‌ها فعال است." : "Test notification. Message alerts are working.")
        : payload.previewHidden ? (locale === "fa" ? "پیام جدید" : "New message") : payload.body || (locale === "fa" ? "پیام جدید" : "New message");
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    let target = new URL("/chat", self.location.origin);
    const data = event.notification?.data || {};
    if (data.chatId) target.searchParams.set("chatId", String(data.chatId));
    else if (data.url) {
      try { const requested = new URL(data.url, self.location.origin); if (requested.origin === target.origin && ["http:", "https:"].includes(requested.protocol)) target = requested; } catch { /* Open the app. */ }
    }
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find(client => { try { return new URL(client.url).origin === target.origin; } catch { return false; } });
    if (existing) { await existing.focus(); await existing.navigate(target.href); }
    else await self.clients.openWindow(target.href);
  })());
});
