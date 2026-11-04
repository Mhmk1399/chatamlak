import { normalizeChatAppearance } from "../../shared/chatAppearance.js";

export function createAppearanceRepository(store) {
  return {
    updateChatAppearance(userId, wallpaperId, revision) {
      return store.transaction(async () => {
        const user = await store.one("users", { id: userId });
        if (!user) return { notFound: true };
        const previous = normalizeChatAppearance(user.chat_appearance);
        if (previous.revision !== revision) return { conflict: previous };
        if (previous.wallpaperId === wallpaperId) return { appearance: previous, changed: false };
        const appearance = { wallpaperId, revision: previous.revision + 1, updatedAt: new Date().toISOString() };
        await store.update("users", { id: userId }, { chat_appearance: appearance });
        await store.event(null, { type: "chat_appearance_updated", userId, chatAppearance: appearance }, userId);
        return { appearance, changed: true };
      });
    },
  };
}
