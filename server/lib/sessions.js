export function createSessionHelpers({
  getSession,
  touchSession,
  deleteSession = () => {},
  isProduction,
  sessionIdleTimeoutMs = Number(process.env.SESSION_IDLE_TIMEOUT_MS) || 14 * 24 * 60 * 60 * 1000,
  sessionAbsoluteTimeoutMs = Number(process.env.SESSION_ABSOLUTE_TIMEOUT_MS) || 30 * 24 * 60 * 60 * 1000,
  now = Date.now,
}) {
  const parseCookies = (req) => {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return {};

    return cookieHeader.split(";").reduce((acc, cookie) => {
      const [name, ...rest] = cookie.trim().split("=");
      if (!name) return acc;

      acc[name] = decodeURIComponent(rest.join("="));

      return acc;
    }, {});
  };

  const isHttpsRequest = (req) => {
    if (!req) return false;
    if (req.secure) return true;

    const proto = String(req.headers?.["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();

    return proto === "https";
  };

  const shouldUseSecureCookie = (req) => {
    // Only mark cookies Secure on actual HTTPS requests.
    // This keeps local HTTP development working even if APP_ENV is production.
    return isProduction && isHttpsRequest(req);
  };

  const setSessionCookie = (req, res, token) => {
    const parts = [
      `sid=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=1209600",
    ];

    if (shouldUseSecureCookie(req)) {
      parts.push("Secure");
    }

    res.setHeader("Set-Cookie", parts.join("; "));
  };

  const clearSessionCookie = (req, res) => {
    const parts = ["sid=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

    if (shouldUseSecureCookie(req)) {
      parts.push("Secure");
    }

    res.setHeader("Set-Cookie", parts.join("; "));
  };

  const timestamp = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const isSessionExpired = (session) => {
    if (!session) return false;
    const currentTime = Number(now());
    const createdAt = timestamp(session.session_created_at ?? session.created_at);
    const lastSeen = timestamp(session.session_last_seen ?? session.last_seen);
    const idleExpired = sessionIdleTimeoutMs > 0 && lastSeen !== null
      && currentTime - lastSeen >= sessionIdleTimeoutMs;
    const absoluteExpired = sessionAbsoluteTimeoutMs > 0 && createdAt !== null
      && currentTime - createdAt >= sessionAbsoluteTimeoutMs;
    return idleExpired || absoluteExpired;
  };

  const resolveSession = (session, token, { touch = true } = {}) => {
    if (!session) return null;
    if (isSessionExpired(session)) {
      try {
        const deleted = deleteSession(token);
        if (deleted && typeof deleted.then === "function") {
          return deleted.catch(() => {}).then(() => null);
        }
      } catch (_) {
        // Expired credentials stay denied even if best-effort cleanup fails.
      }
      return null;
    }

    if (!touch) return session;
    const touched = touchSession(token);
    if (touched && typeof touched.then === "function") {
      return touched.then(() => session);
    }
    return session;
  };

  const getSessionFromToken = (token, options = {}) => {
    if (typeof token !== "string" || !token) return null;
    const rawSession = getSession(token);
    if (rawSession && typeof rawSession.then === "function") {
      return rawSession.then((session) => resolveSession(session, token, options));
    }
    return resolveSession(rawSession, token, options);
  };

  const getSessionFromRequest = (req, options = {}) => {
    const cookies = parseCookies(req);
    if (!cookies.sid) return null;
    return getSessionFromToken(cookies.sid, options);
  };

  const requireSession = (req, res) => {
    const rawSession = getSessionFromRequest(req);
    if (rawSession && typeof rawSession.then === "function") {
      return rawSession.then((session) => {
        if (!session) {
          res.status(401).json({ error: "Not authenticated." });
          return null;
        }
        return session;
      });
    }

    if (!rawSession) {
      res.status(401).json({ error: "Not authenticated." });
      return null;
    }

    return rawSession;
  };

  const requireSessionUsernameMatch = (res, session, suppliedUsername) => {
    const supplied = String(suppliedUsername || "")
      .trim()
      .toLowerCase();

    if (supplied && supplied !== String(session.username || "").toLowerCase()) {
      res
        .status(403)
        .json({ error: "Username does not match authenticated user." });
      return false;
    }

    return true;
  };

  return {
    parseCookies,
    isHttpsRequest,
    shouldUseSecureCookie,
    setSessionCookie,
    clearSessionCookie,
    isSessionExpired,
    getSessionFromToken,
    getSessionFromRequest,
    requireSession,
    requireSessionUsernameMatch,
  };
}
