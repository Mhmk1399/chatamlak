import { useMessageActions } from "../../../hooks/chat/useMessageActions.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { toolButton } from "./toolStyles.js";

export default function MessageEngagement({ message, onOpenContextMenu, isOffline = false }) {
  useLocale();
  const actions = useMessageActions(message);
  const context = actions.context;
  if (!context) return null;
  if (message._clientId && ["sending", "failed"].includes(message._delivery)) return <div className="mx-3 mb-2 flex justify-end gap-2">
    {message._delivery === "failed" && <button type="button" className={toolButton} onClick={() => context.retryQueued(message)}>{t("Retry")}</button>}
    <button type="button" className={toolButton} onClick={() => context.removeQueued(message)}>{t("Remove queued message")}</button>
  </div>;
  if (!actions.available) return null;
  const id = actions.id;
  const { extras, user, act, busy } = context;
  const { reactions, canManage, pinned } = actions;
  const poll = extras.polls.find((poll) => poll.message_id === id);
  const react = actions.react;
  return <div className={`mx-3 mb-2 flex max-w-lg flex-wrap items-center gap-1 ${message.username === user.username ? "ms-auto justify-end" : "me-auto"}`}>
    {pinned && <span className="text-[11px] text-brand-700 dark:text-brand-300">📌 {t("Pin message")}</span>}
    {[...new Set(reactions.map((reaction) => reaction.emoji))].map((emoji) => <button key={emoji} type="button" disabled={busy || isOffline} className={toolButton} aria-pressed={actions.selected.has(emoji)} onClick={() => react(emoji)}>{emoji} {reactions.filter((reaction) => reaction.emoji === emoji).length}</button>)}
    {onOpenContextMenu && <button type="button" className="min-h-9 rounded-full px-3 text-xs text-slate-500 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:bg-brand-500/10" aria-haspopup="dialog" onClick={(event) => onOpenContextMenu({ kind: "message", event, targetEl: event.currentTarget, data: { message, isOffline } })}>{t("React")} ···</button>}
    {poll && <div className="mt-1 w-full space-y-1 rounded-xl border border-brand-200 bg-white p-3 dark:border-brand-500/30 dark:bg-slate-900">
      <p className="text-sm font-semibold" dir="auto">{poll.question}</p>
      {poll.options.map((option, index) => <button key={index} type="button" className={`${toolButton} w-full justify-between ${Number(poll.myVote) === index && poll.myVote !== null ? "bg-brand-100 dark:bg-brand-500/20" : ""}`} disabled={busy || Boolean(Number(poll.closed))} aria-pressed={poll.myVote !== null && Number(poll.myVote) === index} onClick={() => act(`/polls/${poll.id}/vote`, { method: "PUT", body: { option: index } })}><span dir="auto">{option}</span><span>{poll.counts[index]}</span></button>)}
      {Number(poll.closed) ? <p className="text-xs text-slate-500">{t("Poll closed")}</p> : (canManage || poll.user_id === user.id) && <button type="button" className={toolButton} disabled={busy} onClick={() => act(`/polls/${poll.id}/close`, { method: "POST", body: {} })}>{t("Close poll")}</button>}
    </div>}
  </div>;
}
