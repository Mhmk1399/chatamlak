import { tError as localizeError } from "../../../i18n/locale.js";
import { useLayoutEffect, useRef, useState } from "react";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { getLocale, setLocale, t, useLocale } from "../../../i18n/locale.js";
import { toolButton, toolInput } from "./ToolDialog.jsx";

export function SidebarFilters() {
  useLocale();
  const context = useMessagingContext();
  if (!context) return null;
  const folders = [...new Set(context.preferences.map((item) => item.folder).filter(Boolean))];
  return <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-3 py-2 dark:border-slate-800" aria-label={t("Folder")}>
    {[["all", "All"], ["unread", "Unread"], ["group", "Groups"], ["channel", "Channels"], ["archived", "Archived"], ...folders.map((folder) => [`folder:${folder}`, folder])].map(([value, label]) =>
      <button key={value} type="button" className={`${toolButton} shrink-0 ${context.filter === value ? "bg-brand-100 dark:bg-brand-500/20" : ""}`} aria-pressed={context.filter === value} onClick={() => context.setFilter(value)}>{t(label)}</button>)}
  </div>;
}

export default function MessagingToolbar() {
  useLocale();
  const context = useMessagingContext();
  const [folderOpen, setFolderOpen] = useState(false);
  const [folder, setFolder] = useState("");
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
  const preference = context.preferences.find((item) => item.chat_id === context.activeChatId) || {};
  const update = (body) => context.act(`/chats/${context.activeChatId}/preference`, { method: "PUT", body });
  return <div ref={toolbarRef} className="ouj-glass shrink-0 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={toolButton} onClick={() => context.setPanel("Search")}>{t("Search")}</button>
      {context.activeChatId && <>
        <button type="button" className={toolButton} onClick={() => context.setPanel("Media")}>{t("Media")}</button>
        <button type="button" disabled={context.busy} className={toolButton} onClick={() => update({ pinned: !Number(preference.pinned) })}>{t(Number(preference.pinned) ? t("Unpin chat") : t("Pin chat"))}</button>
        <button type="button" disabled={context.busy} className={toolButton} onClick={() => update({ archived: !Number(preference.archived) })}>{t(Number(preference.archived) ? t("Unarchive") : t("Archive"))}</button>
        <button type="button" className={toolButton} aria-expanded={folderOpen} onClick={() => { setFolder(preference.folder || ""); setFolderOpen(!folderOpen); }}>{t("Folder")}</button>
      </>}
      <button type="button" className={toolButton} onClick={() => context.setPanel("Devices")}>{t("Chat tools")}</button>
      {(context.chat?.type === "group" || context.groupCall?.room) && <button type="button" className={`${toolButton} ${context.groupCall?.room ? "bg-brand-100 dark:bg-brand-500/20" : ""}`} onClick={() => context.setPanel("Group call")}>{t("Group call")}</button>}
      <button type="button" className={`${toolButton} ms-auto md:hidden`} aria-label={t("Language")} onClick={() => setLocale(getLocale() === "fa" ? "en" : "fa")}>{getLocale() === "fa" ? t("English") : "فارسی"}</button>
    </div>
    {folderOpen && <form noValidate className="mt-2 flex gap-2" onSubmit={async (event) => { event.preventDefault(); if (await update({ folder })) setFolderOpen(false); }}>
      <label className="min-w-0 flex-1"><span className="sr-only">{t("Folder")}</span><input className={toolInput} value={folder} onChange={(event) => setFolder(event.target.value)} maxLength={60} /></label>
      <button type="submit" disabled={context.busy} className={toolButton}>{t("Save")}</button>
    </form>}
    {context.extras.topics.length > 0 && <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">{t("Topics")}
      <select className="min-h-9 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900" value={context.topic} onChange={(event) => context.setTopic(event.target.value)}>
        <option value="">{t("All topics")}</option>{context.extras.topics.map((topic) => <option key={topic.id} value={topic.id}>{t(topic.title)}</option>)}
      </select>
    </label>}
    {context.extras.pinnedMessages?.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto" aria-label={t("Pinned messages")}>{context.extras.pinnedMessages.map((message) => <button key={message.id} type="button" className={`${toolButton} max-w-60 shrink-0`} onClick={() => { context.setTopic(""); context.openResult(message); }}><span className="truncate" dir="auto">📌 {message.body}</span></button>)}</div>}
    {context.error && <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-300">{localizeError(context.error)}</p>}
  </div>;
}
