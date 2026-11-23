import { NativeWebAuthError } from "../lib/nativeWebIdentityClient.js";

const TRANSACTION_COOKIE = "owj_chat_auth_tx";
const TRANSACTION_PATH = "/api/auth/web";

function errorResponse(res, error) {
  const known = error instanceof NativeWebAuthError || (
    typeof error?.code === "string" && Number.isInteger(error?.status)
  );
  const status = known ? error.status : 500;
  return res.status(status).json({
    error: {
      code: known ? error.code : "CHAT_AUTHORIZATION_FAILED",
      message: known ? error.message : "The Web sign-in could not be completed.",
    },
  });
}

function cookieOptions(req, deps, maxAge) {
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(deps.shouldUseSecureCookie?.(req)),
    path: TRANSACTION_PATH,
  };
  if (Number.isFinite(maxAge)) options.maxAge = maxAge;
  return options;
}

function clearTransactionCookie(req, res, deps) {
  res.clearCookie(TRANSACTION_COOKIE, cookieOptions(req, deps));
}

export function registerNativeAuthRoutes(app, deps = {}) {
  app.post("/api/auth/web/start", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (deps.nativeAuthMode !== "federated" || typeof deps.startNativeWebAuthorization !== "function") {
      return errorResponse(res, Object.assign(new Error("Web sign-in is disabled in local native test mode."), {
        code: "WEB_FEDERATION_DISABLED",
        status: 409,
      }));
    }
    try {
      const result = await deps.startNativeWebAuthorization();
      res.cookie(
        TRANSACTION_COOKIE,
        result.browserToken,
        cookieOptions(req, deps, result.expiresInSeconds * 1_000),
      );
      return res.json({
        version: 1,
        authorizationUrl: result.authorizationUrl,
        form: result.form,
        expiresInSeconds: result.expiresInSeconds,
      });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.post("/api/auth/web/callback", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (deps.nativeAuthMode !== "federated" || typeof deps.completeNativeWebAuthorization !== "function") {
      return errorResponse(res, Object.assign(new Error("Web sign-in is disabled."), {
        code: "WEB_FEDERATION_DISABLED",
        status: 409,
      }));
    }
    const cookies = deps.parseCookies?.(req) || {};
    try {
      const result = await deps.completeNativeWebAuthorization({
        code: req.body?.code,
        state: req.body?.state,
        browserToken: cookies[TRANSACTION_COOKIE],
        userAgent: req.headers["user-agent"] || null,
      });
      deps.setSessionCookie(req, res, result.sessionToken);
      clearTransactionCookie(req, res, deps);
      const user = result.user;
      return res.json({
        version: 1,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname || null,
          avatarUrl: user.avatar_url || null,
          color: user.color || null,
          status: user.status || "online",
          role: user.role || "user",
          authKind: "web_federated",
          webScopes: Array.isArray(result.scopes) ? result.scopes : [],
          crmTaskAllowed: Boolean(result.crmTaskAllowed),
        },
        provisioned: result.provisioned,
      });
    } catch (error) {
      clearTransactionCookie(req, res, deps);
      return errorResponse(res, error);
    }
  });
}

export { TRANSACTION_COOKIE, TRANSACTION_PATH };
