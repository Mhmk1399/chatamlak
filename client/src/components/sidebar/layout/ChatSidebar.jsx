"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  t as localize,
  useLocale as useAppLocale,
} from "../../../i18n/locale.js";
import { Phone, Settings } from "../../../icons/lucide.js";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import ConversationFilters from "../navigation/ConversationFilters.jsx";
import UserMenuButton from "../header/UserMenuButton.jsx";
import SidebarHeader from "../header/SidebarHeader.jsx";
import ChatsListPanel from "../list/ChatsListPanel.jsx";
import CallsPanel from "../../call/CallsPanel.jsx";
import { MobileSettingsPanel } from "../../settings/index.js";

function preferredScrollBehavior() {
  if (typeof window === "undefined") return "auto";
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export default function ChatSidebar({
  mobileTab,
  isConnected,
  isUpdating,
  scrollEpoch = 0,
  chatsScrollToTopEpoch = 0,
  editMode,
  visibleChats: unfilteredChats = [],
  selectedChats = [],
  loadingChats,
  activeChatId,
  user,
  calls = [],
  loadingCalls,
  callsEditMode,
  selectedCalls = [],
  toggleSelectCall,
  onEnterCallsEditMode,
  onExitCallsEditMode,
  onDeleteCall,
  onDeleteSelectedCalls,
  onOpenNewCall,
  onStartCall,
  callsDisabled = false,
  isInCall = false,
  formatChatTimestamp,
  requestDeleteChats,
  toggleSelectChat,
  setActiveChatId,
  setActivePeer,
  setMobileTab,
  setIsAtBottom,
  setUnreadInChat,
  lastMessageIdRef,
  isAtBottomRef,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenNewChannel,
  chatsSearchQuery,
  onChatsSearchChange,
  onChatsSearchFocus,
  onChatsSearchBlur,
  chatsSearchFocused,
  onCloseSearch,
  discoverLoading,
  discoverUsers,
  discoverGroups,
  discoverChannels,
  discoverSaved,
  isSavedChatActive,
  onOpenDiscoveredUser,
  onOpenDiscoveredGroup,
  onOpenUserProfileContext,
  onOpenSavedMessages,
  onOpenUserContextMenu,
  onOpenChatContextMenu,
  setSettingsPanel,
  toggleTheme,
  setIsDark,
  isDark,
  handleLogout,
  settingsPanel,
  displayName,
  statusTextClass,
  statusValue,
  handleProfileSave,
  avatarPreview,
  profileForm,
  handleAvatarChange,
  handleAvatarRemove,
  setProfileForm,
  statusSelection,
  setStatusSelection,
  handlePasswordSave,
  passwordForm,
  setPasswordForm,
  userColor,
  profileError,
  passwordError,
  fileUploadEnabled,
  notificationsSupported,
  notificationPermission,
  notificationsEnabled,
  notificationsDisabled,
  notificationStatusLabel,
  onToggleNotifications,
  onOpenNotifications,
  messagePreviewEnabled,
  onToggleMessagePreview,
  notificationsDebugLine,
  onClearCache,
  dataCacheStats,
  onDeleteAccount,
  appInfo,
  appInfoLoading,
  appInfoError,
  onExitEdit,
  onEnterEdit,
  onDeleteChats,
  onOpenOwnProfile,
  displayInitials,
  onOpenWhatsNew,
  adminPanelEnabled = true,
  permissionsPrompt = null,
  insecureConnection = false,
}) {
  useAppLocale();
  const messaging = useMessagingContext();
  const filter = messaging?.filter || "all";

  const visibleChats = useMemo(() => {
    const preferences = new Map(
      (messaging?.preferences || []).map((item) => [
        String(item.chat_id),
        item,
      ]),
    );

    return unfilteredChats
      .filter((chat) => {
        const preference = preferences.get(String(chat.id)) || {};
        const archived = Boolean(Number(preference.archived));

        if (filter === "archived") return archived;
        if (archived) return false;
        if (filter === "unread") return Number(chat.unread_count) > 0;
        if (filter.startsWith("folder:")) {
          return preference.folder === filter.slice(7);
        }
        return filter === "all" || chat.type === filter;
      })
      .sort((first, second) => {
        const firstPinned =
          Number(preferences.get(String(first.id))?.pinned) || 0;
        const secondPinned =
          Number(preferences.get(String(second.id))?.pinned) || 0;
        return secondPinned - firstPinned;
      });
  }, [unfilteredChats, messaging?.preferences, filter]);

  const chatsScrollRef = useRef(null);
  const chatsContentRef = useRef(null);
  const scrollPositionsRef = useRef({ chats: 0, calls: 0 });
  const previousFilterRef = useRef(filter);
  const previousSearchRef = useRef(null);
  const previousScrollEpochRef = useRef(scrollEpoch);
  const handledTopEpochRef = useRef(0);
  const scrollableRef = useRef(false);
  const [isChatsScrollable, setIsChatsScrollable] = useState(false);

  const activeListKey =
    mobileTab === "settings" ? null : mobileTab === "calls" ? "calls" : "chats";

  const updateScrollability = useCallback(() => {
    const scroller = chatsScrollRef.current;
    const next = Boolean(
      scroller && scroller.scrollHeight - scroller.clientHeight > 4,
    );
    if (next !== scrollableRef.current) {
      scrollableRef.current = next;
      setIsChatsScrollable(next);
    }
  }, []);

  const scrollListToTop = useCallback(() => {
    if (activeListKey) scrollPositionsRef.current[activeListKey] = 0;
    chatsScrollRef.current?.scrollTo({
      top: 0,
      behavior: preferredScrollBehavior(),
    });
  }, [activeListKey]);

  const handleChatsScroll = useCallback(() => {
    const scroller = chatsScrollRef.current;
    if (!scroller || !activeListKey) return;
    scrollPositionsRef.current[activeListKey] = scroller.scrollTop;
    updateScrollability();
  }, [activeListKey, updateScrollability]);

  // Each tab remembers its own scroll position, including when Settings unmounts the list.
  useLayoutEffect(() => {
    const scroller = chatsScrollRef.current;
    if (!scroller || !activeListKey) return;
    scroller.scrollTop = scrollPositionsRef.current[activeListKey] || 0;
  }, [activeListKey, scrollEpoch]);

  // scrollEpoch is the existing explicit reset contract from the parent.
  useLayoutEffect(() => {
    if (previousScrollEpochRef.current === scrollEpoch) return;
    previousScrollEpochRef.current = scrollEpoch;
    scrollPositionsRef.current = { chats: 0, calls: 0 };
    if (chatsScrollRef.current) chatsScrollRef.current.scrollTop = 0;
  }, [scrollEpoch]);

  // ResizeObserver tracks both the viewport and the actual content. No MutationObserver
  // is needed, and only one animation frame is ever outstanding.
  useLayoutEffect(() => {
    const scroller = chatsScrollRef.current;
    if (!scroller) {
      updateScrollability();
      return undefined;
    }

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateScrollability);
    };
    updateScrollability();
    measure();

    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(scroller);
      if (chatsContentRef.current) observer.observe(chatsContentRef.current);
    }
    window.addEventListener("resize", measure, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [
    activeListKey,
    visibleChats.length,
    calls.length,
    filter,
    loadingChats,
    loadingCalls,
    discoverLoading,
    chatsSearchQuery,
    chatsSearchFocused,
    scrollEpoch,
    updateScrollability,
  ]);

  useEffect(() => {
    if (
      chatsScrollToTopEpoch === 0 ||
      chatsScrollToTopEpoch === handledTopEpochRef.current
    ) {
      return;
    }
    handledTopEpochRef.current = chatsScrollToTopEpoch;
    if (activeListKey === "chats") scrollListToTop();
  }, [chatsScrollToTopEpoch, activeListKey, scrollListToTop]);

  // A different folder or search should start at the first result, not midway down.
  useEffect(() => {
    if (previousFilterRef.current === filter) return;
    previousFilterRef.current = filter;
    scrollPositionsRef.current.chats = 0;
    if (activeListKey === "chats" && chatsScrollRef.current) {
      chatsScrollRef.current.scrollTop = 0;
    }
  }, [filter, activeListKey]);

  useEffect(() => {
    const searchKey = `${Boolean(chatsSearchFocused)}:${chatsSearchQuery || ""}`;
    if (previousSearchRef.current === null) {
      previousSearchRef.current = searchKey;
      return;
    }
    if (previousSearchRef.current === searchKey) return;
    previousSearchRef.current = searchKey;
    scrollPositionsRef.current.chats = 0;
    if (activeListKey === "chats" && chatsScrollRef.current) {
      chatsScrollRef.current.scrollTop = 0;
    }
  }, [chatsSearchFocused, chatsSearchQuery, activeListKey]);

  const navigateTo = useCallback(
    (tab) => {
      setMobileTab?.(tab);
      setSettingsPanel?.(null);
    },
    [setMobileTab, setSettingsPanel],
  );
  const handleNavigateChats = useCallback(
    () => navigateTo("chats"),
    [navigateTo],
  );
  const handleNavigateCalls = useCallback(
    () => navigateTo("calls"),
    [navigateTo],
  );
  const handleNavigateSettings = useCallback(
    () => navigateTo("settings"),
    [navigateTo],
  );

  const railActionBase =
    "ouj-rail-action group relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-tight outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 motion-reduce:transition-none";
  const railActionIdle =
    "text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-200";
  const railActionActive =
    "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200";

  return (
    <>
      <div className="ouj-folder-rail hidden h-full min-h-0 w-[76px] shrink-0 flex-col items-center gap-1 border-e border-slate-200 bg-white px-1.5 pb-2 pt-2 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="flex w-full shrink-0 justify-center pb-1">
          <UserMenuButton
            triggerVariant="navigation"
            user={user}
            displayName={displayName}
            displayInitials={displayInitials}
            userColor={userColor}
            statusValue={statusValue}
            statusTextClass={statusTextClass}
            mobileTab={mobileTab}
            onNavigateChats={handleNavigateChats}
            onNavigateCalls={handleNavigateCalls}
            onNavigateSettings={handleNavigateSettings}
            onEnterEdit={
              mobileTab === "calls" ? onEnterCallsEditMode : onEnterEdit
            }
            canEdit={
              mobileTab === "calls"
                ? Boolean(calls.length)
                : Boolean(visibleChats.length)
            }
            handleLogout={handleLogout}
            onOpenOwnProfile={onOpenOwnProfile}
          />
        </div>

        <ConversationFilters variant="rail" onSelect={handleNavigateChats} />

        <div className="mt-auto flex w-full shrink-0 flex-col gap-1 border-t border-slate-200 pt-2 dark:border-slate-800">
          <button
            type="button"
            aria-label={localize("Calls")}
            aria-current={mobileTab === "calls" ? "page" : undefined}
            title={localize("Calls")}
            onClick={handleNavigateCalls}
            className={`${railActionBase} ${
              mobileTab === "calls" ? railActionActive : railActionIdle
            }`}
          >
            <Phone size={21} aria-hidden="true" strokeWidth={1.9} />
            <span className="max-w-full truncate">{localize("Calls")}</span>
          </button>
          <button
            type="button"
            aria-label={localize("Settings")}
            aria-current={mobileTab === "settings" ? "page" : undefined}
            title={localize("Settings")}
            onClick={handleNavigateSettings}
            className={`${railActionBase} ${
              mobileTab === "settings" ? railActionActive : railActionIdle
            }`}
          >
            <Settings size={21} aria-hidden="true" strokeWidth={1.9} />
            <span className="max-w-full truncate">{localize("Settings")}</span>
          </button>
        </div>
      </div>

      <aside
        aria-label={
          mobileTab === "settings"
            ? localize("Settings")
            : mobileTab === "calls"
              ? localize("Calls")
              : localize("Chats")
        }
        className={`ouj-chat-sidebar relative isolate h-full min-h-0 min-w-0 w-full shrink-0 flex-col overflow-hidden border-x border-slate-300/80 bg-white dark:border-white/5 dark:bg-slate-900 ${
          mobileTab === "chat" ? "hidden md:flex" : "flex"
        }`}
      >
        {mobileTab !== "settings" && (
          <div className="relative z-10 shrink-0 bg-white dark:bg-slate-900">
            <SidebarHeader
              isDark={isDark}
              toggleTheme={toggleTheme}
              mobileTab={mobileTab}
              editMode={mobileTab === "calls" ? callsEditMode : editMode}
              onExitEdit={
                mobileTab === "calls" ? onExitCallsEditMode : onExitEdit
              }
              isConnected={isConnected}
              isUpdating={isUpdating}
              hasChats={
                mobileTab === "calls"
                  ? Boolean(calls.length)
                  : Boolean(visibleChats.length)
              }
              selectedChatsCount={
                mobileTab === "calls"
                  ? selectedCalls.length
                  : selectedChats.length
              }
              title={
                mobileTab === "calls" ? localize("Calls") : localize("Chats")
              }
              editAriaLabel={
                mobileTab === "calls" ? "Edit call list" : "Edit chat list"
              }
              deleteAriaLabel={
                mobileTab === "calls" ? "Delete calls" : "Delete chats"
              }
              onEnterCallsEditMode={onEnterCallsEditMode}
              onExitCallsEditMode={onExitCallsEditMode}
              onDeleteCalls={onDeleteSelectedCalls}
              onNewCall={onOpenNewCall}
              callsDisabled={callsDisabled}
              isInCall={isInCall}
              onEnterEdit={onEnterEdit}
              onDeleteChats={onDeleteChats}
              onNewChat={onOpenNewChat}
              onNewGroup={onOpenNewGroup}
              onNewChannel={onOpenNewChannel}
              chatsSearchQuery={chatsSearchQuery}
              chatsSearchFocused={chatsSearchFocused}
              onChatsSearchChange={onChatsSearchChange}
              onChatsSearchFocus={onChatsSearchFocus}
              onChatsSearchBlur={onChatsSearchBlur}
              onCloseSearch={onCloseSearch}
              chatsScrollable={isChatsScrollable}
              onScrollToTop={scrollListToTop}
              permissionsPrompt={permissionsPrompt}
              insecureConnection={insecureConnection}
              user={user}
              displayName={displayName}
              displayInitials={displayInitials}
              userColor={userColor}
              statusValue={statusValue}
              statusTextClass={statusTextClass}
              onNavigateChats={handleNavigateChats}
              onNavigateSettings={handleNavigateSettings}
              onNavigateCalls={handleNavigateCalls}
              handleLogout={handleLogout}
              onOpenOwnProfile={onOpenOwnProfile}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">
          {mobileTab === "settings" ? (
            <div
              key={`settings-scroll-${scrollEpoch}`}
              className="flex h-full min-h-0 flex-col overflow-hidden"
              style={{
                overscrollBehaviorY: "contain",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <MobileSettingsPanel
                settingsPanel={settingsPanel}
                user={user}
                displayName={displayName}
                statusTextClass={statusTextClass}
                statusValue={statusValue}
                setSettingsPanel={setSettingsPanel}
                toggleTheme={toggleTheme}
                setIsDark={setIsDark}
                isDark={isDark}
                handleLogout={handleLogout}
                statusSelection={statusSelection}
                setStatusSelection={setStatusSelection}
                profileForm={profileForm}
                setProfileForm={setProfileForm}
                avatarPreview={avatarPreview}
                handleAvatarChange={handleAvatarChange}
                handleAvatarRemove={handleAvatarRemove}
                handleProfileSave={handleProfileSave}
                profileError={profileError}
                passwordForm={passwordForm}
                setPasswordForm={setPasswordForm}
                handlePasswordSave={handlePasswordSave}
                passwordError={passwordError}
                userColor={userColor}
                displayInitials={displayInitials}
                fileUploadEnabled={fileUploadEnabled}
                notificationsSupported={notificationsSupported}
                notificationPermission={notificationPermission}
                notificationsEnabled={notificationsEnabled}
                notificationsDisabled={notificationsDisabled}
                notificationStatusLabel={notificationStatusLabel}
                onToggleNotifications={onToggleNotifications}
                onOpenNotifications={onOpenNotifications}
                messagePreviewEnabled={messagePreviewEnabled}
                onToggleMessagePreview={onToggleMessagePreview}
                notificationsDebugLine={notificationsDebugLine}
                onClearCache={onClearCache}
                dataCacheStats={dataCacheStats}
                onOpenOwnProfile={onOpenOwnProfile}
                onOpenSavedMessages={onOpenSavedMessages}
                onDeleteAccount={onDeleteAccount}
                appInfo={appInfo}
                appInfoLoading={appInfoLoading}
                appInfoError={appInfoError}
                onOpenWhatsNew={onOpenWhatsNew}
                adminPanelEnabled={adminPanelEnabled}
                onNavigateChats={handleNavigateChats}
                onNavigateCalls={handleNavigateCalls}
              />
            </div>
          ) : (
            <>
              {mobileTab !== "calls" && (
                <div className="shrink-0 md:hidden">
                  <ConversationFilters variant="tabs" />
                </div>
              )}

              <div
                key={`chats-scroll-${scrollEpoch}`}
                ref={chatsScrollRef}
                role="region"
                aria-label={
                  mobileTab === "calls" ? localize("Calls") : localize("Chats")
                }
                aria-busy={Boolean(
                  mobileTab === "calls" ? loadingCalls : loadingChats,
                )}
                className="app-scroll ouj-sidebar-list-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-0 pb-[calc(104px_+_env(safe-area-inset-bottom))] md:pb-4"
                onScroll={handleChatsScroll}
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <div ref={chatsContentRef} className="min-h-0">
                  {mobileTab === "calls" ? (
                    <CallsPanel
                      loadingCalls={loadingCalls}
                      calls={calls}
                      user={user}
                      callsEditMode={callsEditMode}
                      selectedCalls={selectedCalls}
                      toggleSelectCall={toggleSelectCall}
                      onRequestDeleteCall={onDeleteCall}
                      onStartCall={onStartCall}
                      callsDisabled={callsDisabled}
                      isInCall={isInCall}
                    />
                  ) : (
                    <ChatsListPanel
                      loadingChats={loadingChats}
                      visibleChats={visibleChats}
                      user={user}
                      editMode={editMode}
                      activeChatId={activeChatId}
                      selectedChats={selectedChats}
                      formatChatTimestamp={formatChatTimestamp}
                      requestDeleteChats={requestDeleteChats}
                      toggleSelectChat={toggleSelectChat}
                      setActiveChatId={setActiveChatId}
                      setActivePeer={setActivePeer}
                      setMobileTab={setMobileTab}
                      setIsAtBottom={setIsAtBottom}
                      setUnreadInChat={setUnreadInChat}
                      lastMessageIdRef={lastMessageIdRef}
                      isAtBottomRef={isAtBottomRef}
                      chatsSearchQuery={chatsSearchQuery}
                      chatsSearchFocused={chatsSearchFocused}
                      discoverLoading={discoverLoading}
                      discoverUsers={discoverUsers}
                      discoverGroups={discoverGroups}
                      discoverChannels={discoverChannels}
                      discoverSaved={discoverSaved}
                      isSavedChatActive={isSavedChatActive}
                      onOpenDiscoveredUser={onOpenDiscoveredUser}
                      onOpenDiscoveredGroup={onOpenDiscoveredGroup}
                      onOpenUserProfileContext={onOpenUserProfileContext}
                      onOpenSavedMessages={onOpenSavedMessages}
                      onOpenUserContextMenu={onOpenUserContextMenu}
                      onOpenChatContextMenu={onOpenChatContextMenu}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
