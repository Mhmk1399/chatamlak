import { CHAT_WALLPAPER_IDS } from "../../../shared/chatAppearance.js";

export function createAppearanceService({ mongoRepository, emitSseEvent }) {
  return {
    async save(session, input) {
      if (!CHAT_WALLPAPER_IDS.includes(input?.wallpaperId) || !Number.isSafeInteger(input?.revision) || input.revision < 0) {
        return { status: 400, body: { error: "Choose an available chat background." } };
      }
      if (input.accountId !== undefined && input.accountId !== session.id) {
        return { status: 403, body: { error: "Your account changed. Sign in again before changing your background." } };
      }
      const result = await mongoRepository.updateChatAppearance(session.id, input.wallpaperId, input.revision);
      if (result.notFound) return { status: 404, body: { error: "User not found." } };
      if (result.conflict) return { status: 409, body: { error: "Your background changed on another device. Review your choice and apply again.", chatAppearance: result.conflict } };
      if (result.changed) {
        try { await emitSseEvent(session.username, { type: "chat_appearance_updated", userId: session.id, chatAppearance: result.appearance }); }
        catch { /* The committed private journal event is replayed on reconnect. */ }
      }
      return { status: 200, body: { chatAppearance: result.appearance } };
    },
  };
}
