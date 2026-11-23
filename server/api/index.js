import { registerAppRoutes } from "./app.js";
import { registerAdminRoutes } from "./admin.js";
import { registerAuthRoutes } from "./auth.js";
import { registerNativeAuthRoutes } from "./nativeAuth.js";
import { registerGuestLinkRoutes } from "./guestLink.js";
import { registerChatRoutes } from "./chats.js";
import { registerHealthRoutes } from "./health.js";
import { registerMessageRoutes } from "./messages.js";
import { registerPushRoutes } from "./push.js";
import { registerPresenceRoutes } from "./presence.js";
import { registerProfileRoutes } from "./profile.js";
import { registerAppearanceRoutes } from "./appearance.js";
import { registerRemoteChannelRoutes } from "./remoteChannels.js";
import { registerCallRoutes } from "./calls.js";
import { registerCrmRoutes } from "./crm.js";
import { registerRemoteChannelTickRoutes } from "./remoteChannelTick.js";
import { registerRemoteMirrorRoutes } from "./remoteMirror.js";
import { registerAdminPanelRoutes } from "./adminPanel.js";
import { registerAdminRemoteChannelRoutes } from "./adminRemoteChannel.js";
import { registerRemoteUploadRoutes } from "./uploadsRemote.js";
import { registerMessagingRoutes } from "./messaging.js";
import { registerSupportRoutes } from "./support.js";
import { createMessagingService } from "../lib/services/messagingService.js";
import { safeErrorCode } from "../lib/requestLogging.js";

function registerApiRoutes(app, deps) {
  const messagingService = createMessagingService(deps);
  deps = { ...deps, ensureChatPublishAllowed: messagingService.publicationError };
  registerMessagingRoutes(app, deps);
  registerSupportRoutes(app, deps);
  if (deps.messagingDb) {
    const timer = setInterval(() => { void messagingService.tick().catch((error) => console.error(JSON.stringify({
      service: "ouj-chat",
      event: "scheduled_messages.tick_failed",
      errorCode: safeErrorCode(error, "scheduled_messages_failed"),
    }))); }, 5000);
    timer.unref?.();
  }
  registerHealthRoutes(app, deps);
  registerAppRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerNativeAuthRoutes(app, deps);
  registerGuestLinkRoutes(app, deps);
  registerPresenceRoutes(app, deps);
  registerProfileRoutes(app, deps);
  registerAppearanceRoutes(app, deps);
  registerChatRoutes(app, deps);
  registerRemoteChannelRoutes(app, deps);
  registerRemoteChannelTickRoutes(app, deps);
  registerRemoteMirrorRoutes(app, deps);
  registerMessageRoutes(app, deps);
  registerRemoteUploadRoutes(app, deps);
  registerPushRoutes(app, deps);
  registerCallRoutes(app, deps);
  registerCrmRoutes(app, deps);
  registerAdminPanelRoutes(app, deps);
  registerAdminRemoteChannelRoutes(app, deps);
  registerAdminRoutes(app, deps);
  app.use((error, req, res, next) => {
    if (!error || typeof error.code !== "string" || !Number.isInteger(error.status)) {
      return next(error);
    }
    res.set("Cache-Control", "private, no-store");
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message || "The request was denied.",
      },
    });
  });
}

export { registerApiRoutes };
