"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import ContextMenuSurface from "../../context-menu/ContextMenuSurface.jsx";
import {
  Bookmark,
  Chat,
  Check,
  CheckCheck,
  Clock12,
  File,
  Ghost,
  ImageIcon,
  Megaphone,
  Mic,
  Minus,
  Phone,
  Users,
  Video,
  VolumeX,
} from "../../../icons/lucide.js";
import { getAvatarStyle } from "../../../utils/avatarColor.js";
import { hasPersian } from "../../../utils/fontUtils.js";
import { getAvatarInitials } from "../../../utils/avatarInitials.js";
import { renderMarkdownInlinePlain } from "../../../utils/markdown.js";
import { summarizeFiles } from "../../../utils/messagePreview.js";
import { getCallLogLabel, parseCallLogBody } from "../../../utils/messageContent.js";
import { isMessageAuthoredByUser } from "../../../utils/messageOwnership.js";
import { formatCompactCount } from "../../../utils/chatFormat.js";
import Avatar from "../../common/Avatar.jsx";
import UserRoleBadge from "../../common/UserRoleBadge.jsx";
import VerifiedBadge from "../../common/VerifiedBadge.jsx";
import Tooltip from "../../common/Tooltip.jsx";

const INITIAL_RENDER = 40;
const RENDER_BATCH = 24;
const MEDIA_ONLY_FALLBACK =
  /^Sent (a media file|a file|a document|a voice message|\d+ (files|documents|media files|voice messages))$/i;
const rowSurface =
  "ouj-chat-list-item group relative flex min-h-[76px] w-full min-w-0 items-center rounded-xl outline-none transition-colors duration-150 motion-reduce:transition-none";
const inactiveRow =
  "border border-transparent text-slate-700 hover:bg-brand-50 focus-within:bg-brand-50 dark:text-slate-100 dark:hover:bg-brand-500/10 dark:focus-within:bg-brand-500/10";
const activeRow =
  "border border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-400/60 dark:bg-brand-500/10 dark:text-brand-300";
const searchHeading =
  "ouj-search-section-heading sticky top-0 z-[1] bg-white/95 px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-brand-700 backdrop-blur-sm dark:bg-slate-900/95 dark:text-brand-200";
const rowAction =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 motion-reduce:transition-none";

const previewIconMap = {
  voice: Mic,
  video: Video,
  image: ImageIcon,
  document: File,
  file: File,
  callVoice: Phone,
  callVideo: Video,
};

function normalizePreviewText(value) {
  if (typeof value === "string") return value === "[object Object]" ? "" : value;
  if (value && typeof value === "object") {
    const text = value.text ?? value.body;
    return typeof text === "string" ? text : "";
  }
  if (value == null) return "";
  const text = String(value);
  return text === "[object Object]" ? "" : text;
}

function getOtherMember(chat, user) {
  if (chat.type !== "dm") return null;
  return (chat.members || []).find(
    (member) =>
      String(member?.username ?? "").toLowerCase() !==
      String(user?.username ?? "").toLowerCase(),
  ) || null;
}

function getChatName(chat, user) {
  if (chat.type === "dm") {
    const other = getOtherMember(chat, user);
    return other?.nickname || other?.username || localize("Deleted account");
  }
  if (chat.type === "saved") return chat.name || localize("Saved messages");
  return chat.name || localize("Chat");
}

function getLastMessagePreview(chat, user) {
  const files = Array.isArray(chat.last_message_files)
    ? chat.last_message_files
    : [];
  const body = normalizePreviewText(chat.last_message).trim();

  if (!files.length) {
    const callLog = parseCallLogBody(body);
    if (callLog) {
      const own = isMessageAuthoredByUser(
        {
          username: chat.last_sender_username,
          client_request_id: chat.last_message_client_request_id,
        },
        user,
      );
      return {
        icon: callLog.type === "video" ? "callVideo" : "callVoice",
        text: getCallLogLabel(callLog, own),
      };
    }
    return { icon: null, text: body };
  }

  const summaryText = summarizeFiles(files);
  const summaryIcon = /^Sent (a voice message|\d+ voice messages)$/i.test(summaryText)
    ? "voice"
    : /^Sent (a video|\d+ videos)$/i.test(summaryText)
      ? "video"
      : /^Sent (a photo|\d+ photos|a media file|\d+ media files)$/i.test(summaryText)
        ? "image"
        : "document";

  return {
    icon: summaryIcon,
    text: !body || MEDIA_ONLY_FALLBACK.test(body) ? summaryText : body,
  };
}

function isMobileCoarsePointer() {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 767px) and (pointer: coarse)").matches;
}

function PreviewIcon({ kind }) {
  const Icon = previewIconMap[kind];
  return Icon ? (
    <Icon size={15} className="mt-px shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
  ) : null;
}

function SectionHeading({ children }) {
  return <h3 className={searchHeading}>{children}</h3>;
}

const ChatRow = memo(function ChatRow({
  chat,
  user,
  selected,
  active,
  editMode,
  formatChatTimestamp,
  onOpen,
  onToggleSelect,
  onRequestDelete,
  onOpenContextMenu,
  locale,
}) {
  const isGroup = chat.type === "group";
  const isChannel = chat.type === "channel";
  const isSaved = chat.type === "saved";
  const other = getOtherMember(chat, user);
  const isDeletedDm = chat.type === "dm" && !other;
  const name = getChatName(chat, user);
  const members = chat.members || [];
  const isChannelOwner = isChannel && members.some(
    (member) =>
      String(member?.id ?? "") === String(user?.id ?? "") &&
      String(member?.role ?? "").toLowerCase() === "owner",
  );
  const ownLastMessage =
    Boolean(chat.last_message || chat.last_message_files?.length) &&
    isMessageAuthoredByUser(
      {
        username: chat.last_sender_username,
        client_request_id: chat.last_message_client_request_id,
      },
      user,
    );
  const pending = Boolean(chat._lastMessagePending && ownLastMessage);
  const seen = Boolean(chat.last_message_read_at) || (isSaved && ownLastMessage);
  const showOwnStatus = ownLastMessage && !isChannelOwner;
  const unreadCount = Math.max(0, Math.floor(Number(chat.unread_count) || 0));
  const unreadLabel = unreadCount > 999 ? formatCompactCount(unreadCount) : unreadCount;
  const preview = useMemo(
    () => getLastMessagePreview(chat, user),
    [chat, user, locale],
  );
  // The existing renderMarkdownInlinePlain utility is kept for compatibility.
  // It must return escaped/sanitized inline HTML before being used here.
  const previewHtml = useMemo(
    () => renderMarkdownInlinePlain(pending ? localize("Processing...") : preview.text),
    [pending, preview.text, locale],
  );
  const hasLastMessage = Boolean(chat.last_message || chat.last_message_files?.length);
  const senderName = chat.last_sender_nickname || chat.last_sender_username;
  const avatarColor = isGroup || isChannel
    ? chat.group_color || "#66308d"
    : isSaved
      ? "#66308d"
      : isDeletedDm
        ? "#94a3b8"
        : other?.color || "#66308d";
  const avatarInitials = getAvatarInitials(name);
  const titleIsPersian = hasPersian(name);
  const previewIsPersian = hasPersian(preview.text);
  const ariaName = unreadCount
    ? `${name}, ${localize("{count} unread messages", { count: unreadCount })}`
    : name;
  const mobileCoarse = isMobileCoarsePointer();

  const handleActivate = () => {
    if (editMode) onToggleSelect(chat.id);
    else onOpen(chat);
  };

  return (
    <div className="ouj-chat-list-row w-full px-2">
      <div className={`${rowSurface} ${active ? activeRow : inactiveRow}`}>
        {editMode && (
          <button
            type="button"
            onClick={() => onRequestDelete([chat.id])}
            className={`${rowAction} ms-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10`}
            aria-label={`${localize("Remove chat")}: ${name}`}
            title={localize("Remove chat")}
          >
            <Minus size={17} aria-hidden="true" />
          </button>
        )}

        <ContextMenuSurface
          as="button"
          type="button"
          onClick={handleActivate}
          aria-label={ariaName}
          aria-current={!editMode && active ? "true" : undefined}
          aria-pressed={editMode ? selected : undefined}
          contextMenu={{
            disabled: editMode,
            isMobile: mobileCoarse,
            onOpen: ({ event, targetEl, isMobile }) =>
              onOpenContextMenu?.({
                kind: "chat",
                event,
                targetEl,
                isMobile,
                data: { chat },
              }),
          }}
          className="ouj-chat-list-button flex min-h-[76px] min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-3"
        >
          <Avatar
            src={isGroup || isChannel ? chat.group_avatar_url : other?.avatar_url}
            alt={name}
            name={name}
            color={avatarColor}
            initials={avatarInitials}
            placeholderContent={
              isSaved ? (
                <Bookmark size={22} className="text-white" aria-hidden="true" />
              ) : isDeletedDm ? (
                <Ghost size={22} className="text-slate-600" aria-hidden="true" />
              ) : avatarInitials
            }
            showOnlineBadge={chat.type === "dm" && !isDeletedDm && String(other?.status ?? "").toLowerCase() === "online"}
            className="h-[52px] w-[52px] shrink-0 text-lg font-semibold"
          />

          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {isChannel ? (
                  <Megaphone size={15} className="shrink-0 text-brand-500" aria-hidden="true" />
                ) : isGroup ? (
                  <Users size={15} className="shrink-0 text-brand-500" aria-hidden="true" />
                ) : null}
                <Tooltip label={name} asChild>
                  <span
                    dir="auto"
                    className={`min-w-0 truncate text-[14px] leading-5 font-semibold ${titleIsPersian ? "font-fa" : ""} ${isDeletedDm ? "text-slate-500" : ""}`}
                  >
                    {name}
                  </span>
                </Tooltip>
                {chat.type === "dm" && !isDeletedDm && Boolean(other?.user_verified) && (
                  <VerifiedBadge size={15} />
                )}
                {chat.type === "dm" && !isDeletedDm && other && (
                  <UserRoleBadge role={other.user_role} size={15} />
                )}
                {chat.type !== "dm" && Boolean(chat.verified) && <VerifiedBadge size={15} />}
                {Boolean(chat._muted) && (
                  <VolumeX size={15} className="shrink-0 text-slate-400 dark:text-slate-500" aria-label={localize("Muted chat")} />
                )}
              </div>

              <div className="flex min-w-0 items-center gap-1 text-[13px] leading-[19px] text-slate-500 dark:text-slate-400">
                {hasLastMessage && (
                  <>
                    {showOwnStatus ? (
                      <span className="shrink-0 font-semibold">{localize("You:")}</span>
                    ) : isGroup && senderName ? (
                      <Tooltip label={senderName} asChild>
                        <span className="inline-flex max-w-[42%] shrink-0 items-center gap-0.5 overflow-hidden font-semibold">
                          <bdi dir="auto" className={`min-w-0 truncate ${hasPersian(senderName) ? "font-fa" : ""}`}>
                            {senderName}
                          </bdi>
                          <span aria-hidden="true">:</span>
                        </span>
                      </Tooltip>
                    ) : null}
                    <PreviewIcon kind={preview.icon} />
                    <span
                      dir="auto"
                      className={`ouj-chat-preview min-w-0 flex-1 truncate ${previewIsPersian ? "font-fa" : ""}`}
                      style={{ unicodeBidi: "plaintext" }}
                      dangerouslySetInnerHTML={{ __html: String(previewHtml || "") }}
                    />
                  </>
                )}
                {!hasLastMessage && <span aria-hidden="true" className="h-[19px]" />}
              </div>
            </div>

            <div className="flex min-w-[45px] max-w-[85px] shrink-0 flex-col items-end gap-2 self-stretch justify-center">
              <span dir="ltr" className="inline-flex max-w-full items-center gap-0.5 whitespace-nowrap text-[11px] leading-4 tabular-nums text-slate-500 dark:text-slate-400">
                {showOwnStatus && (
                  <span
                    className={pending
                      ? "text-brand-700 dark:text-brand-200"
                      : seen
                        ? "text-sky-400"
                        : "text-slate-400 dark:text-slate-500"}
                    aria-label={localize(pending ? "Processing..." : seen ? "Read" : "Sent")}
                  >
                    {pending ? (
                      <Clock12 size={14} className="animate-spin" aria-hidden="true" />
                    ) : seen ? (
                      <CheckCheck size={15} strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <Check size={15} strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </span>
                )}
                <time className="truncate" suppressHydrationWarning>
                  {chat.last_time && typeof formatChatTimestamp === "function"
                    ? formatChatTimestamp(chat.last_time)
                    : ""}
                </time>
              </span>
              {unreadCount > 0 ? (
                <span
                  className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-bold text-white tabular-nums ${chat._muted ? "bg-slate-400 dark:bg-slate-500" : "bg-brand-600"}`}
                  aria-label={localize("{count} unread messages", { count: unreadCount })}
                >
                  {unreadLabel}
                </span>
              ) : <span className="h-5" aria-hidden="true" />}
            </div>
          </div>
        </ContextMenuSurface>

        {editMode && (
          <button
            type="button"
            onClick={() => onToggleSelect(chat.id)}
            className={`${rowAction} me-1.5 border ${selected ? "border-brand-600 bg-brand-600 text-white" : "border-brand-300 text-brand-600 hover:bg-brand-50 dark:border-brand-500/50 dark:text-brand-200 dark:hover:bg-brand-500/10"}`}
            aria-label={`${localize("Select chat")}: ${name}`}
            aria-pressed={selected}
            title={localize("Select chat")}
          >
            {selected && <Check size={18} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        )}
      </div>
      <div className="ouj-chat-row-separator ms-[77px] me-3 border-b border-slate-200/70 dark:border-slate-800/75" aria-hidden="true" />
    </div>
  );
});

const DiscoveredUserRow = memo(function DiscoveredUserRow({
  member,
  active,
  onOpen,
  onOpenContextMenu,
  onOpenProfile,
}) {
  const name = member.nickname || member.username || localize("User");
  const showOnline = String(member.status ?? "").toLowerCase() === "online";
  return (
    <div className="ouj-chat-list-row px-2">
      <ContextMenuSurface
        as="button"
        type="button"
        onClick={() => onOpen?.(member)}
        aria-label={name}
        contextMenu={{
          isMobile: isMobileCoarsePointer(),
          onOpen: ({ event, targetEl, isMobile }) =>
            onOpenContextMenu?.({
              kind: "user",
              event,
              targetEl,
              isMobile,
              data: {
                member,
                sourceChatType: "discover",
                onOpenProfile,
              },
            }),
        }}
        className={`${rowSurface} ${active ? activeRow : inactiveRow} min-h-[76px] gap-3 px-3 py-2 text-start focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500`}
      >
        <Avatar
          src={member.avatar_url}
          alt={name}
          name={name}
          color={member.color || "#66308d"}
          initials={getAvatarInitials(name)}
          showOnlineBadge={showOnline}
          className="h-[52px] w-[52px] shrink-0 text-lg font-semibold"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span dir="auto" className={`min-w-0 truncate text-[14px] font-semibold ${hasPersian(name) ? "font-fa" : ""}`}>
              {name}
            </span>
            {Boolean(member.verified) && <VerifiedBadge size={15} />}
            <UserRoleBadge role={member.role} size={15} />
          </span>
          <Tooltip label={member.username} asChild>
            <span className="truncate text-[13px] text-slate-500 dark:text-slate-400" dir="ltr">
              @{member.username}
            </span>
          </Tooltip>
        </span>
      </ContextMenuSurface>
      <div className="ouj-chat-row-separator ms-[77px] me-3 border-b border-slate-200/70 dark:border-slate-800/75" aria-hidden="true" />
    </div>
  );
});

const DiscoveredCommunityRow = memo(function DiscoveredCommunityRow({
  item,
  type,
  active,
  onOpen,
  locale,
}) {
  const name = item.name || localize(type === "channel" ? "Channel" : "Group");
  const count = Math.max(0, Number(item.membersCount) || 0);
  const countString = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(count);
  return (
    <div className="ouj-chat-list-row px-2">
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        aria-label={name}
        className={`${rowSurface} ${active ? activeRow : inactiveRow} min-h-[76px] gap-3 px-3 py-2 text-start focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500`}
      >
        <Avatar
          src={item.avatarUrl || item.avatar_url}
          alt={name}
          name={name}
          color={item.color || "#66308d"}
          initials={getAvatarInitials(name)}
          className="h-[52px] w-[52px] shrink-0 text-lg font-semibold"
        />
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <Tooltip label={name} asChild>
                <span dir="auto" className={`min-w-0 truncate text-[14px] font-semibold ${hasPersian(name) ? "font-fa" : ""}`}>
                  {name}
                </span>
              </Tooltip>
              {Boolean(item.verified) && <VerifiedBadge size={15} />}
            </span>
            <span className="truncate text-[13px] text-slate-500 dark:text-slate-400" dir="auto">
              {item.username ? `@${item.username} · ` : ""}{countString} {localize(type === "channel" ? "subscribers" : "members")}
            </span>
          </span>
          {Boolean(item.isMember) && (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
              {localize("Joined")}
            </span>
          )}
        </span>
      </button>
      <div className="ouj-chat-row-separator ms-[77px] me-3 border-b border-slate-200/70 dark:border-slate-800/75" aria-hidden="true" />
    </div>
  );
});

function SavedMessagesRow({ active, onOpen }) {
  return (
    <div className="ouj-chat-list-row px-2">
      <ContextMenuSurface
        as="button"
        type="button"
        onClick={() => onOpen?.()}
        contextMenu={{ disabled: true }}
        className={`${rowSurface} ${active ? activeRow : inactiveRow} min-h-[76px] gap-3 px-3 py-2 text-start focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500`}
      >
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full" style={getAvatarStyle("#66308d")}>
          <Bookmark size={23} className="text-white" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[14px] font-semibold">{localize("Saved messages")}</span>
          <span className="truncate text-[13px] text-slate-500 dark:text-slate-400">{localize("Personal notes")}</span>
        </span>
      </ContextMenuSurface>
    </div>
  );
}

function ChatsLoadingSkeleton() {
  return (
    <div className="w-full px-2" role="status" aria-label={localize("Loading chats...")}>
      {Array.from({ length: 7 }, (_, index) => (
        <div className="flex min-h-[76px] items-center gap-3 rounded-xl px-3 py-2 motion-safe:animate-pulse" key={index} aria-hidden="true">
          <div className="h-[52px] w-[52px] shrink-0 rounded-full bg-brand-100 dark:bg-brand-900/40" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="h-3 w-2/5 rounded-full bg-brand-100 dark:bg-brand-900/40" />
            <div className="h-2.5 w-3/4 rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="h-2.5 w-8 self-start rounded-full bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyChats() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
        <Chat size={26} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">{localize("Your chat list is empty.")}</p>
      <p className="mt-1 max-w-[260px] text-[13px] leading-5 text-slate-500 dark:text-slate-400">{localize("Search or use + button to start chatting.")}</p>
    </div>
  );
}

export default function ChatsListPanel({
  loadingChats = false,
  visibleChats = [],
  allChatsForSearch,
  listFilterKey,
  user,
  editMode = false,
  activeChatId,
  selectedChats = [],
  formatChatTimestamp,
  requestDeleteChats,
  toggleSelectChat,
  setActiveChatId,
  setActivePeer,
  setMobileTab,
  setUnreadInChat,
  lastMessageIdRef,
  chatsSearchQuery = "",
  chatsSearchFocused = false,
  discoverLoading = false,
  discoverUsers = [],
  discoverGroups = [],
  discoverChannels = [],
  discoverSaved = false,
  isSavedChatActive = false,
  onOpenDiscoveredUser,
  onOpenDiscoveredGroup,
  onOpenUserProfileContext,
  onOpenSavedMessages,
  onOpenUserContextMenu,
  onOpenChatContextMenu,
}) {
  const locale = useAppLocale();
  const query = String(chatsSearchQuery ?? "").trim();
  const searchMode = Boolean(chatsSearchFocused);
  const viewKey = searchMode ? `search:${query}` : `folder:${listFilterKey ?? "all"}`;
  const [page, setPage] = useState({ key: viewKey, limit: INITIAL_RENDER });
  // Render the same initial batch during SSR and the first client render.
  const [canObserve, setCanObserve] = useState(true);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") setCanObserve(false);
  }, []);

  const searchableChats = Array.isArray(allChatsForSearch) ? allChatsForSearch : visibleChats;

  const localSearchMatches = useMemo(() => {
    if (!searchMode || !query) return [];
    const needle = query.toLocaleLowerCase();
    return searchableChats.filter((chat) => {
      const title = getChatName(chat, user);
      const other = getOtherMember(chat, user);
      return [title, other?.username, chat.username]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(needle));
    });
  }, [searchableChats, searchMode, query, user, locale]);

  const chatResults = searchMode ? localSearchMatches : visibleChats;
  const renderLimit = page.key === viewKey ? page.limit : INITIAL_RENDER;
  const currentLimit = canObserve ? renderLimit : chatResults.length;
  const renderedChats = useMemo(
    () => chatResults.slice(0, currentLimit),
    [chatResults, currentLimit],
  );

  useEffect(() => {
    if (!canObserve || renderLimit >= chatResults.length) return undefined;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return undefined;

    // Use the nested list scroller, rather than the page viewport.
    const scrollRoot = sentinel.closest(".ouj-sidebar-list-scroll, .app-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPage((previous) => ({
            key: viewKey,
            limit: Math.min(
              chatResults.length,
              (previous.key === viewKey ? previous.limit : INITIAL_RENDER) + RENDER_BATCH,
            ),
          }));
        }
      },
      { root: scrollRoot || null, rootMargin: "300px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [renderLimit, chatResults.length, canObserve, viewKey]);

  const selectedChatIds = useMemo(
    () => new Set((selectedChats || []).map(String)),
    [selectedChats],
  );

  const openChat = useCallback((chat) => {
    setActiveChatId?.(chat.id);
    setActivePeer?.(getOtherMember(chat, user));
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) {
      setMobileTab?.("chat");
    }
    setUnreadInChat?.(0);
    if (lastMessageIdRef) lastMessageIdRef.current = null;
  }, [setActiveChatId, setActivePeer, setMobileTab, setUnreadInChat, lastMessageIdRef, user]);

  const toggleSelected = useCallback(
    (id) => toggleSelectChat?.(id),
    [toggleSelectChat],
  );
  const requestDelete = useCallback(
    (ids) => requestDeleteChats?.(ids),
    [requestDeleteChats],
  );

  const dmChatIdsByUsername = useMemo(() => {
    const result = new Map();
    for (const chat of searchableChats) {
      const other = getOtherMember(chat, user);
      if (other?.username) result.set(String(other.username).toLowerCase(), chat.id);
    }
    return result;
  }, [searchableChats, user]);

  const hasUserResults = Array.isArray(discoverUsers) && discoverUsers.length > 0;
  const hasGroupResults = Array.isArray(discoverGroups) && discoverGroups.length > 0;
  const hasChannelResults = Array.isArray(discoverChannels) && discoverChannels.length > 0;
  const hasRemoteResults = hasUserResults || hasGroupResults || hasChannelResults || Boolean(discoverSaved);
  const showSearchResults = searchMode && Boolean(query);
  const isActiveChat = (id) => id != null && activeChatId != null && String(activeChatId) === String(id);

  return (
    <div className="ouj-chats-list min-h-full w-full py-1" aria-busy={Boolean(loadingChats && !searchMode)}>
      {searchMode && !query && (
        <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            <Chat size={26} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <p className="max-w-[260px] text-[13px] leading-5 text-slate-500 dark:text-slate-400">
            {localize("Type to search users, groups, and channels.")}
          </p>
        </div>
      )}

      {showSearchResults && renderedChats.length > 0 && (
        <section aria-label={localize("Chats")}>
          <SectionHeading>{localize("Chats")}</SectionHeading>
          {renderedChats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              user={user}
              active={isActiveChat(chat.id)}
              selected={selectedChatIds.has(String(chat.id))}
              editMode={editMode}
              formatChatTimestamp={formatChatTimestamp}
              onOpen={openChat}
              onToggleSelect={toggleSelected}
              onRequestDelete={requestDelete}
              onOpenContextMenu={onOpenChatContextMenu}
              locale={locale}
            />
          ))}
        </section>
      )}

      {showSearchResults && discoverLoading && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-4 py-4 text-[13px] text-slate-500 dark:text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-500/20 dark:border-t-brand-300" aria-hidden="true" />
          {localize("Searching...")}
        </div>
      )}

      {showSearchResults && !discoverLoading && (
        <>
          {hasUserResults && (
            <section aria-label={localize("Users")}>
              <SectionHeading>{localize("Users")}</SectionHeading>
              {discoverUsers.map((member) => {
                const dmId = dmChatIdsByUsername.get(String(member.username || "").toLowerCase());
                return (
                  <DiscoveredUserRow
                    key={`search-user-${member.id ?? member.username}`}
                    locale={locale}
                    member={member}
                    active={isActiveChat(dmId)}
                    onOpen={onOpenDiscoveredUser}
                    onOpenContextMenu={onOpenUserContextMenu}
                    onOpenProfile={onOpenUserProfileContext}
                  />
                );
              })}
            </section>
          )}
          {hasGroupResults && (
            <section aria-label={localize("Groups")}>
              <SectionHeading>{localize("Groups")}</SectionHeading>
              {discoverGroups.map((group) => (
                <DiscoveredCommunityRow
                  key={`search-group-${group.id}`}
                  item={group}
                  type="group"
                  active={isActiveChat(group.id)}
                  onOpen={onOpenDiscoveredGroup}
                  locale={locale}
                />
              ))}
            </section>
          )}
          {hasChannelResults && (
            <section aria-label={localize("Channels")}>
              <SectionHeading>{localize("Channels")}</SectionHeading>
              {discoverChannels.map((channel) => (
                <DiscoveredCommunityRow
                  key={`search-channel-${channel.id}`}
                  item={channel}
                  type="channel"
                  active={isActiveChat(channel.id)}
                  onOpen={onOpenDiscoveredGroup}
                  locale={locale}
                />
              ))}
            </section>
          )}
          {Boolean(discoverSaved) && (
            <section aria-label={localize("Saved Messages")}>
              <SectionHeading>{localize("Saved Messages")}</SectionHeading>
              <SavedMessagesRow active={isSavedChatActive} onOpen={onOpenSavedMessages} />
            </section>
          )}
          {!hasRemoteResults && !localSearchMatches.length && (
            <p className="px-5 py-10 text-center text-[13px] text-slate-500 dark:text-slate-400" role="status">
              {localize("No results.")}
            </p>
          )}
        </>
      )}

      {!searchMode && loadingChats && !visibleChats.length && <ChatsLoadingSkeleton />}
      {!searchMode && !loadingChats && !visibleChats.length && <EmptyChats />}

      {!searchMode && renderedChats.length > 0 && renderedChats.map((chat) => (
        <ChatRow
          key={chat.id}
          chat={chat}
          user={user}
          active={isActiveChat(chat.id)}
          selected={selectedChatIds.has(String(chat.id))}
          editMode={editMode}
          formatChatTimestamp={formatChatTimestamp}
          onOpen={openChat}
          onToggleSelect={toggleSelected}
          onRequestDelete={requestDelete}
          onOpenContextMenu={onOpenChatContextMenu}
          locale={locale}
        />
      ))}

      {renderLimit < chatResults.length && canObserve && (
        <div ref={loadMoreRef} className="h-8 w-full" aria-hidden="true" />
      )}
    </div>
  );
}
