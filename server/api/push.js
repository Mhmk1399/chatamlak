function registerPushRoutes(app, deps) {
  const {
    requireSession,
    requireSessionUsernameMatch,
    findUserByUsername,
    upsertPushSubscription,
    deletePushSubscription,
    VAPID_PUBLIC_KEY,
    sendPushNotificationToUsers,
    listPushSubscriptionsByUserIds,
  } = deps;

  app.get("/api/push/public-key", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!VAPID_PUBLIC_KEY) {
      return res.status(503).json({ error: "Push is not configured." });
    }
    return res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;
    const { username, subscription, messagePreview, locale } = req.body || {};
    let endpoint;
    try { endpoint = new URL(subscription?.endpoint); } catch { /* Invalid native subscription. */ }
    if (!username || !endpoint || endpoint.protocol !== "https:" || endpoint.username || endpoint.password || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res
        .status(400)
        .json({ error: "Username and subscription are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) return res.status(404).json({ error: "User not found." });
    try {
      await upsertPushSubscription(
        user.id,
        subscription.endpoint,
        subscription.keys?.p256dh,
        subscription.keys?.auth,
        messagePreview === false ? 0 : 1,
        locale === "en" ? "en" : "fa",
      );
      return res.json({ ok: true });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Unable to save subscription." });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;
    const { username, endpoint } = req.body || {};
    if (!username || !endpoint) {
      return res
        .status(400)
        .json({ error: "Username and endpoint are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    try {
      await deletePushSubscription(endpoint, session.id);
      return res.json({ ok: true });
    } catch { return res.status(500).json({ error: "Unable to remove subscription." }); }
  });

  app.post("/api/push/test", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    if (!VAPID_PUBLIC_KEY) {
      return res.status(503).json({ error: "Push is not configured." });
    }
    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) return res.status(404).json({ error: "User not found." });
    const rawSubs = listPushSubscriptionsByUserIds([user.id]);
    const subs = (rawSubs && typeof rawSubs.then === "function" ? await rawSubs : rawSubs) || [];
    if (!subs.length) {
      return res.status(400).json({ error: "No push subscription found." });
    }
    try {
      const report = await sendPushNotificationToUsers([user.id], {
        title: "Ouj Chat", isTest: true,
        body: "Test notification",
        data: { url: "/chat" },
      });
      if (report?.sent === 0) return res.status(503).json({ error: "Unable to send test notification." });
      return res.json({ ok: true });
    } catch {
      return res
        .status(500)
        .json({ error: "Unable to send test notification." });
    }
  });

  app.get("/api/push/debug", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;
    const username = req.query?.username?.toString();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;
    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) return res.status(404).json({ error: "User not found." });
    const rawSubs = listPushSubscriptionsByUserIds([user.id]);
    const subs = (rawSubs && typeof rawSubs.then === "function" ? await rawSubs : rawSubs) || [];
    return res.json({
      ok: true,
      configured: Boolean(VAPID_PUBLIC_KEY),
      count: subs.length,
      endpoints: subs.map((sub) => sub.endpoint),
    });
  });
}

export { registerPushRoutes };
