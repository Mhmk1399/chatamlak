import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Archive, EllipsisVertical, Folder, ImageIcon, Info, Languages, Phone, Pin, Search, Settings, Trash, Users, Video, Volume2, VolumeX } from "../../icons/lucide.js";
import { getLocale, setLocale, t, useLocale } from "../../i18n/locale.js";
import { useMessagingContext } from "../../hooks/chat/useMessagingTools.js";
import AnchoredMenu from "../common/AnchoredMenu.jsx";
import Tooltip from "../common/Tooltip.jsx";

const iconButton = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-brand-500/10 dark:hover:text-brand-200";
const menuButton = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-medium text-slate-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-100 dark:hover:bg-brand-500/10";

export default function ChatHeaderActions({ onVoiceCall, onVideoCall, voiceDisabled, videoDisabled, groupCallDisabled, voiceHint, videoHint, onOpenProfile }) {
  useLocale();
  const context = useMessagingContext(), anchorRef = useRef(null), menuId = useId();
  const [open, setOpen] = useState(false);
  const close = useCallback((restoreFocus = true) => { setOpen(false); if (restoreFocus) requestAnimationFrame(() => anchorRef.current?.focus({ preventScroll: true })); }, []);
  useEffect(() => { setOpen(false); }, [context?.activeChatId]);
  const preference = context?.preferences?.find(item => item.chat_id === context.activeChatId) || {};
  const update = body => context.act(`/chats/${context.activeChatId}/preference`, { method: "PUT", body });
  const choose = action => { close(false); action(); };
  const groupCall = context?.chat?.type === "group" || context?.groupCall?.room;
  const groupBlocked = !context?.groupCall?.room && (groupCallDisabled || context?.isInCall);
  const actions = context?.headerActions || {};
  const options = [
    onOpenProfile && ["Open profile", Info, onOpenProfile],
    onVideoCall && ["Video call", Video, onVideoCall, videoDisabled, videoHint],
    actions.toggleMute && context?.chat?.type !== "saved" && [context?.chat?._muted ? "Unmute" : "Mute", context?.chat?._muted ? Volume2 : VolumeX, actions.toggleMute, context?.busy],
    context?.activeChatId && ["Media", ImageIcon, () => context.setPanel("Media")],
    context?.activeChatId && [Number(preference.pinned) ? "Unpin chat" : "Pin chat", Pin, () => update({ pinned: !Number(preference.pinned) }), context.busy],
    context?.activeChatId && [Number(preference.archived) ? "Unarchive" : "Archive", Archive, () => update({ archived: !Number(preference.archived) }), context.busy],
    context?.activeChatId && ["Folder", Folder, () => context.setPanel("Folder")],
    actions.openAppearance && ["Chat background", ImageIcon, actions.openAppearance],
    groupCall && ["Group call", Users, () => context.setPanel("Group call"), groupBlocked],
    context && ["Chat tools", Settings, () => context.setPanel("Devices")],
    ["Language", Languages, () => setLocale(getLocale() === "fa" ? "en" : "fa")],
    actions.deleteChat && ["Delete chat", Trash, actions.deleteChat, context?.busy],
  ].filter(Boolean);
  return <div role="group" className="flex shrink-0 items-center gap-0.5" aria-label={t("Chat actions")}>
    <Tooltip label={t("Search")} placement="bottom"><button type="button" className={iconButton} aria-label={t("Search")} disabled={!context} onClick={() => context.setPanel("Search")}><Search size={21} /></button></Tooltip>
    {onVoiceCall ? <Tooltip label={voiceHint || t("Voice call")} placement="bottom"><button type="button" className={iconButton} aria-label={t("Voice call")} disabled={voiceDisabled} onClick={onVoiceCall}><Phone size={21} /></button></Tooltip>
      : groupCall && <Tooltip label={t("Group call")} placement="bottom"><button type="button" className={iconButton} aria-label={t("Group call")} disabled={groupBlocked} onClick={() => context.setPanel("Group call")}><Phone size={21} /></button></Tooltip>}
    <Tooltip label={t("More chat actions")} placement="bottom"><button ref={anchorRef} type="button" className={iconButton} aria-label={t("More chat actions")}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); } }}><EllipsisVertical size={23} /></button></Tooltip>
    {open && <AnchoredMenu id={menuId} anchorRef={anchorRef} label={t("Chat actions")} onClose={close} variant="conversation">
      {options.map(([label, Icon, action, disabled, hint]) => <button key={label} type="button" role="menuitem" disabled={disabled} title={hint} onClick={() => choose(action)}
        className={`${menuButton} ${label === "Delete chat" ? "text-rose-600 dark:text-rose-300" : ""}`}><Icon size={19} className="shrink-0" /><span>{t(label)}</span></button>)}
    </AnchoredMenu>}
  </div>;
}
