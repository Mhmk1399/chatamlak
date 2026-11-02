import { registerAppRoutes } from "./app.js";
import { registerAdminRoutes } from "./admin.js";
import { registerAuthRoutes } from "./auth.js";
import { registerChatRoutes } from "./chats.js";
import { registerHealthRoutes } from "./health.js";
import { registerMessageRoutes } from "./messages.js";
import { registerPushRoutes } from "./push.js";
import { registerPresenceRoutes } from "./presence.js";
import { registerProfileRoutes } from "./profile.js";
import { registerRemoteChannelRoutes } from "./remoteChannels.js";
import { registerCallRoutes } from "./calls.js";
import { registerRemoteChannelTickRoutes } from "./remoteChannelTick.js";
import { registerRemoteMirrorRoutes } from "./remoteMirror.js";
import { registerAdminPanelRoutes } from "./adminPanel.js";
import { registerAdminRemoteChannelRoutes } from "./adminRemoteChannel.js";
import { registerRemoteUploadRoutes } from "./uploadsRemote.js";
import { registerMessagingRoutes } from "./messaging.js";
import { createMessagingService } from "../lib/services/messagingService.js";

function registerApiRoutes(app, deps) {
  const messagingService = createMessagingService(deps);
  deps = { ...deps, ensureChatPublishAllowed: messagingService.publicationError };
  registerMessagingRoutes(app, deps);
  if (deps.messagingDb) {
    const timer = setInterval(() => { void messagingService.tick().catch((error) => console.error("[scheduled-messages]", error.message)); }, 5000);
    timer.unref?.();
  }
  registerHealthRoutes(app, deps);
  registerAppRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerPresenceRoutes(app, deps);
  registerProfileRoutes(app, deps);
  registerChatRoutes(app, deps);
  registerRemoteChannelRoutes(app, deps);
  registerRemoteChannelTickRoutes(app, deps);
  registerRemoteMirrorRoutes(app, deps);
  registerMessageRoutes(app, deps);
  registerRemoteUploadRoutes(app, deps);
  registerPushRoutes(app, deps);
  registerCallRoutes(app, deps);
  registerAdminPanelRoutes(app, deps);
  registerAdminRemoteChannelRoutes(app, deps);
  registerAdminRoutes(app, deps);
}

export { registerApiRoutes };
