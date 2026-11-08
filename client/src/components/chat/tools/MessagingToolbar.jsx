import { tError as localizeError } from "../../../i18n/locale.js";
import { useLayoutEffect, useRef } from "react";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { toolButton } from "./toolStyles.js";

export default function MessagingToolbar() {
  useLocale();
  const context = useMessagingContext();
  const toolbarRef = useRef(null);
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const panel = toolbar.parentElement;
    const update = () => panel.style.setProperty("--chat-tools-height", `${toolbar.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => { observer.disconnect(); panel.style.removeProperty("--chat-tools-height"); };
  }, []);
  if (!context) return null;
  const hasContent = context.extras.topics.length > 0 || context.extras.pinnedMessages?.length > 0 || context.error;
  return <div ref={toolbarRef} className={hasContent ? "ouj-glass shrink-0 border-b border-slate-200 px-3 py-2 dark:border-slate-800" : "shrink-0"}>
    {context.extras.topics.length > 0 && <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">{t("Topics")}
      <select className="text-base min-h-9 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900" value={context.topic} onChange={(event) => context.setTopic(event.target.value)}>
        <option value="">{t("All topics")}</option>{context.extras.topics.map((topic) => <option key={topic.id} value={topic.id}>{t(topic.title)}</option>)}
      </select>
    </label>}
    {context.extras.pinnedMessages?.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto" aria-label={t("Pinned messages")}>{context.extras.pinnedMessages.map((message) => <button key={message.id} type="button" className={`${toolButton} max-w-60 shrink-0`} onClick={() => { context.setTopic(""); context.openResult(message); }}><span className="truncate" dir="auto">📌 {message.body}</span></button>)}</div>}
    {context.error && <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-300">{localizeError(context.error)}</p>}
  </div>;
}
