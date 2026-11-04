"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import BrandIdentity from "../../common/BrandIdentity.jsx";
import LanguageSwitcher from "../../common/LanguageSwitcher.jsx";
import ThemeSwitcher from "../../common/ThemeSwitcher.jsx";
import {
  t as localize,
  useLocale as useAppLocale,
} from "../../../i18n/locale.js";
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

// Preserve the existing storage key so previous dismissals still apply.
const INSECURE_NOTICE_KEY = "songbird-insecure-dismissed";

const iconButton =
  "ouj-sidebar-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-white/80 text-brand-700 outline-none transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200 dark:hover:bg-brand-500/10 motion-reduce:transition-none";
const destructiveButton =
  "ouj-sidebar-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 outline-none transition-colors duration-150 hover:border-rose-300 hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-500/10 motion-reduce:transition-none";
const createItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-slate-700 outline-none transition-colors duration-150 hover:bg-brand-50 hover:text-brand-700 focus-visible:bg-brand-50 focus-visible:text-brand-700 dark:text-slate-100 dark:hover:bg-brand-500/10 dark:hover:text-brand-200 dark:focus-visible:bg-brand-500/10 motion-reduce:transition-none";

function getDismissedInsecureNotice() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSECURE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function isLocalHostName() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

export default function SidebarHeader({
  isDark,
  toggleTheme,
  mobileTab = "chats",
  editMode = false,
  isConnected = true,
  isUpdating = false,
  hasChats = false,
  selectedChatsCount = 0,
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
  chatsSearchQuery = "",
  chatsSearchFocused = false,
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
  showAccountMenu = false,
}) {
  useAppLocale();
  const isCallsMode = mobileTab === "calls";
  const isChatsTab = mobileTab !== "calls" && mobileTab !== "settings";
  const isSearchMode = isChatsTab && Boolean(chatsSearchFocused);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [hideInsecureBanner, setHideInsecureBanner] = useState(false);
  const [environmentReady, setEnvironmentReady] = useState(false);
  const [browserIsLocalhost, setBrowserIsLocalhost] = useState(false);
  const createButtonRef = useRef(null);
  const searchInputRef = useRef(null);
  const createMenuId = useId();
  const searchId = useId();
  const query = String(chatsSearchQuery ?? "");
  const hasSearchText = Boolean(query.trim());
  const isLocalhost =
    typeof isLocalhostProp === "boolean" ? isLocalhostProp : browserIsLocalhost;

  const closeCreateMenu = useCallback((restoreFocus = true) => {
    setShowCreateMenu(false);
    if (restoreFocus && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() =>
        createButtonRef.current?.focus({ preventScroll: true }),
      );
    }
  }, []);

  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    onCloseSearch?.();
  }, [onCloseSearch]);

  useEffect(() => {
    if (editMode || isSearchMode || isCallsMode) setShowCreateMenu(false);
  }, [editMode, isSearchMode, isCallsMode]);

  useEffect(() => {
    setBrowserIsLocalhost(isLocalHostName());
    setEnvironmentReady(true);
  }, []);

  useEffect(() => {
    if (insecureConnection) setHideInsecureBanner(getDismissedInsecureNotice());
  }, [insecureConnection]);

  const dismissInsecureNotice = () => {
    try {
      window.localStorage.setItem(INSECURE_NOTICE_KEY, "1");
    } catch {
      // Storage can be blocked in private/restricted browsing modes.
    }
    setHideInsecureBanner(true);
  };

  const activePermission =
    permissionsPrompt?.mode === "notification"
      ? permissionsPrompt?.notification
      : permissionsPrompt?.mode === "microphone"
        ? permissionsPrompt?.microphone
        : null;
  const permissionMode = permissionsPrompt?.mode;
  const permissionLabel =
    permissionMode === "notification"
      ? localize("Enable notifications")
      : localize("Enable microphone");
  const showPermissionNotice = Boolean(
    isChatsTab && permissionsPrompt?.show && activePermission?.show,
  );
  const showInsecureBanner = Boolean(
    isChatsTab &&
    insecureConnection &&
    environmentReady &&
    !hideInsecureBanner &&
    !isLocalhost,
  );
  const connectionStatus = !isConnected
    ? localize("Connecting...")
    : isUpdating
      ? localize("Updating...")
      : null;

  const createAction = (callback) => {
    // Do not restore focus here: the action may open a modal or new screen.
    setShowCreateMenu(false);
    callback?.();
  };

  return (
    <header
      className={`ouj-glass ouj-sidebar-header relative shrink-0 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900 ${
        isCallsMode ? "py-2" : "pt-2 pb-2.5"
      }`}
    >
      {isChatsTab && (
        <div className="ouj-sidebar-brand-row mb-1.5 flex min-h-10 items-center justify-between gap-2 px-1">
          <div className="min-w-0 flex-1">
            <BrandIdentity compact />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeSwitcher isDark={isDark} onToggle={toggleTheme} />
            <LanguageSwitcher compact />
          </div>
        </div>
      )}

      <div className="flex min-h-11 w-full items-center justify-between gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {isSearchMode || editMode ? (
            <button
              type="button"
              onClick={isSearchMode ? closeSearch : onExitEdit}
              className={iconButton}
              aria-label={localize(
                isSearchMode ? "Close search" : "Exit edit mode",
              )}
            >
              <Close size={20} aria-hidden="true" />
            </button>
          ) : (
            <>
              {showAccountMenu && (
                <div className="hidden shrink-0 md:inline-flex">
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
                    onEnterEdit={
                      isCallsMode ? onEnterCallsEditMode : onEnterEdit
                    }
                    canEdit={hasChats}
                    handleLogout={handleLogout}
                    onOpenOwnProfile={onOpenOwnProfile}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={isCallsMode ? onEnterCallsEditMode : onEnterEdit}
                disabled={!hasChats}
                className={`${iconButton} md:hidden disabled:cursor-not-allowed disabled:opacity-40`}
                aria-label={localize(editAriaLabel)}
                title={localize(editAriaLabel)}
              >
                <Pencil size={19} aria-hidden="true" />
              </button>
            </>
          )}

          <div className="min-w-0 flex-1 ps-0.5">
            <h2 className="min-w-0 truncate text-[17px] font-bold leading-6 text-slate-900 dark:text-slate-100">
              {!editMode && !isSearchMode && chatsScrollable ? (
                <button
                  type="button"
                  onClick={onScrollToTop}
                  className="max-w-full truncate rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  title={localize("{value0} to top", { value0: title })}
                  aria-label={localize("{value0} to top", { value0: title })}
                >
                  {localize(title)}
                </button>
              ) : editMode ? (
                localize("Edit")
              ) : isSearchMode ? (
                localize("Search")
              ) : (
                localize(title)
              )}
            </h2>
            {editMode && selectedChatsCount > 0 ? (
              <p className="text-[11px] font-medium tabular-nums text-brand-600 dark:text-brand-300">
                {selectedChatsCount}
              </p>
            ) : connectionStatus && !editMode ? (
              <p
                className="flex items-center gap-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400"
                role="status"
              >
                <LoaderCircle
                  size={12}
                  className="animate-spin text-brand-500"
                  aria-hidden="true"
                />
                {connectionStatus}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1">
          {editMode ? (
            <button
              type="button"
              onClick={isCallsMode ? onDeleteCalls : onDeleteChats}
              disabled={!selectedChatsCount}
              className={destructiveButton}
              aria-label={localize(deleteAriaLabel)}
              title={localize(deleteAriaLabel)}
            >
              <Trash size={19} aria-hidden="true" />
            </button>
          ) : isSearchMode ? (
            <span className="inline-block h-10 w-10" aria-hidden="true" />
          ) : isCallsMode ? (
            <button
              type="button"
              onClick={onNewCall}
              disabled={Boolean(isInCall || callsDisabled)}
              className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40`}
              title={
                callsDisabled
                  ? localize("Calls are disabled by the server")
                  : isInCall
                    ? localize("Already in a call")
                    : localize(newCallAriaLabel)
              }
              aria-label={localize(newCallAriaLabel)}
            >
              <PhoneCall size={20} aria-hidden="true" />
            </button>
          ) : (
            <div className="relative">
              <button
                ref={createButtonRef}
                type="button"
                onClick={() => setShowCreateMenu((previous) => !previous)}
                className={`${iconButton} text-brand-700 dark:text-brand-200`}
                aria-label={localize("Create")}
                aria-haspopup="menu"
                aria-expanded={showCreateMenu}
                aria-controls={showCreateMenu ? createMenuId : undefined}
                title={localize("Create")}
              >
                <Plus size={23} strokeWidth={2} aria-hidden="true" />
              </button>
              {showCreateMenu && (
                <AnchoredMenu
                  anchorRef={createButtonRef}
                  onClose={closeCreateMenu}
                  id={createMenuId}
                  label={localize("Create")}
                  align="end"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={createItemClass}
                    onClick={() => createAction(onNewChat)}
                  >
                    <Chat
                      size={19}
                      className="shrink-0 text-brand-500"
                      aria-hidden="true"
                    />
                    {localize("New DM")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={createItemClass}
                    onClick={() => createAction(onNewGroup)}
                  >
                    <Users
                      size={19}
                      className="shrink-0 text-brand-500"
                      aria-hidden="true"
                    />
                    {localize("New group")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={createItemClass}
                    onClick={() => createAction(onNewChannel)}
                  >
                    <Megaphone
                      size={19}
                      className="shrink-0 text-brand-500"
                      aria-hidden="true"
                    />
                    {localize("New channel")}
                  </button>
                </AnchoredMenu>
              )}
            </div>
          )}
        </div>
      </div>

      {isChatsTab && (
        <div className="mt-1.5">
          <div className="ouj-sidebar-search group relative flex h-10 items-center rounded-xl border border-brand-200 bg-white transition-[background-color,border-color,box-shadow] duration-150 hover:border-brand-300 focus-within:border-brand-400 focus-within:bg-white/80 focus-within:ring-2 focus-within:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:hover:border-brand-500/50 dark:focus-within:border-brand-500 dark:focus-within:bg-slate-950 motion-reduce:transition-none">
            <label
              htmlFor={searchId}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-brand-600 group-focus-within:text-brand-700 dark:text-brand-300 dark:group-focus-within:text-brand-200"
            >
              <Search size={18} aria-hidden="true" />
            </label>
            <input
              id={searchId}
              ref={searchInputRef}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => onChatsSearchChange?.(event.target.value)}
              onFocus={onChatsSearchFocus}
              onBlur={(event) => {
                // Clicking or tabbing into results must not unmount them before
                // the result button receives its click/keyboard action.
                if (
                  isSearchMode &&
                  event.relatedTarget?.closest?.(".ouj-chats-list")
                )
                  return;
                onChatsSearchBlur?.(event);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeSearch();
                }
              }}
              placeholder={localize("Search")}
              aria-label={localize("Search")}
              dir="auto"
              className={`ouj-sidebar-search-input h-full w-full min-w-0 rounded-xl bg-transparent ps-10 pe-10 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500 ${hasPersian(query) ? "font-fa" : ""}`}
              style={{ unicodeBidi: "plaintext" }}
            />
            {hasSearchText && (
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChatsSearchChange?.("");
                  searchInputRef.current?.focus({ preventScroll: true });
                }}
                className="absolute end-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 outline-none transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                aria-label={localize("Clear search")}
              >
                <Close size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {showPermissionNotice && (
        <div className="mt-2.5 flex min-h-11 items-center gap-1 rounded-xl border border-brand-200/80 bg-brand-50/70 p-1.5 dark:border-brand-500/30 dark:bg-brand-500/10">
          <button
            type="button"
            onClick={activePermission.onRequest}
            disabled={typeof activePermission.onRequest !== "function"}
            className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-start text-xs font-medium text-brand-800 outline-none hover:bg-brand-100/70 focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default dark:text-brand-200 dark:hover:bg-brand-500/10"
          >
            {permissionMode === "notification" ? (
              <Bell size={17} className="shrink-0" aria-hidden="true" />
            ) : (
              <Mic size={17} className="shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">{permissionLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => permissionsPrompt?.onDismiss?.(permissionMode)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-700 outline-none hover:bg-brand-100/70 focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-200 dark:hover:bg-brand-500/10"
            aria-label={localize("Dismiss")}
          >
            <Close size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {showInsecureBanner && (
        <div className="mt-2.5 flex min-h-11 items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 px-2.5 py-1.5 dark:border-rose-500/30 dark:bg-rose-900/40">
          <AlertCircle
            size={17}
            className="shrink-0 text-rose-600 dark:text-rose-300"
            aria-hidden="true"
          />
          <span
            className="min-w-0 flex-1 text-xs font-medium text-rose-700 dark:text-rose-100"
            role="status"
          >
            {localize("Connection is not secure")}
          </span>
          <button
            type="button"
            onClick={dismissInsecureNotice}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-600 outline-none hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-400 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label={localize("Dismiss")}
          >
            <Close size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </header>
  );
}
