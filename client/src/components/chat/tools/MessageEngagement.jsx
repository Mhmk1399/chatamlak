import { useState } from "react";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { isValidUuid } from "../../../utils/uuidUtils.js";
import { toolButton } from "./toolStyles.js";

export default function MessageEngagement({ message }) {
  useLocale();
  const context = useMessagingContext();
  const [open, setOpen] = useState(false);
  if (!context) return null;
  if (message._clientId && ["sending", "failed"].includes(message._delivery)) return <div className="mx-3 mb-2 flex justify-end gap-2">
    {message._delivery === "failed" && <button type="button" className={toolButton} onClick={() => context.retryQueued(message)}>{t("Retry")}</button>}
    <button type="button" className={toolButton} onClick={() => context.removeQueued(message)}>{t("Remove queued message")}</button>
  </div>;
  const id = message._serverId || message.id;
  if (!isValidUuid(String(id))) return null;
  if (/^\[\[(system|call):/.test(String(message.body || ""))) return null;
  const { extras, user, activeChatId, chat, act, busy } = context;
  const reactions = extras.reactions.filter((reaction) => reaction.message_id === id);
  const myRole = (chat?.members || []).find((member) => member.id === user.id)?.role;
  const canManage = ["owner", "admin"].includes(myRole);
  const pinned = extras.pins.includes(id);
  const poll = extras.polls.find((poll) => poll.message_id === id);
  const topicId = extras.messageTopics.find((entry) => entry.message_id === id)?.topic_id || "";
  const react = (emoji) => act(`/chats/${activeChatId}/reaction`, { method: "PUT", body: { messageId: id, emoji, active: !reactions.some((reaction) => reaction.emoji === emoji && reaction.user_id === user.id) } });
  return <div className={`mx-3 mb-2 flex max-w-lg flex-wrap items-center gap-1 ${message.username === user.username ? "ms-auto justify-end" : "me-auto"}`}>
    {pinned && <span className="text-[11px] text-brand-700 dark:text-brand-300">📌 {t("Pin message")}</span>}
    {[...new Set(reactions.map((reaction) => reaction.emoji))].map((emoji) => <button key={emoji} type="button" disabled={busy} className={toolButton} aria-pressed={reactions.some((reaction) => reaction.emoji === emoji && reaction.user_id === user.id)} onClick={() => react(emoji)}>{emoji} {reactions.filter((reaction) => reaction.emoji === emoji).length}</button>)}
    <button type="button" className="min-h-8 rounded-full px-2 text-xs text-slate-500 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:bg-brand-500/10" aria-expanded={open} onClick={() => setOpen(!open)}>{t("React")} ···</button>
    {open && <>
      {["👍", "❤️", "😂", "🎉", "😮", "😢", "👎"].map((emoji) => <button key={emoji} type="button" className={toolButton} disabled={busy} aria-label={`${t("React")} ${emoji}`} onClick={() => react(emoji)}>{emoji}</button>)}
      {canManage && <button type="button" className={toolButton} disabled={busy} onClick={() => act(`/chats/${activeChatId}/pin`, { method: "PUT", body: { messageId: id, active: !pinned } })}>{t(pinned ? t("Unpin message") : t("Pin message"))}</button>}
      {extras.topics.length > 0 && (canManage || message.username === user.username) && <label className="text-xs">{t("Topics")} <select value={topicId} disabled={busy} className="rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" onChange={(event) => act(`/chats/${activeChatId}/topic`, { method: "PUT", body: { messageId: id, topicId: event.target.value || null } })}>
        <option value="">{t("All topics")}</option>{extras.topics.filter((topic) => !Number(topic.closed)).map((topic) => <option key={topic.id} value={topic.id}>{t(topic.title)}</option>)}
      </select></label>}
    </>}
    {poll && <div className="mt-1 w-full space-y-1 rounded-xl border border-brand-200 bg-white p-3 dark:border-brand-500/30 dark:bg-slate-900">
      <p className="text-sm font-semibold" dir="auto">{poll.question}</p>
      {poll.options.map((option, index) => <button key={index} type="button" className={`${toolButton} w-full justify-between ${Number(poll.myVote) === index && poll.myVote !== null ? "bg-brand-100 dark:bg-brand-500/20" : ""}`} disabled={busy || Boolean(Number(poll.closed))} aria-pressed={poll.myVote !== null && Number(poll.myVote) === index} onClick={() => act(`/polls/${poll.id}/vote`, { method: "PUT", body: { option: index } })}><span dir="auto">{option}</span><span>{poll.counts[index]}</span></button>)}
      {Number(poll.closed) ? <p className="text-xs text-slate-500">{t("Poll closed")}</p> : (canManage || poll.user_id === user.id) && <button type="button" className={toolButton} disabled={busy} onClick={() => act(`/polls/${poll.id}/close`, { method: "POST", body: {} })}>{t("Close poll")}</button>}
    </div>}
  </div>;
}
