import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { messagingRequest } from "../../api/messagingApi.js";

export const MessagingContext = createContext(null);
export const useMessagingContext = () => useContext(MessagingContext);
const EMPTY = { reactions: [], pins: [], topics: [], messageTopics: [], polls: [], policy: {} };

export function useMessagingTools({ user, activeChatId, loadChatsRef, scheduleMessageRefreshRef, setMessages, messages, invalidateHistory }) {
  const [preferences, setPreferences] = useState([]);
  const [extras, setExtras] = useState(EMPTY);
  const [filter, setFilter] = useState("all");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [panel, setPanel] = useState(null);
  const [visibleMessageIds, setVisibleMessageIds] = useState("");
  const refreshRevision = useRef(0);
  const activeRef = useRef(activeChatId);
  const visibleIdsRef = useRef(visibleMessageIds);
  const loadedMessagesRef = useRef(messages);
  const invalidateHistoryRef = useRef(invalidateHistory);
  useLayoutEffect(() => { activeRef.current = activeChatId; visibleIdsRef.current = visibleMessageIds; }, [activeChatId, visibleMessageIds]);
  useLayoutEffect(() => { loadedMessagesRef.current = messages; invalidateHistoryRef.current = invalidateHistory; }, [messages, invalidateHistory]);
  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    const chatId = activeRef.current;
    const [prefs, data] = await Promise.all([
      messagingRequest("/preferences"), chatId ? messagingRequest(`/chats/${chatId}${visibleIdsRef.current ? `?ids=${visibleIdsRef.current}` : ""}`) : Promise.resolve(EMPTY),
    ]);
    if (revision !== refreshRevision.current) return;
    setPreferences(prefs.preferences);
    if (chatId === activeRef.current) setExtras(data);
  }, []);
  const act = useCallback(async (path, options) => {
    if (actionInFlight.current) return null;
    actionInFlight.current = true;
    setBusy(true); setError("");
    try {
      const result = await messagingRequest(path, options);
      await refresh().catch(() => setError("Saved. Reconnect to refresh this view."));
      return result;
    }
    catch (failure) { setError(failure.message); return null; }
    finally { actionInFlight.current = false; setBusy(false); }
  }, [refresh]);

  useEffect(() => { setTopic(""); setExtras(EMPTY); setVisibleMessageIds(""); }, [activeChatId, user.id, user.username]);
  useEffect(() => {
    let cancelled = false;
    void refresh().catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [activeChatId, user.username, visibleMessageIds, refresh]);

  useEffect(() => {
    const event = (event) => {
      if (["chat_tools_updated", "chat_message_deleted", "chat_message_updated"].includes(event.detail?.type)) void refresh().catch(() => {});
    };
    window.addEventListener("ouj-chat:realtime-event", event);
    return () => window.removeEventListener("ouj-chat:realtime-event", event);
  }, [refresh]);

  useEffect(() => {
    let stopped = false;
    let running = false;
    const key = `ouj-chat-sync-cursor:${user.id || user.username}`;
    const sync = async () => {
      if (running || stopped || navigator.onLine === false || document.visibilityState === "hidden") return;
      running = true;
      try {
        let cursor = 0;
        try { cursor = Number(localStorage.getItem(key) || 0); } catch { /* volatile cursor */ }
        for (let page = 0; page < 10 && !stopped; page += 1) {
          const data = await messagingRequest(`/sync?after=${cursor}`);
          if (stopped) return;
          for (const event of data.events) {
            if (event.type === "chat_appearance_updated") window.dispatchEvent(new CustomEvent("ouj-chat:realtime-event", { detail: event }));
          }
          const chatEvents = data.events.filter((event) => event.type !== "chat_appearance_updated");
          if (chatEvents.length) {
            await loadChatsRef.current?.({ silent: true, preserveActiveUnread: true });
            const currentChat = activeRef.current;
            const relevant = chatEvents.filter((event) => event.chatId === currentChat);
            await invalidateHistoryRef.current?.([...new Set(chatEvents.map((event) => event.chatId))].filter((id) => id !== activeRef.current));
            const deleted = new Set(relevant.filter((event) => event.type === "chat_message_deleted").flatMap((event) => event.messageIds || [event.messageId]));
            const affected = new Set(relevant.flatMap((event) => event.messageIds || [event.messageId]).filter(Boolean));
            const loaded = new Set((loadedMessagesRef.current || []).flatMap((message) => [message._serverId || message.id, message.replyTo?.id]).filter(Boolean));
            const ids = [...affected].filter((id) => loaded.has(id));
            const patches = [];
            for (let index = 0; index < ids.length; index += 200) {
              const result = await messagingRequest(`/chats/${currentChat}/changes?ids=${ids.slice(index, index + 200).join(",")}`);
              patches.push(...result.messages);
            }
            if (currentChat === activeRef.current && (deleted.size || patches.length)) setMessages((previous) => previous.filter((message) => !deleted.has(message._serverId || message.id)).flatMap((message) => {
              const patch = patches.find((patch) => patch.id === (message._serverId || message.id));
              if (patch?.deleted) return [];
              const reply = patches.find((patch) => patch.id === message.replyTo?.id);
              return [{ ...message, ...(patch || {}), ...(reply ? { replyTo: { ...message.replyTo, body: reply.deleted ? "" : reply.body } } : {}) }];
            }));
            if (relevant.length) {
              scheduleMessageRefreshRef.current?.(activeRef.current, { preserveHistory: true });
              await refresh();
            }
          }
          cursor = data.cursor;
          try { localStorage.setItem(key, String(cursor)); } catch { /* replay next time */ }
          if (!data.hasMore) break;
        }
      } catch { /* existing connection banner owns degraded network status */ }
      finally { running = false; }
    };
    void sync();
    const timer = setInterval(sync, 15000);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("online", sync); document.removeEventListener("visibilitychange", sync); };
  }, [user.id, user.username, refresh, loadChatsRef, scheduleMessageRefreshRef, setMessages]);

  return { user, activeChatId, preferences, extras, filter, setFilter, topic, setTopic, error, setError, busy, act, refresh, panel, setPanel, setVisibleMessageIds };
}
