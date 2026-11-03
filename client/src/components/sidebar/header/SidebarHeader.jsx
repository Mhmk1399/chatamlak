import BrandIdentity from "../../common/BrandIdentity.jsx";
import LanguageSwitcher from "../../common/LanguageSwitcher.jsx";
import ThemeSwitcher from "../../common/ThemeSwitcher.jsx";
import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  Chat,
  Close,
  LoaderCircle,
  Megaphone,
  Mic,
  Pencil,
  PhoneCall,
  Plus,
  Search,
  Trash,
  Users,
} from "../../../icons/lucide.js";
import { hasPersian } from "../../../utils/fontUtils.js";
import AnchoredMenu from "../../common/AnchoredMenu.jsx";
import UserMenuButton from "./UserMenuButton.jsx";

export default function SidebarHeader({
  isDark,
  toggleTheme,
  mobileTab = "chats",
  editMode,
  isConnected,
  isUpdating,
  hasChats,
  selectedChatsCount,
  title = "Chats",
  editAriaLabel = "Edit chat list",
  deleteAriaLabel = "Delete chats",
  newCallAriaLabel = "New call",
  callsDisabled = false,
  isInCall = false,
  onEnterCallsEditMode,
  onDeleteCalls,
  onNewCall,
  onExitEdit,
  onEnterEdit,
  onDeleteChats,
  onNewChat,
  onNewGroup,
  onNewChannel,
  chatsSearchQuery,
  chatsSearchFocused,
  onChatsSearchChange,
  onChatsSearchFocus,
  onChatsSearchBlur,
  onCloseSearch,
  chatsScrollable = false,
  onScrollToTop,
  permissionsPrompt = null,
  insecureConnection = false,
  isLocalhost: isLocalhostProp,
  user,
  displayName,
  displayInitials,
  userColor,
  statusValue,
  statusTextClass,
  onNavigateChats,
  onNavigateSettings,
  onNavigateCalls,
  handleLogout,
  onOpenOwnProfile,
}) {
  useAppLocale();
  const isCallsMode = mobileTab === "calls";
  const isChatsTab = mobileTab !== "calls" && mobileTab !== "settings";
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createButtonRef = useRef(null);
  const createMenuId = useId();
  const closeCreateMenu = useCallback((restoreFocus = true) => {
    setShowCreateMenu(false);
    if (restoreFocus) requestAnimationFrame(() => createButtonRef.current?.focus({ preventScroll: true }));
  }, []);
  const searchInputRef = useRef(null);
  const hasSearchText = Boolean(String(chatsSearchQuery || "").trim());
  const searchHasPersian = hasPersian(chatsSearchQuery || "");
  const searchIsRtl = hasSearchText && searchHasPersian;
  const [hideInsecureBanner, setHideInsecureBanner] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("songbird-insecure-dismissed") === "1";
  });
  const isLocalhost =
    typeof isLocalhostProp === "boolean"
      ? isLocalhostProp
      : typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname === "::1" ||
          window.location.hostname.endsWith(".localhost"));

  useEffect(() => {
    if (!insecureConnection || typeof window === "undefined") return;
    setHideInsecureBanner(
      window.localStorage.getItem("songbird-insecure-dismissed") === "1",
    );
  }, [insecureConnection]);

  const showInsecureBanner = Boolean(
    isChatsTab && insecureConnection && !hideInsecureBanner && !isLocalhost,
  );



  return (
    <div
      className={`ouj-glass border-b border-slate-300/80 bg-white px-5 dark:border-brand-500/20 dark:bg-slate-900 ${
        isCallsMode ? "flex h-[72px] shrink-0 items-center" : "py-3"
      }`}
    >
      {isChatsTab && !chatsSearchFocused && <div className="mb-3 flex items-center justify-between gap-3"><BrandIdentity compact /><div className="flex items-center gap-2"><ThemeSwitcher isDark={isDark} onToggle={toggleTheme} /><LanguageSwitcher compact /></div></div>}
      {mobileTab === "settings" ? (
        <div className="text-center text-lg font-semibold md:hidden">
          <span className="inline-flex items-center gap-2">
            {!isConnected ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-brand-500" />
            ) : null}
            {isConnected ? localize("Settings") : localize("Connecting...")}
          </span>
        </div>
      ) : (
        <>
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
            <div className="flex items-center gap-2">
              {chatsSearchFocused ? (
                <button
                  type="button"
                  onClick={() => {
                    searchInputRef.current?.blur?.();
                    onCloseSearch?.();
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white/80 p-2 text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_16px_rgba(244,63,94,0.22)] dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-200"
                  aria-label={localize("Close search")}
                >
                  <Close size={18} className="icon-anim-pop" />
                </button>
              ) : editMode ? (
                <button
                  type="button"
                  onClick={onExitEdit}
                  className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white/80 p-2 text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_16px_rgba(244,63,94,0.22)] dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-200"
                  aria-label={localize("Exit edit mode")}
                >
                  <Close size={18} className="icon-anim-pop" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={isCallsMode ? onEnterCallsEditMode : onEnterEdit}
                    disabled={!hasChats}
                    className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white/80 p-2 text-brand-700 transition hover:border-brand-300 hover:shadow-[0_0_16px_rgba(102,48,141,0.22)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-brand-200 disabled:hover:shadow-none dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200 md:hidden"
                    aria-label={localize(editAriaLabel)}
                  >
                    <Pencil size={18} className="icon-anim-sway" />
                  </button>
                  <div className="hidden md:inline-flex">
                    <UserMenuButton
                      user={user}
                      displayName={displayName}
                      displayInitials={displayInitials}
                      userColor={userColor}
                      statusValue={statusValue}
                      statusTextClass={statusTextClass}
                      mobileTab={mobileTab}
                      onNavigateChats={onNavigateChats}
                      onNavigateSettings={onNavigateSettings}
                      onNavigateCalls={onNavigateCalls}
                      onEnterEdit={isCallsMode ? onEnterCallsEditMode : onEnterEdit}
                      canEdit={hasChats}
                      handleLogout={handleLogout}
                      onOpenOwnProfile={onOpenOwnProfile}
                    />
                  </div>
                </>
              )}
            </div>
            <h2 className="text-center text-lg font-semibold">
              <span className="inline-flex items-center gap-2">
                {!editMode && (!isConnected || isUpdating) ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-brand-500" />
                ) : null}
                {editMode ? (
                  localize("Edit")
                ) : chatsSearchFocused ? (
                  localize("Search")
                ) : !isConnected ? (
                  localize("Connecting...")
                ) : isUpdating ? (
                  localize("Updating...")
                ) :                 chatsScrollable ? (
                  <button
                    type="button"
                    onClick={onScrollToTop}
                    className="inline-flex cursor-pointer items-center gap-2 px-1 py-0.5 text-inherit"
                    aria-label={localize("{value0} to top", { value0: title })}
                  >
                    {localize(title)}
                  </button>
                ) : (
                  title
                )}
              </span>
            </h2>
            <div className="flex justify-end">
              {chatsSearchFocused ? (
                <span className="inline-flex h-9 w-9" aria-hidden="true" />
              ) : editMode ? (
                <button
                  type="button"
                  onClick={isCallsMode ? onDeleteCalls : onDeleteChats}
                  disabled={!selectedChatsCount}
                  className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_16px_rgba(244,63,94,0.22)] disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                  aria-label={localize(deleteAriaLabel)}
                >
                  <Trash size={18} className="icon-anim-slide" />
                </button>
              ) : isCallsMode ? (
                <button
                  type="button"
                  onClick={isInCall || callsDisabled ? undefined : onNewCall}
                  disabled={isInCall || callsDisabled}
                  title={
                    callsDisabled
                      ? localize("Calls are disabled by the server")
                      : isInCall
                        ? localize("Already in a call")
                        : undefined
                  }
                  className={`inline-flex items-center justify-center rounded-full border border-brand-200 bg-white/80 p-2 text-brand-700 transition hover:border-brand-300 hover:shadow-[0_0_16px_rgba(102,48,141,0.22)] dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200 ${
                    isInCall || callsDisabled ? "cursor-not-allowed opacity-50" : ""
                  }`}
                  aria-label={localize(newCallAriaLabel)}
                >
                  <PhoneCall size={18} className={isInCall || callsDisabled ? "" : "icon-anim-pop"} />
                </button>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    ref={createButtonRef}
                    onClick={() => setShowCreateMenu((prev) => !prev)}
                    className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white/80 p-2 text-brand-700 transition hover:border-brand-300 hover:shadow-[0_0_16px_rgba(102,48,141,0.22)] dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200"
                    aria-label={localize("Create")}
                    aria-haspopup="menu"
                    aria-controls={showCreateMenu ? createMenuId : undefined}
                    aria-expanded={showCreateMenu}
                  >
                    <Plus size={18} className="icon-anim-pop" />
                  </button>
                  {showCreateMenu ? (
                    <AnchoredMenu anchorRef={createButtonRef} onClose={closeCreateMenu} id={createMenuId} label={localize("Create")}>
                      <button
                        type="button" role="menuitem"
                        onClick={() => {
                          closeCreateMenu();
                          onNewChat?.();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                      >
                        <Chat
                          size={16}
                          className="text-brand-500 icon-anim-bob"
                        />{localize("New DM")}</button>
                      <button
                        type="button" role="menuitem"
                        onClick={() => {
                          closeCreateMenu();
                          onNewGroup?.();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                      >
                        <Users
                          size={18}
                          className="text-brand-500 icon-anim-sway"
                        />{localize("New group")}</button>
                      <button
                        type="button" role="menuitem"
                        onClick={() => {
                          closeCreateMenu();
                          onNewChannel?.();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                      >
                        <Megaphone
                          size={18}
                          className="text-brand-500 icon-anim-swing"
                        />{localize("New channel")}</button>
                    </AnchoredMenu>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          {!isCallsMode ? (
          <div className="mt-3">
            <label className="group relative block">
              {!hasSearchText && !chatsSearchFocused ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm leading-none text-slate-500 transition-colors group-hover:text-slate-600 dark:text-slate-400 dark:group-hover:text-slate-300">
                  <span className="inline-flex -translate-y-px md:translate-y-0">
                    <Search
                      size={14}
                      className="icon-anim-pop block text-brand-600 dark:text-brand-300"
                    />
                  </span>
                  <span>{localize("Search")}</span>
                </span>
              ) : null}
              {chatsSearchFocused || hasSearchText ? (
                <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-2 leading-none text-slate-500 dark:text-slate-400">
                  <span className="inline-flex -translate-y-px md:translate-y-0">
                    <Search
                      size={14}
                      className="icon-anim-pop block text-brand-600 dark:text-brand-300"
                    />
                  </span>
                </span>
              ) : null}
              <input
                ref={searchInputRef}
                value={chatsSearchQuery}
                onChange={(event) => onChatsSearchChange?.(event.target.value)}
                onFocus={onChatsSearchFocus}
                onBlur={onChatsSearchBlur}
                placeholder={localize("Search")}
                lang={searchIsRtl ? "fa" : "en"}
                dir={searchIsRtl ? "rtl" : "ltr"}
                className={`w-full rounded-2xl border border-brand-200 bg-white py-2 pr-10 text-sm text-slate-700 outline-hidden transition hover:border-brand-300 hover:shadow-[0_0_16px_rgba(102,48,141,0.18)] focus:border-brand-400 focus:bg-white/80 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-500/50 dark:hover:shadow-[0_0_18px_rgba(102,48,141,0.12)] dark:focus:bg-slate-950 ${
                  chatsSearchFocused || hasSearchText
                    ? searchIsRtl
                      ? "pl-9 text-end font-fa placeholder-slate-500 dark:placeholder-slate-400"
                      : "pl-9 text-start placeholder-slate-500 dark:placeholder-slate-400"
                    : "px-9 text-center placeholder-transparent"
                }`}
                style={{ unicodeBidi: "plaintext" }}
              />
              {hasSearchText ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onChatsSearchChange?.("")}
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-rose-600 transition hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.22)] dark:text-rose-200 dark:hover:bg-rose-500/10"
                  aria-label={localize("Clear search")}
                >
                  <Close size={14} className="icon-anim-pop" />
                </button>
              ) : null}
            </label>
          </div>
          ) : null}
          {isChatsTab && permissionsPrompt?.show ? (
            <div
              tabIndex={0}
              onClick={
                permissionsPrompt?.mode === "notification"
                  ? permissionsPrompt?.notification?.onRequest
                  : permissionsPrompt?.mode === "microphone"
                    ? permissionsPrompt?.microphone?.onRequest
                    : undefined
              }
              onKeyDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  if (permissionsPrompt?.mode === "notification") {
                    permissionsPrompt?.notification?.onRequest?.();
                  } else if (permissionsPrompt?.mode === "microphone") {
                    permissionsPrompt?.microphone?.onRequest?.();
                  }
                }
              }}
              className="mt-3 flex cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-2xl border border-brand-200/80 bg-brand-50/70 px-3 py-2 text-xs font-semibold text-brand-800 shadow-xs transition hover:border-brand-300 hover:bg-brand-100/70 focus:outline-hidden focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-800/60 dark:text-brand-200 dark:hover:bg-slate-800/90"
            >
              {permissionsPrompt?.notification?.show &&
              permissionsPrompt?.mode === "notification" ? (
                <>
                  <div className="flex min-w-0 items-center gap-2">
                    <Bell className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                    <span className="truncate whitespace-nowrap">{localize("Enable notifications")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      permissionsPrompt.onDismiss?.("notification");
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200/80 bg-white/80 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-900/80 dark:text-rose-200 dark:hover:bg-rose-500/10"
                    aria-label={localize("Dismiss")}
                  >
                    <Close size={14} className="icon-anim-pop" />
                  </button>
                </>
              ) : null}
              {permissionsPrompt?.microphone?.show &&
              permissionsPrompt?.mode === "microphone" ? (
                <>
                  <div className="flex min-w-0 items-center gap-2">
                    <Mic className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                    <span className="truncate whitespace-nowrap">{localize("Enable microphone")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      permissionsPrompt.onDismiss?.("microphone");
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200/80 bg-white/80 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-900/80 dark:text-rose-200 dark:hover:bg-rose-500/10"
                    aria-label={localize("Dismiss")}
                  >
                    <Close size={14} className="icon-anim-pop" />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {showInsecureBanner ? (
            <div className="mt-3 flex items-center justify-between gap-2 overflow-hidden rounded-2xl border border-rose-200/80 bg-rose-50/70 px-3 py-2 text-xs font-semibold text-rose-700 shadow-xs dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-100">
              <div className="flex min-w-0 items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
                <span className="truncate whitespace-nowrap">{localize("Connection is not secure")}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(
                      "songbird-insecure-dismissed",
                      "1",
                    );
                  }
                  setHideInsecureBanner(true);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200/80 bg-white/80 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-900/80 dark:text-rose-200 dark:hover:bg-rose-500/10"
                aria-label={localize("Dismiss")}
              >
                <Close size={14} className="icon-anim-pop" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
