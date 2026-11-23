import { NativeWebAuthError } from "../lib/nativeWebIdentityClient.js";

const COOKIE = "owj_chat_guest_link_tx";
const PATH = "/api/integrations/support/guest-link";

function options(req, deps, maxAge) {
  const value = { httpOnly: true, sameSite: "lax", secure: Boolean(deps.shouldUseSecureCookie?.(req)), path: PATH };
  if (Number.isFinite(maxAge)) value.maxAge = maxAge;
  return value;
}

function error(res, cause) {
  const known = cause instanceof NativeWebAuthError || (typeof cause?.code === "string" && Number.isInteger(cause?.status));
  return res.status(known ? cause.status : 500).json({
    error: { code: known ? cause.code : "GUEST_LINK_FAILED", message: known ? cause.message : "Guest linking could not be completed." },
  });
}

export function registerGuestLinkRoutes(app, deps = {}) {
  app.post(`${PATH}/start`, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      if (req.body?.intent !== "link_guest_history" || typeof deps.startGuestHistoryLink !== "function") {
        throw Object.assign(new Error("Explicit guest-history link intent is required."), { code: "SUPPORT_GUEST_LINK_INTENT_REQUIRED", status: 400 });
      }
      const nativeSession = await deps.getSessionFromRequest?.(req, { forceRefresh: true });
      const result = await deps.startGuestHistoryLink(nativeSession);
      res.cookie(COOKIE, result.browserToken, options(req, deps, result.expiresInSeconds * 1_000));
      return res.json({ version: 1, authorizationUrl: result.authorizationUrl, form: result.form, expiresInSeconds: result.expiresInSeconds });
    } catch (cause) {
      return error(res, cause);
    }
  });

  const callback = async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const nativeSession = await deps.getSessionFromRequest?.(req, { forceRefresh: true });
      const cookies = deps.parseCookies?.(req) || {};
      const result = await deps.completeGuestHistoryLink({
        code: req.body?.code || req.query?.code,
        state: req.body?.state || req.query?.state,
        browserToken: cookies[COOKIE],
        nativeSession,
      });
      res.clearCookie(COOKIE, options(req, deps));
      return res.json({ version: 1, linked: true, convertedCount: result.convertedCount });
    } catch (cause) {
      res.clearCookie(COOKIE, options(req, deps));
      return error(res, cause);
    }
  };
  app.get(`${PATH}/callback`, callback);
  app.post(`${PATH}/callback`, callback);
}

export { COOKIE as GUEST_LINK_TRANSACTION_COOKIE, PATH as GUEST_LINK_PATH };
