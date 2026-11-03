import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { SidebarFilters } from "../../chat/tools/MessagingToolbar.jsx";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ChatsListPanel from "../list/ChatsListPanel.jsx";
import CallsPanel from "../../call/CallsPanel.jsx";
import {
  MobileSettingsPanel,
} from "../../settings/index.js";
import SidebarHeader from "../header/SidebarHeader.jsx";

export default function ChatSidebar({
  mobileTab,
  isConnected,
  isUpdating,
  scrollEpoch = 0,
  chatsScrollToTopEpoch = 0,
  editMode,
  visibleChats: unfilteredChats,
  selectedChats,
  loadingChats,
  activeChatId,
  user,
  calls,
  loadingCalls,
  callsEditMode,
  selectedCalls,
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
  const preferences = new Map((messaging?.preferences || []).map((item) => [item.chat_id, item]));
  const visibleChats = unfilteredChats.filter((chat) => {
    const preference = preferences.get(chat.id) || {};
    const filter = messaging?.filter || "all";
    if (filter === "archived") return Boolean(Number(preference.archived));
    if (Number(preference.archived)) return false;
    if (filter === "unread") return Number(chat.unread_count) > 0;
    if (filter.startsWith("folder:")) return preference.folder === filter.slice(7);
    return filter === "all" || chat.type === filter;
  }).sort((a, b) => Number(preferences.get(b.id)?.pinned || 0) - Number(preferences.get(a.id)?.pinned || 0));
  const chatsScrollRef = useRef(null);
  const chatsContentRef = useRef(null);
  const [isChatsScrollable, setIsChatsScrollable] = useState(false);

  useLayoutEffect(() => {
    const scroller = chatsScrollRef.current;
    const content = chatsContentRef.current;
    if (!scroller) return undefined;
    const updateScrollable = () => {
      const next = scroller.scrollHeight - scroller.clientHeight > 4;
      setIsChatsScrollable((prev) => (prev === next ? prev : next));
    };

    updateScrollable();
    const raf1 = requestAnimationFrame(() => {
      updateScrollable();
      requestAnimationFrame(updateScrollable);
    });

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateScrollable);
      resizeObserver.observe(scroller);
      if (content) {
        resizeObserver.observe(content);
      }
    }

    let mutationObserver = null;
    if (typeof MutationObserver !== "undefined" && content) {
      mutationObserver = new MutationObserver(updateScrollable);
      mutationObserver.observe(content, {
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("resize", updateScrollable);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("resize", updateScrollable);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [visibleChats.length, chatsSearchQuery, chatsSearchFocused, scrollEpoch]);

  const handleChatsScroll = () => {
    const node = chatsScrollRef.current;
    if (!node) return;
    setIsChatsScrollable(node.scrollHeight - node.clientHeight > 4);
  };

  useEffect(() => {
    if (chatsScrollToTopEpoch === 0) return;
    chatsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [chatsScrollToTopEpoch]);

  const handleNavigateChats = () => {
    setMobileTab?.("chats");
    setSettingsPanel?.(null);
  };

  const handleNavigateSettings = () => {
    setMobileTab?.("settings");
    setSettingsPanel?.(null);
  };

  const handleNavigateCalls = () => {
    setMobileTab?.("calls");
    setSettingsPanel?.(null);
  };

  return (
    <aside
      className={
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-lg shadow-brand-500/10 dark:border-white/5 dark:bg-slate-900 md:border md:w-[35%] md:shadow-xl md:shadow-brand-500/15 " +
        (mobileTab === "chat" ? "hidden md:block" : "block")
      }
    >
      <div className={mobileTab === "settings" ? "hidden" : ""}>
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
            mobileTab === "calls" ? selectedCalls.length : selectedChats.length
          }
          title={mobileTab === "calls" ? localize("Calls") : localize("Chats")}
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
          onScrollToTop={() => {
            chatsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
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

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden py-0"
        style={{ overscrollBehavior: "contain" }}
      >
        {mobileTab === "settings" ? (
          <div
            key={`settings-scroll-${scrollEpoch}`}
            className="flex h-full min-h-0 flex-col overflow-hidden"
            style={{
              overscrollBehaviorY: "contain",
              overflowAnchor: "none",
              WebkitOverflowScrolling: "touch",
              scrollbarGutter: "stable both-edges",
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
        ) : null}

        {mobileTab !== "settings" && mobileTab !== "calls" && <SidebarFilters />}
        <div
          className={
            mobileTab === "settings"
              ? "hidden min-h-0 flex-1"
              : "flex min-h-0 flex-1 flex-col"
          }
        >
          <div
            key={`chats-scroll-${scrollEpoch}`}
            ref={chatsScrollRef}
            className="app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-0 pb-[calc(104px+env(safe-area-inset-bottom))] md:pb-6"
            style={{
              overscrollBehaviorY: "contain",
              overflowAnchor: "none",
              WebkitOverflowScrolling: "touch",
              scrollbarGutter: "stable both-edges",
            }}
            onScroll={handleChatsScroll}
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
        </div>
      </div>
    </aside>
  );
}
