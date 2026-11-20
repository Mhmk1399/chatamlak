import { safeErrorCode } from "./requestLogging.js";

function writePushLog(level, event, { status, errorCode } = {}) {
  const entry = {
    service: "ouj-chat",
    event,
    ...(Number.isFinite(Number(status))
      ? { status: Math.max(0, Math.round(Number(status))) }
      : {}),
    ...(errorCode ? { errorCode: String(errorCode).slice(0, 128) } : {}),
  };
  const method = ["log", "info", "warn", "error"].includes(level)
    ? level
    : "log";
  console[method](JSON.stringify(entry));
}

export function createPushService({
  webpush,
  listPushSubscriptionsByUserIds,
  deletePushSubscription,
  getTotalUnreadCount,
  vapid,
  proxyUrl,
}) {
  const VAPID_PUBLIC_KEY = String(vapid.publicKey || "").trim();
  const VAPID_PRIVATE_KEY = String(vapid.privateKey || "").trim();
  const VAPID_SUBJECT = String(
    vapid.subject || "mailto:admin@example.com",
  ).trim();
  const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  
  let proxyAgent = null;

  if (PUSH_ENABLED) {
    try {
      webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
      );
      
      // Configure proxy if provided
      if (proxyUrl) {
        import('https-proxy-agent').then(({ HttpsProxyAgent }) => {
          proxyAgent = new HttpsProxyAgent(proxyUrl);
          writePushLog("log", "push.proxy_configured");
        }).catch((error) => {
          writePushLog("error", "push.proxy_configuration_failed", {
            errorCode: safeErrorCode(error, "proxy_configuration_failed"),
          });
        });
      }
    } catch (error) {
      writePushLog("error", "push.vapid_setup_failed", {
        errorCode: safeErrorCode(error, "vapid_setup_failed"),
      });
    }
  }

  async function sendPushNotificationToUsers(userIds = [], payload = {}) {
    if (!PUSH_ENABLED) return { sent: 0, failed: 0, disabled: true };
    const rawTargets = listPushSubscriptionsByUserIds(userIds);
    const targets = (rawTargets && typeof rawTargets.then === "function" ? await rawTargets : rawTargets) || [];
    if (!targets.length) return { sent: 0, failed: 0 };
    const report = { sent: 0, failed: 0 };

    const badgeByUserId = {};
    for (const sub of targets) {
      const uid = sub.user_id;
      if (!(uid in badgeByUserId)) {
        try {
          const rawCount = getTotalUnreadCount
            ? getTotalUnreadCount(uid)
            : 1;
          badgeByUserId[uid] =
            rawCount && typeof rawCount.then === "function"
              ? await rawCount
              : rawCount;
        } catch {
          badgeByUserId[uid] = 1;
        }
      }
    }

    await Promise.all(
      targets.map(async (sub) => {
        const badge = Math.max(0, Math.floor(Number(badgeByUserId[sub.user_id]) || 0));
        const showPreview = sub.message_preview !== 0;
        const perUserPayload = showPreview
          ? { ...payload, badge, accountId: sub.user_id, locale: sub.locale || "fa" }
          : { ...payload, body: "New message", previewHidden: true, badge, accountId: sub.user_id, locale: sub.locale || "fa" };
        const perUserBody = JSON.stringify(perUserPayload);
        try {
          const sendOptions = { urgency: "high", TTL: 86400 };
          if (proxyAgent) sendOptions.agent = proxyAgent;
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh || "",
                auth: sub.auth || "",
              },
            },
            perUserBody,
            sendOptions,
          );
          report.sent += 1;
        } catch (error) {
          report.failed += 1;
          const status = Number(error?.statusCode || 0);
          const errBody = String(error?.body || "");
          
          const isGone =
            status === 404 ||
            status === 410 ||
            status === 401 ||
            status === 403 ||
            (status === 400 && errBody.includes("VapidPkHashMismatch"));
          if (isGone) {
            writePushLog("info", "push.subscription_pruned", { status });
            try {
              const res = deletePushSubscription(sub.endpoint);
              if (res && typeof res.then === "function") await res;
            } catch {}
          } else {
            writePushLog("warn", "push.delivery_failed", {
              status,
              errorCode: safeErrorCode(error, "push_delivery_failed"),
            });
          }
        }
      }),
    );
    return report;
  }

  return {
    PUSH_ENABLED,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT,
    sendPushNotificationToUsers,
  };
}
