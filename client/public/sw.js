const CACHE_VERSION = "0.13.2-ouj.1";
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

  // Call pushes are handled before the generic message path. The dismiss
  // branch must always run — even when a window is focused. The incoming
  // branch suppresses display when a window is focused: the realtime
  // call:incoming ring covers focused windows (same trade-off as messages).
  if (data.callPush === "incoming" || data.callPush === "dismiss") {
    const callTag = `call-${data.chatId || "unknown"}`;
    event.waitUntil(
      (async () => {
        if (data.callPush === "dismiss") {
          try {
            const existing = await self.registration.getNotifications({
              tag: callTag,
            });
            existing.forEach((notification) => notification.close());
          } catch {
            // a dismiss that cannot run must not throw
          }
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
        if (appFocused) {
          // A focused Songbird window rings in-app via realtime.
          return;
        }
        const locale = await notificationLocale();
        const caller = payload.title?.match(/^Incoming (?:voice|video) call from (.+)$/)?.[1];
        const title = locale === "fa" && caller ? `تماس ${data.callType === "video" ? "تصویری" : "صوتی"} از ${caller}` : payload.title || (locale === "fa" ? "گفتگوی اوج" : "Ouj Chat");
        await self.registration.showNotification(title, {
          body: locale === "fa" ? "برای پاسخ بزنید" : payload.body || "Tap to answer",
          data,
          tag: callTag,
          renotify: true,
          requireInteraction: true,
          badge: "/ouj-icons/icon-192.png",
          icon: "/ouj-icons/icon-192.png",
        });
      })(),
    );
    return;
  }

  const badgeCount = Number(payload.badge || 0);
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
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const appFocused = clients.some((client) =>
        "focused" in client
          ? Boolean(client.focused)
          : false,
      );
      if (appFocused) {
        // A focused Songbird window handles unread state in-app.
        return;
      }
      try {
        if (badgeCount > 0 && navigator?.setAppBadge) {
          navigator.setAppBadge(badgeCount).catch(() => null);
        }
      } catch {
        // ignore badge errors; must not affect notification delivery
      }
      const locale = await notificationLocale();
      const title = payload.title || (locale === "fa" ? "گفتگوی اوج" : "Ouj Chat");
      // Notification bodies containing user-written messages stay unchanged.
      options.body = payload.body || (locale === "fa" ? "پیام جدید" : "New message");
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsArr) => {
        const existing = clientsArr.find((client) =>
          client.url.includes(self.location.origin),
        );
        if (existing) {
          existing.focus();
          existing.navigate(target);
          return;
        }
        self.clients.openWindow(target);
      }),
  );
});
