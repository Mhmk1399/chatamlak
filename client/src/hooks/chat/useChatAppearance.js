import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { updateChatAppearance } from "../../api/chatApi.js";
import { normalizeChatAppearance } from "../../../../shared/chatAppearance.js";
import { SESSION_USER_KEY } from "../../utils/sessionStorage.js";

export const ChatAppearanceContext = createContext(null);
export const useChatAppearanceContext = () => useContext(ChatAppearanceContext);

export function useChatAppearance(user, setUser) {
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const accountId = user?.id;
  const currentAccount = useRef(accountId);
  useLayoutEffect(() => { currentAccount.current = accountId; }, [accountId]);
  const appearance = normalizeChatAppearance(user?.chatAppearance);
  const accept = useCallback((userId, incoming) => {
    if (userId !== accountId) return;
    const next = normalizeChatAppearance(incoming);
    setUser((previous) => {
      if (previous?.id !== userId || normalizeChatAppearance(previous.chatAppearance).revision >= next.revision) return previous;
      return { ...previous, chatAppearance: next };
    });
  }, [accountId, setUser]);

  useEffect(() => {
    const receive = ({ detail }) => {
      if (detail?.type === "chat_appearance_updated") accept(detail.userId, detail.chatAppearance);
    };
    const storage = (event) => {
      if (event.key !== SESSION_USER_KEY || !event.newValue) return;
      try { const saved = JSON.parse(event.newValue); accept(saved.id, saved.chatAppearance); } catch { /* Ignore corrupted external cache entries. */ }
    };
    window.addEventListener("songbird:realtime-event", receive);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener("songbird:realtime-event", receive); window.removeEventListener("storage", storage); };
  }, [accept]);

  const save = async (wallpaperId) => {
    if (pending.current) return false;
    pending.current = true; setSaving(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await updateChatAppearance(wallpaperId, appearance.revision, accountId, controller.signal);
      const result = await response.json().catch(() => ({}));
      if (currentAccount.current !== accountId) return false;
      if (result.chatAppearance) accept(accountId, result.chatAppearance);
      if (!response.ok || !result.chatAppearance) throw new Error(result.error || "Could not save your background. Your preview is kept; try again.");
      return true;
    } catch (error) {
      if (error instanceof TypeError || error?.name === "AbortError") throw new Error("Could not save your background. Your preview is kept; try again.");
      throw error;
    } finally { clearTimeout(timeout); pending.current = false; setSaving(false); }
  };
  return { accountId, appearance, saving, save };
}
