"use client";

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { t as localize, useLocale as useAppLocale } from "../i18n/locale.js";
import { useGroupCall } from "../hooks/chat/useGroupCall.js";
import { GroupCallMedia } from "../components/chat/tools/GroupCallPanel.jsx";
import {
  MessagingContext,
  useMessagingTools,
} from "../hooks/chat/useMessagingTools.js";
import {
  ChatAppearanceContext,
  useChatAppearance,
} from "../hooks/chat/useChatAppearance.js";
import {
  completePermissionSetup,
  INSTALL_GUIDE_EVENT,
  PERMISSION_SETUP_EVENT,
  permissionSetupPending,
} from "../utils/devicePermissions.js";
import {
  saveOutboxMessage,
  readOutboxMessages,
  removeOutboxMessage,
} from "../utils/chatOutbox.js";
import { readChatDraft } from "../utils/chatDrafts.js";
import MobileTabMenu from "../components/navigation/MobileTabMenu.jsx";
import ChatWindowPanel from "../components/chat/ChatWindowPanel.jsx";
import ChatLayout from "../components/chat/ChatLayout.jsx";
import { CallScreen } from "../components/call/CallScreen.jsx";
import { ChatSidebar } from "../components/sidebar/index.js";
import AppContextMenu from "../components/context-menu/AppContextMenu.jsx";
import { useAppContextMenu } from "../components/context-menu/useAppContextMenu.js";
import { CHAT_PAGE_CONFIG } from "../settings/chatPageConfig.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import { getRandomAvatarColor } from "../utils/avatarColor.js";
import {
  NICKNAME_MAX,
  USERNAME_MAX,
  USERNAME_REGEX,
} from "../utils/nameLimits.js";
import {
  resolveReplyPreview,
  summarizeFiles,
  truncateText,
} from "../utils/messagePreview.js";
import {
  formatBytesAsMb,
  formatChatCardTimestamp,
  formatDayLabel,
  formatTime,
  parseServerDate,
} from "../utils/chatFormat.js";
import { useChatEvents } from "../hooks/chat/useChatEvents.js";
import { useChatScroll } from "../hooks/chat/useChatScroll.js";
import { useChatCacheStats } from "../hooks/chat/useChatCacheStats.js";
import { useChatNotifications } from "../hooks/chat/useChatNotifications.js";
import { useDiscoverSearch } from "../hooks/chat/useDiscoverSearch.js";
import { useActiveChatState } from "../hooks/chat/useActiveChatState.js";
import { useAppActivity } from "../hooks/chat/useAppActivity.js";
import { useDmUsernames } from "../hooks/chat/useDmUsernames.js";
import { useHealthCheck } from "../hooks/chat/useHealthCheck.js";
import { useMessagesLoader } from "../hooks/chat/useMessagesLoader.js";
import { useMobileViewport } from "../hooks/chat/useMobileViewport.js";
import { useNewChatSearch } from "../hooks/chat/useNewChatSearch.js";
import { useNewGroupModal } from "../hooks/chat/useNewGroupModal.js";
import { usePerfTelemetry } from "../hooks/chat/usePerfTelemetry.js";
import { useResumeRefresh } from "../hooks/chat/useResumeRefresh.js";
import { useMessageVisibility } from "../hooks/chat/useMessageVisibility.js";
import { useWebRTCCall } from "../hooks/chat/useWebRTCCall.js";
import { isCallSupported } from "../utils/callCapabilities.js";
import { useAppReleaseInfo } from "../hooks/useAppReleaseInfo.js";
import { Bookmark } from "../icons/lucide.js";
import { CLIPBOARD_COPY_EVENT } from "../utils/clipboard.js";
import { CACHE_STORES } from "../utils/cacheDb.js";
import { downloadMessageFiles } from "../utils/fileDownload.js";
import {
  CHAT_CACHE_VERSION,
  buildChatListCacheKey,
  buildMessagesCacheKey,
  canUseIdb,
  deleteIdbCache,
  normalizeMessageBody,
  normalizeMessagesForRender,
  pruneMessagesIndex,
  readChatListCacheAsync,
  readMessagesCacheAsync,
  readMessagesIndexAsync,
  sanitizeMessagesForCache,
  readChannelSeenCacheAsync,
  writeChannelSeenCacheAsync,
  writeIdbCache,
  migrateLocalCacheToIdb,
  updateMessagesIndex,
  writeMessagesIndex,
} from "../utils/chatCache.js";
import { getMessageFiles } from "../utils/messageContent.js";
import {
  isMessageAuthoredByUser,
  isMessageFromOtherUser,
  isRemoteChannelMessage,
} from "../utils/messageOwnership.js";
import { normalizeUuid, isValidUuid } from "../utils/uuidUtils.js";
import {
  createDmChat,
  discoverUsersAndGroups,
  createChannelChat,
  createGroupChat,
  deleteMessage,
  deleteAccount,
  deleteGroupChat,
  editMessage,
  fetchHealth,
  getProfileByUsername,
  fetchPresence,
  getChatPreview,
  getGroupInviteLink,
  getMessagesUploadUrl,
  getSseStreamUrl,
  hideChats,
  leaveGroupChat,
  listChatsForUser,
  listCalls,
  listMessagesByQuery,
  logout,
  markMessageRead,
  markMessagesRead as markAllMessagesRead,
  fetchFirstUnreadMessage,
  deleteCall,
  searchUsers,
  sendTypingIndicator,
  sendMessage,
  removeGroupMember,
  removeGroupAvatar,
  regenerateGroupInviteLink,
  setChatMute,
  getRemoteChannelSettings,
  updateChannelChat,
  getMessageReadCounts,
  updateRemoteChannelSettings,
  updateGroupChat,
  uploadGroupAvatar,
  getSavedMessagesChat,
  fetchPushPublicKey,
  forwardMessage,
  subscribePush,
  unsubscribePush,
  sendPushTest,
  updatePassword,
  updateProfile,
  updateStatus as updateStatusRequest,
  uploadAvatar,
  uploadAvatarFile,
  prepareFilesForMessage,
} from "../api/chatApi.js";
import { useMessageMaxChars } from "../settings/appConfig.js";
import {
  MOBILE_CLOSE_ANIMATION_MS,
  NEW_CHAT_SEARCH_DEBOUNCE_MS,
  NOTIFICATION_PREVIEW_MAX_CHARS,
  OPEN_CHAT_ID_KEY,
  UPLOAD_PROGRESS_HIDE_DELAY_MS,
} from "../utils/chatPageConstants.js";

import styles from "./ChatPage.module.css";

// ─── Code splitting ───────────────────────────────────────────────────────────
const loadChatProfileModal = () =>
  import("../components/modals/ChatProfileModal.jsx");
const loadDeleteChatsModal = () =>
  import("../components/modals/DeleteChatsModal.jsx");
const loadDeleteMessageScopeModal = () =>
  import("../components/modals/DeleteMessageScopeModal.jsx");
const loadForwardMessageModal = () =>
  import("../components/modals/ForwardMessageModal.jsx");
const loadLeaveGroupModal = () =>
  import("../components/modals/LeaveGroupModal.jsx");
const loadGroupInviteLinkModal = () =>
  import("../components/modals/GroupInviteLinkModal.jsx");
const loadNewChatModal = () => import("../components/modals/NewChatModal.jsx");
const loadNewCallModal = () => import("../components/modals/NewCallModal.jsx");
const loadNewGroupModal = () =>
  import("../components/modals/NewGroupModal.jsx");
const loadDesktopSettingsModal = () =>
  import("../components/settings/modals/DesktopSettingsModal.jsx").then(
    (module) => ({
      default: module.DesktopSettingsModal,
    }),
  );
const loadNotificationsSettingsModal = () =>
  import("../components/settings/modals/NotificationsSettingsModal.jsx").then(
    (module) => ({
      default: module.NotificationsSettingsModal,
    }),
  );
const loadWhatsNewModal = () =>
  import("../components/modals/WhatsNewModal.jsx");

const ChatProfileModal = lazy(loadChatProfileModal);
const DeleteChatsModal = lazy(loadDeleteChatsModal);
const DeleteMessageScopeModal = lazy(loadDeleteMessageScopeModal);
const ForwardMessageModal = lazy(loadForwardMessageModal);
const LeaveGroupModal = lazy(loadLeaveGroupModal);
const GroupInviteLinkModal = lazy(loadGroupInviteLinkModal);
const NewChatModal = lazy(loadNewChatModal);
const NewCallModal = lazy(loadNewCallModal);
const NewGroupModal = lazy(loadNewGroupModal);
const DesktopSettingsModal = lazy(loadDesktopSettingsModal);
const NotificationsSettingsModal = lazy(loadNotificationsSettingsModal);
const WhatsNewModal = lazy(loadWhatsNewModal);
const ChatToolsDialog = lazy(
  () => import("../components/chat/tools/ChatToolsDialog.jsx"),
);
const DevicePermissionsSetup = lazy(
  () => import("../components/pwa/DevicePermissionsSetup.jsx"),
);

const CRITICAL_CHUNKS = [
  loadNewChatModal,
  loadNewCallModal,
  loadNewGroupModal,
  loadDesktopSettingsModal,
  loadNotificationsSettingsModal,
  loadWhatsNewModal,
];
const LAZY_CHUNKS = [
  loadChatProfileModal,
  loadDeleteChatsModal,
  loadDeleteMessageScopeModal,
  loadForwardMessageModal,
  loadLeaveGroupModal,
  loadGroupInviteLinkModal,
  ...CRITICAL_CHUNKS,
];
const preloadChatPageCriticalChunks = () =>
  Promise.allSettled(CRITICAL_CHUNKS.map((load) => load()));
const preloadChatPageLazyChunks = () =>
  Promise.allSettled(LAZY_CHUNKS.map((load) => load()));

function resolveChunkPreloadMode() {
  if (typeof navigator === "undefined") return "eager";
  const network = /** @type {any} */ (navigator);
  const connection =
    network.connection || network.mozConnection || network.webkitConnection;
  if (!connection) return "eager";
  if (connection.saveData) return "idle";
  const type = String(connection.effectiveType || "").toLowerCase();
  return type === "slow-2g" || type === "2g" ? "idle" : "eager";
}

// ─── Cache and domain helpers ─────────────────────────────────────────────────
const IN_MEMORY_MESSAGES_CACHE_MAX_CHATS = 8;
const IN_MEMORY_MESSAGES_PER_CHAT = 480;
const IN_MEMORY_MESSAGES_CACHE_STALE_MS = 20 * 60 * 1000;
const TYPING_IDLE_TIMEOUT_MS = 3000;
const TYPING_SIGNAL_THROTTLE_MS = 1500;
const TYPING_REMOTE_TTL_MS = 5000;
const PERMISSION_DISMISS_PREFIX = "songbird-permission-dismiss-";
const PERMISSION_DISMISS_MS = 3 * 24 * 60 * 60 * 1000;
const PERMISSION_PROMPT_DELAY_MS = 1000;
const DEFAULT_AVATAR_COLOR = "#66308d";

const getMessageContextKey = (message) =>
  String(message?._clientId ?? message?._serverId ?? message?.id ?? "");

function pruneMessagesForMemory(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list.length <= IN_MEMORY_MESSAGES_PER_CHAT
    ? list
    : list.slice(-IN_MEMORY_MESSAGES_PER_CHAT);
}

function normalizeMessagesCachePayloadForMemory(payload) {
  if (!payload || !Array.isArray(payload.messages)) return payload;
  const messages = pruneMessagesForMemory(payload.messages);
  if (messages === payload.messages) return payload;
  return {
    ...payload,
    messages,
    hasOlderMessages: true,
    lastMessageId: messages.length
      ? messages[messages.length - 1]?.id || null
      : null,
    updatedAt: Date.now(),
  };
}

function readMessagesCacheMemory(cacheMap, chatId) {
  const key = String(chatId || "");
  if (!key || !cacheMap?.has(key)) return null;
  const value = cacheMap.get(key);
  cacheMap.delete(key);
  cacheMap.set(key, value);
  return value;
}

function pruneMessagesCacheMemory(cacheMap, activeChatId = null) {
  if (!cacheMap?.size) return;
  const activeId = String(activeChatId || "");
  const now = Date.now();
  const expired = [];
  cacheMap.forEach((value, key) => {
    const updatedAt = Number(value?.updatedAt || 0);
    if (
      updatedAt &&
      String(key) !== activeId &&
      now - updatedAt > IN_MEMORY_MESSAGES_CACHE_STALE_MS
    ) {
      expired.push(key);
    }
  });
  expired.forEach((key) => cacheMap.delete(key));
  while (cacheMap.size > IN_MEMORY_MESSAGES_CACHE_MAX_CHATS) {
    const oldest = cacheMap.keys().next().value;
    if (oldest === undefined) break;
    if (activeId && String(oldest) === activeId && cacheMap.size > 1) {
      const value = cacheMap.get(oldest);
      cacheMap.delete(oldest);
      cacheMap.set(oldest, value);
      continue;
    }
    cacheMap.delete(oldest);
  }
}

function writeMessagesCacheMemory(
  cacheMap,
  chatId,
  payload,
  activeChatId = null,
) {
  const key = String(chatId || "");
  if (!key || !payload || !cacheMap) return;
  cacheMap.delete(key);
  cacheMap.set(key, normalizeMessagesCachePayloadForMemory(payload));
  pruneMessagesCacheMemory(cacheMap, activeChatId || key);
}

function patchChatAndMoveToFront(chats, chatId, updateChat) {
  const target = String(chatId || "");
  if (!target) return chats;
  const index = chats.findIndex((chat) => String(chat?.id || "") === target);
  if (index < 0) return chats;
  const updated = updateChat(chats[index]);
  if (!updated || updated === chats[index]) return chats;
  const next = chats.slice();
  next.splice(index, 1);
  next.unshift(updated);
  return next;
}

const normalizeInviteUsername = (value) =>
  String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

function buildInvitePathForChat(chat) {
  const visibility = String(
    chat?.group_visibility || chat?.visibility || "public",
  )
    .trim()
    .toLowerCase();
  const username = normalizeInviteUsername(
    chat?.group_username || chat?.username,
  );
  if (visibility === "public" && username) {
    return `/invite/${encodeURIComponent(username)}`;
  }
  const token = String(chat?.inviteToken || chat?.invite_token || "").trim();
  return token ? `/invite/${encodeURIComponent(token)}` : "";
}

function buildInviteLinkForChat(chat) {
  const path = buildInvitePathForChat(chat);
  if (!path) return "";
  if (typeof window === "undefined") return path;
  const origin = String(window.location?.origin || "").replace(/\/+$/, "");
  return origin ? `${origin}${path}` : path;
}

function readPermissionDismissed(kind) {
  if (typeof window === "undefined") return false;
  const key = `${PERMISSION_DISMISS_PREFIX}${kind}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const until = Number(raw);
    if (Number.isFinite(until) && until > Date.now()) return true;
    window.localStorage.removeItem(key);
    return false;
  } catch {
    // Storage may be blocked (private browsing or hardened security settings).
    return false;
  }
}

function getNetworkBackoffMultiplier() {
  if (typeof navigator === "undefined") return 1;
  const network = /** @type {any} */ (navigator);
  const connection =
    network.connection || network.mozConnection || network.webkitConnection;
  if (!connection) return 1;
  let factor = connection.saveData ? 2.2 : 1;
  const type = String(connection.effectiveType || "").toLowerCase();
  if (type === "slow-2g" || type === "2g") factor = Math.max(factor, 2.5);
  else if (type === "3g") factor = Math.max(factor, 1.6);
  return factor;
}

const isAmbiguousSendStatus = (status) =>
  [502, 503, 504].includes(Number(status || 0));
function createAmbiguousSendError(status, message) {
  return Object.assign(
    new Error(message || `Unable to confirm delivery (HTTP ${status}).`),
    { _ambiguousSendStatus: Number(status || 0) },
  );
}

// ─── Chat page ────────────────────────────────────────────────────────────────

/** Persistent controller state, kept separate from async business operations. */
function useChatPageState(user) {
  // Chat, message, navigation and overlay state
  const [loadingChats, setLoadingChats] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activePeer, setActivePeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [channelSeenCounts, setChannelSeenCounts] = useState({});
  const [sseConnected, setSseConnected] = useState(false);
  const [mobileTab, setMobileTab] = useState("chats");
  const [sidebarScrollEpoch, setSidebarScrollEpoch] = useState(0);
  const [chatsScrollToTopEpoch, setChatsScrollToTopEpoch] = useState(0);
  const [isUpdatingChats, setIsUpdatingChats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(null);
  const [chatsSearchFocused, setChatsSearchFocused] = useState(false);
  const [showFloatingLabel, setShowFloatingLabel] = useState(false);

  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callsEditMode, setCallsEditMode] = useState(false);
  const [selectedCalls, setSelectedCalls] = useState([]);
  const [newCallOpen, setNewCallOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [confirmDeleteCallOpen, setConfirmDeleteCallOpen] = useState(false);
  const [pendingDeleteCallIds, setPendingDeleteCallIds] = useState([]);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [pendingLeaveChatId, setPendingLeaveChatId] = useState(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [unreadInChat, setUnreadInChat] = useState(0);
  const [unreadMarkerId, setUnreadMarkerId] = useState(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [pendingUploadType, setPendingUploadType] = useState("");
  const [pendingVoiceMessage, setPendingVoiceMessage] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [activeUploadProgress, setActiveUploadProgress] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [messageDeleteScopeOpen, setMessageDeleteScopeOpen] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null);
  const [forwardMessageTarget, setForwardMessageTarget] = useState(null);
  const [forwardSavedChat, setForwardSavedChat] = useState(null);
  const [forwardedChatPreviewById, setForwardedChatPreviewById] = useState({});
  const [forwardedUserPreviewByKey, setForwardedUserPreviewByKey] = useState(
    {},
  );
  const [forwardedChatPreviewTick, setForwardedChatPreviewTick] = useState(0);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [resultTarget, setResultTarget] = useState(null);
  const [typingByChat, setTypingByChat] = useState({});
  const [peerPresence, setPeerPresence] = useState({
    status: "offline",
    rawStatus: "offline",
    lastSeen: null,
  });

  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalMember, setProfileModalMember] = useState(null);
  const [profileInviteLink, setProfileInviteLink] = useState("");
  const [profileInviteLinkLoading, setProfileInviteLinkLoading] =
    useState(false);
  const [profileRemoteChannelStatus, setProfileRemoteChannelStatus] =
    useState(null);
  const [mentionProfile, setMentionProfile] = useState(null);
  const [mentionRefreshToken] = useState(0);
  const [editingGroup, setEditingGroup] = useState(false);
  const [profileForm, setProfileForm] = useState({
    nickname: user?.nickname || "",
    username: user?.username || "",
    avatarUrl: user?.avatarUrl || "",
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || "");
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState("");
  const [groupAvatarMarkedForRemoval, setGroupAvatarMarkedForRemoval] =
    useState(false);
  const [pendingGroupAvatarFile, setPendingGroupAvatarFile] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [statusSelection, setStatusSelection] = useState(
    user?.status || "online",
  );
  const [permissionSetupOpen, setPermissionSetupOpen] = useState(() =>
    permissionSetupPending(user),
  );
  const [microphonePermission, setMicrophonePermission] = useState("unknown");
  const [microphonePermissionSupported, setMicrophonePermissionSupported] =
    useState(false);
  const [permissionPromptDelayUntil, setPermissionPromptDelayUntil] =
    useState(0);
  const [permissionsDismissed, setPermissionsDismissed] = useState(() => ({
    notification: readPermissionDismissed("notification"),
    microphone: readPermissionDismissed("microphone"),
  }));

  // Persistent DOM references and coordination refs
  const settingsMenuRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const chatScrollRef = useRef(null);
  const composerInputRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const activeChatTypeRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const pendingScrollToBottomRef = useRef(false);
  const pendingScrollToUnreadRef = useRef(null);
  const unreadMarkerIdRef = useRef(null);
  const openingHadUnreadRef = useRef(false);
  const openingUnreadCountRef = useRef(0);
  const allowStartReachedRef = useRef(false);
  const unreadAnchorLockUntilRef = useRef(0);
  const unreadAlignTimersRef = useRef([]);
  const suppressScrolledUpRef = useRef(false);
  const shouldAutoMarkReadRef = useRef(true);
  const openingChatRef = useRef(false);
  const smoothScrollLockRef = useRef(0);
  const pendingUploadFilesRef = useRef([]);
  const pendingVoiceMessageRef = useRef(null);
  const prevUploadProgressRef = useRef(null);
  const activeUploadProgressHideTimerRef = useRef(null);
  const mediaLoadSnapTimerRef = useRef(null);
  const messageRefreshTimerRef = useRef(null);
  const updateToastTimerRef = useRef(null);
  const copyToastTimerRef = useRef(null);
  const forwardedChatPreviewInFlightRef = useRef(new Set());
  const forwardedUserPreviewInFlightRef = useRef(new Set());
  const channelSeenQueueRef = useRef([]);
  const channelSeenActiveRef = useRef(false);
  const channelSeenLoadedRef = useRef(new Set());
  const channelSeenTimerRef = useRef(null);
  const channelSeenLatestRefreshRef = useRef(0);
  const messagesRef = useRef([]);
  const messagesCacheRef = useRef(new Map());
  const messagesCacheWriteTimerRef = useRef(null);
  const lastCacheWriteChatIdRef = useRef(null);
  const seenMessageIdsRef = useRef(new Set());
  const pendingGroupAvatarFileRef = useRef(null);
  const messageBlobUrlsRef = useRef(new Set());
  const lazyChunksPreloadedRef = useRef(false);
  const presenceStateRef = useRef(new Map());
  const typingStateRef = useRef({ chatId: 0, isTyping: false, lastSentAt: 0 });
  const typingStopTimerRef = useRef(null);
  const typingExpiryTimersRef = useRef(new Map());
  const sseReconnectRef = useRef(null);
  const isMarkingReadRef = useRef(false);
  const sendingClientIdsRef = useRef(new Set());
  const usernameRef = useRef(String(user?.username || ""));
  const loadChatsRef = useRef(null);
  const scheduleMessageRefreshRef = useRef(null);
  const loadChatsAbortRef = useRef(null);
  const loadChatsInFlightRef = useRef(false);
  const queuedLoadChatsOptionsRef = useRef(null);
  const realtimeSenderRef = useRef(null);
  const outboxRetryStateRef = useRef(new Map());
  const outboxSendRef = useRef(null);
  const previousTopicRef = useRef("");

  return {
    loadingChats,
    setLoadingChats,
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    activePeer,
    setActivePeer,
    messages,
    setMessages,
    loadingOlderMessages,
    setLoadingOlderMessages,
    channelSeenCounts,
    setChannelSeenCounts,
    sseConnected,
    setSseConnected,
    mobileTab,
    setMobileTab,
    sidebarScrollEpoch,
    setSidebarScrollEpoch,
    chatsScrollToTopEpoch,
    setChatsScrollToTopEpoch,
    isUpdatingChats,
    setIsUpdatingChats,
    showSettings,
    setShowSettings,
    settingsPanel,
    setSettingsPanel,
    chatsSearchFocused,
    setChatsSearchFocused,
    showFloatingLabel,
    setShowFloatingLabel,
    calls,
    setCalls,
    loadingCalls,
    setLoadingCalls,
    callsEditMode,
    setCallsEditMode,
    selectedCalls,
    setSelectedCalls,
    newCallOpen,
    setNewCallOpen,
    editMode,
    setEditMode,
    selectedChats,
    setSelectedChats,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    pendingDeleteIds,
    setPendingDeleteIds,
    confirmDeleteCallOpen,
    setConfirmDeleteCallOpen,
    pendingDeleteCallIds,
    setPendingDeleteCallIds,
    confirmLeaveOpen,
    setConfirmLeaveOpen,
    pendingLeaveChatId,
    setPendingLeaveChatId,
    isAtBottom,
    setIsAtBottom,
    userScrolledUp,
    setUserScrolledUp,
    unreadInChat,
    setUnreadInChat,
    unreadMarkerId,
    setUnreadMarkerId,
    pendingUploadFiles,
    setPendingUploadFiles,
    pendingUploadType,
    setPendingUploadType,
    pendingVoiceMessage,
    setPendingVoiceMessage,
    uploadError,
    setUploadError,
    activeUploadProgress,
    setActiveUploadProgress,
    replyTarget,
    setReplyTarget,
    editTarget,
    setEditTarget,
    messageDeleteScopeOpen,
    setMessageDeleteScopeOpen,
    pendingDeleteMessage,
    setPendingDeleteMessage,
    forwardMessageTarget,
    setForwardMessageTarget,
    forwardSavedChat,
    setForwardSavedChat,
    forwardedChatPreviewById,
    setForwardedChatPreviewById,
    forwardedUserPreviewByKey,
    setForwardedUserPreviewByKey,
    forwardedChatPreviewTick,
    setForwardedChatPreviewTick,
    copyToastVisible,
    setCopyToastVisible,
    resultTarget,
    setResultTarget,
    typingByChat,
    setTypingByChat,
    peerPresence,
    setPeerPresence,
    profileError,
    setProfileError,
    passwordError,
    setPasswordError,
    profileModalOpen,
    setProfileModalOpen,
    profileModalMember,
    setProfileModalMember,
    profileInviteLink,
    setProfileInviteLink,
    profileInviteLinkLoading,
    setProfileInviteLinkLoading,
    profileRemoteChannelStatus,
    setProfileRemoteChannelStatus,
    mentionProfile,
    setMentionProfile,
    mentionRefreshToken,
    editingGroup,
    setEditingGroup,
    profileForm,
    setProfileForm,
    avatarPreview,
    setAvatarPreview,
    pendingAvatarFile,
    setPendingAvatarFile,
    groupAvatarPreview,
    setGroupAvatarPreview,
    groupAvatarMarkedForRemoval,
    setGroupAvatarMarkedForRemoval,
    pendingGroupAvatarFile,
    setPendingGroupAvatarFile,
    passwordForm,
    setPasswordForm,
    statusSelection,
    setStatusSelection,
    permissionSetupOpen,
    setPermissionSetupOpen,
    microphonePermission,
    setMicrophonePermission,
    microphonePermissionSupported,
    setMicrophonePermissionSupported,
    permissionPromptDelayUntil,
    setPermissionPromptDelayUntil,
    permissionsDismissed,
    setPermissionsDismissed,
    settingsMenuRef,
    settingsButtonRef,
    chatScrollRef,
    composerInputRef,
    activeChatIdRef,
    activeChatTypeRef,
    lastMessageIdRef,
    isAtBottomRef,
    userScrolledUpRef,
    pendingScrollToBottomRef,
    pendingScrollToUnreadRef,
    unreadMarkerIdRef,
    openingHadUnreadRef,
    openingUnreadCountRef,
    allowStartReachedRef,
    unreadAnchorLockUntilRef,
    unreadAlignTimersRef,
    suppressScrolledUpRef,
    shouldAutoMarkReadRef,
    openingChatRef,
    smoothScrollLockRef,
    pendingUploadFilesRef,
    pendingVoiceMessageRef,
    prevUploadProgressRef,
    activeUploadProgressHideTimerRef,
    mediaLoadSnapTimerRef,
    messageRefreshTimerRef,
    updateToastTimerRef,
    copyToastTimerRef,
    forwardedChatPreviewInFlightRef,
    forwardedUserPreviewInFlightRef,
    channelSeenQueueRef,
    channelSeenActiveRef,
    channelSeenLoadedRef,
    channelSeenTimerRef,
    channelSeenLatestRefreshRef,
    messagesRef,
    messagesCacheRef,
    messagesCacheWriteTimerRef,
    lastCacheWriteChatIdRef,
    seenMessageIdsRef,
    pendingGroupAvatarFileRef,
    messageBlobUrlsRef,
    lazyChunksPreloadedRef,
    presenceStateRef,
    typingStateRef,
    typingStopTimerRef,
    typingExpiryTimersRef,
    sseReconnectRef,
    isMarkingReadRef,
    sendingClientIdsRef,
    usernameRef,
    loadChatsRef,
    scheduleMessageRefreshRef,
    loadChatsAbortRef,
    loadChatsInFlightRef,
    queuedLoadChatsOptionsRef,
    realtimeSenderRef,
    outboxRetryStateRef,
    outboxSendRef,
    previousTopicRef,
  };
}

/**
 * Presentation-only layer. All mutations and async operations live in
 * ChatPageController; this layer preserves existing child-component APIs.
 */
function ChatPageView({ model }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(styles.page);
    return () => root.classList.remove(styles.page);
  }, []);

  const {
    acceptCall,
    activeChat,
    activeChatId,
    activeChatMuted,
    activeFallbackTitle,
    activeGroupAvatarColor,
    activeGroupAvatarUrl,
    activeHeaderAvatar,
    activeHeaderAvatarIcon,
    activeUploadProgress,
    adminPanelEnabled,
    appInfo,
    appInfoError,
    appInfoLoading,
    avatarPreview,
    callDuration,
    callEndReason,
    callQuality,
    callState,
    callType,
    calls,
    callsEditMode,
    canCurrentUserViewInvite,
    canDeleteMessageForEveryone,
    canJoinMentionChat,
    canSendInActiveChat,
    canStartChat,
    canSwipeReply,
    channelSeenCounts,
    chatAppearance,
    chatScrollRef,
    chats,
    chatsScrollToTopEpoch,
    chatsSearchFocused,
    chatsSearchQuery,
    clearPendingUploads,
    clearPendingVoiceMessage,
    closeChat,
    closeContextMenu,
    closeNewChatModal,
    closeNewGroupModal,
    closeProfileModal,
    composerInputRef,
    confirmDeleteCall,
    confirmDeleteCallOpen,
    confirmDeleteChats,
    confirmDeleteOpen,
    confirmLeaveGroupById,
    confirmLeaveOpen,
    contextMenu,
    copyToastVisible,
    createdGroupInviteLink,
    createdGroupInviteType,
    creatingGroup,
    dataCacheStats,
    discoverChannels,
    discoverGroups,
    discoverLoading,
    discoverSaved,
    discoverUsers,
    dismissPermissionsPrompt,
    dismissWhatsNew,
    displayInitials,
    displayName,
    displayedGroupInviteLink,
    editMode,
    editTarget,
    editingGroup,
    enableNotifications,
    endCall,
    exitSearchMode,
    fileUploadInProgress,
    forwardMessageTarget,
    forwardSavedChat,
    forwardedChatStatusById,
    forwardedChatsById,
    forwardedUserStatusByKey,
    forwardedUsersById,
    groupAvatarPreview,
    groupInviteOpen,
    groupModalType,
    handleAvatarChange,
    handleAvatarRemove,
    handleChatScrollWithSeen,
    handleClearCache,
    handleClearEdit,
    handleClearReply,
    handleCreateGroup,
    handleDeleteAccount,
    handleDeleteActiveGroup,
    handleDeleteCalls,
    handleDeleteChats,
    handleEnterEdit,
    handleExitEdit,
    handleFloatingDayNavigate,
    handleForwardMessageSubmit,
    handleGroupAvatarChange,
    handleGroupAvatarRemove,
    handleJoinMentionChat,
    handleJumpToLatest,
    handleLogout,
    handleMessageInput,
    handleMessageMediaLoaded,
    handleNewCallSubmit,
    handleOpenForwardModal,
    handleOpenForwardOrigin,
    handleOpenNewCall,
    handleOpenProfileChat,
    handleOpenSettings,
    handleOpenWhatsNew,
    handlePasswordSave,
    handleProfileRemoteChannelStatusChange,
    handleProfileSave,
    handleProfileStartVideoCall,
    handleProfileStartVoiceCall,
    handleRegenerateGroupInvite,
    handleRemoveGroupMember,
    handleSend,
    handleStartCallFromRow,
    handleStartReached,
    handleStartReply,
    handleStartVideoCall,
    handleStartVoiceCall,
    handleTestPush,
    handleToggleMessagePreview,
    handleToggleNotifications,
    handleUploadFilesSelected,
    handleUserScrollIntent,
    handleVoiceRecorded,
    hasOlderMessages,
    headerAvatarColor,
    isActiveChannelChat,
    isActiveGroupChat,
    isActiveSavedChat,
    isAtBottom,
    isAtBottomRef,
    isCallClosing,
    isCameraOff,
    isCameraUnavailable,
    isConnected,
    isDark,
    isInCall,
    isMentionProfileReadOnly,
    isMuted,
    isOffline,
    isRemoteCameraOff,
    isSpeakerOn,
    isUpdatingChats,
    lastMessageIdRef,
    loadingCalls,
    loadingChats,
    loadingMessages,
    loadingOlderMessages,
    localVideoRef,
    mentionProfile,
    mentionProfileChat,
    mentionProfileUser,
    mentionRefreshToken,
    messageDeleteScopeOpen,
    messageMaxChars,
    messagePreviewEnabled,
    messages,
    messaging,
    messagingValue,
    microphonePermission,
    mobileTab,
    newCallOpen,
    newChatError,
    newChatLoading,
    newChatOpen,
    newChatResults,
    newChatSelection,
    newChatUsername,
    newGroupError,
    newGroupForm,
    newGroupMembers,
    newGroupOpen,
    newGroupSearch,
    newGroupSearchLoading,
    newGroupSearchResults,
    notificationPermission,
    notificationStatusLabel,
    notificationsActive,
    notificationsDebugLine,
    notificationsDisabled,
    notificationsEnabled,
    notificationsModalOpen,
    notificationsSupported,
    openActiveChatProfile,
    openContextMenu,
    openDiscoverGroup,
    openDiscoverUser,
    openEditGroupFromProfile,
    openMemberProfileFromList,
    openMemberProfileFromMessage,
    openMentionProfile,
    openNewChannelModal,
    openNewGroupModal,
    openOwnProfileModal,
    openSavedMessages,
    openSelfProfileEditor,
    passwordError,
    passwordForm,
    pendingDeleteCallIds,
    pendingDeleteIds,
    pendingDeleteMessage,
    pendingLeaveChatId,
    pendingUploadFiles,
    pendingUploadType,
    pendingVoiceMessage,
    performDeleteMessage,
    permissionSetupOpen,
    permissionsPrompt,
    profileError,
    profileForm,
    profileInviteLink,
    profileInviteLinkLoading,
    profileModalMember,
    profileModalOpen,
    profileRemoteChannelStatus,
    profileTargetUser,
    pushSubscribeStatus,
    regeneratingGroupInviteLink,
    registerMessageRef,
    rejectCall,
    remoteAudioRef,
    remoteVideoRef,
    removePendingUpload,
    replyTarget,
    requestDeleteCall,
    requestDeleteChats,
    requestLeaveGroupById,
    requestMicrophonePermission,
    resolvedCallPeer,
    resolvedHeaderSubtitle,
    selectedCalls,
    selectedChats,
    setActiveChatId,
    setActivePeer,
    setCallsEditMode,
    setChatsScrollToTopEpoch,
    setChatsSearchFocused,
    setChatsSearchQuery,
    setConfirmDeleteCallOpen,
    setConfirmDeleteOpen,
    setConfirmLeaveOpen,
    setCreatedGroupInviteType,
    setForwardMessageTarget,
    setForwardSavedChat,
    setGroupInviteOpen,
    setIsAtBottom,
    setIsDark,
    setMessageDeleteScopeOpen,
    setMobileTab,
    setNewCallOpen,
    setNewChatError,
    setNewChatOpen,
    setNewChatSelection,
    setNewChatUsername,
    setNewGroupError,
    setNewGroupForm,
    setNewGroupMembers,
    setNewGroupSearch,
    setNotificationsModalOpen,
    setPasswordForm,
    setPendingDeleteMessage,
    setPendingLeaveChatId,
    setPermissionSetupOpen,
    setProfileForm,
    setSelectedCalls,
    setSettingsPanel,
    setStatusSelection,
    setUnreadInChat,
    settingsButtonRef,
    settingsMenuRef,
    settingsPanel,
    shouldShowMembersList,
    showFloatingLabel,
    showGroupInviteManagement,
    showSettings,
    sidebarScrollEpoch,
    smoothScrollLockRef,
    sseConnected,
    startDirectMessage,
    statusSelection,
    statusTextClass,
    statusValue,
    toggleCamera,
    toggleMute,
    toggleMuteChat,
    toggleSelectCall,
    toggleSelectChat,
    toggleSpeaker,
    toggleTheme,
    typingIndicator,
    unreadInChat,
    unreadMarkerId,
    uploadError,
    user,
    userColor,
    userScrolledUp,
    visibleChats,
    whatsNewOpen,
  } = model;
  return (
    <ChatAppearanceContext.Provider value={chatAppearance}>
      <MessagingContext.Provider value={messagingValue}>
        <ChatLayout>
          <ChatSidebar
            mobileTab={mobileTab}
            isConnected={isConnected}
            isUpdating={isUpdatingChats}
            scrollEpoch={sidebarScrollEpoch}
            chatsScrollToTopEpoch={chatsScrollToTopEpoch}
            editMode={editMode}
            visibleChats={visibleChats}
            selectedChats={selectedChats}
            loadingChats={loadingChats}
            activeChatId={activeChatId}
            user={user}
            calls={calls}
            loadingCalls={loadingCalls}
            callsEditMode={callsEditMode}
            selectedCalls={selectedCalls}
            toggleSelectCall={toggleSelectCall}
            onEnterCallsEditMode={() => {
              if (calls.length) setCallsEditMode(true);
            }}
            onExitCallsEditMode={() => {
              setCallsEditMode(false);
              setSelectedCalls([]);
            }}
            onDeleteCall={requestDeleteCall}
            onDeleteSelectedCalls={handleDeleteCalls}
            onOpenNewCall={handleOpenNewCall}
            onStartCall={handleStartCallFromRow}
            callsDisabled={!CHAT_PAGE_CONFIG.callsEnabled}
            isInCall={isInCall}
            formatChatTimestamp={formatChatCardTimestamp}
            requestDeleteChats={requestDeleteChats}
            toggleSelectChat={toggleSelectChat}
            setActiveChatId={setActiveChatId}
            setActivePeer={setActivePeer}
            setMobileTab={setMobileTab}
            setIsAtBottom={setIsAtBottom}
            setUnreadInChat={setUnreadInChat}
            lastMessageIdRef={lastMessageIdRef}
            isAtBottomRef={isAtBottomRef}
            onOpenNewChat={() => setNewChatOpen(true)}
            onOpenNewGroup={openNewGroupModal}
            onOpenNewChannel={openNewChannelModal}
            chatsSearchQuery={chatsSearchQuery}
            onChatsSearchChange={setChatsSearchQuery}
            onChatsSearchFocus={() => {
              if (editMode) handleExitEdit();
              setChatsSearchFocused(true);
            }}
            onChatsSearchBlur={() => {}}
            chatsSearchFocused={chatsSearchFocused}
            onCloseSearch={exitSearchMode}
            discoverLoading={discoverLoading}
            discoverUsers={discoverUsers}
            discoverGroups={discoverGroups}
            discoverChannels={discoverChannels}
            discoverSaved={discoverSaved}
            isSavedChatActive={isActiveSavedChat}
            onOpenDiscoveredUser={openDiscoverUser}
            onOpenDiscoveredGroup={openDiscoverGroup}
            onOpenUserProfileContext={openMemberProfileFromList}
            onOpenUserContextMenu={openContextMenu}
            onOpenChatContextMenu={openContextMenu}
            showSettings={showSettings}
            settingsMenuRef={settingsMenuRef}
            setSettingsPanel={setSettingsPanel}
            toggleTheme={toggleTheme}
            setIsDark={setIsDark}
            isDark={isDark}
            handleLogout={handleLogout}
            settingsPanel={settingsPanel}
            displayName={displayName}
            statusTextClass={statusTextClass}
            statusValue={statusValue}
            handleProfileSave={handleProfileSave}
            avatarPreview={avatarPreview}
            profileForm={profileForm}
            handleAvatarChange={handleAvatarChange}
            handleAvatarRemove={handleAvatarRemove}
            setProfileForm={setProfileForm}
            statusSelection={statusSelection}
            setStatusSelection={setStatusSelection}
            handlePasswordSave={handlePasswordSave}
            passwordForm={passwordForm}
            setPasswordForm={setPasswordForm}
            userColor={userColor}
            profileError={profileError}
            passwordError={passwordError}
            fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
            notificationsSupported={notificationsSupported}
            notificationPermission={notificationPermission}
            notificationsEnabled={notificationsEnabled}
            notificationsDisabled={notificationsDisabled}
            notificationStatusLabel={notificationStatusLabel}
            onToggleNotifications={handleToggleNotifications}
            onOpenNotifications={() => setNotificationsModalOpen(true)}
            messagePreviewEnabled={messagePreviewEnabled}
            onToggleMessagePreview={handleToggleMessagePreview}
            notificationsDebugLine={notificationsDebugLine}
            onOpenSavedMessages={openSavedMessages}
            onClearCache={handleClearCache}
            dataCacheStats={dataCacheStats}
            onDeleteAccount={handleDeleteAccount}
            appInfo={appInfo}
            appInfoLoading={appInfoLoading}
            appInfoError={appInfoError}
            onExitEdit={handleExitEdit}
            onEnterEdit={handleEnterEdit}
            onDeleteChats={handleDeleteChats}
            onOpenSettings={handleOpenSettings}
            onOpenOwnProfile={openOwnProfileModal}
            settingsButtonRef={settingsButtonRef}
            displayInitials={displayInitials}
            onOpenWhatsNew={handleOpenWhatsNew}
            adminPanelEnabled={adminPanelEnabled}
            permissionsPrompt={permissionsPrompt}
            insecureConnection={
              typeof window !== "undefined" &&
              window.location.protocol !== "https:"
            }
          />

          <ChatWindowPanel
            mobileTab={mobileTab}
            isOffline={isOffline}
            sseConnected={sseConnected}
            activeChatId={activeChatId}
            activeChat={activeChat}
            closeChat={closeChat}
            activeHeaderPeer={activeHeaderAvatar}
            activeFallbackTitle={activeFallbackTitle}
            peerStatusLabel={resolvedHeaderSubtitle}
            typingIndicator={typingIndicator}
            isGroupChat={isActiveGroupChat}
            isChannelChat={isActiveChannelChat}
            isSavedChat={isActiveSavedChat}
            groupAvatarColor={activeGroupAvatarColor}
            groupAvatarUrl={activeGroupAvatarUrl}
            channelSeenCounts={channelSeenCounts}
            chatScrollRef={chatScrollRef}
            composerInputRef={composerInputRef}
            smoothScrollLockRef={smoothScrollLockRef}
            isAtBottomRef={isAtBottomRef}
            onChatScroll={handleChatScrollWithSeen}
            onStartReached={handleStartReached}
            messages={messages}
            user={user}
            formatTime={formatTime}
            unreadMarkerId={unreadMarkerId}
            loadingMessages={loadingMessages}
            loadingOlderMessages={loadingOlderMessages}
            hasOlderMessages={hasOlderMessages}
            handleSend={handleSend}
            userScrolledUp={userScrolledUp}
            isAtBottom={isAtBottom}
            unreadInChat={unreadInChat}
            onJumpToLatest={handleJumpToLatest}
            isConnected={isConnected}
            isDark={isDark}
            pendingUploadFiles={pendingUploadFiles}
            pendingUploadType={pendingUploadType}
            pendingVoiceMessage={pendingVoiceMessage}
            maxVideoNoteBytes={Math.min(
              CHAT_PAGE_CONFIG.maxFileSizeBytes,
              CHAT_PAGE_CONFIG.maxTotalUploadBytes,
            )}
            uploadError={uploadError}
            activeUploadProgress={activeUploadProgress}
            messageMaxChars={messageMaxChars}
            onMessageMediaLoaded={handleMessageMediaLoaded}
            onUploadFilesSelected={handleUploadFilesSelected}
            onRemovePendingUpload={removePendingUpload}
            onClearPendingUploads={clearPendingUploads}
            onVoiceRecorded={handleVoiceRecorded}
            onClearPendingVoiceMessage={clearPendingVoiceMessage}
            onMessageInput={handleMessageInput}
            replyTarget={replyTarget}
            onClearReply={handleClearReply}
            editTarget={editTarget}
            onClearEdit={handleClearEdit}
            onReplyToMessage={handleStartReply}
            onOpenHeaderProfile={openActiveChatProfile}
            onOpenMessageSenderProfile={openMemberProfileFromMessage}
            onOpenMention={openMentionProfile}
            onOpenForwardOrigin={handleOpenForwardOrigin}
            forwardedChatsById={forwardedChatsById}
            forwardedChatStatusById={forwardedChatStatusById}
            forwardedUsersById={forwardedUsersById}
            forwardedUserStatusByKey={forwardedUserStatusByKey}
            onForwardMessage={handleOpenForwardModal}
            onOpenContextMenu={openContextMenu}
            onUserScrollIntent={handleUserScrollIntent}
            onFloatingDayNavigate={handleFloatingDayNavigate}
            canSwipeReply={canSwipeReply}
            fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
            fileUploadInProgress={
              fileUploadInProgress || activeUploadProgress !== null
            }
            showComposer={canSendInActiveChat}
            isChannelMuted={activeChatMuted}
            onToggleChannelMute={() => toggleMuteChat(activeChat?.id)}
            headerClickable={!isActiveSavedChat}
            showStatus={!isActiveSavedChat}
            headerAvatarIcon={activeHeaderAvatarIcon}
            headerAvatarColor={headerAvatarColor}
            mentionRefreshToken={mentionRefreshToken}
            copyToastVisible={copyToastVisible}
            microphonePermissionStatus={microphonePermission}
            onRequestMicrophonePermission={requestMicrophonePermission}
            registerMessageRef={registerMessageRef}
            onStartVoiceCall={handleStartVoiceCall}
            onStartVideoCall={handleStartVideoCall}
            callsDisabled={!CHAT_PAGE_CONFIG.callsEnabled}
            videoCallsDisabled={!CHAT_PAGE_CONFIG.videoCallsEnabled}
            isInCall={isInCall}
            isDmChat={
              !isActiveGroupChat && !isActiveChannelChat && !isActiveSavedChat
            }
            permissionsPrompt={permissionsPrompt}
            showFloatingLabel={showFloatingLabel}
          />

          {callState !== "idle" && (
            <CallScreen
              callState={callState}
              callEndReason={callEndReason}
              isCallClosing={isCallClosing}
              callType={callType}
              callPeer={resolvedCallPeer}
              callDuration={callDuration}
              callQuality={callQuality}
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              cameraUnavailable={
                isCameraUnavailable ||
                !CHAT_PAGE_CONFIG.callsEnabled ||
                !CHAT_PAGE_CONFIG.videoCallsEnabled
              }
              isRemoteCameraOff={isRemoteCameraOff}
              isSpeakerOn={isSpeakerOn}
              localVideoRef={localVideoRef}
              remoteVideoRef={remoteVideoRef}
              remoteAudioRef={remoteAudioRef}
              onAccept={acceptCall}
              onReject={rejectCall}
              onEnd={endCall}
              onToggleMute={toggleMute}
              onToggleCamera={toggleCamera}
              onToggleSpeaker={toggleSpeaker}
            />
          )}

          <MobileTabMenu
            hidden={Boolean(
              (mobileTab === "chat" && activeChatId) ||
              (mobileTab === "chats" &&
                (chatsSearchFocused || String(chatsSearchQuery || "").trim())),
            )}
            mobileTab={mobileTab}
            onChats={() => {
              if (mobileTab === "chats") {
                setChatsScrollToTopEpoch((previous) => previous + 1);
              } else {
                setMobileTab("chats");
                setSettingsPanel(null);
              }
            }}
            onCalls={() => {
              if (mobileTab !== "calls") {
                setMobileTab("calls");
                setSettingsPanel(null);
              }
            }}
            onSettings={() => setMobileTab("settings")}
          />

          {newChatOpen && (
            <Suspense fallback={null}>
              <NewChatModal
                open={newChatOpen}
                newChatUsername={newChatUsername}
                setNewChatUsername={setNewChatUsername}
                newChatError={newChatError}
                setNewChatError={setNewChatError}
                newChatResults={newChatResults}
                newChatSelection={newChatSelection}
                setNewChatSelection={setNewChatSelection}
                newChatLoading={newChatLoading}
                canStartChat={canStartChat}
                startDirectMessage={startDirectMessage}
                onClose={closeNewChatModal}
              />
            </Suspense>
          )}
          {confirmDeleteOpen && (
            <Suspense fallback={null}>
              <DeleteChatsModal
                open={confirmDeleteOpen}
                pendingDeleteIds={pendingDeleteIds}
                selectedChats={selectedChats}
                setConfirmDeleteOpen={setConfirmDeleteOpen}
                confirmDeleteChats={confirmDeleteChats}
              />
            </Suspense>
          )}
          {confirmDeleteCallOpen && (
            <Suspense fallback={null}>
              <DeleteChatsModal
                open={confirmDeleteCallOpen}
                title={localize("Delete calls")}
                pendingDeleteIds={pendingDeleteCallIds}
                selectedChats={[]}
                setConfirmDeleteOpen={setConfirmDeleteCallOpen}
                confirmDeleteChats={confirmDeleteCall}
              />
            </Suspense>
          )}
          {newCallOpen && (
            <Suspense fallback={null}>
              <NewCallModal
                open={newCallOpen}
                chats={chats}
                currentUser={user}
                onClose={() => setNewCallOpen(false)}
                onSubmit={handleNewCallSubmit}
              />
            </Suspense>
          )}
          {messageDeleteScopeOpen && (
            <Suspense fallback={null}>
              <DeleteMessageScopeModal
                open={messageDeleteScopeOpen}
                allowDeleteForEveryone={canDeleteMessageForEveryone(
                  pendingDeleteMessage,
                )}
                isOffline={isOffline}
                sseConnected={sseConnected}
                onClose={() => {
                  setMessageDeleteScopeOpen(false);
                  setPendingDeleteMessage(null);
                }}
                onConfirm={(deleteForEveryone) =>
                  performDeleteMessage(
                    pendingDeleteMessage,
                    deleteForEveryone ? "everyone" : "self",
                  )
                }
              />
            </Suspense>
          )}
          {forwardMessageTarget && (
            <Suspense fallback={null}>
              <ForwardMessageModal
                open={Boolean(forwardMessageTarget)}
                chats={chats}
                savedChat={forwardSavedChat}
                currentUser={user}
                sourceChatId={activeChatId}
                onClose={() => {
                  setForwardMessageTarget(null);
                  setForwardSavedChat(null);
                }}
                onSubmit={handleForwardMessageSubmit}
              />
            </Suspense>
          )}
          {confirmLeaveOpen && (
            <Suspense fallback={null}>
              <LeaveGroupModal
                open={confirmLeaveOpen}
                onClose={() => {
                  setConfirmLeaveOpen(false);
                  setPendingLeaveChatId(null);
                }}
                onConfirm={confirmLeaveGroupById}
                isChannel={chats.some(
                  (chat) =>
                    String(chat.id) === String(pendingLeaveChatId || "") &&
                    chat.type === "channel",
                )}
              />
            </Suspense>
          )}

          {newGroupOpen && (
            <Suspense fallback={null}>
              <NewGroupModal
                open={newGroupOpen}
                groupForm={newGroupForm}
                setGroupForm={setNewGroupForm}
                groupSearchQuery={newGroupSearch}
                setGroupSearchQuery={setNewGroupSearch}
                groupSearchResults={newGroupSearchResults}
                groupSearchLoading={newGroupSearchLoading}
                selectedGroupMembers={newGroupMembers}
                setSelectedGroupMembers={setNewGroupMembers}
                groupError={newGroupError}
                setGroupError={setNewGroupError}
                creatingGroup={creatingGroup}
                onCreate={handleCreateGroup}
                onClose={closeNewGroupModal}
                title={
                  editingGroup
                    ? localize("Edit {value0}", {
                        value0: localize(
                          groupModalType === "channel" ? "channel" : "group",
                        ),
                      })
                    : localize(
                        groupModalType === "channel"
                          ? "New channel"
                          : "New group",
                      )
                }
                submitLabel={
                  editingGroup ? localize("Save") : localize("Create")
                }
                avatarPreview={groupAvatarPreview}
                avatarColor={
                  editingGroup
                    ? activeChat?.group_color || DEFAULT_AVATAR_COLOR
                    : newGroupForm.groupColor || DEFAULT_AVATAR_COLOR
                }
                avatarName={
                  newGroupForm.nickname ||
                  newGroupForm.username ||
                  (groupModalType === "channel" ? "Channel" : "Group")
                }
                onAvatarChange={handleGroupAvatarChange}
                onAvatarRemove={handleGroupAvatarRemove}
                showAvatarField
                hideSelectedMemberChips={false}
                fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
                showInviteManagement={showGroupInviteManagement}
                currentInviteLink={displayedGroupInviteLink}
                regeneratingInviteLink={regeneratingGroupInviteLink}
                onRegenerateInvite={
                  editingGroup ? handleRegenerateGroupInvite : null
                }
                showRemoteChannelSettings={Boolean(
                  groupModalType === "channel" &&
                  appInfo?.remoteChannels?.uiEnabled,
                )}
                remoteChannelAvailable={Boolean(
                  appInfo?.remoteChannels?.enabled &&
                  appInfo?.remoteChannels?.uiEnabled,
                )}
                remoteChannelTelegramAvailable={Boolean(
                  appInfo?.remoteChannels?.telegramConfigured,
                )}
                remoteChannelSongbirdAvailable={Boolean(
                  appInfo?.remoteChannels?.songbirdConfigured,
                )}
                remoteChannelMediaStreamAllowed={Boolean(
                  appInfo?.remoteChannels?.mediaStreamEnabled,
                )}
                entityLabel={groupModalType === "channel" ? "Channel" : "Group"}
                onDeleteChat={editingGroup ? handleDeleteActiveGroup : null}
                chatId={editingGroup ? activeChat?.id : null}
                username={user?.username || ""}
              />
            </Suspense>
          )}
          {groupInviteOpen && (
            <Suspense fallback={null}>
              <GroupInviteLinkModal
                open={groupInviteOpen}
                inviteLink={createdGroupInviteLink}
                type={createdGroupInviteType}
                onClose={() => {
                  setGroupInviteOpen(false);
                  setCreatedGroupInviteType("group");
                }}
              />
            </Suspense>
          )}
          {profileModalOpen && (
            <Suspense fallback={null}>
              <ChatProfileModal
                open={profileModalOpen}
                chat={
                  mentionProfileChat ||
                  (mentionProfileUser || profileModalMember
                    ? { ...(activeChat || {}), type: "dm" }
                    : activeChat)
                }
                targetUser={profileTargetUser}
                currentUser={user}
                muted={activeChatMuted}
                inviteLink={profileInviteLink}
                inviteLinkLoading={profileInviteLinkLoading}
                initialRemoteChannelStatus={profileRemoteChannelStatus}
                onRemoteChannelStatusChange={
                  handleProfileRemoteChannelStatusChange
                }
                canViewInvite={canCurrentUserViewInvite}
                readOnly={Boolean(
                  isMentionProfileReadOnly ||
                  mentionProfile?._readOnly ||
                  profileModalMember?._readOnly,
                )}
                showJoinAction={canJoinMentionChat}
                onJoinChat={handleJoinMentionChat}
                showMembers={shouldShowMembersList}
                membersBatchSize={CHAT_PAGE_CONFIG.newChatSearchMaxResults}
                remoteChannelAvailable={Boolean(
                  appInfo?.remoteChannels?.enabled &&
                  appInfo?.remoteChannels?.uiEnabled &&
                  !(
                    mentionProfileChat &&
                    String(mentionProfileChat.id || "") !==
                      String(activeChat?.id || "")
                  ),
                )}
                onClose={closeProfileModal}
                onOpenChat={handleOpenProfileChat}
                onStartVoiceCall={handleProfileStartVoiceCall}
                onStartVideoCall={handleProfileStartVideoCall}
                callsDisabled={!CHAT_PAGE_CONFIG.callsEnabled}
                videoCallsDisabled={!CHAT_PAGE_CONFIG.videoCallsEnabled}
                isInCall={isInCall}
                onToggleMute={() =>
                  toggleMuteChat(mentionProfileChat?.id || activeChat?.id)
                }
                onLeaveGroup={() =>
                  requestLeaveGroupById(
                    mentionProfileChat?.id || activeChat?.id,
                  )
                }
                onOpenMember={openMemberProfileFromList}
                onRemoveMember={handleRemoveGroupMember}
                onOpenUserContextMenu={openContextMenu}
                onEditGroup={
                  mentionProfileChat &&
                  String(mentionProfileChat.id || "") !==
                    String(activeChat?.id || "")
                    ? undefined
                    : openEditGroupFromProfile
                }
                onEditSelfProfile={openSelfProfileEditor}
              />
            </Suspense>
          )}
          {notificationsModalOpen && (
            <Suspense fallback={null}>
              <NotificationsSettingsModal
                open={notificationsModalOpen}
                onClose={() => setNotificationsModalOpen(false)}
                notificationsActive={notificationsActive}
                notificationsDisabled={notificationsDisabled}
                notificationStatusLabel={notificationStatusLabel}
                onToggleNotifications={handleToggleNotifications}
                messagePreviewEnabled={messagePreviewEnabled}
                onToggleMessagePreview={handleToggleMessagePreview}
                debugLine={notificationsDebugLine}
              />
            </Suspense>
          )}
          {settingsPanel && mobileTab !== "settings" && (
            <Suspense fallback={null}>
              <DesktopSettingsModal
                settingsPanel={settingsPanel}
                setSettingsPanel={setSettingsPanel}
                handleProfileSave={handleProfileSave}
                avatarPreview={avatarPreview}
                profileForm={profileForm}
                handleAvatarChange={handleAvatarChange}
                handleAvatarRemove={handleAvatarRemove}
                setProfileForm={setProfileForm}
                statusSelection={statusSelection}
                setStatusSelection={setStatusSelection}
                handlePasswordSave={handlePasswordSave}
                passwordForm={passwordForm}
                setPasswordForm={setPasswordForm}
                userColor={userColor}
                profileError={profileError}
                passwordError={passwordError}
                fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
                onClearCache={handleClearCache}
                dataCacheStats={dataCacheStats}
                currentUser={user}
                onDeleteAccount={handleDeleteAccount}
                appInfo={appInfo}
                appInfoLoading={appInfoLoading}
                appInfoError={appInfoError}
                onOpenWhatsNew={handleOpenWhatsNew}
              />
            </Suspense>
          )}
          {whatsNewOpen && !permissionSetupOpen && (
            <Suspense fallback={null}>
              <WhatsNewModal
                open={whatsNewOpen}
                version={appInfo?.version || ""}
                changelog={
                  appInfo?.currentChangelog || appInfo?.changelog || ""
                }
                changelogSections={appInfo?.changelogSections || []}
                onClose={() => dismissWhatsNew(true)}
              />
            </Suspense>
          )}

          <GroupCallMedia />
          {messaging.panel && (
            <Suspense fallback={null}>
              <ChatToolsDialog />
            </Suspense>
          )}
          {permissionSetupOpen && (
            <Suspense fallback={null}>
              <DevicePermissionsSetup
                notificationsActive={notificationsActive}
                notificationsDisabled={notificationsDisabled}
                notificationStatusLabel={notificationStatusLabel}
                pushSubscribeStatus={pushSubscribeStatus}
                onEnableNotifications={enableNotifications}
                onTestNotification={handleTestPush}
                onClose={() => {
                  completePermissionSetup(user);
                  setPermissionSetupOpen(false);
                  dismissPermissionsPrompt("notification");
                  dismissPermissionsPrompt("microphone");
                }}
                onInstall={() => {
                  completePermissionSetup(user);
                  setPermissionSetupOpen(false);
                  window.dispatchEvent(new Event(INSTALL_GUIDE_EVENT));
                }}
              />
            </Suspense>
          )}
          <AppContextMenu menu={contextMenu} onClose={closeContextMenu} />
        </ChatLayout>
      </MessagingContext.Provider>
    </ChatAppearanceContext.Provider>
  );
}

export default function ChatPage({
  user,
  setUser,
  isDark,
  setIsDark,
  toggleTheme,
  adminPanelEnabled = true,
}) {
  /* eslint-disable react-hooks/exhaustive-deps */
  const appLocale = useAppLocale();
  const messageMaxChars = useMessageMaxChars();
  const chatAppearance = useChatAppearance(user, setUser);
  const groupCall = useGroupCall();

  // Centralized state and refs preserve stable identity across rerenders.
  const {
    loadingChats,
    setLoadingChats,
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    activePeer,
    setActivePeer,
    messages,
    setMessages,
    loadingOlderMessages,
    setLoadingOlderMessages,
    channelSeenCounts,
    setChannelSeenCounts,
    sseConnected,
    setSseConnected,
    mobileTab,
    setMobileTab,
    sidebarScrollEpoch,
    setSidebarScrollEpoch,
    chatsScrollToTopEpoch,
    setChatsScrollToTopEpoch,
    isUpdatingChats,
    setIsUpdatingChats,
    showSettings,
    setShowSettings,
    settingsPanel,
    setSettingsPanel,
    chatsSearchFocused,
    setChatsSearchFocused,
    showFloatingLabel,
    setShowFloatingLabel,
    calls,
    setCalls,
    loadingCalls,
    setLoadingCalls,
    callsEditMode,
    setCallsEditMode,
    selectedCalls,
    setSelectedCalls,
    newCallOpen,
    setNewCallOpen,
    editMode,
    setEditMode,
    selectedChats,
    setSelectedChats,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    pendingDeleteIds,
    setPendingDeleteIds,
    confirmDeleteCallOpen,
    setConfirmDeleteCallOpen,
    pendingDeleteCallIds,
    setPendingDeleteCallIds,
    confirmLeaveOpen,
    setConfirmLeaveOpen,
    pendingLeaveChatId,
    setPendingLeaveChatId,
    isAtBottom,
    setIsAtBottom,
    userScrolledUp,
    setUserScrolledUp,
    unreadInChat,
    setUnreadInChat,
    unreadMarkerId,
    setUnreadMarkerId,
    pendingUploadFiles,
    setPendingUploadFiles,
    pendingUploadType,
    setPendingUploadType,
    pendingVoiceMessage,
    setPendingVoiceMessage,
    uploadError,
    setUploadError,
    activeUploadProgress,
    setActiveUploadProgress,
    replyTarget,
    setReplyTarget,
    editTarget,
    setEditTarget,
    messageDeleteScopeOpen,
    setMessageDeleteScopeOpen,
    pendingDeleteMessage,
    setPendingDeleteMessage,
    forwardMessageTarget,
    setForwardMessageTarget,
    forwardSavedChat,
    setForwardSavedChat,
    forwardedChatPreviewById,
    setForwardedChatPreviewById,
    forwardedUserPreviewByKey,
    setForwardedUserPreviewByKey,
    forwardedChatPreviewTick,
    setForwardedChatPreviewTick,
    copyToastVisible,
    setCopyToastVisible,
    resultTarget,
    setResultTarget,
    typingByChat,
    setTypingByChat,
    peerPresence,
    setPeerPresence,
    profileError,
    setProfileError,
    passwordError,
    setPasswordError,
    profileModalOpen,
    setProfileModalOpen,
    profileModalMember,
    setProfileModalMember,
    profileInviteLink,
    setProfileInviteLink,
    profileInviteLinkLoading,
    setProfileInviteLinkLoading,
    profileRemoteChannelStatus,
    setProfileRemoteChannelStatus,
    mentionProfile,
    setMentionProfile,
    mentionRefreshToken,
    editingGroup,
    setEditingGroup,
    profileForm,
    setProfileForm,
    avatarPreview,
    setAvatarPreview,
    pendingAvatarFile,
    setPendingAvatarFile,
    groupAvatarPreview,
    setGroupAvatarPreview,
    groupAvatarMarkedForRemoval,
    setGroupAvatarMarkedForRemoval,
    pendingGroupAvatarFile,
    setPendingGroupAvatarFile,
    passwordForm,
    setPasswordForm,
    statusSelection,
    setStatusSelection,
    permissionSetupOpen,
    setPermissionSetupOpen,
    microphonePermission,
    setMicrophonePermission,
    microphonePermissionSupported,
    setMicrophonePermissionSupported,
    permissionPromptDelayUntil,
    setPermissionPromptDelayUntil,
    permissionsDismissed,
    setPermissionsDismissed,
    settingsMenuRef,
    settingsButtonRef,
    chatScrollRef,
    composerInputRef,
    activeChatIdRef,
    activeChatTypeRef,
    lastMessageIdRef,
    isAtBottomRef,
    userScrolledUpRef,
    pendingScrollToBottomRef,
    pendingScrollToUnreadRef,
    unreadMarkerIdRef,
    openingHadUnreadRef,
    openingUnreadCountRef,
    allowStartReachedRef,
    unreadAnchorLockUntilRef,
    unreadAlignTimersRef,
    suppressScrolledUpRef,
    shouldAutoMarkReadRef,
    openingChatRef,
    smoothScrollLockRef,
    pendingUploadFilesRef,
    pendingVoiceMessageRef,
    prevUploadProgressRef,
    activeUploadProgressHideTimerRef,
    mediaLoadSnapTimerRef,
    messageRefreshTimerRef,
    updateToastTimerRef,
    copyToastTimerRef,
    forwardedChatPreviewInFlightRef,
    forwardedUserPreviewInFlightRef,
    channelSeenQueueRef,
    channelSeenActiveRef,
    channelSeenLoadedRef,
    channelSeenTimerRef,
    channelSeenLatestRefreshRef,
    messagesRef,
    messagesCacheRef,
    messagesCacheWriteTimerRef,
    lastCacheWriteChatIdRef,
    seenMessageIdsRef,
    pendingGroupAvatarFileRef,
    messageBlobUrlsRef,
    lazyChunksPreloadedRef,
    presenceStateRef,
    typingStateRef,
    typingStopTimerRef,
    typingExpiryTimersRef,
    sseReconnectRef,
    isMarkingReadRef,
    sendingClientIdsRef,
    usernameRef,
    loadChatsRef,
    scheduleMessageRefreshRef,
    loadChatsAbortRef,
    loadChatsInFlightRef,
    queuedLoadChatsOptionsRef,
    realtimeSenderRef,
    outboxRetryStateRef,
    outboxSendRef,
    previousTopicRef,
  } = useChatPageState(user);

  // External hooks
  const { dataCacheStats, handleClearCache } = useChatCacheStats({
    user,
    settingsPanel,
    messagesCacheRef,
  });
  const {
    appInfo,
    appInfoLoading,
    appInfoError,
    whatsNewOpen,
    openWhatsNew,
    dismissWhatsNew,
  } = useAppReleaseInfo();
  const { isAppActive } = useAppActivity();
  const { isMobileViewport } = useMobileViewport();
  const { isConnected } = useHealthCheck({
    fetchHealth,
    intervalMs: CHAT_PAGE_CONFIG.healthCheckIntervalMs,
  });
  const { dmUsernamesRef } = useDmUsernames({ chats, user });
  const {
    notificationsModalOpen,
    setNotificationsModalOpen,
    notificationsEnabled,
    notificationPermission,
    notificationsSupported,
    notificationsActive,
    notificationsDisabled,
    notificationStatusLabel,
    notificationsDebugLine,
    messagePreviewEnabled,
    handleToggleNotifications,
    handleToggleMessagePreview,
    enableNotifications,
    handleTestPush,
    pushSubscribeStatus,
    clearPushForLogout,
  } = useChatNotifications({
    user,
    settingsPanel,
    fetchPushPublicKey,
    subscribePush,
    unsubscribePush,
    sendPushTest,
  });
  const {
    newChatOpen,
    setNewChatOpen,
    newChatUsername,
    setNewChatUsername,
    newChatError,
    setNewChatError,
    newChatResults,
    setNewChatResults,
    newChatLoading,
    newChatSelection,
    setNewChatSelection,
  } = useNewChatSearch({
    user,
    dmUsernamesRef,
    searchUsers,
    debounceMs: NEW_CHAT_SEARCH_DEBOUNCE_MS,
    maxResults: CHAT_PAGE_CONFIG.newChatSearchMaxResults,
  });
  const {
    chatsSearchQuery,
    setChatsSearchQuery,
    discoverLoading,
    discoverUsers,
    discoverGroups,
    discoverChannels,
    discoverSaved,
  } = useDiscoverSearch({
    user,
    discoverUsersAndGroups,
    debounceMs: NEW_CHAT_SEARCH_DEBOUNCE_MS,
    maxResults: CHAT_PAGE_CONFIG.newChatSearchMaxResults,
  });
  const {
    newGroupOpen,
    setNewGroupOpen,
    creatingGroup,
    setCreatingGroup,
    groupModalType,
    setGroupModalType,
    newGroupForm,
    setNewGroupForm,
    newGroupSearch,
    setNewGroupSearch,
    newGroupSearchResults,
    setNewGroupSearchResults,
    newGroupSearchLoading,
    newGroupMembers,
    setNewGroupMembers,
    newGroupError,
    setNewGroupError,
    groupInviteOpen,
    setGroupInviteOpen,
    createdGroupInviteLink,
    setCreatedGroupInviteLink,
    createdGroupInviteType,
    setCreatedGroupInviteType,
    editGroupInviteToken,
    setEditGroupInviteToken,
    regeneratingGroupInviteLink,
    setRegeneratingGroupInviteLink,
  } = useNewGroupModal({
    user,
    chats,
    activeChatId,
    editingGroup,
    searchUsers,
    debounceMs: NEW_CHAT_SEARCH_DEBOUNCE_MS,
    maxResults: CHAT_PAGE_CONFIG.newChatSearchMaxResults,
  });
  const messaging = useMessagingTools({
    user,
    activeChatId,
    loadChatsRef,
    scheduleMessageRefreshRef,
    setMessages,
    messages,
    invalidateHistory: async (ids) => {
      await Promise.all(
        ids.map((id) => {
          messagesCacheRef.current.delete(String(id));
          return deleteIdbCache(
            CACHE_STORES.messages,
            buildMessagesCacheKey(user.username, id),
          );
        }),
      );
    },
  });
  const markMessagesRead = useCallback(
    (payload) =>
      messaging.topic ? Promise.resolve() : markAllMessagesRead(payload),
    [messaging.topic],
  );

  const {
    callState,
    callEndReason,
    isCallClosing,
    callType,
    callPeer,
    callDuration,
    callQuality,
    isMuted,
    isCameraOff,
    isCameraUnavailable,
    isRemoteCameraOff,
    isSpeakerOn,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    handleSignal: handleCallSignal,
  } = useWebRTCCall({ realtimeSenderRef });

  const {
    activeId,
    visibleChats,
    activeChat,
    activeMembers,
    isActiveGroupChat,
    isActiveChannelChat,
    isActiveSavedChat,
    canSendInActiveChat,
    activeGroupMemberUsernames,
    activeGroupMemberUsernamesKey,
    activeHeaderPeer,
    activeFallbackTitle,
    activeHeaderAvatar,
    activeGroupAvatarColor,
    activeGroupAvatarUrl,
    headerAvatarColor,
  } = useActiveChatState({
    chats,
    chatsSearchQuery,
    user,
    activeChatId,
    activeChatIdRef,
    activeChatTypeRef,
    activePeer,
  });

  const {
    loadMessages,
    loadingMessages,
    setLoadingMessages,
    hasOlderMessages,
    setHasOlderMessages,
  } = useMessagesLoader({
    user,
    topicId: messaging.topic,
    chats,
    activeChat,
    activeChatIdRef,
    activeChatTypeRef,
    isActiveChannelChat,
    isMobileViewport,
    mobileTab,
    setMessages,
    setUnreadInChat,
    setUnreadMarkerId,
    setUserScrolledUp,
    setIsAtBottom,
    setChannelSeenCounts,
    lastMessageIdRef,
    openingChatRef,
    openingUnreadCountRef,
    openingHadUnreadRef,
    pendingScrollToUnreadRef,
    unreadMarkerIdRef,
    pendingScrollToBottomRef,
    userScrolledUpRef,
    isAtBottomRef,
    unreadAnchorLockUntilRef,
    shouldAutoMarkReadRef,
    allowStartReachedRef,
    formatDayLabel,
    formatTime,
    parseServerDate,
    resolveReplyPreview,
    normalizeMessageBody,
    CHAT_PAGE_CONFIG,
    listMessagesByQuery,
    markMessagesRead,
    fetchFirstUnreadMessage,
  });

  const canMarkReadInCurrentView =
    (!isMobileViewport || mobileTab === "chat") && !messaging.topic;
  const {
    handleChatScroll,
    handleJumpToLatest,
    handleMessageMediaLoaded,
    scrollChatToBottom,
    cancelSmoothScroll,
  } = useChatScroll({
    activeChatId,
    canMarkReadInCurrentView,
    chatScrollRef,
    clearUnreadAlignTimers,
    smoothScrollLockRef,
    messages,
    user,
    isAppActive,
    markMessagesRead,
    pendingScrollToUnreadRef,
    isAtBottomRef,
    userScrolledUpRef,
    unreadAnchorLockUntilRef,
    suppressScrolledUpRef,
    mediaLoadSnapTimerRef,
    activeChatIdRef,
    isMarkingReadRef,
    setUnreadInChat,
    setIsAtBottom,
    setUserScrolledUp,
    setChats,
    unreadMarkerIdRef,
    openingChatRef,
    setShowFloatingLabel,
  });
  usePerfTelemetry({
    activeChatId,
    messagesLength: messages.length,
    loadingMessages,
  });

  useLayoutEffect(() => { messagesRef.current = messages; }, [messages]);

  // ─── Scrolling and message controls ──────────────────────────────────────
  function clearUnreadAlignTimers() {
    unreadAlignTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    unreadAlignTimersRef.current = [];
  }

  const scrollToBottomIfSafe = useCallback(
    (behavior = "auto", { force = false } = {}) => {
      if (!force) {
        if (unreadMarkerIdRef.current !== null) return;
        if (Date.now() < Number(unreadAnchorLockUntilRef.current || 0)) return;
        if (pendingScrollToUnreadRef.current !== null) return;
      }
      if (userScrolledUpRef.current && !force) return;
      pendingScrollToBottomRef.current = true;
      scrollChatToBottom(behavior);
      requestAnimationFrame(() => scrollChatToBottom(behavior));
      window.setTimeout(() => scrollChatToBottom(behavior), 80);
    },
    [scrollChatToBottom],
  );

  function scheduleUnreadAnchorAlignment(unreadId) {
    clearUnreadAlignTimers();
    const attempt = () => {
      const divider =
        document.getElementById(`unread-divider-${unreadId}`) ||
        document.getElementById(`message-${unreadId}`);
      if (!divider) return false;
      const scroller = chatScrollRef.current;
      if (scroller) {
        const dividerRect = divider.getBoundingClientRect();
        const containerRect = scroller.getBoundingClientRect();
        const top =
          scroller.scrollTop + dividerRect.top - containerRect.top - 12;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      } else {
        divider.scrollIntoView?.({ block: "start", behavior: "auto" });
      }
      return true;
    };
    attempt();
    for (let index = 1; index <= 12; index += 1) {
      const timer = window.setTimeout(() => {
        if (Date.now() > Number(unreadAnchorLockUntilRef.current || 0)) return;
        if (userScrolledUpRef.current === false) return;
        attempt();
      }, index * 80);
      unreadAlignTimersRef.current.push(timer);
    }
  }

  const handleUserScrollIntent = () => {
    cancelSmoothScroll?.();
    allowStartReachedRef.current = true;
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    const distance =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distance <= 24) return;
    pendingScrollToBottomRef.current = false;
    pendingScrollToUnreadRef.current = null;
    unreadAnchorLockUntilRef.current = 0;
    if (!userScrolledUpRef.current) {
      userScrolledUpRef.current = true;
      setUserScrolledUp(true);
    }
    if (isAtBottomRef.current) {
      isAtBottomRef.current = false;
      setIsAtBottom(false);
    }
  };

  const handleFloatingDayNavigate = useCallback(() => {
    cancelSmoothScroll?.();
    allowStartReachedRef.current = true;
    pendingScrollToBottomRef.current = false;
    pendingScrollToUnreadRef.current = null;
    unreadAnchorLockUntilRef.current = 0;
    userScrolledUpRef.current = true;
    setUserScrolledUp(true);
    isAtBottomRef.current = false;
    setIsAtBottom(false);
  }, [cancelSmoothScroll]);

  const handleStartReached = async () => {
    if (
      !activeChatId ||
      loadingMessages ||
      loadingOlderMessages ||
      !hasOlderMessages
    )
      return;
    if (!allowStartReachedRef.current) return;
    const oldest = messages[0];
    const oldestId = oldest?.id || null;
    const oldestCreatedAt = oldest?.created_at || "";
    if (!oldestId || !oldestCreatedAt) return;

    const scroller = chatScrollRef.current;
    let anchorId = "";
    let anchorOffset = 0;
    if (scroller) {
      const top = scroller.getBoundingClientRect().top;
      const nodes = Array.from(scroller.querySelectorAll("[id^='message-']"));
      const first = nodes.find(
        (node) => node.getBoundingClientRect().bottom > top + 1,
      );
      const anchor = first || nodes[0];
      if (anchor) {
        anchorId = anchor.id;
        anchorOffset = anchor.getBoundingClientRect().top - top;
      }
    }
    setLoadingOlderMessages(true);
    try {
      await loadMessages(activeChatId, {
        silent: true,
        prepend: true,
        beforeId: oldestId,
        beforeCreatedAt: oldestCreatedAt,
        limit: CHAT_PAGE_CONFIG.messagePageSize,
      });
      requestAnimationFrame(() => {
        if (!scroller || !anchorId) return;
        const node = document.getElementById(anchorId);
        if (!node) return;
        const offset =
          node.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top;
        scroller.scrollTop += offset - anchorOffset;
      });
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const handleStartReply = (message) => {
    if (!message) return;
    const id = message.id || message._serverId || null;
    if (!id) return;
    setEditTarget(null);
    const preview = resolveReplyPreview(message);
    const channel = isActiveChannelChat;
    setReplyTarget({
      id,
      username: message.username || "",
      nickname: message.nickname || "",
      body: preview.text,
      icon: preview.icon,
      displayName:
        (channel
          ? activeChat?.name || "Channel"
          : message.nickname ||
            message.username ||
            message.replyTo?.nickname ||
            message.replyTo?.username ||
            "") || "Unknown",
      color: channel
        ? activeChat?.group_color || DEFAULT_AVATAR_COLOR
        : message.color || DEFAULT_AVATAR_COLOR,
      verified: channel
        ? Boolean(activeChat?.verified)
        : Boolean(message.user_verified),
      role: channel ? null : message.user_role || null,
    });
    scrollToBottomIfSafe("auto");
  };
  const handleClearReply = () => {
    setReplyTarget(null);
    scrollToBottomIfSafe("auto");
  };
  const handleStartEdit = (message) => {
    if (!message) return;
    const id = message.id || message._serverId || null;
    if (!id) return;
    setReplyTarget(null);
    setEditTarget({
      id,
      username: message.username || "",
      nickname: message.nickname || "",
      displayName:
        message.nickname || message.username || activeChat?.name || "Unknown",
      body: message.body || "",
      files: Array.isArray(message.files) ? message.files : [],
    });
    scrollToBottomIfSafe("auto");
  };
  const handleClearEdit = () => setEditTarget(null);
  const handleSaveMessageFiles = useCallback((message) => {
    const files = getMessageFiles(message);
    if (files.length) downloadMessageFiles(files);
  }, []);

  const handleOpenForwardModal = (message) => {
    if (!message) return;
    void (async () => {
      try {
        let saved = chats.find(
          (chat) => String(chat?.type || "").toLowerCase() === "saved",
        );
        if (!saved) {
          const response = await getSavedMessagesChat(user.username);
          const data = await response.json();
          if (response.ok && data?.id) {
            saved = {
              id: data.id,
              type: "saved",
              name: "Saved messages",
              members: [],
              group_color: DEFAULT_AVATAR_COLOR,
              group_avatar_url: "",
              last_outgoing_time: null,
              last_time: null,
            };
          }
        }
        setForwardSavedChat(saved || null);
      } catch {
        // Keep forwarding available when saved-message lookup fails.
      } finally {
        setForwardMessageTarget(message);
      }
    })();
  };

  // ─── Presence and typing ─────────────────────────────────────────────────
  const parsePresenceDate = (value) => {
    if (!value) return null;
    const date = parseServerDate(value);
    return date && !Number.isNaN(date.getTime()) ? date : null;
  };
  const normalizeStatus = (status) =>
    String(status || "").toLowerCase() === "online" ? "online" : "offline";

  const formatLastSeenLabel = (input) => {
    const date = parsePresenceDate(input);
    const time = date?.getTime?.() || 0;
    if (!Number.isFinite(time) || time <= 0) return "last seen recently";
    const elapsed = Math.max(0, Date.now() - time);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    if (elapsed < 10 * minute) return "last seen recently";
    if (elapsed < 90 * minute) return "last seen an hour ago";
    if (elapsed < day) {
      const hours = Math.max(2, Math.round(elapsed / hour));
      return `last seen ${hours.toLocaleString("en-US")} hours ago`;
    }
    if (elapsed < 2 * day) return "last seen yesterday";
    if (elapsed < 7 * day) {
      return `last seen ${date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()}`;
    }
    if (elapsed < 2 * week) return "last seen a week ago";
    if (elapsed < 4 * week) return "last seen two weeks ago";
    if (elapsed < 8 * week) return "last seen a month ago";
    return "last seen a long time ago";
  };

  const applyPresenceUpdate = (payload = {}) => {
    const username = String(payload?.username || "").toLowerCase();
    if (!username) return;
    const status = String(payload?.status || "").toLowerCase();
    const rawStatus = String(payload?.rawStatus || status).toLowerCase();
    const date = parsePresenceDate(String(payload?.lastSeen || "").trim());
    const lastSeen = date ? date.toISOString() : new Date().toISOString();
    const normalized = normalizeStatus(status);
    presenceStateRef.current.set(username, {
      status: normalized,
      rawStatus,
      lastSeen,
    });
    if (presenceStateRef.current.size > 500) {
      presenceStateRef.current.delete(
        presenceStateRef.current.keys().next().value,
      );
    }
    setChats((previous) =>
      previous.map((chat) => {
        const members = Array.isArray(chat?.members) ? chat.members : [];
        const hasMember = members.some(
          (member) => String(member?.username || "").toLowerCase() === username,
        );
        const dmMatch =
          chat?.type === "dm" &&
          (hasMember ||
            String(chat?.last_sender_username || "").toLowerCase() ===
              username ||
            members.length === 0);
        if (!hasMember && !dmMatch) return chat;
        const updatedMembers = hasMember
          ? members.map((member) =>
              String(member?.username || "").toLowerCase() === username
                ? { ...member, status: normalized }
                : member,
            )
          : [...members, { username, status: normalized }];
        return { ...chat, members: updatedMembers };
      }),
    );
    if (String(activeHeaderPeer?.username || "").toLowerCase() === username) {
      setPeerPresence({ status: normalized, rawStatus, lastSeen });
    }
  };

  const applyProfileUpdate = useCallback(
    (payload = {}) => {
      const userId = isValidUuid(payload?.userId)
        ? normalizeUuid(payload.userId)
        : null;
      const nextUsername = String(payload?.username || "")
        .trim()
        .toLowerCase();
      const previousUsername = String(payload?.previousUsername || "")
        .trim()
        .toLowerCase();
      if (!userId && !nextUsername && !previousUsername) return;
      const nickname =
        String(payload?.nickname || "").trim() ||
        nextUsername ||
        previousUsername;
      const avatarUrl = String(payload?.avatarUrl || "").trim();
      const color =
        String(payload?.color || DEFAULT_AVATAR_COLOR).trim() ||
        DEFAULT_AVATAR_COLOR;
      const status =
        String(payload?.status || "online")
          .trim()
          .toLowerCase() || "online";
      const usernames = new Set(
        [nextUsername, previousUsername].filter(Boolean),
      );
      const matchesUser = (id, username) => {
        const candidateId = isValidUuid(id) ? normalizeUuid(id) : null;
        const candidateUsername = String(username || "")
          .trim()
          .toLowerCase();
        return Boolean(
          (userId && candidateId === userId) ||
          (candidateUsername && usernames.has(candidateUsername)),
        );
      };

      // Preserve the cached status when a peer changes their profile.
      const previousPresence = nextUsername
        ? presenceStateRef.current.get(nextUsername) ||
          presenceStateRef.current.get(previousUsername)
        : null;
      presenceStateRef.current.delete(previousUsername);
      const effectiveStatus =
        previousPresence?.status ||
        (["online", "offline"].includes(status) ? status : "offline");
      if (nextUsername) {
        presenceStateRef.current.set(nextUsername, {
          status: effectiveStatus,
          lastSeen: previousPresence?.lastSeen || new Date().toISOString(),
        });
      }

      setChats((previous) =>
        previous.map((chat) => {
          let changed = false;
          const members = Array.isArray(chat?.members) ? chat.members : [];
          const nextMembers = members.map((member) => {
            if (!matchesUser(member?.id, member?.username)) return member;
            changed = true;
            return {
              ...member,
              username: nextUsername || member?.username || "",
              nickname: nickname || member?.nickname || member?.username || "",
              avatar_url: avatarUrl,
              color,
              status: member?.status || effectiveStatus,
            };
          });
          const senderMatch = matchesUser(
            chat?.last_sender_id,
            chat?.last_sender_username,
          );
          if (!changed && !senderMatch) return chat;
          return {
            ...chat,
            members: nextMembers,
            last_sender_username: senderMatch
              ? nextUsername || chat?.last_sender_username || ""
              : chat?.last_sender_username,
            last_sender_nickname: senderMatch
              ? nickname ||
                chat?.last_sender_nickname ||
                chat?.last_sender_username ||
                ""
              : chat?.last_sender_nickname,
            last_sender_avatar_url: senderMatch
              ? avatarUrl
              : chat?.last_sender_avatar_url,
          };
        }),
      );
      setMessages((previous) =>
        previous.map((message) => {
          const senderMatch = matchesUser(message?.user_id, message?.username);
          const replyMatch = matchesUser(
            message?.replyTo?.user_id,
            message?.replyTo?.username,
          );
          const forwardMatch = matchesUser(
            message?.forwarded_from_user_id,
            message?.forwarded_from_username,
          );
          if (!senderMatch && !replyMatch && !forwardMatch) return message;
          return {
            ...message,
            ...(senderMatch
              ? {
                  username: nextUsername || message?.username || "",
                  nickname:
                    nickname || message?.nickname || message?.username || "",
                  avatar_url: avatarUrl,
                  color,
                }
              : {}),
            ...(replyMatch
              ? {
                  replyTo: {
                    ...message.replyTo,
                    username: nextUsername || message?.replyTo?.username || "",
                    nickname:
                      nickname ||
                      message?.replyTo?.nickname ||
                      message?.replyTo?.username ||
                      "",
                    avatar_url: avatarUrl,
                    color,
                  },
                }
              : {}),
            ...(forwardMatch
              ? {
                  forwarded_from_username:
                    nextUsername || message?.forwarded_from_username || "",
                  forwarded_from_label:
                    nickname ||
                    message?.forwarded_from_label ||
                    nextUsername ||
                    "",
                  forwarded_from_avatar_url: avatarUrl,
                  forwarded_from_color: color,
                }
              : {}),
          };
        }),
      );
      setProfileModalMember((previous) =>
        previous && matchesUser(previous.id, previous.username)
          ? {
              ...previous,
              username: nextUsername || previous.username || "",
              nickname:
                nickname || previous.nickname || previous.username || "",
              avatar_url: avatarUrl,
              color,
              status,
            }
          : previous,
      );
      setMentionProfile((previous) =>
        previous?.kind === "user" &&
        matchesUser(previous?.id, previous?.username)
          ? {
              ...previous,
              username: nextUsername || previous.username || "",
              nickname:
                nickname || previous.nickname || previous.username || "",
              avatarUrl,
              color,
            }
          : previous,
      );
      setActivePeer((previous) =>
        previous && matchesUser(previous.id, previous.username)
          ? {
              ...previous,
              username: nextUsername || previous.username || "",
              nickname:
                nickname || previous.nickname || previous.username || "",
              avatar_url: avatarUrl,
              color,
              status,
            }
          : previous,
      );
      setUser((previous) =>
        previous && matchesUser(previous.id, previous.username)
          ? {
              ...previous,
              username: nextUsername || previous.username || "",
              nickname:
                nickname || previous.nickname || previous.username || "",
              avatarUrl,
              color,
              status,
            }
          : previous,
      );
      if (matchesUser(null, activeHeaderPeer?.username)) {
        const snapshot = presenceStateRef.current.get(
          nextUsername || previousUsername,
        );
        setPeerPresence((previous) => ({
          status: normalizeStatus(status),
          rawStatus:
            status || previous?.rawStatus || previous?.status || "online",
          lastSeen: snapshot?.lastSeen || previous?.lastSeen || null,
        }));
      }
    },
    [activeHeaderPeer?.username, setUser],
  );

  const clearTypingExpiryTimer = useCallback((chatId, username) => {
    const key = `${String(chatId || "")}:${String(username || "").toLowerCase()}`;
    const timer = typingExpiryTimersRef.current.get(key);
    if (timer) {
      window.clearTimeout(timer);
      typingExpiryTimersRef.current.delete(key);
    }
  }, []);
  const removeTypingUser = useCallback((chatId, username) => {
    const chatKey = String(chatId || "");
    const normalized = String(username || "").toLowerCase();
    if (!chatKey || !normalized) return;
    setTypingByChat((previous) => {
      const typing = previous?.[chatKey];
      if (!typing?.[normalized]) return previous;
      const nextTyping = { ...typing };
      delete nextTyping[normalized];
      if (Object.keys(nextTyping).length) {
        return { ...previous, [chatKey]: nextTyping };
      }
      const next = { ...previous };
      delete next[chatKey];
      return next;
    });
  }, []);
  const setTypingUser = useCallback((chatId, username, nickname = "") => {
    const chatKey = String(chatId || "");
    const normalized = String(username || "").toLowerCase();
    if (!chatKey || !normalized) return;
    setTypingByChat((previous) => ({
      ...previous,
      [chatKey]: {
        ...(previous?.[chatKey] || {}),
        [normalized]: {
          username: normalized,
          nickname: String(nickname || "").trim() || normalized,
          updatedAt: Date.now(),
        },
      },
    }));
  }, []);
  const scheduleTypingExpiry = useCallback(
    (chatId, username) => {
      const chatKey = String(chatId || "");
      const normalized = String(username || "").toLowerCase();
      if (!chatKey || !normalized) return;
      clearTypingExpiryTimer(chatKey, normalized);
      const key = `${chatKey}:${normalized}`;
      const timer = window.setTimeout(() => {
        typingExpiryTimersRef.current.delete(key);
        removeTypingUser(chatKey, normalized);
      }, TYPING_REMOTE_TTL_MS);
      typingExpiryTimersRef.current.set(key, timer);
    },
    [clearTypingExpiryTimer, removeTypingUser],
  );
  const sendTypingSignal = useCallback(
    (chatId, isTyping) => {
      const id = String(chatId || "");
      const username = String(usernameRef.current || "").toLowerCase();
      if (!id || !username) return;
      if (
        isTyping &&
        String(activeChatTypeRef.current || "").toLowerCase() === "channel"
      )
        return;
      if (isTyping && String(user?.status || "").toLowerCase() !== "online")
        return;
      sendTypingIndicator({
        chatId: id,
        username,
        isTyping: Boolean(isTyping),
      }).catch(() => null);
    },
    [user?.status],
  );
  const clearLocalTypingStopTimer = useCallback(() => {
    if (!typingStopTimerRef.current) return;
    window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
  }, []);
  const stopTypingIndicator = useCallback(
    (override = null) => {
      const chatId =
        override ||
        typingStateRef.current.chatId ||
        activeChatIdRef.current ||
        null;
      if (!chatId) return;
      clearLocalTypingStopTimer();
      if (typingStateRef.current.isTyping) sendTypingSignal(chatId, false);
      typingStateRef.current = {
        chatId,
        isTyping: false,
        lastSentAt: Date.now(),
      };
    },
    [clearLocalTypingStopTimer, sendTypingSignal],
  );
  const handleMessageInput = useCallback(
    (value) => {
      const trimmed = String(value || "").trim();
      if (
        uploadError &&
        String(uploadError).toLowerCase().includes("message must be") &&
        trimmed.length <= messageMaxChars
      ) {
        setUploadError("");
      }
      const chatId = activeChatId || "";
      const type = String(activeChatTypeRef.current || "").toLowerCase();
      if (!chatId || !canSendInActiveChat || type === "channel") {
        stopTypingIndicator(chatId);
        return;
      }
      const state = typingStateRef.current;
      const now = Date.now();
      if (state.chatId !== chatId && state.isTyping)
        stopTypingIndicator(state.chatId);
      if (!trimmed.length) {
        stopTypingIndicator(chatId);
        return;
      }
      clearLocalTypingStopTimer();
      typingStopTimerRef.current = window.setTimeout(
        () => stopTypingIndicator(chatId),
        TYPING_IDLE_TIMEOUT_MS,
      );
      if (
        !state.isTyping ||
        state.chatId !== chatId ||
        now - Number(state.lastSentAt || 0) >= TYPING_SIGNAL_THROTTLE_MS
      ) {
        sendTypingSignal(chatId, true);
        typingStateRef.current = { chatId, isTyping: true, lastSentAt: now };
      }
    },
    [
      activeChatId,
      canSendInActiveChat,
      clearLocalTypingStopTimer,
      messageMaxChars,
      sendTypingSignal,
      stopTypingIndicator,
      uploadError,
    ],
  );

  // ─── Derived peer, channel and forwarded content ──────────────────────────
  const resolvedCallPeer = useMemo(() => {
    if (!callPeer) return null;
    const username = String(callPeer.username || "").toLowerCase();
    let member = null;
    for (const chat of chats || []) {
      const found = (chat.members || []).find(
        (item) => String(item?.username || "").toLowerCase() === username,
      );
      if (found) {
        member = found;
        break;
      }
    }
    return {
      ...callPeer,
      color: callPeer.color || member?.color || null,
      verified:
        callPeer.verified !== undefined
          ? callPeer.verified
          : member
            ? Boolean(member.user_verified ?? member.verified)
            : false,
      role:
        callPeer.role !== undefined
          ? callPeer.role
          : member?.user_role || member?.role || null,
    };
  }, [callPeer, chats]);

  const peerStatusLabel =
    !activeHeaderPeer || activeHeaderPeer?.isDeleted
      ? "last seen recently"
      : String(
            peerPresence.rawStatus || peerPresence.status || "",
          ).toLowerCase() === "invisible"
        ? "last seen recently"
        : peerPresence.status === "online"
          ? "online"
          : formatLastSeenLabel(peerPresence.lastSeen);

  const activeTypingUsers = useMemo(() => {
    const id = String(activeChatId || "");
    const typing = typingByChat?.[id];
    if (!id || !typing || typeof typing !== "object") return [];
    const self = String(user?.username || "").toLowerCase();
    const members = new Map(
      (Array.isArray(activeMembers) ? activeMembers : []).map((member) => [
        String(member?.username || "").toLowerCase(),
        member,
      ]),
    );
    return Object.values(typing)
      .map((entry) => ({
        username: String(entry?.username || "").toLowerCase(),
        nickname: String(entry?.nickname || "").trim(),
      }))
      .filter((entry) => entry.username && entry.username !== self)
      .filter(
        (entry) =>
          isActiveGroupChat ||
          isActiveChannelChat ||
          entry.username ===
            String(activeHeaderPeer?.username || "").toLowerCase(),
      )
      .map((entry) => {
        const member = members.get(entry.username);
        return {
          username: entry.username,
          displayName:
            String(member?.nickname || "").trim() ||
            entry.nickname ||
            String(member?.username || "").trim() ||
            entry.username,
        };
      });
  }, [
    activeChatId,
    activeHeaderPeer?.username,
    activeMembers,
    isActiveChannelChat,
    isActiveGroupChat,
    typingByChat,
    user?.username,
  ]);

  const buildTypingDisplayName = useCallback((value, maxChars = 22) => {
    const text = String(value || "").trim();
    return text.length > maxChars
      ? `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
      : text;
  }, []);

  const typingIndicator = useMemo(() => {
    if (!activeTypingUsers.length || isActiveChannelChat) return null;
    if (!isActiveGroupChat) return { type: "dm", label: localize("typing") };
    if (activeTypingUsers.length === 1) {
      const name = buildTypingDisplayName(activeTypingUsers[0].displayName, 28);
      return {
        type: "group_single",
        name,
        label: localize("{value0} typing", { value0: name }),
        fullLabel: activeTypingUsers[0].displayName,
      };
    }
    if (activeTypingUsers.length === 2) {
      const first = buildTypingDisplayName(
        activeTypingUsers[0].displayName,
        16,
      );
      const second = buildTypingDisplayName(
        activeTypingUsers[1].displayName,
        16,
      );
      return {
        type: "group_pair",
        firstName: first,
        secondName: second,
        label: localize("{value0} and {value1} typing", {
          value0: first,
          value1: second,
        }),
        fullLabel: `${activeTypingUsers[0].displayName} and ${activeTypingUsers[1].displayName}`,
      };
    }
    const first = buildTypingDisplayName(activeTypingUsers[0].displayName, 18);
    const count = activeTypingUsers.length - 1;
    return {
      type: "group_multi",
      label: localize("{value0} and {value1} others typing", {
        value0: first,
        value1: count,
      }),
      fullLabel: `${activeTypingUsers[0].displayName} and ${count.toLocaleString("en-US")} others`,
    };
  }, [
    activeTypingUsers,
    buildTypingDisplayName,
    isActiveChannelChat,
    isActiveGroupChat,
    appLocale,
  ]);

  const activeHeaderSubtitle =
    isActiveGroupChat || isActiveChannelChat
      ? localize(
          activeMembers.length === 1 ? "{count} member" : "{count} members",
          {
            count: Number(activeMembers.length || 0),
          },
        )
      : isActiveSavedChat
        ? ""
        : localize(peerStatusLabel);
  const resolvedHeaderSubtitle =
    !isActiveSavedChat && typingIndicator?.label
      ? typingIndicator.label
      : activeHeaderSubtitle;
  const activeChatMuted = Boolean(activeChat?._muted);
  const activeHeaderAvatarIcon = isActiveSavedChat ? (
    <Bookmark size={18} className="text-white" />
  ) : null;

  const forwardedChatIds = useMemo(
    () =>
      Array.from(
        new Set(
          messages
            .map((message) =>
              String(message?.forwarded_from_chat_id || "").trim(),
            )
            .filter(Boolean),
        ),
      ),
    [messages],
  );
  const forwardedUserRefs = useMemo(
    () =>
      Array.from(
        new Map(
          messages
            .map((message) => {
              const userId =
                String(message?.forwarded_from_user_id || "").trim() || null;
              const username = String(message?.forwarded_from_username || "")
                .trim()
                .toLowerCase();
              if (!userId && !username) return null;
              return [
                userId ? `id:${userId}` : `username:${username}`,
                { userId, username },
              ];
            })
            .filter(Boolean),
        ).values(),
      ),
    [messages],
  );

  const forwardedChatsById = useMemo(() => {
    const next = {};
    chats.forEach((chat) => {
      const id = String(chat?.id || "").trim();
      const type = String(chat?.type || "").toLowerCase();
      if (id && (type === "group" || type === "channel")) next[id] = chat;
    });
    Object.entries(forwardedChatPreviewById).forEach(([id, entry]) => {
      if (id && !next[id] && entry?.status === "ready" && entry.chat)
        next[id] = entry.chat;
    });
    return next;
  }, [chats, forwardedChatPreviewById]);
  const forwardedChatStatusById = useMemo(() => {
    const next = {};
    chats.forEach((chat) => {
      const id = String(chat?.id || "").trim();
      const type = String(chat?.type || "").toLowerCase();
      if (id && (type === "group" || type === "channel")) next[id] = "ready";
    });
    Object.entries(forwardedChatPreviewById).forEach(([id, entry]) => {
      if (id && entry?.status) next[id] = entry.status;
    });
    return next;
  }, [chats, forwardedChatPreviewById]);
  const forwardedUsersById = useMemo(() => {
    const next = {};
    if (user?.id) {
      next[user.id] = {
        id: user.id,
        username: user.username || "",
        nickname: user.nickname || user.username || "",
        avatar_url: user.avatarUrl || "",
        color: user.color || DEFAULT_AVATAR_COLOR,
        status: user.status || "online",
      };
    }
    chats.forEach((chat) => {
      (Array.isArray(chat?.members) ? chat.members : []).forEach((member) => {
        if (!member?.id) return;
        next[member.id] = {
          id: member.id,
          username: member.username || "",
          nickname: member.nickname || member.username || "",
          avatar_url: member.avatar_url || "",
          color: member.color || DEFAULT_AVATAR_COLOR,
          status: member.status || "online",
        };
      });
    });
    Object.values(forwardedUserPreviewByKey).forEach((entry) => {
      if (entry?.status === "ready" && entry?.profile?.id) {
        next[entry.profile.id] = entry.profile;
      }
    });
    return next;
  }, [chats, forwardedUserPreviewByKey, user]);
  const forwardedUserStatusByKey = useMemo(() => {
    const next = {};
    Object.entries(forwardedUserPreviewByKey).forEach(([key, entry]) => {
      if (key && entry?.status) next[key] = entry.status;
    });
    return next;
  }, [forwardedUserPreviewByKey]);

  const getVisibleChannelMessageIds = useCallback(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return [];
    const viewport = scroller.getBoundingClientRect();
    const ids = [];
    messages.forEach((message) => {
      const id = normalizeUuid(message?._serverId || message?.id) || null;
      if (!id) return;
      const element = document.getElementById(`message-${id}`);
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom >= viewport.top && bounds.top <= viewport.bottom)
        ids.push(id);
    });
    return ids;
  }, [messages]);

  const processChannelSeenQueue = useCallback(() => {
    if (!isActiveChannelChat || channelSeenActiveRef.current) return;
    const nextId = channelSeenQueueRef.current.shift();
    if (!nextId) return;
    const chatId = activeChatIdRef.current || null;
    if (!chatId) return;
    channelSeenActiveRef.current = true;
    getMessageReadCounts({
      chatId,
      username: String(usernameRef.current || ""),
      messageIds: [nextId],
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) return;
        if (String(activeChatIdRef.current || "") !== String(chatId)) return;
        setChannelSeenCounts((previous) => ({
          ...previous,
          [nextId]: Number(data?.counts?.[nextId] || 0),
        }));
      })
      .catch(() => null)
      .finally(() => {
        channelSeenLoadedRef.current.add(nextId);
        channelSeenActiveRef.current = false;
        if (channelSeenTimerRef.current)
          window.clearTimeout(channelSeenTimerRef.current);
        channelSeenTimerRef.current = window.setTimeout(
          processChannelSeenQueue,
          140,
        );
      });
  }, [isActiveChannelChat]);

  const enqueueChannelSeenCounts = useCallback(
    (forceLatest = false) => {
      if (!isActiveChannelChat || loadingMessages) return;
      // Message DOM order follows chronology; reverse it instead of subtracting UUIDs.
      const visible = Array.from(
        new Set(getVisibleChannelMessageIds()),
      ).reverse();
      if (!visible.length) return;
      const latest = visible[0];
      const now = Date.now();
      if (latest) {
        const force =
          forceLatest ||
          now - Number(channelSeenLatestRefreshRef.current || 0) > 2500;
        if (force && !channelSeenQueueRef.current.includes(latest)) {
          channelSeenQueueRef.current.push(latest);
          channelSeenLatestRefreshRef.current = now;
        }
      }
      visible.slice(1).forEach((id) => {
        if (
          !channelSeenLoadedRef.current.has(id) &&
          !channelSeenQueueRef.current.includes(id)
        ) {
          channelSeenQueueRef.current.push(id);
        }
      });
      processChannelSeenQueue();
    },
    [
      getVisibleChannelMessageIds,
      isActiveChannelChat,
      loadingMessages,
      processChannelSeenQueue,
    ],
  );

  const handleChatScrollWithSeen = useCallback(
    (event) => {
      handleChatScroll(event);
      enqueueChannelSeenCounts();
    },
    [handleChatScroll, enqueueChannelSeenCounts],
  );

  // ─── Call actions ────────────────────────────────────────────────────────
  const handleStartVoiceCall = useCallback(() => {
    if (callState !== "idle" || groupCall.room || groupCall.joining) return;
    if (
      !activeChatId ||
      !activeHeaderPeer?.username ||
      activeHeaderPeer.isDeleted
    )
      return;
    if (!isCallSupported()) return;
    startCall({
      chatId: activeChatId,
      calleeUsername: activeHeaderPeer.username,
      calleeNickname: activeHeaderPeer.nickname,
      calleeAvatar: activeHeaderPeer.avatar_url,
      calleeColor: activeHeaderPeer.color,
      calleeVerified: Boolean(
        activeHeaderPeer.user_verified ?? activeHeaderPeer.verified,
      ),
      calleeRole: activeHeaderPeer.user_role || activeHeaderPeer.role,
      type: "voice",
    });
  }, [
    activeChatId,
    activeHeaderPeer,
    callState,
    groupCall.room,
    groupCall.joining,
    startCall,
  ]);
  const handleStartVideoCall = useCallback(() => {
    if (callState !== "idle" || groupCall.room || groupCall.joining) return;
    if (
      !activeChatId ||
      !activeHeaderPeer?.username ||
      activeHeaderPeer.isDeleted
    )
      return;
    if (!isCallSupported()) return;
    startCall({
      chatId: activeChatId,
      calleeUsername: activeHeaderPeer.username,
      calleeNickname: activeHeaderPeer.nickname,
      calleeAvatar: activeHeaderPeer.avatar_url,
      calleeColor: activeHeaderPeer.color,
      calleeVerified: Boolean(
        activeHeaderPeer.user_verified ?? activeHeaderPeer.verified,
      ),
      calleeRole: activeHeaderPeer.user_role || activeHeaderPeer.role,
      type: "video",
    });
  }, [
    activeChatId,
    activeHeaderPeer,
    callState,
    groupCall.room,
    groupCall.joining,
    startCall,
  ]);
  const mentionProfileUser =
    mentionProfile?.kind === "user"
      ? {
          username: mentionProfile.username,
          nickname: mentionProfile.nickname || mentionProfile.username,
          avatar_url: mentionProfile.avatarUrl || "",
          color: mentionProfile.color || DEFAULT_AVATAR_COLOR,
          status: "online",
          role: mentionProfile.role || "user",
          verified: Boolean(mentionProfile.verified),
        }
      : null;
  const profileTargetUser =
    mentionProfileUser || profileModalMember || activeHeaderPeer || null;

  const handleProfileCall = useCallback(
    (type, peer) => {
      if (callState !== "idle" || groupCall.room || groupCall.joining) return;
      const target = peer || profileTargetUser || activeHeaderPeer;
      if (!target?.username || target.isDeleted || !isCallSupported()) return;
      const dm =
        (activeChat?.type === "dm" ? activeChat : null) ||
        chats.find(
          (chat) =>
            chat.type === "dm" &&
            (chat.members || []).some(
              (member) =>
                String(member.username).toLowerCase() ===
                String(target.username).toLowerCase(),
            ),
        );
      const chatId = dm?.id || activeChatId;
      if (!chatId) return;
      startCall({
        chatId,
        calleeUsername: target.username,
        calleeNickname: target.nickname,
        calleeAvatar: target.avatar_url,
        calleeColor: target.color,
        calleeVerified: Boolean(target.user_verified ?? target.verified),
        calleeRole: target.user_role || target.role,
        type,
      });
    },
    [
      activeChat,
      activeChatId,
      activeHeaderPeer,
      callState,
      groupCall.room,
      groupCall.joining,
      chats,
      profileTargetUser,
      startCall,
    ],
  );
  const handleProfileStartVoiceCall = useCallback(
    (peer) => handleProfileCall("voice", peer),
    [handleProfileCall],
  );
  const handleProfileStartVideoCall = useCallback(
    (peer) => handleProfileCall("video", peer),
    [handleProfileCall],
  );

  const loadCalls = useCallback(async () => {
    if (!user?.username) return;
    setLoadingCalls(true);
    try {
      const rows = await listCalls();
      setCalls(Array.isArray(rows) ? rows : []);
    } catch {
      // Retain last known list on network errors.
    } finally {
      setLoadingCalls(false);
    }
  }, [user?.username]);
  const handleStartCallFromRow = useCallback(
    (call) => {
      if (callState !== "idle" || groupCall.room || groupCall.joining) return;
      const peer = call?.peer;
      if (!call?.chatId || !peer?.username || !isCallSupported()) return;
      startCall({
        chatId: call.chatId,
        calleeUsername: peer.username,
        calleeNickname: peer.nickname,
        calleeAvatar: peer.avatarUrl,
        calleeColor: peer.color,
        calleeVerified: Boolean(peer.verified),
        calleeRole: peer.role,
        type: "voice",
      });
    },
    [callState, groupCall.room, groupCall.joining, startCall],
  );
  const handleNewCallSubmit = useCallback(
    (chatId, peer) => {
      if (callState !== "idle" || groupCall.room || groupCall.joining) return;
      if (!chatId || !peer?.username || !isCallSupported()) return;
      setNewCallOpen(false);
      startCall({
        chatId,
        calleeUsername: peer.username,
        calleeNickname: peer.nickname,
        calleeAvatar: peer.avatar_url,
        calleeColor: peer.color,
        calleeVerified: Boolean(peer.user_verified ?? peer.verified),
        calleeRole: peer.user_role || peer.role,
        type: "voice",
      });
    },
    [callState, groupCall.room, groupCall.joining, startCall],
  );
  const handleOpenNewCall = useCallback(() => {
    if (callState === "idle" && !groupCall.room && !groupCall.joining)
      setNewCallOpen(true);
  }, [callState, groupCall.room, groupCall.joining]);
  const toggleSelectCall = (callId) =>
    setSelectedCalls((previous) =>
      previous.includes(callId)
        ? previous.filter((id) => id !== callId)
        : [...previous, callId],
    );
  const requestDeleteCall = (call) => {
    const id = call?.messageId || call?.id;
    if (!id) return;
    setPendingDeleteCallIds([id]);
    setConfirmDeleteCallOpen(true);
  };
  const handleDeleteCalls = () => {
    if (!selectedCalls.length) return;
    setPendingDeleteCallIds(selectedCalls);
    setConfirmDeleteCallOpen(true);
  };
  const confirmDeleteCall = async () => {
    const ids = pendingDeleteCallIds;
    setConfirmDeleteCallOpen(false);
    setPendingDeleteCallIds([]);
    if (!ids.length) return;
    try {
      const results = await Promise.allSettled(
        ids.map((messageId) =>
          deleteCall({ username: user?.username, messageId }),
        ),
      );
      const deleted = new Set();
      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value?.ok)
          deleted.add(String(ids[index]));
      });
      if (!deleted.size) return;
      setCalls((previous) =>
        previous.filter((call) => !deleted.has(String(call.id))),
      );
    } catch {
      // A later refresh will reconcile unsuccessful deletions.
    }
    setSelectedCalls([]);
    setCallsEditMode(false);
    void loadCalls();
  };

  // ─── Forwarded message origins ────────────────────────────────────────────
  const handleOpenForwardOrigin = async (target) => {
    if (!target) return;
    if (target.kind === "self") {
      openOwnProfileModal();
      return;
    }
    if (target.kind === "user") {
      const fallback = {
        id: target.userId || null,
        username: target.username || "",
        nickname: target.nickname || "",
        avatar_url: target.avatar_url || "",
        color: target.color || DEFAULT_AVATAR_COLOR,
        status: "online",
        role: "",
      };
      const username = String(target.username || "").trim();
      if (!username) {
        openMemberProfileFromList({ ...fallback, _readOnly: true });
        return;
      }
      try {
        const response = await getProfileByUsername(username);
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          openMemberProfileFromList({
            id: data?.id || fallback.id || null,
            username: data?.username || fallback.username || "",
            nickname:
              data?.nickname ||
              fallback.nickname ||
              data?.username ||
              fallback.username ||
              "",
            avatar_url: data?.avatarUrl || fallback.avatar_url || "",
            color: data?.color || fallback.color || DEFAULT_AVATAR_COLOR,
            status: data?.status || fallback.status || "online",
            role: "",
          });
          return;
        }
        if (response.status === 404) {
          openMemberProfileFromList({ ...fallback, _readOnly: true });
          return;
        }
      } catch {
        // Show the retained origin when lookup is unavailable.
      }
      openMemberProfileFromList(fallback);
      return;
    }

    const chatId = String(target.chatId || "");
    if (!chatId) return;
    let targetChat = chats.find((chat) => String(chat.id) === chatId);
    if (!targetChat) {
      try {
        const response = await getChatPreview({
          chatId,
          username: user.username,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data?.error || "Unable to open forwarded chat.");
        targetChat = {
          id: String(data?.id || chatId),
          type: data?.type || "group",
          name: data?.name || "Chat",
          group_username: data?.username || "",
          group_visibility: data?.visibility || "public",
          group_color: data?.color || DEFAULT_AVATAR_COLOR,
          group_avatar_url: data?.avatarUrl || "",
          invite_token: data?.inviteToken || "",
          membersCount: Number(data?.membersCount || 0),
          members: [],
          _previewOnly: true,
          _isMember: Boolean(data?.isMember),
        };
      } catch {
        setMentionProfile({
          kind: "group",
          chatId,
          name: target.label || "Chat",
          username: "",
          visibility: "private",
          color: target.color || DEFAULT_AVATAR_COLOR,
          avatarUrl: target.avatar_url || "",
          inviteToken: "",
          membersCount: 0,
          isMember: false,
          _actionState: "none",
          _readOnly: true,
        });
        setProfileModalOpen(true);
        return;
      }
    }
    if (String(targetChat.type || "").toLowerCase() === "dm") {
      const peer = (targetChat.members || []).find(
        (member) =>
          String(member?.username || "").toLowerCase() !==
          String(user?.username || "").toLowerCase(),
      );
      if (peer) openMemberProfileFromList(peer);
      return;
    }
    setMentionProfile({
      kind: String(targetChat.type || "group").toLowerCase(),
      chatId: String(targetChat.id || ""),
      name: targetChat.name || "Chat",
      username: targetChat.group_username || "",
      visibility: targetChat.group_visibility || "public",
      color: targetChat.group_color || DEFAULT_AVATAR_COLOR,
      avatarUrl: targetChat.group_avatar_url || "",
      inviteToken: targetChat.invite_token || "",
      membersCount:
        Array.isArray(targetChat.members) && targetChat.members.length
          ? targetChat.members.length
          : Number(targetChat.membersCount || 0),
      isMember:
        targetChat._previewOnly === true ? Boolean(targetChat._isMember) : true,
    });
    setProfileModalOpen(true);
  };

  async function handleForwardMessageSubmit(targetChatIds = []) {
    const messageId =
      normalizeUuid(
        forwardMessageTarget?._serverId || forwardMessageTarget?.id,
      ) || null;
    if (!messageId || !user?.username || !activeChatId) return;
    const author = String(
      forwardMessageTarget?.nickname ||
        forwardMessageTarget?.username ||
        user?.nickname ||
        user?.username ||
        "yourself",
    ).trim();
    const label = isActiveChannelChat
      ? String(activeChat?.name || activeFallbackTitle || "Channel").trim()
      : author;
    const body = String(forwardMessageTarget?.body || "");
    const captured = forwardMessageTarget;
    setForwardMessageTarget(null);
    setForwardSavedChat(null);
    try {
      const response = await forwardMessage({
        username: user.username,
        sourceMessageId: messageId,
        targetChatIds,
        body,
        forwardedFromChatId: isActiveChannelChat ? activeChatId : null,
        forwardedFromLabel: label,
        forwardedFromUserId: isActiveChannelChat
          ? null
          : normalizeUuid(captured?.user_id) || normalizeUuid(user?.id) || null,
        forwardedFromUsername: isActiveChannelChat
          ? ""
          : String(captured?.username || user?.username || "").trim(),
        forwardedFromAvatarUrl: isActiveChannelChat
          ? ""
          : String(captured?.avatar_url || user?.avatarUrl || "").trim(),
        forwardedFromColor: isActiveChannelChat
          ? ""
          : String(
              captured?.color || user?.color || DEFAULT_AVATAR_COLOR,
            ).trim(),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to forward message.");
      await loadChats({ silent: true });
    } catch (error) {
      setUploadError(String(error?.message || "Unable to forward message."));
    }
  }

  // ─── Profiles, invites and settings ───────────────────────────────────────
  const liveMentionProfileChat = mentionProfile
    ? chats.find((chat) => {
        const id = String(mentionProfile.chatId || "");
        if (id && String(chat?.id || "") === id) return true;
        const username = String(mentionProfile.username || "")
          .trim()
          .toLowerCase();
        const chatUsername = String(chat?.group_username || "")
          .trim()
          .toLowerCase();
        return Boolean(username && chatUsername && username === chatUsername);
      }) || null
    : null;
  const mentionProfileChat =
    mentionProfile && mentionProfile.kind !== "user"
      ? {
          ...(liveMentionProfileChat || {}),
          type: liveMentionProfileChat?.type || mentionProfile.kind,
          id: liveMentionProfileChat?.id || mentionProfile.chatId || null,
          name:
            liveMentionProfileChat?.name ||
            mentionProfile.name ||
            mentionProfile.username ||
            "Chat",
          group_username:
            liveMentionProfileChat?.group_username ||
            mentionProfile.username ||
            "",
          group_visibility:
            liveMentionProfileChat?.group_visibility ||
            mentionProfile.visibility ||
            "public",
          group_color:
            liveMentionProfileChat?.group_color ||
            mentionProfile.color ||
            DEFAULT_AVATAR_COLOR,
          group_avatar_url:
            liveMentionProfileChat?.group_avatar_url ??
            mentionProfile.avatarUrl ??
            null,
          inviteToken:
            liveMentionProfileChat?.inviteToken ||
            liveMentionProfileChat?.invite_token ||
            mentionProfile.inviteToken ||
            "",
          members: Array.isArray(liveMentionProfileChat?.members)
            ? liveMentionProfileChat.members
            : [],
          membersCount:
            Array.isArray(liveMentionProfileChat?.members) &&
            liveMentionProfileChat.members.length
              ? liveMentionProfileChat.members.length
              : Number(
                  liveMentionProfileChat?.membersCount ||
                    mentionProfile.membersCount ||
                    0,
                ),
          isMember: Boolean(liveMentionProfileChat || mentionProfile.isMember),
        }
      : null;
  const mentionProfileActionState =
    mentionProfile && mentionProfile.kind !== "user"
      ? mentionProfile._actionState ||
        (mentionProfileChat?.isMember
          ? "member"
          : String(
                mentionProfileChat?.group_visibility || "public",
              ).toLowerCase() === "public"
            ? "join"
            : "none")
      : "none";
  const canJoinMentionChat = Boolean(
    mentionProfileChat && mentionProfileActionState === "join",
  );
  const isMentionProfileReadOnly = Boolean(
    mentionProfile &&
    mentionProfile.kind !== "user" &&
    mentionProfileActionState === "none",
  );
  const shouldShowMembersList = !mentionProfile;
  const canCurrentUserEditGroup = Boolean(
    (isActiveGroupChat || isActiveChannelChat) &&
    activeMembers.some(
      (member) =>
        String(member.id || "") === String(user?.id || "") &&
        String(member.role || "").toLowerCase() === "owner",
    ),
  );
  const canSwipeReply = !isActiveChannelChat || canCurrentUserEditGroup;
  const canCurrentUserViewInvite = Boolean(
    !mentionProfile &&
    (isActiveGroupChat || isActiveChannelChat) &&
    (canCurrentUserEditGroup ||
      Boolean(Number(activeChat?.allow_member_invites || 0))),
  );

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setProfileModalMember(null);
    setProfileInviteLink("");
    setProfileInviteLinkLoading(false);
    setMentionProfile(null);
  };
  const openOwnProfileModal = () => {
    setProfileModalMember({
      id: normalizeUuid(user?.id) || user?.id || null,
      username: user?.username || "",
      nickname: user?.nickname || "",
      avatar_url: user?.avatarUrl || "",
      color: user?.color || DEFAULT_AVATAR_COLOR,
      status: user?.status || "online",
      role: user?.role || "user",
      verified: Boolean(user?.verified),
    });
    setProfileInviteLink("");
    setProfileModalOpen(true);
  };
  const openMemberProfileFromMessage = (message) => {
    if (!message) return;
    setProfileModalMember({
      id: message.user_id || null,
      username: message.username || "",
      nickname: message.nickname || "",
      avatar_url: message.avatar_url || "",
      color: message.color || DEFAULT_AVATAR_COLOR,
      status: "online",
      role: message.user_role || "user",
      verified: Boolean(message.user_verified),
    });
    setProfileModalOpen(true);
  };
  const openMemberProfileFromList = (member) => {
    if (!member) return;
    const normalized = Object.prototype.hasOwnProperty.call(
      member,
      "user_verified",
    )
      ? { ...member, verified: Boolean(member.user_verified) }
      : member;
    setProfileModalMember(normalized);
    setProfileModalOpen(true);
  };
  const openMentionProfile = (mention) => {
    if (!mention) return;
    setMentionProfile(mention);
    setProfileModalOpen(true);
  };
  const openActiveChatProfile = async () => {
    if (!activeChat) return;
    setProfileModalMember(null);
    setProfileInviteLinkLoading(false);
    setProfileRemoteChannelStatus((previous) =>
      previous?._chatId && previous._chatId !== activeChat.id ? null : previous,
    );
    setProfileModalOpen(true);
    if (activeChat.type !== "group" && activeChat.type !== "channel") {
      setProfileInviteLink("");
      return;
    }
    const localLink = buildInviteLinkForChat(activeChat);
    if (localLink) {
      setProfileInviteLink(localLink);
      return;
    }
    setProfileInviteLinkLoading(true);
    try {
      const response = await getGroupInviteLink(activeChat.id);
      const data = await response.json();
      setProfileInviteLink(response.ok ? String(data?.inviteLink || "") : "");
    } catch {
      setProfileInviteLink("");
    } finally {
      setProfileInviteLinkLoading(false);
    }
  };
  const handleJoinMentionChat = async () => {
    if (!mentionProfileChat?.id) return;
    const path = buildInvitePathForChat(mentionProfileChat);
    if (path && typeof window !== "undefined") window.location.href = path;
  };
  const handleOpenProfileChat = () => {
    if (mentionProfileChat?.id) {
      setActiveChatId(mentionProfileChat.id);
      setActivePeer(null);
      setMobileTab("chat");
      closeProfileModal();
      return;
    }
    const target = profileModalMember || profileTargetUser;
    if (target?.username) {
      if (
        String(target.username).toLowerCase() ===
        String(user.username).toLowerCase()
      ) {
        closeProfileModal();
      } else {
        void openOrCreateDmFromMember(target);
      }
      return;
    }
    if (!profileModalMember && activeChat?.type === "group")
      setMobileTab("chat");
    closeProfileModal();
  };
  const handleProfileRemoteChannelStatusChange = useCallback(
    (status) =>
      setProfileRemoteChannelStatus(
        status ? { ...status, _chatId: activeChat?.id } : null,
      ),
    [activeChat?.id],
  );
  const openSelfProfileEditor = () => {
    closeProfileModal();
    setShowSettings(false);
    setSettingsPanel("profile");
    if (isMobileViewport) setMobileTab("settings");
  };

  const openSavedMessages = async () => {
    try {
      setShowSettings(false);
      setSettingsPanel(null);
      const saved = chats.find((chat) => chat.type === "saved");
      let chatId = normalizeUuid(saved?.id) || null;
      if (!chatId) {
        const response = await getSavedMessagesChat(user.username);
        const data = await response.json();
        if (!response.ok)
          throw new Error(data?.error || "Unable to open saved messages.");
        chatId = normalizeUuid(data?.id) || null;
        await loadChats({ silent: true });
      }
      if (!chatId) return;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, String(chatId));
      }
      setActiveChatId(chatId);
      setActivePeer(null);
      setMobileTab("chat");
      setSidebarScrollEpoch((previous) => previous + 1);
    } catch {
      // Ignore when the saved-chat endpoint is unavailable.
    }
  };
  const handleLeaveGroupById = async (chatId) => {
    const id = normalizeUuid(chatId) || null;
    if (!id) return;
    try {
      const response = await leaveGroupChat(id, { username: user.username });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to leave group.");
      closeProfileModal();
      if (String(activeChat?.id || "") === id) closeChat();
      await loadChats();
    } catch {
      // Leave failures do not close the current view.
    }
  };
  const requestLeaveGroupById = (chatId) => {
    const id = String(chatId || "");
    if (!id) return;
    setPendingLeaveChatId(id);
    setConfirmLeaveOpen(true);
  };
  const confirmLeaveGroupById = async () => {
    const id = String(pendingLeaveChatId || "");
    if (!id) return;
    setConfirmLeaveOpen(false);
    setPendingLeaveChatId(null);
    await handleLeaveGroupById(id);
  };

  const closeChat = () => {
    if (typeof window !== "undefined")
      window.sessionStorage.removeItem(OPEN_CHAT_ID_KEY);
    setMobileTab("chats");
    window.setTimeout(() => {
      setActiveChatId(null);
      setActivePeer(null);
    }, MOBILE_CLOSE_ANIMATION_MS);
  };

  const handleMarkChatSeen = useCallback(
    async (chat) => {
      const chatId = String(chat?.id || "");
      if (!chatId) return;
      setChats((previous) =>
        previous.map((item) =>
          String(item.id) === chatId ? { ...item, unread_count: 0 } : item,
        ),
      );
      if (String(activeChatId || "") === chatId) setUnreadInChat(0);
      try {
        await markMessagesRead({ chatId, username: user.username });
      } catch {
        // The next sync will reconcile the unread count.
      }
    },
    [activeChatId, markMessagesRead, user.username],
  );
  const toggleMuteChat = async (chatId) => {
    const id = normalizeUuid(chatId) || null;
    if (!id) return;
    const existing = chats.find((chat) => chat.id === id);
    const before = Boolean(existing?._muted);
    const muted = !before;
    setChats((previous) =>
      previous.map((chat) =>
        chat.id === id ? { ...chat, _muted: muted } : chat,
      ),
    );
    try {
      const response = await setChatMute(id, {
        username: user.username,
        muted,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update mute state.");
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === id ? { ...chat, _muted: Boolean(data?.muted) } : chat,
        ),
      );
    } catch {
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === id ? { ...chat, _muted: before } : chat,
        ),
      );
    }
  };

  const handleExitEdit = () => {
    setEditMode(false);
    setSelectedChats([]);
  };
  const handleEnterEdit = () => {
    if (visibleChats.length) setEditMode(true);
  };
  const toggleSelectChat = (id) =>
    setSelectedChats((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  const requestDeleteChats = (ids) => {
    if (!ids.length) return;
    setPendingDeleteIds(ids);
    setConfirmDeleteOpen(true);
  };
  const handleDeleteChats = () => requestDeleteChats(selectedChats);
  const confirmDeleteChats = async () => {
    const ids = pendingDeleteIds.length ? pendingDeleteIds : selectedChats;
    if (!ids.length) return;
    try {
      const groups = chats.filter(
        (chat) =>
          ids.includes(chat.id) &&
          (chat.type === "group" || chat.type === "channel"),
      );
      await Promise.all(
        groups.map(async (chat) => {
          try {
            await leaveGroupChat(chat.id, { username: user.username });
          } catch {
            /* Keep hiding locally when leaving fails. */
          }
        }),
      );
      await hideChats({ username: user.username, chatIds: ids });
    } catch {
      // Keep UI responsive and reconcile from the server.
    }
    if (ids.includes(activeId)) {
      setMobileTab("chats");
      window.setTimeout(() => {
        setActiveChatId(null);
        setActivePeer(null);
      }, MOBILE_CLOSE_ANIMATION_MS);
    }
    setSelectedChats([]);
    setPendingDeleteIds([]);
    setEditMode(false);
    setConfirmDeleteOpen(false);
    await loadChats();
  };

  const handleOpenSettings = () => setShowSettings((previous) => !previous);
  const handleOpenWhatsNew = () => {
    setShowSettings(false);
    openWhatsNew();
  };
  const exitSearchMode = () => {
    setChatsSearchFocused(false);
    setChatsSearchQuery("");
    setSidebarScrollEpoch((previous) => previous + 1);
    if (
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    }
  };
  const displayName = user.nickname || user.username;
  const displayInitials = getAvatarInitials(displayName);
  const statusValue = user.status || "online";
  const statusTextClass =
    statusValue === "online"
      ? "font-semibold text-brand-500 dark:text-brand-300"
      : "";
  const userColor = user?.color || DEFAULT_AVATAR_COLOR;
  const canStartChat = Boolean(newChatSelection);
  const isOffline =
    !sseConnected ||
    (typeof navigator !== "undefined" && navigator.onLine === false);

  // ─── Profile actions ──────────────────────────────────────────────────────
  async function handleStatusUpdate(nextStatus) {
    if (!user || user.status === nextStatus) return;
    try {
      const response = await updateStatusRequest({
        username: user.username,
        status: nextStatus,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update status.");
      setUser({ ...user, status: data.status });
    } catch {
      // Keep the last known user status.
    }
  }

  const handleAvatarChange = async (event) => {
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setProfileError("File uploads are disabled on this server.");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !String(file.type || "")
        .toLowerCase()
        .startsWith("image/")
    ) {
      setProfileError("Profile photo must be an image file.");
      event.target.value = "";
      return;
    }
    if (Number(file.size || 0) > CHAT_PAGE_CONFIG.maxFileSizeBytes) {
      setProfileError(
        `Profile photo must be smaller than ${formatBytesAsMb(CHAT_PAGE_CONFIG.maxFileSizeBytes)}.`,
      );
      event.target.value = "";
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setProfileError("");
    if (pendingAvatarFile?.previewUrl)
      URL.revokeObjectURL(pendingAvatarFile.previewUrl);
    setPendingAvatarFile({ file, previewUrl });
    setAvatarPreview(previewUrl);
    event.target.value = "";
  };
  const handleAvatarRemove = () => {
    setProfileError("");
    if (pendingAvatarFile?.previewUrl)
      URL.revokeObjectURL(pendingAvatarFile.previewUrl);
    setPendingAvatarFile(null);
    setAvatarPreview("");
    setProfileForm((previous) => ({ ...previous, avatarUrl: "" }));
  };

  async function handleProfileSave(event) {
    event.preventDefault();
    setProfileError("");
    const nickname = profileForm.nickname.trim();
    const username = profileForm.username.trim().toLowerCase();
    if (nickname.length > NICKNAME_MAX) {
      setProfileError(`Nickname must be ${NICKNAME_MAX} characters or less.`);
      return;
    }
    if (username.length > USERNAME_MAX) {
      setProfileError(`Username must be ${USERNAME_MAX} characters or less.`);
      return;
    }
    if (username.length < 3) {
      setProfileError("Username must be at least 3 characters.");
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setProfileError(
        "Username can only include english letters, numbers, dot (.), and underscore (_).",
      );
      return;
    }
    try {
      let avatarUrl = profileForm.avatarUrl;
      if (pendingAvatarFile?.file) {
        if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
          throw new Error("File uploads are disabled on this server.");
        }
        const uploaded = await uploadAvatarFile(pendingAvatarFile.file);
        let response;
        if (uploaded.directS3 && uploaded.avatarUrl) {
          response = await uploadAvatar({
            currentUsername: user.username,
            avatarUrl: uploaded.avatarUrl,
          });
        } else {
          const form = new FormData();
          form.append("avatar", pendingAvatarFile.file);
          form.append("currentUsername", user.username);
          response = await uploadAvatar(form);
        }
        const data = await response.json();
        if (!response.ok)
          throw new Error(data?.error || "Unable to upload profile photo.");
        avatarUrl =
          data.avatarUrl || (uploaded.directS3 ? uploaded.avatarUrl : "") || "";
      }
      const response = await updateProfile({
        currentUsername: user.username,
        username,
        nickname,
        avatarUrl,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update profile.");
      let updatedUser = {
        ...user,
        username: data.username,
        nickname: data.nickname,
        avatarUrl: data.avatarUrl,
        color: data.color || user.color || null,
        status: data.status,
      };
      if (statusSelection && statusSelection !== (user.status || "online")) {
        await handleStatusUpdate(statusSelection);
        updatedUser = { ...updatedUser, status: statusSelection };
      }
      setUser(updatedUser);
      if (pendingAvatarFile?.previewUrl)
        URL.revokeObjectURL(pendingAvatarFile.previewUrl);
      setPendingAvatarFile(null);
      setSettingsPanel(null);
    } catch (error) {
      setProfileError(error.message);
    }
  }

  async function handlePasswordSave(event) {
    event.preventDefault();
    setPasswordError("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    try {
      const response = await updatePassword({
        username: user.username,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update password.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSettingsPanel(null);
    } catch (error) {
      setPasswordError(error.message);
    }
  }

  async function handleLogout() {
    await clearPushForLogout?.();
    await logout().catch(() => null);
    setUser(null);
    setShowSettings(false);
    setMobileTab("chats");
  }
  async function handleDeleteAccount(password) {
    if (!user?.username) return;
    const value = String(password || "").trim();
    if (!value) throw new Error("Password is required.");
    const response = await deleteAccount({
      username: user.username,
      password: value,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.error || "Unable to delete account.");
    setSettingsPanel(null);
    setShowSettings(false);
    void handleLogout();
  }
  async function handleDeleteActiveGroup(password) {
    if (!activeChat || !["group", "channel"].includes(activeChat.type)) return;
    const value = String(password || "").trim();
    if (!value) throw new Error("Password is required.");
    const response = await deleteGroupChat(activeChat.id, {
      username: user.username,
      password: value,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to delete chat.");
    closeProfileModal();
    closeNewGroupModal();
    closeChat();
    await loadChats();
  }

  // ─── Create and edit conversations ────────────────────────────────────────
  const closeNewChatModal = () => {
    setNewChatOpen(false);
    setNewChatUsername("");
    setNewChatResults([]);
    setNewChatSelection(null);
    setNewChatError("");
  };
  async function startDirectMessage() {
    if (!newChatUsername.trim()) return;
    setNewChatError("");
    try {
      if (!isConnected) {
        setNewChatError("Server not reachable.");
        return;
      }
      if (!newChatSelection) {
        setNewChatError("Pick a user from the search results.");
        return;
      }
      const response = await createDmChat({
        from: user.username,
        to: newChatSelection.username,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error || `Unable to start chat (${response.status}).`,
        );
      if (!data?.id) throw new Error("Server did not return a chat id.");
      setActiveChatId(data.id);
      setActivePeer(newChatSelection);
      setNewChatUsername("");
      setNewChatOpen(false);
      setMobileTab("chat");
      await loadChats();
    } catch (error) {
      setNewChatError(error.message);
    }
  }

  async function openOrCreateDmFromMember(member) {
    const username = String(member?.username || "").toLowerCase();
    if (!username || username === String(user.username || "").toLowerCase())
      return;
    try {
      const existing = chats.find(
        (chat) =>
          chat?.type === "dm" &&
          (chat.members || []).some(
            (item) => String(item?.username || "").toLowerCase() === username,
          ),
      );
      let chatId = normalizeUuid(existing?.id) || null;
      if (!chatId) {
        const response = await createDmChat({
          from: user.username,
          to: username,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data?.error || "Unable to open direct chat.");
        chatId = normalizeUuid(data?.id) || null;
      }
      if (!chatId) throw new Error("Unable to resolve direct chat.");
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, String(chatId));
      }
      setActiveChatId(chatId);
      setMobileTab("chat");
      closeProfileModal();
      await loadChats({ silent: true });
      const refreshed = chats.find((chat) => chat.id === chatId);
      const peer = (refreshed?.members || []).find(
        (item) => String(item?.username || "").toLowerCase() === username,
      );
      setActivePeer(peer || member || null);
    } catch (error) {
      setProfileError(error.message || "Unable to open direct chat.");
    }
  }
  async function openDiscoverUser(member) {
    if (!member) return;
    await openOrCreateDmFromMember(member);
    setSidebarScrollEpoch((previous) => previous + 1);
  }
  async function openDiscoverGroup(group) {
    const chatId = normalizeUuid(group?.id) || null;
    const path = buildInvitePathForChat(group);
    const isMember =
      group?.isMember === true ||
      group?.isMember === 1 ||
      String(group?.isMember || "").toLowerCase() === "true";
    if (isMember && chatId) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, String(chatId));
      }
      await loadChats({ silent: true });
      setActiveChatId(chatId);
      setActivePeer(null);
      setMobileTab("chat");
      setSidebarScrollEpoch((previous) => previous + 1);
      return;
    }
    if (!path) return;
    try {
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } catch (error) {
      setNewChatError(error.message || "Unable to open group.");
    }
  }

  const openNewGroupModal = () => {
    setEditingGroup(false);
    setGroupModalType("group");
    setNewGroupForm((previous) => ({
      ...previous,
      groupColor: getRandomAvatarColor(),
    }));
    setNewGroupOpen(true);
    setNewGroupError("");
  };
  const openNewChannelModal = () => {
    setEditingGroup(false);
    setGroupModalType("channel");
    setNewGroupForm((previous) => ({
      ...previous,
      groupColor: getRandomAvatarColor(),
    }));
    setNewGroupOpen(true);
    setNewGroupError("");
  };
  const closeNewGroupModal = () => {
    setNewGroupOpen(false);
    setCreatingGroup(false);
    setEditingGroup(false);
    setGroupModalType("group");
    setNewGroupForm({
      nickname: "",
      username: "",
      groupColor: DEFAULT_AVATAR_COLOR,
      visibility: "public",
      allowMemberInvites: true,
      remoteChannelEnabled: false,
      remoteChannelProvider: appInfo?.remoteChannels?.telegramConfigured
        ? "telegram"
        : "songbird",
      remoteChannelSource: "",
      remoteChannelSyncMetadata: false,
      remoteChannelStreamMedia: false,
      remoteChannelStatus: null,
      remoteChannelLoading: false,
    });
    setNewGroupSearch("");
    setNewGroupSearchResults([]);
    setNewGroupMembers([]);
    if (pendingGroupAvatarFile?.previewUrl)
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    setPendingGroupAvatarFile(null);
    setGroupAvatarPreview("");
    setGroupAvatarMarkedForRemoval(false);
    setEditGroupInviteToken("");
    setRegeneratingGroupInviteLink(false);
    setNewGroupError("");
  };

  const handleGroupAvatarChange = (event) => {
    const label = groupModalType === "channel" ? "Channel" : "Group";
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setNewGroupError("File uploads are disabled on this server.");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !String(file.type || "")
        .toLowerCase()
        .startsWith("image/")
    ) {
      setNewGroupError(`${label} avatar must be an image file.`);
      event.target.value = "";
      return;
    }
    if (Number(file.size || 0) > CHAT_PAGE_CONFIG.maxFileSizeBytes) {
      setNewGroupError(
        `${label} avatar must be smaller than ${formatBytesAsMb(CHAT_PAGE_CONFIG.maxFileSizeBytes)}.`,
      );
      event.target.value = "";
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (pendingGroupAvatarFile?.previewUrl)
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    setPendingGroupAvatarFile({ file, previewUrl });
    setGroupAvatarPreview(previewUrl);
    setGroupAvatarMarkedForRemoval(false);
    setNewGroupError("");
    event.target.value = "";
  };
  const handleGroupAvatarRemove = () => {
    if (pendingGroupAvatarFile?.previewUrl)
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    const hadAvatar = Boolean(
      editingGroup && String(activeChat?.group_avatar_url || "").trim(),
    );
    setPendingGroupAvatarFile(null);
    setGroupAvatarPreview("");
    setGroupAvatarMarkedForRemoval(hadAvatar);
  };
  const handleRegenerateGroupInvite = async () => {
    if (!editingGroup || !activeChat?.id) return;
    try {
      setRegeneratingGroupInviteLink(true);
      const response = await regenerateGroupInviteLink(activeChat.id, {
        username: user.username,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to regenerate invite link.");
      setEditGroupInviteToken(String(data?.inviteToken || ""));
      setProfileInviteLink(String(data?.inviteLink || ""));
    } catch (error) {
      setNewGroupError(error.message || "Unable to regenerate invite link.");
    } finally {
      setRegeneratingGroupInviteLink(false);
    }
  };

  const openEditGroupFromProfile = async () => {
    if (
      !activeChat ||
      !["group", "channel"].includes(activeChat.type) ||
      !canCurrentUserEditGroup
    ) {
      return;
    }
    setEditingGroup(true);
    setGroupModalType(activeChat.type === "channel" ? "channel" : "group");
    setProfileModalOpen(false);
    setNewGroupForm({
      nickname: activeChat.name || "",
      username: activeChat.group_username || "",
      groupColor: activeChat.group_color || DEFAULT_AVATAR_COLOR,
      visibility: activeChat.group_visibility || "public",
      allowMemberInvites: Boolean(Number(activeChat.allow_member_invites || 0)),
      remoteChannelEnabled: false,
      remoteChannelProvider: appInfo?.remoteChannels?.telegramConfigured
        ? "telegram"
        : "songbird",
      remoteChannelSource: "",
      remoteChannelSyncMetadata: false,
      remoteChannelStreamMedia: false,
      remoteChannelStatus: null,
      remoteChannelLoading:
        activeChat.type === "channel" &&
        Boolean(
          appInfo?.remoteChannels?.enabled &&
          appInfo?.remoteChannels?.uiEnabled,
        ),
    });
    setNewGroupMembers([]);
    setNewGroupSearch("");
    setGroupAvatarPreview(activeChat.group_avatar_url || "");
    setGroupAvatarMarkedForRemoval(false);
    if (pendingGroupAvatarFile?.previewUrl)
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    setPendingGroupAvatarFile(null);
    setEditGroupInviteToken(
      String(activeChat.inviteToken || activeChat.invite_token || ""),
    );
    setNewGroupOpen(true);
    try {
      const response = await getGroupInviteLink(activeChat.id);
      const data = await response.json();
      if (response.ok) setEditGroupInviteToken(String(data?.inviteToken || ""));
    } catch {
      // Invite token will use the chat snapshot.
    }
    if (
      activeChat.type !== "channel" ||
      !appInfo?.remoteChannels?.enabled ||
      !appInfo?.remoteChannels?.uiEnabled
    )
      return;
    try {
      const response = await getRemoteChannelSettings({
        chatId: activeChat.id,
        username: user.username,
      });
      const data = await response.json();
      if (response.ok) {
        const source = data?.source || null;
        setNewGroupForm((previous) => ({
          ...previous,
          remoteChannelEnabled: Boolean(source?.enabled),
          remoteChannelProvider: source?.provider || "songbird",
          remoteChannelSource:
            source?.sourceRaw ||
            (source?.sourceUsername ? `@${source.sourceUsername}` : "") ||
            source?.sourceChatId ||
            "",
          remoteChannelSyncMetadata: Boolean(source?.syncMetadata),
          remoteChannelStreamMedia:
            CHAT_PAGE_CONFIG.fileUploadEnabled && Boolean(source?.streamMedia),
          remoteChannelStatus: data,
          remoteChannelLoading: false,
        }));
      } else {
        setNewGroupForm((previous) => ({
          ...previous,
          remoteChannelStatus: {
            available: false,
            source: null,
            error: data?.error || "Unable to load Remote Channel settings.",
          },
          remoteChannelLoading: false,
        }));
      }
    } catch {
      setNewGroupForm((previous) => ({
        ...previous,
        remoteChannelStatus: {
          available: false,
          source: null,
          error: "Unable to load Remote Channel settings.",
        },
        remoteChannelLoading: false,
      }));
    }
  };

  async function handleCreateGroup() {
    const isChannel = groupModalType === "channel";
    const label = isChannel ? "Channel" : "Group";
    const nickname = newGroupForm.nickname.trim();
    const username = newGroupForm.username.trim().toLowerCase();
    if (!nickname) {
      setNewGroupError(`${label} nickname is required.`);
      return;
    }
    if (nickname.length > NICKNAME_MAX) {
      setNewGroupError(
        `${label} nickname must be ${NICKNAME_MAX} characters or less.`,
      );
      return;
    }
    if (username.length > USERNAME_MAX) {
      setNewGroupError(
        `${label} username must be ${USERNAME_MAX} characters or less.`,
      );
      return;
    }
    if (username.length < 3) {
      setNewGroupError(`${label} username must be at least 3 characters.`);
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setNewGroupError(
        `${label} username can only include english letters, numbers, dot (.), and underscore (_).`,
      );
      return;
    }

    const source = String(newGroupForm.remoteChannelSource || "").trim();
    const enabled =
      newGroupForm.visibility !== "private" &&
      Boolean(newGroupForm.remoteChannelEnabled);
    const provider = String(
      newGroupForm.remoteChannelProvider || "songbird",
    ).toLowerCase();
    const syncMetadata =
      enabled && Boolean(newGroupForm.remoteChannelSyncMetadata);
    const streamMedia =
      enabled &&
      CHAT_PAGE_CONFIG.fileUploadEnabled &&
      Boolean(appInfo?.remoteChannels?.mediaStreamEnabled) &&
      Boolean(newGroupForm.remoteChannelStreamMedia);
    const original = editingGroup
      ? newGroupForm.remoteChannelStatus?.source || null
      : null;
    const originalEnabled = Boolean(original?.enabled);
    const originalProvider = String(
      original?.provider || "telegram",
    ).toLowerCase();
    const originalSource =
      original?.sourceRaw ||
      (original?.sourceUsername ? `@${original.sourceUsername}` : "") ||
      original?.sourceChatId ||
      "";
    const changed =
      enabled !== originalEnabled ||
      provider !== originalProvider ||
      source !== originalSource ||
      syncMetadata !== Boolean(original?.syncMetadata) ||
      streamMedia !==
        (CHAT_PAGE_CONFIG.fileUploadEnabled && Boolean(original?.streamMedia));
    const saveRemote = Boolean(
      isChannel &&
      appInfo?.remoteChannels?.enabled &&
      appInfo?.remoteChannels?.uiEnabled &&
      (editingGroup
        ? changed
        : enabled || source || syncMetadata || streamMedia),
    );
    if (saveRemote && enabled && !source) {
      setNewGroupError("Remote Channel source is required.");
      return;
    }

    try {
      setCreatingGroup(true);
      setNewGroupError("");
      const payload = {
        creator: user.username,
        nickname,
        username,
        groupColor: newGroupForm.groupColor || DEFAULT_AVATAR_COLOR,
        visibility: newGroupForm.visibility,
        allowMemberInvites:
          newGroupForm.visibility !== "private" ||
          newGroupForm.allowMemberInvites !== false,
        members: editingGroup
          ? Array.from(
              new Set([
                ...(activeChat?.members || [])
                  .map((member) => String(member?.username || "").toLowerCase())
                  .filter(
                    (name) =>
                      name &&
                      name !== String(user.username || "").toLowerCase(),
                  ),
                ...newGroupMembers
                  .map((member) => String(member?.username || "").toLowerCase())
                  .filter(Boolean),
              ]),
            )
          : newGroupMembers.map((member) => member.username),
      };
      if (!editingGroup && saveRemote) {
        payload.remoteChannel = {
          enabled,
          provider,
          source,
          syncMetadata,
          streamMedia,
        };
      }
      const response =
        editingGroup && activeChat?.id
          ? await (isChannel ? updateChannelChat : updateGroupChat)(
              activeChat.id,
              {
                username: user.username,
                nickname: payload.nickname,
                groupUsername: payload.username,
                visibility: payload.visibility,
                allowMemberInvites: payload.allowMemberInvites,
                members: payload.members,
              },
            )
          : await (isChannel ? createChannelChat : createGroupChat)(payload);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to create group.");
      const nextChatId =
        normalizeUuid(data?.id) || normalizeUuid(activeChat?.id) || null;
      if (!nextChatId) throw new Error("Server did not return a group id.");

      if (pendingGroupAvatarFile?.file) {
        const uploaded = await uploadAvatarFile(pendingGroupAvatarFile.file);
        let avatarResponse;
        if (uploaded.directS3 && uploaded.avatarUrl) {
          avatarResponse = await uploadGroupAvatar(nextChatId, {
            username: user.username,
            avatarUrl: uploaded.avatarUrl,
          });
        } else {
          const form = new FormData();
          form.append("username", user.username);
          form.append("avatar", pendingGroupAvatarFile.file);
          avatarResponse = await uploadGroupAvatar(nextChatId, form);
        }
        const avatarData = await avatarResponse.json();
        if (!avatarResponse.ok) {
          throw new Error(
            avatarData?.error ||
              `Unable to upload ${label.toLowerCase()} avatar.`,
          );
        }
      } else if (editingGroup && groupAvatarMarkedForRemoval) {
        const avatarResponse = await removeGroupAvatar(nextChatId, {
          username: user.username,
        });
        const avatarData = await avatarResponse.json();
        if (!avatarResponse.ok) {
          throw new Error(
            avatarData?.error || "Unable to remove group avatar.",
          );
        }
      }
      if (saveRemote && editingGroup) {
        const remoteResponse = await updateRemoteChannelSettings(nextChatId, {
          username: user.username,
          enabled,
          provider,
          source,
          syncMetadata,
          streamMedia,
        });
        const remoteData = await remoteResponse.json();
        if (!remoteResponse.ok) {
          throw new Error(
            remoteData?.error || "Unable to update Remote Channel.",
          );
        }
      }
      if (!editingGroup) {
        setCreatedGroupInviteLink(String(data?.inviteLink || ""));
        setCreatedGroupInviteType(isChannel ? "channel" : "group");
        setGroupInviteOpen(Boolean(data?.inviteLink));
      }
      closeNewGroupModal();
      setEditingGroup(false);
      await loadChats();
      if (editingGroup) setSidebarScrollEpoch((previous) => previous + 1);
      setActiveChatId(nextChatId);
      setActivePeer(null);
      setMobileTab("chat");
    } catch (error) {
      setNewGroupError(error.message);
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleRemoveGroupMember(member) {
    if (
      !activeChat ||
      !["group", "channel"].includes(activeChat.type) ||
      !member?.username
    ) {
      return;
    }
    try {
      const response = await removeGroupMember(activeChat.id, {
        username: user.username,
        targetUsername: member.username,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to remove member.");
      await loadChats({ silent: true });
    } catch {
      // Keep member list until next server refresh.
    }
  }

  // ─── Message deletion and read receipts ───────────────────────────────────
  const canDeleteMessageForEveryone = useCallback(
    (message) => {
      if (String(activeChat?.type || "").toLowerCase() === "saved")
        return false;
      if (isActiveChannelChat && !canCurrentUserEditGroup) return false;
      const author = String(message?.username || "").toLowerCase();
      const self = String(user?.username || "").toLowerCase();
      if (!author) return false;
      return author === self || canCurrentUserEditGroup;
    },
    [
      activeChat?.type,
      canCurrentUserEditGroup,
      isActiveChannelChat,
      user,
    ],
  );
  const canEditMessageFromContext = useCallback(
    (message) =>
      (!isActiveChannelChat || canCurrentUserEditGroup) &&
      isMessageAuthoredByUser(message, { username: user?.username }),
    [canCurrentUserEditGroup, isActiveChannelChat, user],
  );
  const handleDeleteMessageRequest = (message) => {
    if (!message) return;
    setPendingDeleteMessage(message);
    setMessageDeleteScopeOpen(true);
  };

  const handleMessageSeen = useCallback(
    (messageId) => {
      const id = normalizeUuid(messageId) || null;
      if (!id || !activeChatIdRef.current || !user?.username) return;
      if (isMobileViewport && mobileTab !== "chat") return;
      const chatId = String(activeChatIdRef.current || "");
      const receiptKey = chatId + ":" + id;
      if (seenMessageIdsRef.current.has(receiptKey)) return;
      const currentMessage = messagesRef.current.find(
        (message) =>
          (normalizeUuid(message?._serverId || message?.id) || null) === id,
      );
      if (!currentMessage || currentMessage._readByMe) return;
      seenMessageIdsRef.current.add(receiptKey);
      setMessages((previous) =>
        previous.map((message) => {
          const serverId =
            normalizeUuid(message?._serverId || message?.id) || null;
          return serverId === id && !message._readByMe
            ? { ...message, _readByMe: true }
            : message;
        }),
      );
      setChats((previous) =>
        previous.map((chat) =>
          chat?.id && chat.id === activeChatIdRef.current
            ? {
                ...chat,
                unread_count: Math.max(0, Number(chat?.unread_count || 0) - 1),
              }
            : chat,
        ),
      );
      setUnreadInChat((previous) => Math.max(0, previous - 1));
      markMessageRead({
        chatId: activeChatIdRef.current,
        username: user.username,
        messageId: id,
      }).catch(() => null);
    },
    [isMobileViewport, mobileTab, user?.username],
  );

  const { registerMessageRef } = useMessageVisibility({
    activeChatId,
    user,
    canMarkReadInCurrentView: !isMobileViewport || mobileTab === "chat",
    isAppActive,
    chatScrollRef,
    onMessageSeen: handleMessageSeen,
  });

  const pruneDeletedMessagesFromCache = useCallback(
    (chatId, messageIds = []) => {
      const id = normalizeUuid(chatId) || null;
      const ids = Array.from(
        new Set(
          (Array.isArray(messageIds) ? messageIds : [])
            .map((value) => normalizeUuid(value))
            .filter(Boolean),
        ),
      );
      if (!id || !ids.length) return;
      const deleted = new Set(ids);
      const prune = (cached) => {
        if (!cached || !Array.isArray(cached.messages))
          return { changed: false, value: cached };
        const retained = cached.messages.filter((message) => {
          const serverId =
            normalizeUuid(message?._serverId || message?.id) || null;
          return !serverId || !deleted.has(serverId);
        });
        if (retained.length === cached.messages.length)
          return { changed: false, value: cached };
        return {
          changed: true,
          value: {
            ...cached,
            messages: retained,
            lastMessageId: retained.length
              ? normalizeUuid(retained[retained.length - 1]?.id) || null
              : null,
            updatedAt: Date.now(),
          },
        };
      };
      const inMemory = prune(
        readMessagesCacheMemory(messagesCacheRef.current, id),
      );
      if (inMemory.changed) {
        writeMessagesCacheMemory(
          messagesCacheRef.current,
          id,
          inMemory.value,
          activeChatIdRef.current,
        );
      }
      if (!user?.username || !canUseIdb()) return;
      const key = buildMessagesCacheKey(user.username, id);
      void (async () => {
        const cached = prune(await readMessagesCacheAsync(user.username, id));
        if (!cached.changed) return;
        await writeIdbCache(CACHE_STORES.messages, key, cached.value);
        await updateMessagesIndex(
          user.username,
          id,
          Number(cached.value?.updatedAt || Date.now()),
        );
      })();
    },
    [user?.username],
  );

  async function performDeleteMessage(message, scope = "self") {
    const messageId =
      normalizeUuid(message?._id || message?._serverId || message?.id) || null;
    if (!activeChatId || !messageId || !user?.username) return;
    const targetChatId = String(activeChatId);
    const snapshot = messagesRef.current;
    const originalIndex = snapshot.findIndex(
      (item) =>
        (normalizeUuid(item?._serverId || item?.id) || null) === messageId,
    );
    const deletedMessage = originalIndex >= 0 ? snapshot[originalIndex] : null;
    const replies = new Map(
      snapshot
        .filter(
          (item) => (normalizeUuid(item?.replyTo?.id) || null) === messageId,
        )
        .map((item) => [getMessageContextKey(item), item.replyTo]),
    );

    setMessageDeleteScopeOpen(false);
    setPendingDeleteMessage(null);
    setMessages((previous) =>
      previous
        .filter(
          (item) =>
            (normalizeUuid(item?._serverId || item?.id) || null) !== messageId,
        )
        .map((item) =>
          (normalizeUuid(item?.replyTo?.id) || null) === messageId
            ? { ...item, replyTo: null }
            : item,
        ),
    );
    pruneDeletedMessagesFromCache(targetChatId, [messageId]);

    try {
      const response = await deleteMessage({
        chatId: targetChatId,
        username: user.username,
        messageId,
        scope,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to delete message.");
      await loadChats({ silent: true });
    } catch (error) {
      // Restore only the affected message and reply links. Keep any newer SSE rows.
      if (
        String(activeChatIdRef.current || "") === targetChatId &&
        deletedMessage
      ) {
        setMessages((previous) => {
          const exists = previous.some(
            (item) =>
              (normalizeUuid(item?._serverId || item?.id) || null) ===
              messageId,
          );
          const result = previous.map((item) => {
            const reply = replies.get(getMessageContextKey(item));
            return reply ? { ...item, replyTo: reply } : item;
          });
          if (!exists) {
            const preceding = snapshot
              .slice(0, Math.max(0, originalIndex))
              .map((item) => getMessageContextKey(item))
              .reverse();
            let index = 0;
            for (const key of preceding) {
              const found = result.findIndex(
                (item) => getMessageContextKey(item) === key,
              );
              if (found >= 0) {
                index = found + 1;
                break;
              }
            }
            result.splice(index, 0, deletedMessage);
          }
          return result;
        });
      }
      setUploadError(String(error?.message || "Unable to delete message."));
    }
  }

  // ─── Pending uploads and media metadata ───────────────────────────────────
  const fileUploadInProgress = useMemo(
    () =>
      messages.some(
        (message) =>
          message?._delivery === "sending" &&
          Array.isArray(message?._files) &&
          message._files.length > 0,
      ),
    [messages],
  );

  const setPendingUploadProgress = (clientId, progress, chatId = null) => {
    const percent = Math.max(0, Math.min(100, Number(progress || 0)));
    const current = String(activeChatIdRef.current || "");
    const target = String(chatId || "");
    if (!target || current === target) setActiveUploadProgress(percent);
    setMessages((previous) =>
      previous.map((message) =>
        message._clientId === clientId
          ? { ...message, _uploadProgress: percent }
          : message,
      ),
    );
  };
  const scheduleActiveUploadProgressHide = useCallback(() => {
    if (activeUploadProgressHideTimerRef.current) {
      window.clearTimeout(activeUploadProgressHideTimerRef.current);
    }
    activeUploadProgressHideTimerRef.current = window.setTimeout(() => {
      activeUploadProgressHideTimerRef.current = null;
      setActiveUploadProgress(null);
    }, UPLOAD_PROGRESS_HIDE_DELAY_MS);
  }, []);
  const clearPendingUploads = ({ scroll = true } = {}) => {
    setPendingUploadFiles((previous) => {
      previous.forEach((file) => {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      });
      return [];
    });
    setPendingUploadType("");
    setUploadError("");
    if (scroll) scrollToBottomIfSafe("auto");
  };
  const clearPendingVoiceMessage = () => {
    setPendingVoiceMessage((previous) => {
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return null;
    });
  };
  const removePendingUpload = (id) => {
    setPendingUploadFiles((previous) => {
      const next = previous.filter((file) => {
        if (file.id !== id) return true;
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
        return false;
      });
      if (!next.length) setPendingUploadType("");
      return next;
    });
  };
  const handleVoiceRecorded = (payload) => {
    if (!payload?.file) return;
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setUploadError("File uploads are disabled on this server.");
      return;
    }
    if (fileUploadInProgress || activeUploadProgress !== null) {
      setUploadError("Please wait for the current upload to finish.");
      return;
    }
    if (pendingVoiceMessage) {
      setUploadError("Remove the voice message before attaching files.");
      return;
    }
    if (pendingUploadFiles.length) {
      setUploadError("Remove attachments before adding a voice message.");
      return;
    }
    const file = payload.file;
    const sizeBytes = Number(file.size || 0);
    if (sizeBytes > CHAT_PAGE_CONFIG.maxFileSizeBytes) {
      setUploadError(
        `Each file must be smaller than ${formatBytesAsMb(CHAT_PAGE_CONFIG.maxFileSizeBytes)}.`,
      );
      return;
    }
    if (sizeBytes > CHAT_PAGE_CONFIG.maxTotalUploadBytes) {
      setUploadError(
        `Total upload size cannot exceed ${formatBytesAsMb(CHAT_PAGE_CONFIG.maxTotalUploadBytes)}.`,
      );
      return;
    }
    setUploadError("");
    clearPendingVoiceMessage();
    const previewUrl = URL.createObjectURL(file);
    setPendingVoiceMessage({
      id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name || "voice-message",
      mimeType: payload.mimeType || file.type || "audio/webm",
      sizeBytes,
      durationSeconds: Number(payload.durationSeconds || 0) || null,
      previewUrl,
      kind: "voice",
    });
    if (activeChatId && !userScrolledUpRef.current)
      scrollToBottomIfSafe("auto");
  };

  function getMediaFileMetadata(file) {
    const type = String(file?.type || "").toLowerCase();
    const empty = { width: null, height: null, durationSeconds: null };
    if (type.startsWith("image/")) {
      if (typeof window.createImageBitmap !== "function")
        return Promise.resolve(empty);
      return window
        .createImageBitmap(file)
        .then((bitmap) => {
          const metadata = {
            width: Number.isFinite(Number(bitmap.width))
              ? Number(bitmap.width)
              : null,
            height: Number.isFinite(Number(bitmap.height))
              ? Number(bitmap.height)
              : null,
            durationSeconds: null,
          };
          bitmap.close?.();
          return metadata;
        })
        .catch(() => empty);
    }
    if (type.startsWith("video/") || type.startsWith("audio/")) {
      return new Promise((resolve) => {
        let url;
        try {
          url = URL.createObjectURL(file);
        } catch {
          resolve(empty);
          return;
        }
        const video = type.startsWith("video/");
        const element = document.createElement(video ? "video" : "audio");
        element.preload = "metadata";
        if (element instanceof HTMLVideoElement) {
          element.muted = true;
          element.playsInline = true;
        }
        let resolved = false;
        const done = (metadata) => {
          if (resolved) return;
          resolved = true;
          window.clearTimeout(timeout);
          try {
            element.pause();
          } catch {
            /* No media playing. */
          }
          element.removeAttribute("src");
          URL.revokeObjectURL(url);
          resolve(metadata);
        };
        // A malformed media file must not block every later attachment.
        const timeout = window.setTimeout(() => done(empty), 12000);
        element.onloadedmetadata = () =>
          done({
            width:
              element instanceof HTMLVideoElement
                ? element.videoWidth || null
                : null,
            height:
              element instanceof HTMLVideoElement
                ? element.videoHeight || null
                : null,
            durationSeconds: Number.isFinite(Number(element.duration))
              ? Number(element.duration)
              : null,
          });
        element.onerror = () => done(empty);
        element.src = url;
      });
    }
    return Promise.resolve(empty);
  }

  async function handleUploadFilesSelected(
    fileList,
    uploadType,
    append = false,
  ) {
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setUploadError("File uploads are disabled on this server.");
      return;
    }
    if (fileUploadInProgress || activeUploadProgress !== null) {
      setUploadError("Please wait for the current upload to finish.");
      return;
    }
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setUploadError("");
    if (append && pendingUploadType && uploadType !== pendingUploadType) {
      setUploadError("You can only add one type per message.");
      return;
    }
    const existing = append ? pendingUploadFiles : [];
    if (
      existing.length + incoming.length >
      CHAT_PAGE_CONFIG.maxFilesPerMessage
    ) {
      setUploadError(
        `Maximum ${CHAT_PAGE_CONFIG.maxFilesPerMessage} files per message.`,
      );
      return;
    }
    if (
      incoming.some(
        (file) => Number(file.size || 0) > CHAT_PAGE_CONFIG.maxFileSizeBytes,
      )
    ) {
      setUploadError(
        `Each file must be smaller than ${formatBytesAsMb(CHAT_PAGE_CONFIG.maxFileSizeBytes)}.`,
      );
      return;
    }
    const existingBytes = existing.reduce(
      (sum, file) => sum + Number(file.sizeBytes || file.size || 0),
      0,
    );
    const incomingBytes = incoming.reduce(
      (sum, file) => sum + Number(file.size || 0),
      0,
    );
    if (existingBytes + incomingBytes > CHAT_PAGE_CONFIG.maxTotalUploadBytes) {
      setUploadError(
        `Total upload size cannot exceed ${formatBytesAsMb(CHAT_PAGE_CONFIG.maxTotalUploadBytes)}.`,
      );
      return;
    }
    if (
      uploadType === "media" &&
      incoming.some(
        (file) =>
          !String(file.type || "").startsWith("image/") &&
          !String(file.type || "").startsWith("video/"),
      )
    ) {
      setUploadError("Photo or Video only accepts image/video files.");
      return;
    }
    if (!append) clearPendingUploads();
    const metadata = await Promise.all(incoming.map(getMediaFileMetadata));
    const nextItems = incoming.map((file, index) => ({
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: Number(file.size || 0),
      width: metadata[index]?.width || null,
      height: metadata[index]?.height || null,
      durationSeconds: metadata[index]?.durationSeconds ?? null,
      previewUrl: ["image/", "video/", "audio/"].some((prefix) =>
        String(file.type || "").startsWith(prefix),
      )
        ? URL.createObjectURL(file)
        : null,
    }));
    setPendingUploadFiles((previous) =>
      append ? [...previous, ...nextItems] : nextItems,
    );
    setPendingUploadType(uploadType);
    if (activeChatId && !userScrolledUpRef.current)
      scrollToBottomIfSafe("auto");
  }

  const updateOwnLatestChatPreview = ({
    chatId,
    body = "",
    files = [],
    createdAt = null,
    messageId = null,
  }) => {
    const id = String(chatId || "");
    if (!id) return;
    const time = createdAt || new Date().toISOString();
    const text = normalizeMessageBody(body).trim();
    const previewFiles = Array.isArray(files)
      ? files.map((file) => ({
          id: file?.id || file?._localId || null,
          kind: file?.kind || "document",
          name: file?.name || "",
          mimeType: file?.mimeType || "",
          sizeBytes: Number(file?.sizeBytes || 0) || 0,
          width: Number.isFinite(Number(file?.width))
            ? Number(file.width)
            : null,
          height: Number.isFinite(Number(file?.height))
            ? Number(file.height)
            : null,
          durationSeconds: Number.isFinite(Number(file?.durationSeconds))
            ? Number(file.durationSeconds)
            : null,
          url: file?.url || file?._localUrl || null,
          processing: Boolean(file?.processing),
        }))
      : [];
    setChats((previous) =>
      patchChatAndMoveToFront(previous, id, (chat) => ({
        ...chat,
        last_message_id:
          normalizeUuid(messageId) || chat?.last_message_id || null,
        last_message: text || chat?.last_message || "",
        last_message_files: previewFiles,
        last_time: time,
        last_sender_username: user.username,
        last_sender_nickname: user.nickname || user.username,
        last_sender_avatar_url: user.avatarUrl || "",
        last_message_client_request_id: null,
        last_message_read_at:
          chat?.type === "saved" ? time : chat?.last_message_read_at || null,
      })),
    );
  };

  // ─── Outbox transport ─────────────────────────────────────────────────────
  const scheduleMessageRefresh = (chatId, options = {}) => {
    if (!chatId) return;
    if (messageRefreshTimerRef.current)
      window.clearTimeout(messageRefreshTimerRef.current);
    /** @type {Record<string, any>} */
    const opts = options;
    const { delayMs, tailDelta, ...loadOptions } = opts;
    const delay = Number.isFinite(Number(delayMs))
      ? Math.max(0, Number(delayMs))
      : 280;
    let deltaOptions = null;
    if (
      tailDelta &&
      !loadOptions.prepend &&
      !loadOptions.pruneMissing &&
      !loadOptions.afterId
    ) {
      const current = messagesRef.current || [];
      let anchor = null;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const candidate = current[index];
        const id = String(candidate?._serverId || candidate?.id || "");
        if (
          id &&
          candidate?.created_at &&
          String(candidate?._chatId || chatId) === String(chatId)
        ) {
          anchor = candidate;
          break;
        }
      }
      if (anchor) {
        deltaOptions = {
          afterId: String(anchor._serverId || anchor.id),
          afterCreatedAt: anchor.created_at,
          tailDelta: true,
          limit: CHAT_PAGE_CONFIG.messageFetchLimit,
        };
      }
    }
    messageRefreshTimerRef.current = window.setTimeout(() => {
      messageRefreshTimerRef.current = null;
      void loadMessages(chatId, {
        silent: true,
        preserveHistory: true,
        ...loadOptions,
        ...(deltaOptions || {}),
      });
    }, delay);
  };

  function uploadPendingMessageWithProgress(pendingMessage, targetChatId) {
    return new Promise((resolve, reject) => {
      void (async () => {
        const form = new FormData();
        form.append("username", user.username);
        form.append("chatId", String(targetChatId));
        form.append("body", pendingMessage.body || "");
        form.append("uploadType", pendingMessage._uploadType || "document");
        form.append("clientRequestId", String(pendingMessage._clientId || ""));
        if (pendingMessage._topicId)
          form.append("topicId", pendingMessage._topicId);
        if (pendingMessage.replyTo?.id) {
          form.append("replyToMessageId", String(pendingMessage.replyTo.id));
        }
        if (pendingMessage._editMessageId) {
          form.append("editMessageId", String(pendingMessage._editMessageId));
        }
        const fileItems = (pendingMessage._files || []).filter(
          (item) => item?.file instanceof Blob,
        );
        let prepared = { presignedFiles: [], localFiles: [], fileMeta: [] };
        try {
          prepared = await prepareFilesForMessage(fileItems, {
            onProgress: (_index, percent) => {
              setPendingUploadProgress(
                pendingMessage._clientId,
                percent,
                targetChatId,
              );
            },
          });
        } catch (error) {
          console.warn(
            "[uploadPendingMessageWithProgress] prepareFilesForMessage failed:",
            error,
          );
        }
        const { presignedFiles = [] } = prepared;
        if (
          presignedFiles.length &&
          presignedFiles.length === fileItems.length
        ) {
          form.append("storageKeys", JSON.stringify(presignedFiles));
        } else {
          const fileMeta = [];
          fileItems.forEach((item) => {
            const filename = item.name || item.file.name || "upload.bin";
            form.append("files", item.file, filename);
            fileMeta.push({
              width: Number.isFinite(Number(item.width))
                ? Number(item.width)
                : null,
              height: Number.isFinite(Number(item.height))
                ? Number(item.height)
                : null,
              durationSeconds: Number.isFinite(Number(item.durationSeconds))
                ? Number(item.durationSeconds)
                : null,
            });
          });
          form.append("fileMeta", JSON.stringify(fileMeta));
        }
        const xhr = new XMLHttpRequest();
        let settled = false;
        const finish = (callback) => {
          if (settled) return;
          settled = true;
          callback();
        };
        xhr.open("POST", getMessagesUploadUrl());
        xhr.timeout = CHAT_PAGE_CONFIG.pendingFileTimeoutMs;
        xhr.upload.onprogress = (event) => {
          if (settled || !event.lengthComputable) return;
          const percent = Math.max(
            0,
            Math.min(100, Math.round((event.loaded / event.total) * 100)),
          );
          setPendingUploadProgress(
            pendingMessage._clientId,
            percent,
            targetChatId,
          );
        };
        xhr.onerror = () =>
          finish(() => reject(new Error("Network error during file upload.")));
        xhr.ontimeout = () =>
          finish(() => reject(new Error("Upload timed out.")));
        xhr.onload = () => {
          let data;
          try {
            data = JSON.parse(xhr.responseText || "{}");
          } catch {
            data = {};
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            const activeId = String(activeChatIdRef.current || "");
            const targetId = String(targetChatId || "");
            if (!targetId || activeId === targetId) {
              setActiveUploadProgress(100);
              scheduleActiveUploadProgressHide();
            }
            finish(() => resolve(data));
            return;
          }
          if (data?.error) {
            finish(() => reject(new Error(String(data.error))));
          } else if (isAmbiguousSendStatus(xhr.status)) {
            finish(() =>
              reject(
                createAmbiguousSendError(
                  xhr.status,
                  `Unable to confirm delivery (HTTP ${xhr.status}).`,
                ),
              ),
            );
          } else if (xhr.status === 413) {
            finish(() =>
              reject(
                new Error(
                  "Upload rejected (HTTP 413): request is too large. Increase proxy upload limit.",
                ),
              ),
            );
          } else {
            finish(() =>
              reject(
                new Error(
                  `Unable to send message (HTTP ${xhr.status || "unknown"}).`,
                ),
              ),
            );
          }
        };
        xhr.send(form);
      })().catch(reject);
    });
  }

  const sendPendingMessage = async (pendingMessage) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (
      !pendingMessage ||
      pendingMessage._delivery !== "sending" ||
      pendingMessage._awaitingServerEcho
    )
      return;
    const retryState =
      outboxRetryStateRef.current.get(pendingMessage._clientId) ||
      pendingMessage;
    if (Number(retryState._nextAttemptAt || 0) > Date.now()) return;
    const clientId = pendingMessage._clientId;
    const hasFiles =
      Array.isArray(pendingMessage._files) && pendingMessage._files.length > 0;
    const editing = Boolean(pendingMessage?._editMessageId);
    if (!clientId || sendingClientIdsRef.current.has(clientId)) return;
    if (
      !hasFiles &&
      String(pendingMessage.body || "").length > messageMaxChars
    ) {
      setUploadError(`Message must be ${messageMaxChars} characters or less.`);
      setMessages((previous) =>
        previous.map((message) =>
          message?._clientId === clientId
            ? { ...message, _delivery: "failed" }
            : message,
        ),
      );
      return;
    }
    sendingClientIdsRef.current.add(clientId);
    const targetChatId = String(pendingMessage._chatId || activeChatId || "");
    let isTargetActive = false;
    try {
      if (!targetChatId) return;
      isTargetActive = String(activeChatIdRef.current || "") === targetChatId;
      const chatType =
        chats.find((chat) => String(chat.id) === targetChatId)?.type ||
        activeChatTypeRef.current ||
        null;
      const saved = String(chatType || "").toLowerCase() === "saved";
      let data;
      if (hasFiles) {
        if (isTargetActive) setActiveUploadProgress(0);
        data = await uploadPendingMessageWithProgress(
          pendingMessage,
          targetChatId,
        );
      } else {
        const response = editing
          ? await editMessage({
              username: user.username,
              body: pendingMessage.body,
              chatId: targetChatId,
              messageId: pendingMessage._editMessageId,
            })
          : await sendMessage({
              username: user.username,
              body: pendingMessage.body,
              chatId: targetChatId,
              replyToMessageId: pendingMessage.replyTo?.id || null,
              clientRequestId: String(clientId),
              topicId: pendingMessage._topicId || null,
            });
        data = await response.json();
        if (!response.ok) {
          if (isAmbiguousSendStatus(response.status) && !editing) {
            throw createAmbiguousSendError(
              response.status,
              `Unable to confirm delivery (HTTP ${response.status}).`,
            );
          }
          throw Object.assign(
            new Error(data?.error || "Unable to send message."),
            {
              httpStatus: response.status,
            },
          );
        }
      }
      isTargetActive = String(activeChatIdRef.current || "") === targetChatId;
      if (!editing)
        await removeOutboxMessage(user.id || user.username, clientId);
      if (editing) {
        if (hasFiles && isTargetActive) {
          setActiveUploadProgress(100);
          scheduleActiveUploadProgressHide();
        }
        if (isTargetActive)
          scheduleMessageRefreshRef.current?.(targetChatId, {
            preserveHistory: true,
            pruneMissing: true,
          });
        await loadChats({ silent: true });
        setEditTarget(null);
        return;
      }

      updateOwnLatestChatPreview({
        chatId: targetChatId,
        body: pendingMessage.body,
        files: pendingMessage._files,
        createdAt:
          pendingMessage?._createdAt ||
          data?.created_at ||
          data?.createdAt ||
          new Date().toISOString(),
        messageId: data?.id || null,
      });
      const serverId = data?.id || data?._serverId || null;
      if (isTargetActive) {
        setMessages((previous) => {
          const uploadType = String(
            pendingMessage?._uploadType || "",
          ).toLowerCase();
          const files = Array.isArray(pendingMessage?._files)
            ? pendingMessage._files
            : [];
          const hasVideo = files.some((file) =>
            String(file?.mimeType || "")
              .toLowerCase()
              .startsWith("video/"),
          );
          const responseFiles =
            Array.isArray(data?.files) && data.files.length ? data.files : null;
          const processing = responseFiles
            ? responseFiles.some((file) => file.processing === true)
            : true;
          const keepPending =
            hasFiles && uploadType === "media" && hasVideo && processing;
          const expiresAt = data?.expiresAt || null;
          const index = previous.findIndex(
            (message) =>
              (message?._clientId &&
                String(message._clientId) === String(clientId)) ||
              (message?.client_request_id &&
                String(message.client_request_id) === String(clientId)) ||
              (message?.id && String(message.id) === String(clientId)) ||
              (serverId &&
                String(message?._serverId || message?.id) === String(serverId)),
          );
          if (index >= 0) {
            return previous.map((message, position) =>
              position !== index
                ? message
                : {
                    ...message,
                    _clientId: clientId,
                    client_request_id: clientId,
                    _serverId: serverId || message._serverId || null,
                    _delivery: keepPending ? "sending" : "sent",
                    _processingPending:
                      keepPending || Boolean(message?._processingPending),
                    _awaitingServerEcho: Boolean(keepPending),
                    _uploadProgress: keepPending ? 100 : null,
                    expiresAt: expiresAt || message.expiresAt || null,
                    files:
                      responseFiles ||
                      (message.files || []).map((file) => ({
                        ...file,
                        expiresAt:
                          expiresAt ||
                          file?.expiresAt ||
                          file?.expires_at ||
                          null,
                        expires_at:
                          expiresAt ||
                          file?.expiresAt ||
                          file?.expires_at ||
                          null,
                      })),
                    read_at:
                      saved && !message.read_at
                        ? message.created_at || new Date().toISOString()
                        : message.read_at,
                    read_by_user_id:
                      saved && !message.read_by_user_id
                        ? user?.id || null
                        : message.read_by_user_id,
                  },
            );
          }
          const createdAt =
            pendingMessage?._createdAt || new Date().toISOString();
          const date = parseServerDate(createdAt);
          const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const normalizedFiles = (responseFiles || files).map((file) => ({
            id: file.id,
            _localId: file._localId || file.id,
            kind: file.kind,
            name: file.name || file.original_name || file.originalName || "",
            mimeType: file.mimeType || file.mime_type || "",
            sizeBytes: file.sizeBytes || file.size_bytes || 0,
            width: Number.isFinite(Number(file.width ?? file.width_px))
              ? Number(file.width ?? file.width_px)
              : null,
            height: Number.isFinite(Number(file.height ?? file.height_px))
              ? Number(file.height ?? file.height_px)
              : null,
            durationSeconds: Number.isFinite(
              Number(file.durationSeconds ?? file.duration_seconds),
            )
              ? Number(file.durationSeconds ?? file.duration_seconds)
              : null,
            expiresAt: file.expiresAt || file.expires_at || expiresAt || null,
            expires_at: file.expiresAt || file.expires_at || expiresAt || null,
            url: file.url || null,
            processing:
              keepPending &&
              String(file?.mimeType || file?.mime_type || "")
                .toLowerCase()
                .startsWith("video/"),
          }));
          return [
            ...previous,
            {
              id: clientId,
              username: user.username,
              body: String(pendingMessage?.body || "").trim(),
              created_at: createdAt,
              read_at: saved ? createdAt : null,
              read_by_user_id: saved ? user?.id || null : null,
              _clientId: clientId,
              client_request_id: clientId,
              _chatId: targetChatId,
              _queuedAt: Number(pendingMessage?._queuedAt || Date.now()),
              _delivery: keepPending ? "sending" : "sent",
              _dayKey: dayKey,
              _dayLabel: formatDayLabel(createdAt),
              _timeLabel: formatTime(createdAt),
              _uploadType: uploadType || "document",
              _files: files,
              _uploadProgress: keepPending ? 100 : null,
              _awaitingServerEcho: Boolean(keepPending),
              _processingPending: keepPending,
              _serverId: serverId,
              expiresAt: expiresAt || null,
              replyTo: pendingMessage.replyTo || null,
              files: normalizedFiles,
            },
          ];
        });
      }
      if (hasFiles && isTargetActive) {
        const files = Array.isArray(pendingMessage?._files)
          ? pendingMessage._files
          : [];
        const hasVideo = files.some((file) =>
          String(file?.mimeType || "")
            .toLowerCase()
            .startsWith("video/"),
        );
        const responseFiles =
          Array.isArray(data?.files) && data.files.length ? data.files : null;
        const processing = responseFiles
          ? responseFiles.some((file) => file.processing === true)
          : true;
        const keepPending =
          String(pendingMessage?._uploadType || "").toLowerCase() === "media" &&
          hasVideo &&
          processing;
        if (!keepPending) {
          if (activeUploadProgressHideTimerRef.current) {
            window.clearTimeout(activeUploadProgressHideTimerRef.current);
            activeUploadProgressHideTimerRef.current = null;
          }
          setActiveUploadProgress(null);
        }
      }
      pendingScrollToBottomRef.current = false;
    } catch (error) {
      if (!editing) {
        const attempts = Number(retryState._attempts || 0) + 1;
        const status = Number(error?.httpStatus || 0);
        const transient =
          !status || status >= 500 || [408, 409, 425, 429].includes(status);
        const delivery = transient && attempts < 5 ? "sending" : "failed";
        const retry = {
          ...pendingMessage,
          _delivery: delivery,
          _attempts: attempts,
          _nextAttemptAt: Date.now() + Math.min(60000, 1000 * 2 ** attempts),
          _uploadProgress: null,
          _lastError: String(error?.message || "Unable to confirm delivery."),
        };
        outboxRetryStateRef.current.set(clientId, {
          _attempts: attempts,
          _nextAttemptAt: retry._nextAttemptAt,
        });
        await saveOutboxMessage(user.id || user.username, retry).catch(
          () => {},
        );
        if (String(activeChatIdRef.current || "") === targetChatId) {
          setMessages((previous) =>
            previous.map((message) =>
              message._clientId === clientId
                ? {
                    ...message,
                    _delivery: delivery,
                    _attempts: attempts,
                    _nextAttemptAt: retry._nextAttemptAt,
                    _lastError: retry._lastError,
                    _uploadProgress: null,
                  }
                : message,
            ),
          );
          if (delivery === "failed") setUploadError(retry._lastError);
          if (hasFiles) setActiveUploadProgress(null);
        }
        return;
      }
      const networkError =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        error instanceof TypeError ||
        error?.name === "TypeError" ||
        String(error?.message || "").includes("Failed to fetch") ||
        String(error?.message || "").includes("NetworkError");
      if (networkError && !editing) return;
      if (!editing && isAmbiguousSendStatus(error?._ambiguousSendStatus)) {
        if (isTargetActive) {
          setMessages((previous) =>
            previous.map((message) =>
              message._clientId === clientId
                ? { ...message, _delivery: "sending", _queuedAt: Date.now() }
                : message,
            ),
          );
        }
        scheduleMessageRefreshRef.current?.(targetChatId, {
          preserveHistory: true,
        });
        void loadChats({ silent: true });
        return;
      }
      if (hasFiles && isTargetActive) {
        if (activeUploadProgressHideTimerRef.current) {
          window.clearTimeout(activeUploadProgressHideTimerRef.current);
          activeUploadProgressHideTimerRef.current = null;
        }
        setActiveUploadProgress(null);
        setUploadError(String(error?.message || "Unable to upload files."));
        setMessages((previous) =>
          previous.map((message) =>
            message._clientId === clientId
              ? { ...message, _delivery: "failed", _uploadProgress: null }
              : message,
          ),
        );
      } else if (isTargetActive) {
        setMessages((previous) =>
          previous.map((message) =>
            message._clientId === clientId
              ? { ...message, _delivery: "failed" }
              : message,
          ),
        );
      }
    } finally {
      sendingClientIdsRef.current.delete(clientId);
    }
  };

  async function handleSend(event, recordedMedia = null) {
    event.preventDefault();
    if (!activeChatId) return false;
    const recordedKind =
      recordedMedia?.kind === "voice" ? "voice" : "video_note";
    if (
      recordedMedia &&
      (!CHAT_PAGE_CONFIG.fileUploadEnabled ||
        !recordedMedia.file?.type?.startsWith(
          recordedKind === "voice" ? "audio/" : "video/",
        ) ||
        recordedMedia.file.size >
          Math.min(
            CHAT_PAGE_CONFIG.maxFileSizeBytes,
            CHAT_PAGE_CONFIG.maxTotalUploadBytes,
          ))
    ) {
      setUploadError(
        recordedKind === "voice"
          ? "The voice message exceeds the server upload limit. Record a shorter message."
          : "The video message exceeds the server upload limit. Record a shorter message.",
      );
      return false;
    }
    stopTypingIndicator(activeChatId);
    const editing = Boolean(editTarget?.id);
    const snapToBottom = !(editing && userScrolledUpRef.current);
    if (snapToBottom) {
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
    }
    shouldAutoMarkReadRef.current = true;
    setUnreadMarkerId(null);
    unreadMarkerIdRef.current = null;
    const form = event.currentTarget;
    const body = new FormData(form).get("message")?.toString() || "";
    if (body === "[object Object]") {
      setUploadError("Invalid message body.");
      return false;
    }
    const trimmedBody = body.trim();
    const selectedFiles = recordedMedia
      ? [
          {
            ...recordedMedia,
            id: `video-note-${Date.now()}`,
            name: recordedMedia.file.name,
            sizeBytes: recordedMedia.file.size,
          },
        ]
      : pendingUploadFiles;
    const hasSelectedFiles = selectedFiles.length > 0;
    const hasVoice = !recordedMedia && Boolean(pendingVoiceMessage);
    const hasAnyFiles = hasSelectedFiles || hasVoice;
    if (!trimmedBody && !hasAnyFiles) return false;
    if (String(body).length > messageMaxChars) {
      setUploadError(`Message must be ${messageMaxChars} characters or less.`);
      return false;
    }
    if (uploadError) setUploadError("");

    const createdAt = new Date().toISOString();
    const queuedAt = Date.now();
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const date = parseServerDate(createdAt);
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const pendingFiles = hasAnyFiles
      ? [
          ...selectedFiles.map((item) => {
            const type = String(item.mimeType || "");
            const localUrl =
              item.file instanceof Blob &&
              ["image/", "video/", "audio/"].some((prefix) =>
                type.startsWith(prefix),
              )
                ? URL.createObjectURL(item.file)
                : item.previewUrl || null;
            return {
              id: item.id,
              _localId: item.id,
              kind: recordedMedia
                ? recordedKind
                : pendingUploadType === "document"
                  ? "document"
                  : "media",
              name: item.name,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              width: Number.isFinite(Number(item.width))
                ? Number(item.width)
                : null,
              height: Number.isFinite(Number(item.height))
                ? Number(item.height)
                : null,
              durationSeconds: Number.isFinite(Number(item.durationSeconds))
                ? Number(item.durationSeconds)
                : null,
              url: localUrl,
              _localUrl: localUrl,
              file: item.file,
            };
          }),
          ...(hasVoice && pendingVoiceMessage
            ? [
                (() => {
                  const localUrl =
                    pendingVoiceMessage.file instanceof Blob
                      ? URL.createObjectURL(pendingVoiceMessage.file)
                      : pendingVoiceMessage.previewUrl || null;
                  return {
                    id: pendingVoiceMessage.id,
                    _localId: pendingVoiceMessage.id,
                    kind: "voice",
                    name: pendingVoiceMessage.name,
                    mimeType: pendingVoiceMessage.mimeType,
                    sizeBytes: pendingVoiceMessage.sizeBytes,
                    width: null,
                    height: null,
                    durationSeconds: Number.isFinite(
                      Number(pendingVoiceMessage.durationSeconds),
                    )
                      ? Number(pendingVoiceMessage.durationSeconds)
                      : null,
                    url: localUrl,
                    _localUrl: localUrl,
                    file: pendingVoiceMessage.file,
                  };
                })(),
              ]
            : []),
        ]
      : [];
    const replyPayload =
      !editing && replyTarget
        ? {
            id: replyTarget.id,
            username: replyTarget.username,
            nickname: replyTarget.nickname,
            body: replyTarget.body,
            icon: replyTarget.icon || null,
            displayName: replyTarget.displayName,
            color: replyTarget.color || null,
          }
        : null;
    const uploadType = recordedMedia
      ? recordedKind === "voice"
        ? "media"
        : "video_note"
      : hasSelectedFiles
        ? pendingUploadType
        : hasVoice
          ? "media"
          : pendingUploadType;

    const pendingMessage = {
      id: tempId,
      username: user.username,
      body: trimmedBody,
      created_at: createdAt,
      _createdAt: createdAt,
      _clientId: tempId,
      client_request_id: tempId,
      _chatId: activeChatId,
      _queuedAt: queuedAt,
      _delivery: "sending",
      _topicId: messaging.topic || null,
      _editMessageId: editing ? String(editTarget.id) : null,
      _dayKey: dayKey,
      _dayLabel: formatDayLabel(createdAt),
      _timeLabel: formatTime(createdAt),
      _uploadType: uploadType,
      _files: pendingFiles,
      files: pendingFiles,
      _uploadProgress: hasAnyFiles ? 0 : null,
      _awaitingServerEcho: false,
      replyTo: replyPayload,
      read_at: isActiveSavedChat ? createdAt : null,
      read_by_user_id: isActiveSavedChat ? user?.id || null : null,
    };

    if (!editing) {
      try {
        await saveOutboxMessage(user.id || user.username, pendingMessage);
      } catch (error) {
        setUploadError(error.message);
        return false;
      }
      // Persist first. Only then may the composer clear its form.
      if (String(activeChatIdRef.current) === String(activeChatId)) {
        setMessages((previous) => [...previous, pendingMessage]);
      }
      updateOwnLatestChatPreview({
        chatId: activeChatId,
        body: trimmedBody,
        files: pendingFiles,
        createdAt,
      });
    }
    form.reset();
    clearPendingUploads();
    clearPendingVoiceMessage();
    pendingScrollToBottomRef.current = snapToBottom;
    setReplyTarget(null);
    setEditTarget(null);
    if (editing) await sendPendingMessage(pendingMessage);
    return true;
  }

  // ─── Conversation hydration and refresh ───────────────────────────────────
  async function loadChats(options = {}) {
    if (loadChatsInFlightRef.current) {
      const queued = {
        silent: Boolean(options.silent),
        showUpdating: Boolean(options.showUpdating),
        preserveActiveUnread: Boolean(options.preserveActiveUnread),
      };
      const current = queuedLoadChatsOptionsRef.current;
      queuedLoadChatsOptionsRef.current = current
        ? {
            silent: current.silent && queued.silent,
            showUpdating: current.showUpdating || queued.showUpdating,
            preserveActiveUnread:
              current.preserveActiveUnread || queued.preserveActiveUnread,
          }
        : queued;
      return;
    }
    loadChatsInFlightRef.current = true;
    loadChatsAbortRef.current?.abort();
    const controller = new AbortController();
    loadChatsAbortRef.current = controller;
    const showUpdating = Boolean(options.showUpdating);
    if (!options.silent) setLoadingChats(true);
    if (showUpdating) setIsUpdatingChats(true);

    try {
      const response = await listChatsForUser(user.username, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to load chats.");

      const list = (data.chats || []).flatMap((chat) => {
        const id = normalizeUuid(chat.id);
        if (!id) return []; // Reject legacy numeric IDs.
        return [
          {
            ...chat,
            id,
            last_message: normalizeMessageBody(chat.last_message),
            members: (chat.members || []).flatMap((member) => {
              const memberId = normalizeUuid(member.id);
              return memberId ? [{ ...member, id: memberId }] : [];
            }),
          },
        ];
      });
      const getTime = (chat) =>
        chat.last_time ? parseServerDate(chat.last_time).getTime() : 0;
      list.sort((first, second) => getTime(second) - getTime(first));

      const deduped = [];
      const dmByPeer = new Map();
      list.forEach((chat) => {
        if (chat.type !== "dm") {
          deduped.push(chat);
          return;
        }
        const peer = (chat.members || []).find(
          (member) =>
            String(member?.username || "").toLowerCase() !==
            String(user?.username || "").toLowerCase(),
        );
        const key = String(peer?.username || "").toLowerCase();
        if (!key) {
          deduped.push(chat);
          return;
        }
        const existing = dmByPeer.get(key);
        if (!existing || getTime(chat) > getTime(existing)) {
          dmByPeer.set(key, chat);
        }
      });
      const merged = [...deduped, ...dmByPeer.values()];
      merged.sort((first, second) => getTime(second) - getTime(first));

      const normalizeFetchedChats = (previousChats = []) => {
        const previousById = new Map(
          previousChats.map((entry) => [String(entry.id), entry]),
        );
        return merged.map((chat) => {
          const previous = previousById.get(String(chat.id));
          const isActive = Boolean(
            activeChatIdRef.current &&
            chat?.id &&
            String(activeChatIdRef.current).toLowerCase() ===
              String(chat.id).toLowerCase(),
          );
          const readable =
            canMarkReadInCurrentView &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible" &&
            document.hasFocus();
          const atBottom =
            isAtBottomRef.current &&
            !userScrolledUpRef.current &&
            unreadMarkerIdRef.current === null &&
            !openingChatRef.current;
          const clearUnread =
            isActive && !options.preserveActiveUnread && readable && atBottom;
          const resolveUnread = (serverCount) => {
            if (clearUnread) return 0;
            const server = Number(serverCount || 0);
            if (isActive && readable) {
              const local = Number(previous?.unread_count ?? server);
              if (openingChatRef.current || unreadMarkerIdRef.current !== null)
                return local;
              if (options.preserveActiveUnread) return Math.min(server, local);
            }
            return server;
          };
          const muted = Boolean(Number(chat?.muted || 0));
          const files = Array.isArray(chat?.last_message_files)
            ? chat.last_message_files
            : [];
          const processingVideo = files.some(
            (file) =>
              String(file?.mimeType || "")
                .toLowerCase()
                .startsWith("video/") &&
              file?.processing === true &&
              !String(file?.url || "").includes("-h264-"),
          );
          const identity = {
            username: chat?.last_sender_username,
            client_request_id: chat?.last_message_client_request_id,
          };
          const self = { username: user.username };
          const own = isMessageAuthoredByUser(identity, self);
          const other = isMessageFromOtherUser(identity, self);
          let updated = {
            ...chat,
            unread_count: resolveUnread(chat?.unread_count),
            _muted: muted,
          };
          if (processingVideo && own) {
            updated = {
              ...updated,
              _lastMessagePending: true,
              last_message_read_at: null,
            };
          } else if (processingVideo && other && previous) {
            updated = {
              ...updated,
              last_message_id: previous.last_message_id,
              last_message: previous.last_message,
              last_time: previous.last_time,
              last_sender_id: previous.last_sender_id,
              last_sender_username: previous.last_sender_username,
              last_sender_nickname: previous.last_sender_nickname,
              last_sender_avatar_url: previous.last_sender_avatar_url,
              last_message_read_at:
                previous.last_message_read_at ??
                chat.last_message_read_at ??
                null,
              last_message_files: previous.last_message_files || [],
            };
          }
          return {
            ...updated,
            last_message: normalizeMessageBody(updated.last_message),
          };
        });
      };

      const snapshot = normalizeFetchedChats(chats);
      setChats((previous) => normalizeFetchedChats(previous));
      void writeIdbCache(
        CACHE_STORES.chatList,
        buildChatListCacheKey(user.username),
        {
          version: CHAT_CACHE_VERSION,
          updatedAt: Date.now(),
          chats: snapshot,
        },
      );
      const currentId = activeChatIdRef.current || null;
      if (currentId && !snapshot.some((chat) => chat.id === currentId))
        closeChat();
      const pendingRaw =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem(OPEN_CHAT_ID_KEY)
          : null;
      const pendingChatId = normalizeUuid(pendingRaw) || pendingRaw;
      if (pendingChatId) {
        const pending = snapshot.find((chat) => chat.id === pendingChatId);
        if (pending) {
          setActiveChatId(pendingChatId);
          if (pending.type === "dm") {
            const peer = (pending.members || []).find(
              (member) =>
                String(member?.username || "").toLowerCase() !==
                String(user?.username || "").toLowerCase(),
            );
            setActivePeer(peer || null);
          } else {
            setActivePeer(null);
          }
          setMobileTab("chat");
          window.sessionStorage.removeItem(OPEN_CHAT_ID_KEY);
        }
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      // Keep stale list accessible while offline.
    } finally {
      if (loadChatsAbortRef.current === controller)
        loadChatsAbortRef.current = null;
      loadChatsInFlightRef.current = false;
      const queued = queuedLoadChatsOptionsRef.current;
      queuedLoadChatsOptionsRef.current = null;
      if (!options.silent) setLoadingChats(false);
      if (showUpdating) setIsUpdatingChats(false);
      if (queued) void loadChats(queued);
    }
  }

  // ─── Context menus and server events ──────────────────────────────────────
  const { contextMenu, closeContextMenu, openContextMenu } = useAppContextMenu({
    activeChatId,
    chats,
    currentUsername: user?.username,
    canCurrentUserEditGroup,
    canReplyToMessage: canSendInActiveChat,
    canEditMessage: canEditMessageFromContext,
    canDeleteMessageForEveryone,
    onReplyToMessage: handleStartReply,
    onEditMessage: handleStartEdit,
    onDeleteMessage: handleDeleteMessageRequest,
    onForwardMessage: handleOpenForwardModal,
    onSaveMessageFiles: handleSaveMessageFiles,
    onOpenOrCreateDm: openOrCreateDmFromMember,
    onOpenProfile: openMemberProfileFromList,
    onRemoveGroupMember: handleRemoveGroupMember,
    onMarkChatSeen: handleMarkChatSeen,
    onToggleChatMute: toggleMuteChat,
    onDeleteChats: requestDeleteChats,
    isOffline,
    sseConnected,
  });

  useChatEvents({
    username: user?.username,
    getSseStreamUrl,
    sseReconnectDelayMs: CHAT_PAGE_CONFIG.sseReconnectDelayMs,
    setSseConnected,
    loadChatsRef,
    scheduleMessageRefreshRef,
    activeChatIdRef,
    usernameRef,
    userScrolledUpRef,
    isAtBottomRef,
    pendingScrollToBottomRef,
    unreadMarkerIdRef,
    unreadAnchorLockUntilRef,
    pendingScrollToUnreadRef,
    setUnreadInChat,
    setMessages,
    setChats,
    sseReconnectRef,
    canMarkReadInCurrentView,
    markMessageRead,
    markMessagesRead,
    isMarkingReadRef,
    onIncomingMessage: (payload, meta = {}) => {
      const chatId = String(payload?.chatId || "");
      const sender = String(payload?.username || "")
        .trim()
        .toLowerCase();
      if (chatId && sender) {
        clearTypingExpiryTimer(chatId, sender);
        removeTypingUser(chatId, sender);
      }
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (
        pushSubscribeStatus === "ok" ||
        !notificationsEnabled ||
        notificationPermission !== "granted"
      )
        return;
      const rawBody = normalizeMessageBody(meta?.body ?? payload?.body).trim();
      if (/^\[\[(?:system|call):/i.test(rawBody)) return;
      const senderName = String(payload?.username || "").trim();
      const ownEvent =
        senderName.toLowerCase() ===
          String(user?.username || "").toLowerCase() &&
        !isRemoteChannelMessage(payload);
      if (ownEvent) return;
      if (document.visibilityState === "visible" && document.hasFocus()) return;
      const chat = chats.find((item) => String(item.id) === chatId);
      if (chat?._muted) return;

      let title = "New message";
      if (chat) {
        if (chat.type === "dm") {
          const peer = (chat.members || []).find(
            (member) =>
              String(member?.username || "").toLowerCase() !==
              String(user?.username || "").toLowerCase(),
          );
          title = peer?.nickname || peer?.username || "Deleted account";
        } else if (chat.type === "group") {
          const senderMember = senderName
            ? (chat.members || []).find(
                (member) =>
                  String(member?.username || "").toLowerCase() ===
                  senderName.toLowerCase(),
              )
            : null;
          const senderLabel = senderName
            ? senderMember?.nickname ||
              senderMember?.username ||
              String(payload?.nickname || "").trim() ||
              senderName
            : "";
          const groupName = chat.name || "Group";
          title = senderLabel ? `${groupName} (${senderLabel})` : groupName;
        } else {
          title = chat.name || "Chat";
        }
      } else if (senderName) {
        title = senderName;
      }
      const text = normalizeMessageBody(meta?.body ?? payload?.body).trim();
      const summary = String(payload?.summaryText || "").trim();
      const filesSummary = chat ? summarizeFiles(chat.last_message_files) : "";
      const generic =
        !text || /^Sent (a media file|a document|\d+ files)$/i.test(text);
      const base =
        summary && generic
          ? summary
          : filesSummary && generic
            ? filesSummary
            : text;
      const body = messagePreviewEnabled
        ? base
          ? truncateText(base, NOTIFICATION_PREVIEW_MAX_CHARS)
          : senderName
            ? `New message from ${senderName}.`
            : "New message"
        : "New message.";
      try {
        const notification = new Notification(title, {
          body,
          tag: chatId ? `chat-${chatId}` : undefined,
        });
        notification.onclick = () => window.focus();
      } catch {
        // Browser may block notifications after permission changes.
      }
    },
    onMessageDeleted: (payload) => {
      const id = String(payload?.chatId || "");
      const ids = Array.isArray(payload?.messageIds) ? payload.messageIds : [];
      pruneDeletedMessagesFromCache(id, ids);
    },
    onChatRead: (payload) => {
      const id = String(payload?.chatId || "");
      if (
        !id ||
        id !== String(activeChatIdRef.current || "") ||
        !isActiveChannelChat
      )
        return;
      getVisibleChannelMessageIds().forEach((messageId) =>
        channelSeenLoadedRef.current.delete(messageId),
      );
      enqueueChannelSeenCounts(true);
    },
    onPresenceUpdate: (payload) => applyPresenceUpdate(payload),
    onProfileUpdated: (payload) => applyProfileUpdate(payload),
    onTypingUpdate: (payload) => {
      const id = String(payload?.chatId || "");
      const sender = String(payload?.username || "").toLowerCase();
      if (
        !id ||
        !sender ||
        sender === String(user?.username || "").toLowerCase()
      )
        return;
      const chat = chats.find((item) => String(item?.id) === id);
      if (
        String(chat?.type || "").toLowerCase() === "channel" ||
        !payload?.isTyping
      ) {
        clearTypingExpiryTimer(id, sender);
        removeTypingUser(id, sender);
        return;
      }
      setTypingUser(
        id,
        sender,
        payload?.nickname || payload?.username || sender,
      );
      scheduleTypingExpiry(id, sender);
    },
    onChatListChanged: (payload) => {
      const id = String(payload?.chatId || "");
      if (!id) return;
      setTypingByChat((previous) => {
        if (!previous?.[id]) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      });
    },
    onSessionRevoked: () => {
      void handleLogout();
    },
    onCallSignal: handleCallSignal,
    realtimeSenderRef,
  });

  useResumeRefresh({
    isAppActive,
    user,
    loadChatsRef,
    scheduleMessageRefreshRef,
    activeChatIdRef,
  });

  // ─── Life cycle: lazy loading, permissions and app shell ───────────────────
  useEffect(() => {
    setMessages((previous) =>
      previous.map((message) => ({
        ...message,
        _dayLabel: formatDayLabel(message.created_at || message._createdAt),
        _timeLabel: formatTime(message.created_at || message._createdAt),
      })),
    );
  }, [appLocale]);

  useEffect(() => {
    setPermissionSetupOpen(
      permissionSetupPending({ id: user.id, username: user.username }),
    );
    const open = () => setPermissionSetupOpen(true);
    window.addEventListener(PERMISSION_SETUP_EVENT, open);
    return () => window.removeEventListener(PERMISSION_SETUP_EVENT, open);
  }, [user.id, user.username]);

  useEffect(() => {
    setReplyTarget(null);
    setEditTarget(null);
    setMessageDeleteScopeOpen(false);
    setPendingDeleteMessage(null);
    setForwardMessageTarget(null);
    setForwardSavedChat(null);
    setShowFloatingLabel(false);
  }, [activeChatId]);

  useEffect(() => {
    if (lazyChunksPreloadedRef.current) return;
    let cancelled = false;
    let idleId = null;
    let criticalTimer = null;
    let timer = null;
    const eager = resolveChunkPreloadMode() === "eager";
    const warmCritical = () => {
      if (!cancelled) void preloadChatPageCriticalChunks();
    };
    const warm = () => {
      if (cancelled || lazyChunksPreloadedRef.current) return;
      lazyChunksPreloadedRef.current = true;
      void preloadChatPageLazyChunks();
    };
    const firstIntent = () => warm();
    window.addEventListener("pointerdown", firstIntent, {
      once: true,
      passive: true,
      capture: true,
    });
    window.addEventListener("keydown", firstIntent, {
      once: true,
      passive: true,
      capture: true,
    });
    criticalTimer = window.setTimeout(warmCritical, eager ? 90 : 240);
    if (eager) timer = window.setTimeout(warm, 120);
    else if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(warm, { timeout: 1500 });
    } else timer = window.setTimeout(warm, 900);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", firstIntent, { capture: true });
      window.removeEventListener("keydown", firstIntent, { capture: true });
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timer !== null) window.clearTimeout(timer);
      if (criticalTimer !== null) window.clearTimeout(criticalTimer);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const topModal = Boolean(
      profileModalOpen || (settingsPanel && mobileTab !== "settings"),
    );
    root.style.setProperty(
      "--app-z",
      topModal ? "90" : isMobileViewport && activeChatId ? "40" : "20",
    );
    return () => root.style.setProperty("--app-z", "20");
  }, [
    activeChatId,
    isMobileViewport,
    mobileTab,
    profileModalOpen,
    settingsPanel,
  ]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    const onUpdate = (event) => {
      if (event?.data?.type !== "APP_SHELL_UPDATED") return;
      setIsUpdatingChats(true);
      if (updateToastTimerRef.current)
        window.clearTimeout(updateToastTimerRef.current);
      updateToastTimerRef.current = window.setTimeout(
        () => setIsUpdatingChats(false),
        2000,
      );
    };
    navigator.serviceWorker.addEventListener("message", onUpdate);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onUpdate);
      if (updateToastTimerRef.current)
        window.clearTimeout(updateToastTimerRef.current);
    };
  }, []);

  const showCopiedToast = useCallback(() => {
    setCopyToastVisible(true);
    if (copyToastTimerRef.current)
      window.clearTimeout(copyToastTimerRef.current);
    copyToastTimerRef.current = window.setTimeout(
      () => setCopyToastVisible(false),
      1400,
    );
  }, []);
  useEffect(() => {
    const onCopy = () => showCopiedToast();
    window.addEventListener(CLIPBOARD_COPY_EVENT, onCopy);
    return () => {
      window.removeEventListener(CLIPBOARD_COPY_EVENT, onCopy);
      if (copyToastTimerRef.current)
        window.clearTimeout(copyToastTimerRef.current);
    };
  }, [showCopiedToast]);

  useEffect(() => {
    if (!isMobileViewport) return;
    window.dispatchEvent(
      new Event(
        activeChatId
          ? "songbird-hide-install-bar"
          : "songbird-show-install-bar",
      ),
    );
  }, [activeChatId, isMobileViewport]);

  const requestMicrophonePermission = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    )
      return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream?.getTracks?.().forEach((track) => track.stop());
      setMicrophonePermission("granted");
      const key = `${PERMISSION_DISMISS_PREFIX}microphone`;
      window.localStorage.setItem(
        key,
        String(Date.now() + PERMISSION_DISMISS_MS),
      );
      setPermissionsDismissed((previous) => ({
        ...previous,
        microphone: true,
      }));
      setPermissionPromptDelayUntil(Date.now() + PERMISSION_PROMPT_DELAY_MS);
    } catch (error) {
      const message = String(error?.name || error?.message || "");
      if (message.toLowerCase().includes("notallowed"))
        setMicrophonePermission("denied");
    }
  }, []);
  const dismissPermissionsPrompt = useCallback((mode) => {
    if (typeof window === "undefined") return;
    const kind = mode || "notification";
    window.localStorage.setItem(
      `${PERMISSION_DISMISS_PREFIX}${kind}`,
      String(Date.now() + PERMISSION_DISMISS_MS),
    );
    setPermissionsDismissed((previous) => ({ ...previous, [kind]: true }));
    setPermissionPromptDelayUntil(Date.now() + PERMISSION_PROMPT_DELAY_MS);
  }, []);
  const requestNotificationsPermission = useCallback(async () => {
    if (notificationPermission === "default") await handleToggleNotifications();
  }, [handleToggleNotifications, notificationPermission]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    let active = true;
    let status = null;
    const onChange = () => {
      if (active && status) setMicrophonePermission(status.state || "prompt");
    };
    const refresh = async () => {
      const supported = Boolean(navigator.mediaDevices?.getUserMedia);
      if (!active) return;
      setMicrophonePermissionSupported(supported);
      if (!supported) {
        setMicrophonePermission("unsupported");
        return;
      }
      if (!navigator.permissions?.query) {
        setMicrophonePermission("unknown");
        return;
      }
      try {
        status = await navigator.permissions.query({ name: "microphone" });
        if (!active) return;
        setMicrophonePermission(status.state || "prompt");
        status.addEventListener?.("change", onChange);
      } catch {
        setMicrophonePermission("unknown");
      }
    };
    void refresh();
    return () => {
      active = false;
      status?.removeEventListener?.("change", onChange);
    };
  }, [isAppActive]);

  const shouldPromptNotifications =
    notificationsSupported &&
    notificationPermission === "default" &&
    !permissionsDismissed.notification;
  const shouldPromptMicrophone =
    microphonePermissionSupported &&
    microphonePermission === "prompt" &&
    !permissionsDismissed.microphone;
  const activePermissionPrompt = shouldPromptNotifications
    ? "notification"
    : shouldPromptMicrophone
      ? "microphone"
      : null;
  const showPermissionsPrompt = Boolean(
    activePermissionPrompt && !(permissionPromptDelayUntil > Date.now()),
  );
  const permissionsPrompt = {
    show: showPermissionsPrompt,
    mode: activePermissionPrompt,
    notification: {
      show: shouldPromptNotifications,
      status: notificationPermission,
      onRequest: requestNotificationsPermission,
    },
    microphone: {
      show: shouldPromptMicrophone,
      status: microphonePermission,
      onRequest: requestMicrophonePermission,
    },
    onDismiss: (mode) =>
      dismissPermissionsPrompt(mode || activePermissionPrompt),
  };

  useEffect(() => {
    if (!permissionPromptDelayUntil) return;
    const remaining = permissionPromptDelayUntil - Date.now();
    if (remaining <= 0) {
      setPermissionPromptDelayUntil(0);
      return;
    }
    const timer = window.setTimeout(
      () => setPermissionPromptDelayUntil(0),
      remaining,
    );
    return () => window.clearTimeout(timer);
  }, [permissionPromptDelayUntil]);
  useEffect(() => {
    setPermissionsDismissed({
      notification: readPermissionDismissed("notification"),
      microphone: readPermissionDismissed("microphone"),
    });
  }, [isAppActive, notificationPermission, microphonePermission]);

  // ─── Cache hydration and resource cleanup ─────────────────────────────────
  useEffect(() => {
    pendingUploadFilesRef.current = pendingUploadFiles;
  }, [pendingUploadFiles]);
  useEffect(() => {
    pendingVoiceMessageRef.current = pendingVoiceMessage;
  }, [pendingVoiceMessage]);
  useEffect(() => {
    pendingGroupAvatarFileRef.current = pendingGroupAvatarFile;
  }, [pendingGroupAvatarFile]);
  useEffect(() => {
    usernameRef.current = String(user?.username || "");
  }, [user?.username]);
  useEffect(() => {
    const nextUrls = new Set();
    const append = (value) => {
      const url = String(value || "");
      if (url.startsWith("blob:")) nextUrls.add(url);
    };
    messages.forEach((message) => {
      (Array.isArray(message?._files) ? message._files : []).forEach((file) => {
        append(file?._localUrl);
        append(file?.url);
      });
      (Array.isArray(message?.files) ? message.files : []).forEach((file) => {
        append(file?._localUrl);
        append(file?.url);
      });
    });
    messageBlobUrlsRef.current.forEach((url) => {
      if (nextUrls.has(url)) return;
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* Object URL no longer exists. */
      }
    });
    messageBlobUrlsRef.current = nextUrls;
  }, [messages]);

  useEffect(() => {
    return () => {
      pendingUploadFilesRef.current.forEach((file) => {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      });
      if (pendingVoiceMessageRef.current?.previewUrl) {
        URL.revokeObjectURL(pendingVoiceMessageRef.current.previewUrl);
      }
      if (pendingGroupAvatarFileRef.current?.previewUrl) {
        URL.revokeObjectURL(pendingGroupAvatarFileRef.current.previewUrl);
      }
      messageBlobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* Already revoked. */
        }
      });
      messageBlobUrlsRef.current.clear();
      clearUnreadAlignTimers();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setPendingAvatarFile(null);
    setProfileForm({
      nickname: user.nickname || "",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
    });
    setAvatarPreview(user.avatarUrl || "");
    setStatusSelection(user.status || "online");
  }, [user]);

  useEffect(() => {
    if (!user?.username || !canUseIdb()) return;
    let active = true;
    void (async () => {
      const cached = await readChatListCacheAsync(user.username);
      if (!active || !Array.isArray(cached?.chats) || !cached.chats.length)
        return;
      const normalized = cached.chats.map((chat) => ({
        ...chat,
        last_message: normalizeMessageBody(chat.last_message),
      }));
      setChats((previous) => (previous.length ? previous : normalized));
      setLoadingChats(false);
      const raw =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem(OPEN_CHAT_ID_KEY)
          : null;
      const pendingId = normalizeUuid(raw) || raw;
      if (!pendingId || activeChatIdRef.current) return;
      const pending = normalized.find((chat) => chat.id === pendingId);
      if (!pending) return;
      setActiveChatId(pendingId);
      if (pending.type === "dm") {
        const peer = (pending.members || []).find(
          (member) =>
            String(member?.username || "").toLowerCase() !==
            String(user?.username || "").toLowerCase(),
        );
        setActivePeer(peer || null);
      } else {
        setActivePeer(null);
      }
      setMobileTab("chat");
    })();
    return () => {
      active = false;
    };
  }, [user?.username]);

  useEffect(() => {
    if (user?.username) void migrateLocalCacheToIdb(user.username);
  }, [user?.username]);
  useEffect(() => {
    if (user?.username) {
      pruneMessagesCacheMemory(
        messagesCacheRef.current,
        activeChatIdRef.current,
      );
    }
  }, [user?.username]);
  useEffect(() => {
    pruneMessagesCacheMemory(messagesCacheRef.current, activeChatId);
  }, [activeChatId, chats.length]);
  useEffect(() => {
    if (!user?.username || !canUseIdb()) return;
    let active = true;
    const pruneIndex = (items) => {
      if (!items.length) return;
      const now = Date.now();
      const valid = items.filter((entry) => {
        const chatId = String(entry?.chatId || "");
        const updatedAt = Number(entry?.updatedAt);
        if (!chatId || !Number.isFinite(updatedAt)) return false;
        if (now - updatedAt > CHAT_PAGE_CONFIG.cacheTtlMs) {
          void deleteIdbCache(
            CACHE_STORES.messages,
            buildMessagesCacheKey(user.username, chatId),
          );
          return false;
        }
        return true;
      });
      const trimmed = pruneMessagesIndex(user.username, valid);
      if (trimmed.length !== items.length)
        writeMessagesIndex(user.username, trimmed);
    };
    void (async () => {
      const index = await readMessagesIndexAsync(user.username);
      if (active && index.length) pruneIndex(index);
    })();
    return () => {
      active = false;
    };
  }, [user?.username]);

  useEffect(() => {
    if (user?.username) void loadChats({ showUpdating: true });
  }, [user?.username]);
  useEffect(() => {
    return () => {
      messagesCacheRef.current.clear();
      if (mediaLoadSnapTimerRef.current)
        window.clearTimeout(mediaLoadSnapTimerRef.current);
      if (messageRefreshTimerRef.current)
        window.clearTimeout(messageRefreshTimerRef.current);
      if (channelSeenTimerRef.current)
        window.clearTimeout(channelSeenTimerRef.current);
      loadChatsAbortRef.current?.abort();
      loadChatsAbortRef.current = null;
      loadChatsInFlightRef.current = false;
      queuedLoadChatsOptionsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (loadingChats && !chats.length) return;
    const unread = chats.reduce(
      (sum, chat) => sum + (chat?._muted ? 0 : Number(chat?.unread_count || 0)),
      0,
    );
    document.title =
      unread > 0
        ? `${localize("Ouj Chat")} | ${localize("{count} unread messages", { count: unread })}`
        : localize("Ouj Chat");
    navigator.serviceWorker?.controller?.postMessage({
      type: "OUJ_BADGE",
      count: unread,
      accountId: user.id,
    });
    if (navigator?.setAppBadge) {
      if (unread > 0) navigator.setAppBadge(unread).catch(() => null);
      else navigator.clearAppBadge?.().catch(() => null);
    }
  }, [chats, loadingChats, appLocale, notificationsActive, user.id]);

  useEffect(() => {
    if (!user || sseConnected || !isAppActive) return;
    const delay = Math.max(
      3000,
      Math.round(
        CHAT_PAGE_CONFIG.chatsRefreshIntervalMs * getNetworkBackoffMultiplier(),
      ),
    );
    const timer = window.setInterval(
      () => void loadChats({ silent: true }),
      delay,
    );
    return () => window.clearInterval(timer);
  }, [user, sseConnected, isAppActive]);

  // Show memory cache immediately; reconcile with IDB and server afterward.
  useEffect(() => {
    if (!user || !activeChatId) return;
    const openedId = activeChatId;
    const openedChat = chats.find((chat) => chat.id === openedId);
    const cached =
      readMessagesCacheMemory(messagesCacheRef.current, openedId) || null;
    const hasCache =
      Array.isArray(cached?.messages) && cached.messages.length > 0;
    seenMessageIdsRef.current.clear();
    openingHadUnreadRef.current = Boolean((openedChat?.unread_count || 0) > 0);
    openingUnreadCountRef.current = Number(openedChat?.unread_count || 0);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setLoadingMessages(!hasCache);
    setMessages(hasCache ? normalizeMessagesForRender(cached.messages) : []);
    setHasOlderMessages(Boolean(cached?.hasOlderMessages));
    setLoadingOlderMessages(false);
    lastMessageIdRef.current = cached?.lastMessageId || null;
    setUnreadInChat(0);
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
    setUnreadMarkerId(null);
    unreadMarkerIdRef.current = null;
    pendingScrollToUnreadRef.current = null;
    allowStartReachedRef.current = false;
    unreadAnchorLockUntilRef.current = 0;
    shouldAutoMarkReadRef.current = true;
    openingChatRef.current = true;
    pendingScrollToBottomRef.current = false;
    suppressScrolledUpRef.current = true;

    const initialLimit = CHAT_PAGE_CONFIG.messageFetchLimit;
    const canMarkNow = !isMobileViewport || mobileTab === "chat";
    const focused =
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus();
    if (user?.username && canUseIdb()) {
      void (async () => {
        const fromIdb = await readMessagesCacheAsync(user.username, openedId);
        if (
          !Array.isArray(fromIdb?.messages) ||
          activeChatIdRef.current !== openedId
        )
          return;
        writeMessagesCacheMemory(
          messagesCacheRef.current,
          openedId,
          fromIdb,
          activeChatIdRef.current,
        );
        setMessages((previous) =>
          previous.length
            ? previous
            : normalizeMessagesForRender(fromIdb.messages),
        );
        setHasOlderMessages(Boolean(fromIdb?.hasOlderMessages));
        lastMessageIdRef.current =
          normalizeUuid(fromIdb?.lastMessageId) || lastMessageIdRef.current;
        setLoadingMessages(false);
      })();
    }
    void (async () => {
      const silently = hasCache && sseConnected;
      const fetchInitial =
        !silently &&
        (openingUnreadCountRef.current > 0 ||
          !cached ||
          !sseConnected ||
          !hasCache);
      if (fetchInitial) {
        await loadMessages(openedId, {
          initialLoad: true,
          limit: initialLimit,
        });
      } else {
        if (!openingUnreadCountRef.current) {
          pendingScrollToBottomRef.current = true;
          scrollChatToBottom("auto");
        }
        void loadMessages(openedId, {
          initialLoad: true,
          silent: true,
          preserveHistory: true,
          limit: initialLimit,
        });
      }
      if (
        canMarkNow &&
        focused &&
        isAtBottomRef.current &&
        !userScrolledUpRef.current &&
        unreadMarkerIdRef.current === null &&
        openingUnreadCountRef.current === 0
      ) {
        await markMessagesRead({
          chatId: openedId,
          username: user.username,
        }).catch(() => null);
      }
      if (!sseConnected) await loadChats({ silent: true });
    })();
  }, [user?.username, activeChatId]);

  useEffect(() => {
    if (!activeChatId) setUnreadInChat(0);
  }, [activeChatId]);
  useEffect(() => {
    clearPendingUploads({ scroll: false });
    clearPendingVoiceMessage();
    if (activeUploadProgressHideTimerRef.current) {
      window.clearTimeout(activeUploadProgressHideTimerRef.current);
      activeUploadProgressHideTimerRef.current = null;
    }
    setActiveUploadProgress(null);
    setReplyTarget(null);
  }, [activeChatId]);
  useEffect(() => {
    return () => {
      if (activeUploadProgressHideTimerRef.current) {
        window.clearTimeout(activeUploadProgressHideTimerRef.current);
        activeUploadProgressHideTimerRef.current = null;
      }
      const typing = typingStateRef.current;
      if (typing.isTyping && typing.chatId)
        sendTypingSignal(typing.chatId, false);
      clearLocalTypingStopTimer();
      typingExpiryTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      typingExpiryTimersRef.current.clear();
    };
  }, [clearLocalTypingStopTimer, sendTypingSignal]);
  useEffect(() => {
    if (String(user?.status || "").toLowerCase() !== "online") {
      stopTypingIndicator(activeChatIdRef.current);
    }
  }, [stopTypingIndicator, user?.status]);
  useEffect(() => {
    const state = typingStateRef.current;
    if (
      !state.isTyping ||
      !state.chatId ||
      state.chatId === (activeChatId || null)
    )
      return;
    sendTypingSignal(state.chatId, false);
    clearLocalTypingStopTimer();
    typingStateRef.current = {
      chatId: state.chatId,
      isTyping: false,
      lastSentAt: Date.now(),
    };
  }, [activeChatId, clearLocalTypingStopTimer, sendTypingSignal]);
  useEffect(() => {
    if (
      activeChatId &&
      prevUploadProgressRef.current !== null &&
      activeUploadProgress === null
    )
      scrollToBottomIfSafe("auto");
    prevUploadProgressRef.current = activeUploadProgress;
  }, [activeUploadProgress, activeChatId]);
  useEffect(() => {
    if (!canSendInActiveChat) stopTypingIndicator(activeChatIdRef.current);
  }, [canSendInActiveChat, stopTypingIndicator]);
  useEffect(() => {
    if (!userScrolledUp) return;
    setUnreadInChat((previous) =>
      previous > 0 ? previous : Number(activeChat?.unread_count || 0),
    );
  }, [userScrolledUp, activeChat?.unread_count]);
  useEffect(() => {
    if (mobileTab !== "calls") {
      setCallsEditMode(false);
      setSelectedCalls([]);
      return;
    }
    if (callState === "idle") void loadCalls();
  }, [mobileTab, callState, loadCalls]);

  // ─── Channel visibility ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isActiveChannelChat) {
      channelSeenQueueRef.current = [];
      channelSeenLoadedRef.current = new Set();
      setChannelSeenCounts({});
      return;
    }
    channelSeenQueueRef.current = [];
    channelSeenLoadedRef.current = new Set();
    if (canUseIdb()) {
      let active = true;
      void (async () => {
        const counts = await readChannelSeenCacheAsync(
          user?.username,
          activeChatId,
        );
        if (active) setChannelSeenCounts(counts);
      })();
      requestAnimationFrame(() => enqueueChannelSeenCounts());
      return () => {
        active = false;
      };
    }
    requestAnimationFrame(() => enqueueChannelSeenCounts());
  }, [isActiveChannelChat, activeChatId, enqueueChannelSeenCounts]);
  useEffect(() => {
    if (!isActiveChannelChat || loadingMessages) return;
    requestAnimationFrame(() => enqueueChannelSeenCounts());
  }, [
    messages,
    loadingMessages,
    isActiveChannelChat,
    enqueueChannelSeenCounts,
  ]);
  useEffect(() => {
    if (!isActiveChannelChat) return;
    const timer = window.setInterval(
      () => enqueueChannelSeenCounts(true),
      4500,
    );
    return () => window.clearInterval(timer);
  }, [isActiveChannelChat, enqueueChannelSeenCounts]);
  useEffect(() => {
    if (isActiveChannelChat && activeChatId && canUseIdb()) {
      void writeChannelSeenCacheAsync(
        user?.username,
        activeChatId,
        channelSeenCounts,
      );
    }
  }, [channelSeenCounts, isActiveChannelChat, activeChatId, user?.username]);

  // ─── Forwarded origin lookup ──────────────────────────────────────────────
  useEffect(() => {
    if (!forwardedChatIds.length) return;
    const timer = window.setInterval(
      () => setForwardedChatPreviewTick(Date.now()),
      2 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [forwardedChatIds.length]);

  useEffect(() => {
    forwardedUserRefs.forEach(({ userId, username }) => {
      const key = userId ? `id:${userId}` : `username:${username}`;
      const cached = forwardedUserPreviewByKey[key];
      if (
        cached?.status === "ready" ||
        cached?.status === "missing" ||
        !username ||
        forwardedUserPreviewInFlightRef.current.has(key)
      )
        return;
      forwardedUserPreviewInFlightRef.current.add(key);
      void (async () => {
        try {
          const response = await getProfileByUsername(username);
          const data = await response.json().catch(() => ({}));
          const resolvedId = normalizeUuid(data?.id) || null;
          if (
            response.ok &&
            (!userId || resolvedId === normalizeUuid(userId))
          ) {
            setForwardedUserPreviewByKey((previous) => ({
              ...previous,
              [key]: {
                status: "ready",
                profile: {
                  id: resolvedId,
                  username: data?.username || username,
                  nickname: data?.nickname || data?.username || username,
                  avatar_url: data?.avatarUrl || "",
                  color: data?.color || DEFAULT_AVATAR_COLOR,
                  status: data?.status || "online",
                  verified: Boolean(data?.verified),
                  role: data?.role || "user",
                },
              },
            }));
          } else if (
            response.status === 404 ||
            (response.ok && userId && resolvedId !== normalizeUuid(userId))
          ) {
            setForwardedUserPreviewByKey((previous) => ({
              ...previous,
              [key]: { status: "missing" },
            }));
          }
        } catch {
          // Try again when the origin is requested later.
        } finally {
          forwardedUserPreviewInFlightRef.current.delete(key);
        }
      })();
    });
  }, [forwardedUserPreviewByKey, forwardedUserRefs]);

  useEffect(() => {
    const liveIds = new Set(Object.keys(forwardedChatsById).map(String));
    const now = Date.now();
    forwardedChatIds.forEach((chatId) => {
      if (liveIds.has(chatId)) return;
      const cached = forwardedChatPreviewById[chatId];
      const fresh =
        cached?.status === "ready" &&
        now - Number(cached?.fetchedAt || 0) < 2 * 60 * 1000;
      if (
        cached?.status === "missing" ||
        fresh ||
        forwardedChatPreviewInFlightRef.current.has(chatId)
      )
        return;
      forwardedChatPreviewInFlightRef.current.add(chatId);
      void (async () => {
        try {
          const response = await getChatPreview({
            chatId,
            username: user.username,
            allowMissing: true,
          });
          const data = await response.json().catch(() => ({}));
          if (data?.missing) {
            setForwardedChatPreviewById((previous) => ({
              ...previous,
              [chatId]: { status: "missing" },
            }));
            return;
          }
          if (response.ok) {
            const chat = {
              id: data?.id || chatId,
              type: data?.type || "group",
              name: data?.name || "Chat",
              group_username: data?.username || "",
              group_visibility: data?.visibility || "public",
              group_color: data?.color || DEFAULT_AVATAR_COLOR,
              group_avatar_url: data?.avatarUrl || "",
              invite_token: data?.inviteToken || "",
              membersCount: Number(data?.membersCount || 0),
              members: [],
              _previewOnly: true,
              _isMember: Boolean(data?.isMember),
            };
            setForwardedChatPreviewById((previous) => ({
              ...previous,
              [chatId]: { status: "ready", chat, fetchedAt: Date.now() },
            }));
          } else if (response.status === 404) {
            setForwardedChatPreviewById((previous) => ({
              ...previous,
              [chatId]: { status: "missing" },
            }));
          }
        } catch {
          // Live preview will be retried later.
        } finally {
          forwardedChatPreviewInFlightRef.current.delete(chatId);
        }
      })();
    });
  }, [
    forwardedChatIds,
    forwardedChatPreviewById,
    forwardedChatPreviewTick,
    forwardedChatsById,
    user.username,
  ]);

  // ─── Profile presence and mention previews ────────────────────────────────
  useEffect(() => {
    if (!activeHeaderPeer?.username) return;
    let mounted = true;
    setPeerPresence({
      status: "offline",
      rawStatus: "offline",
      lastSeen: null,
    });
    const refresh = async () => {
      try {
        const response = await fetchPresence(activeHeaderPeer.username);
        const data = await response.json();
        if (!response.ok)
          throw new Error(data?.error || "Unable to fetch presence.");
        if (!mounted) return;
        const username = String(
          data?.username || activeHeaderPeer.username || "",
        ).toLowerCase();
        const lastSeen =
          String(data?.lastSeen || "").trim() || new Date().toISOString();
        const rawStatus = String(
          data?.rawStatus || data?.status || "online",
        ).toLowerCase();
        presenceStateRef.current.set(username, {
          status: normalizeStatus(data?.status),
          rawStatus,
          lastSeen,
        });
        setPeerPresence({
          status: normalizeStatus(data?.status),
          rawStatus,
          lastSeen,
        });
      } catch {
        if (mounted)
          setPeerPresence({
            status: "offline",
            rawStatus: "offline",
            lastSeen: null,
          });
      }
    };
    void refresh();
    return () => {
      mounted = false;
    };
  }, [activeHeaderPeer?.username]);

  useEffect(() => {
    if (
      !profileModalOpen ||
      profileModalMember ||
      !["group", "channel"].includes(activeChat?.type)
    )
      return;
    const usernames = activeGroupMemberUsernames;
    if (!usernames.length) return;
    let cancelled = false;
    setChats((previous) =>
      previous.map((chat) => {
        if (String(chat?.id || "") !== String(activeChat?.id || ""))
          return chat;
        return {
          ...chat,
          members: (chat.members || []).map((member) => {
            const username = String(member?.username || "").toLowerCase();
            const snapshot = presenceStateRef.current.get(username);
            return {
              ...member,
              status: snapshot ? normalizeStatus(snapshot.status) : "offline",
            };
          }),
        };
      }),
    );
    void Promise.all(
      usernames.map(async (username) => {
        try {
          const response = await fetchPresence(username);
          const data = await response.json();
          if (response.ok && !cancelled) {
            applyPresenceUpdate({
              type: "presence_update",
              username: data?.username || username,
              status: data?.status || "offline",
              lastSeen: data?.lastSeen || null,
            });
          }
        } catch {
          // One member's presence failure must not block the others.
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [
    profileModalOpen,
    profileModalMember,
    activeChat?.id,
    activeChat?.type,
    activeGroupMemberUsernamesKey,
  ]);

  useEffect(() => {
    if (!profileModalOpen || !mentionProfile || mentionProfile.kind === "user")
      return;
    const id = String(mentionProfile.chatId || "");
    if (!id) return;
    if (liveMentionProfileChat) {
      setMentionProfile((previous) => {
        if (
          !previous ||
          previous.kind === "user" ||
          String(previous.chatId || "") !== id
        )
          return previous;
        const kind = String(
          liveMentionProfileChat.type || previous.kind || "group",
        ).toLowerCase();
        const name =
          liveMentionProfileChat.name ||
          previous.name ||
          previous.username ||
          "Chat";
        const username =
          liveMentionProfileChat.group_username || previous.username || "";
        const visibility =
          liveMentionProfileChat.group_visibility ||
          previous.visibility ||
          "public";
        const color =
          liveMentionProfileChat.group_color ||
          previous.color ||
          DEFAULT_AVATAR_COLOR;
        const avatarUrl =
          liveMentionProfileChat.group_avatar_url ?? previous.avatarUrl ?? null;
        const token =
          liveMentionProfileChat.inviteToken ||
          liveMentionProfileChat.invite_token ||
          previous.inviteToken ||
          "";
        const count = Array.isArray(liveMentionProfileChat.members)
          ? liveMentionProfileChat.members.length
          : Number(
              liveMentionProfileChat.membersCount || previous.membersCount || 0,
            );
        if (
          previous.kind === kind &&
          previous.name === name &&
          previous.username === username &&
          previous.visibility === visibility &&
          previous.color === color &&
          (previous.avatarUrl ?? null) === avatarUrl &&
          (previous.inviteToken || "") === token &&
          Number(previous.membersCount || 0) === count &&
          previous.isMember === true &&
          previous._actionState === "member"
        ) {
          return previous;
        }
        return {
          ...previous,
          kind,
          name,
          username,
          visibility,
          color,
          avatarUrl,
          inviteToken: token,
          membersCount: count,
          isMember: true,
          _actionState: "member",
        };
      });
      return;
    }
    let active = true;
    void (async () => {
      try {
        const response = await getChatPreview({
          chatId: id,
          username: user.username,
          allowMissing: true,
        });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (data?.missing || response.status === 404) {
          setMentionProfile((previous) => {
            if (
              !previous ||
              previous.kind === "user" ||
              String(previous.chatId || "") !== id
            )
              return previous;
            const action =
              String(previous.visibility || "private").toLowerCase() ===
              "public"
                ? "join"
                : "none";
            if (previous.isMember === false && previous._actionState === action)
              return previous;
            return { ...previous, isMember: false, _actionState: action };
          });
          return;
        }
        if (!response.ok) return;
        setMentionProfile((previous) => {
          if (
            !previous ||
            previous.kind === "user" ||
            String(previous.chatId || "") !== id
          )
            return previous;
          const visibility = String(
            data?.visibility || previous.visibility || "public",
          ).toLowerCase();
          const isMember = Boolean(data?.isMember);
          const kind = String(
            data?.type || previous.kind || "group",
          ).toLowerCase();
          const name =
            data?.name || previous.name || previous.username || "Chat";
          const username = data?.username || previous.username || "";
          const color = data?.color || previous.color || DEFAULT_AVATAR_COLOR;
          const avatarUrl = data?.avatarUrl ?? previous.avatarUrl ?? null;
          const token = data?.inviteToken || previous.inviteToken || "";
          const count = Number(
            data?.membersCount || previous.membersCount || 0,
          );
          const action = isMember
            ? "member"
            : visibility === "public"
              ? "join"
              : "none";
          if (
            previous.kind === kind &&
            previous.name === name &&
            previous.username === username &&
            previous.visibility === visibility &&
            previous.color === color &&
            (previous.avatarUrl ?? null) === avatarUrl &&
            (previous.inviteToken || "") === token &&
            Number(previous.membersCount || 0) === count &&
            previous.isMember === isMember &&
            previous._actionState === action
          )
            return previous;
          return {
            ...previous,
            kind,
            name,
            username,
            visibility,
            color,
            avatarUrl,
            inviteToken: token,
            membersCount: count,
            isMember,
            _actionState: action,
          };
        });
      } catch {
        // Profile remains usable from the last known snapshot.
      }
    })();
    return () => {
      active = false;
    };
  }, [
    chats,
    liveMentionProfileChat,
    mentionProfile?.chatId,
    mentionProfile?.kind,
    mentionProfile?.visibility,
    profileModalOpen,
    user.username,
  ]);

  // ─── Scroll-to-unread and read reconciliation ─────────────────────────────
  useEffect(() => {
    if (!activeChatId) return;
    pendingScrollToUnreadRef.current = null;
    clearUnreadAlignTimers();
  }, [activeChatId]);

  useLayoutEffect(() => {
    if (!activeChatId) return;
    const pending = pendingScrollToUnreadRef.current;
    if (
      pending === null ||
      pending === undefined ||
      loadingMessages ||
      !messages.length
    )
      return;
    requestAnimationFrame(() => {
      const unreadId = String(pending).trim();
      const scroller = chatScrollRef.current;
      pendingScrollToUnreadRef.current = null;
      pendingScrollToBottomRef.current = false;
      isAtBottomRef.current = false;
      setIsAtBottom(false);
      userScrolledUpRef.current = true;
      setUserScrolledUp(true);
      unreadAnchorLockUntilRef.current = Date.now() + 4000;
      shouldAutoMarkReadRef.current = true;
      if (!scroller) return;
      scheduleUnreadAnchorAlignment(unreadId);
      window.setTimeout(() => {
        if (
          unreadMarkerIdRef.current !== null ||
          Date.now() < Number(unreadAnchorLockUntilRef.current || 0)
        )
          return;
        const distance =
          scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (distance <= 120) {
          isAtBottomRef.current = true;
          setIsAtBottom(true);
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
          unreadAnchorLockUntilRef.current = 0;
        }
      }, 90);
    });
  }, [activeChatId, messages, loadingMessages]);

  useLayoutEffect(() => {
    if (
      !activeChatId ||
      !pendingScrollToUnreadRef.current ||
      !unreadMarkerIdRef.current ||
      loadingMessages ||
      !messages.length
    )
      return;
    const unreadId = String(unreadMarkerIdRef.current || "").trim();
    if (!unreadId) return;
    requestAnimationFrame(() => {
      pendingScrollToBottomRef.current = false;
      isAtBottomRef.current = false;
      setIsAtBottom(false);
      userScrolledUpRef.current = true;
      setUserScrolledUp(true);
      unreadAnchorLockUntilRef.current = Date.now() + 5000;
      scheduleUnreadAnchorAlignment(unreadId);
    });
  }, [activeChatId, unreadMarkerId, messages.length, loadingMessages]);

  useLayoutEffect(() => {
    if (!activeChatId || !pendingScrollToBottomRef.current) return;
    if (pendingScrollToUnreadRef.current !== null) {
      pendingScrollToBottomRef.current = false;
      return;
    }
    if (unreadMarkerIdRef.current !== null) {
      if (isAtBottomRef.current && !userScrolledUpRef.current) {
        setUnreadMarkerId(null);
        unreadMarkerIdRef.current = null;
        unreadAnchorLockUntilRef.current = 0;
        clearUnreadAlignTimers();
      } else {
        pendingScrollToBottomRef.current = false;
        return;
      }
    }
    if (Date.now() < Number(unreadAnchorLockUntilRef.current || 0)) {
      pendingScrollToBottomRef.current = false;
      return;
    }
    if (loadingMessages && !messages.length) return;
    requestAnimationFrame(() => {
      scrollChatToBottom("auto");
      requestAnimationFrame(() => scrollChatToBottom("auto"));
      window.setTimeout(() => scrollChatToBottom("auto"), 120);
      pendingScrollToBottomRef.current = false;
    });
  }, [activeChatId, messages, loadingMessages]);

  useEffect(() => {
    if (!activeChatId) return;
    return () => {
      if (!activeChatId || !user || !canMarkReadInCurrentView) return;
      shouldAutoMarkReadRef.current = true;
      setUnreadMarkerId(null);
      unreadMarkerIdRef.current = null;
      pendingScrollToUnreadRef.current = null;
    };
  }, [activeChatId, user, canMarkReadInCurrentView]);

  useEffect(() => {
    if (!isAppActive) return;
    const id = activeChatIdRef.current;
    if (
      !id ||
      !user?.username ||
      isMarkingReadRef.current ||
      !canMarkReadInCurrentView ||
      !isAtBottomRef.current ||
      userScrolledUpRef.current
    )
      return;
    const hasUnread = messagesRef.current.some(
      (message) =>
        isMessageFromOtherUser(message, { username: user?.username }) &&
        !message._readByMe,
    );
    if (!hasUnread) return;
    setChats((previous) =>
      previous.map((chat) =>
        chat?.id && String(chat.id).toLowerCase() === String(id).toLowerCase()
          ? { ...chat, unread_count: 0 }
          : chat,
      ),
    );
    isMarkingReadRef.current = true;
    markMessagesRead({ chatId: id, username: user.username })
      .catch(() => null)
      .finally(() => {
        isMarkingReadRef.current = false;
      });
  }, [isAppActive, user?.username, canMarkReadInCurrentView]);

  // ─── Offline outbox retries and reconciliations ───────────────────────────
  useEffect(() => {
    outboxSendRef.current = sendPendingMessage;
  });
  useEffect(() => {
    let running = false;
    let stopped = false;
    const flush = async () => {
      if (running || stopped || !isAppActive || navigator.onLine === false)
        return;
      running = true;
      try {
        const accountKey = user.id || user.username;
        const queued = await readOutboxMessages(accountKey, null, {
          hydrate: false,
        });
        for (const entry of queued) {
          if (stopped) break;
          if (
            entry._delivery !== "sending" ||
            String(entry._chatId || "") ===
              String(activeChatIdRef.current || "")
          )
            continue;

          let message = entry;
          let hydrated = false;
          const fileItems = Array.isArray(entry._files) ? entry._files : [];
          if (
            fileItems.length &&
            fileItems.some((file) => !(file?.file instanceof Blob))
          ) {
            // Never submit a file message from a metadata-only outbox row.
            const fullQueue = await readOutboxMessages(
              accountKey,
              entry._chatId,
            );
            message = fullQueue.find(
              (item) => item._clientId === entry._clientId,
            );
            hydrated = true;
            const completeFiles = Array.isArray(message?._files)
              ? message._files
              : [];
            if (
              !message ||
              completeFiles.length !== fileItems.length ||
              completeFiles.some((file) => !(file?.file instanceof Blob))
            )
              continue;
          }
          try {
            await outboxSendRef.current?.(message);
          } finally {
            // Other-chat previews are not mounted; free temporary hydrated URLs.
            if (hydrated)
              (message?._files || []).forEach((file) => {
                if (file._localUrl?.startsWith("blob:"))
                  URL.revokeObjectURL(file._localUrl);
              });
          }
        }
      } catch {
        // Local cache may temporarily be unavailable; retry on the next flush.
      } finally {
        running = false;
      }
    };
    void flush();
    const timer = window.setInterval(() => void flush(), 4000);
    window.addEventListener("online", flush);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [user.username, isAppActive, activeChatId]);

  useEffect(() => {
    if (!user?.username || !activeChatId) return;
    let cancelled = false;
    setReplyTarget(
      readChatDraft(user.id || user.username, activeChatId)?.replyTo || null,
    );
    void readOutboxMessages(user.id || user.username, activeChatId).then(
      (queued) => {
        if (
          cancelled ||
          String(activeChatIdRef.current) !== String(activeChatId)
        ) {
          queued.forEach((message) =>
            (message.files || []).forEach((file) => {
              if (file._localUrl) URL.revokeObjectURL(file._localUrl);
            }),
          );
          return;
        }
        setMessages((previous) => {
          const known = new Set(
            previous.map((message) =>
              String(message.client_request_id || message._clientId || ""),
            ),
          );
          return [
            ...previous,
            ...queued.filter((message) => !known.has(message._clientId)),
          ];
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeChatId, user?.username]);

  useEffect(() => {
    if (!activeChatId) return;
    messages
      .filter((message) => message._delivery === "sending")
      .forEach((message) => void sendPendingMessage(message));
  }, [activeChatId, messages]);
  useEffect(() => {
    if (
      !activeChatId ||
      !messages.some(
        (message) =>
          message._delivery === "sending" &&
          !message._awaitingServerEcho &&
          !message?._serverId,
      )
    )
      return;
    const timer = window.setInterval(() => {
      const online =
        (typeof navigator === "undefined" || navigator.onLine !== false) &&
        sseConnected;
      if (!online) return;
      setMessages((previous) => {
        const now = Date.now();
        let changed = false;
        const next = previous.map((message) => {
          if (
            message._delivery !== "sending" ||
            message._awaitingServerEcho ||
            message?._serverId
          )
            return message;
          const queuedAt = Number(message._queuedAt || 0);
          const fileMessage =
            Array.isArray(message._files) && message._files.length > 0;
          const timeout = fileMessage
            ? CHAT_PAGE_CONFIG.pendingFileTimeoutMs
            : CHAT_PAGE_CONFIG.pendingTextTimeoutMs;
          if (!queuedAt || now - queuedAt < timeout) return message;
          changed = true;
          return { ...message, _delivery: "failed" };
        });
        return changed ? next : previous;
      });
    }, CHAT_PAGE_CONFIG.pendingStatusCheckIntervalMs);
    return () => window.clearInterval(timer);
  }, [activeChatId, messages, sseConnected]);

  useEffect(() => {
    if (!activeChatId || !isAppActive) return;
    const flush = () => {
      const online =
        typeof navigator === "undefined" || navigator.onLine !== false;
      if (!online && !sseConnected) return;
      messages
        .filter(
          (message) =>
            message._delivery === "sending" && !message._awaitingServerEcho,
        )
        .forEach((message) => void sendPendingMessage(message));
    };
    if (sseConnected) flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [activeChatId, messages, sseConnected, isAppActive]);

  useEffect(() => {
    if (!activeChatId || !isAppActive) return;
    const timer = window.setInterval(() => {
      messages
        .filter(
          (message) =>
            message._delivery === "sending" && !message._awaitingServerEcho,
        )
        .forEach((message) => void sendPendingMessage(message));
    }, CHAT_PAGE_CONFIG.pendingRetryIntervalMs);
    return () => window.clearInterval(timer);
  }, [activeChatId, messages, isAppActive]);

  useEffect(() => {
    if (!activeChatId || !isAppActive) return;
    const needsSync = messages.some((message) => {
      if (!isMessageAuthoredByUser(message, { username: user.username }))
        return false;
      if (!Array.isArray(message.files) || !message.files.length) return false;
      return Boolean(
        message._processingPending ||
        message._awaitingServerEcho ||
        message._delivery === "sending",
      );
    });
    if (!needsSync) return;
    const delay = Math.max(
      2000,
      Math.round(2500 * getNetworkBackoffMultiplier()),
    );
    const timer = window.setInterval(() => {
      void loadMessages(activeChatId, { silent: true, preserveHistory: true });
    }, delay);
    return () => window.clearInterval(timer);
  }, [
    activeChatId,
    messages,
    user.username,
    isMobileViewport,
    sseConnected,
    isAppActive,
  ]);

  useEffect(() => {
    if (messaging.topic || !activeChatId) return;
    if (lastCacheWriteChatIdRef.current !== activeChatId) {
      lastCacheWriteChatIdRef.current = activeChatId;
      return;
    }
    const payload = {
      chatId: activeChatId,
      version: CHAT_CACHE_VERSION,
      messages,
      hasOlderMessages,
      lastMessageId: messages.length
        ? String(messages[messages.length - 1]?.id || "")
        : "",
      updatedAt: Date.now(),
    };
    writeMessagesCacheMemory(
      messagesCacheRef.current,
      activeChatId,
      payload,
      activeChatIdRef.current,
    );
    if (user?.username) {
      const storage = {
        ...payload,
        messages: sanitizeMessagesForCache(messages),
      };
      if (messagesCacheWriteTimerRef.current) {
        window.clearTimeout(messagesCacheWriteTimerRef.current);
      }
      messagesCacheWriteTimerRef.current = window.setTimeout(() => {
        const key = buildMessagesCacheKey(user.username, activeChatId);
        void writeIdbCache(CACHE_STORES.messages, key, storage);
        void updateMessagesIndex(
          user.username,
          activeChatId,
          payload.updatedAt,
        );
      }, 600);
    }
    return () => {
      if (messagesCacheWriteTimerRef.current) {
        window.clearTimeout(messagesCacheWriteTimerRef.current);
      }
    };
  }, [
    activeChatId,
    messages,
    hasOlderMessages,
    user?.username,
    messaging.topic,
  ]);

  useEffect(() => {
    if (settingsPanel !== "profile" && profileError) setProfileError("");
    if (settingsPanel !== "security" && passwordError) setPasswordError("");
  }, [settingsPanel, profileError, passwordError]);
  useEffect(() => {
    if (!showSettings || settingsPanel) return;
    const onOutside = (event) => {
      const target = event.target;
      if (
        settingsMenuRef.current?.contains(target) ||
        settingsButtonRef.current?.contains(target)
      )
        return;
      setShowSettings(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showSettings, settingsPanel]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing)
        return;
      if (
        !activeChatId ||
        profileModalOpen ||
        newChatOpen ||
        newGroupOpen ||
        newCallOpen ||
        messageDeleteScopeOpen ||
        forwardMessageTarget ||
        confirmDeleteOpen ||
        confirmDeleteCallOpen ||
        confirmLeaveOpen ||
        notificationsModalOpen ||
        whatsNewOpen ||
        settingsPanel ||
        contextMenu ||
        permissionSetupOpen ||
        messaging.panel
      )
        return;
      closeChat();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    activeChatId,
    profileModalOpen,
    newChatOpen,
    newGroupOpen,
    newCallOpen,
    messageDeleteScopeOpen,
    forwardMessageTarget,
    confirmDeleteOpen,
    confirmDeleteCallOpen,
    confirmLeaveOpen,
    notificationsModalOpen,
    whatsNewOpen,
    settingsPanel,
    contextMenu,
    permissionSetupOpen,
    messaging.panel,
  ]);

  useEffect(() => {
    if (!contextMenu) return;
    if (
      contextMenu.kind === "message" &&
      String(contextMenu.targetChatId || "") !== String(activeChatId || "")
    ) {
      closeContextMenu();
      return;
    }
    if (contextMenu.kind !== "message" || !contextMenu.targetMessageKey) return;
    if (
      !messages.some(
        (message) =>
          getMessageContextKey(message) === contextMenu.targetMessageKey,
      )
    ) {
      closeContextMenu();
    }
  }, [activeChatId, closeContextMenu, contextMenu, messages]);

  useEffect(() => {
    loadChatsRef.current = loadChats;
    scheduleMessageRefreshRef.current = scheduleMessageRefresh;
  });

  useEffect(() => {
    if (previousTopicRef.current === messaging.topic || !activeChatId) return;
    previousTopicRef.current = messaging.topic;
    setMessages((previous) =>
      previous.filter(
        (message) =>
          message._delivery === "sending" &&
          message._topicId === messaging.topic,
      ),
    );
    openingUnreadCountRef.current = 0;
    pendingScrollToUnreadRef.current = null;
    setUnreadMarkerId(null);
    void loadMessages(activeChatId, {
      silent: false,
      preserveHistory: false,
      forceUnreadFetch: true,
    });
  }, [messaging.topic, activeChatId]);

  useEffect(() => {
    if (!resultTarget || resultTarget.chatId !== activeChatId) return;
    const target = resultTarget;
    setResultTarget(null);
    void loadMessages(target.chatId, {
      afterId: target.id,
      afterCreatedAt: target.created_at,
      limit: 60,
      preserveHistory: false,
    }).then(() => {
      if (activeChatIdRef.current !== target.chatId) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent("songbird:jump-to-message", {
              detail: { id: target.id },
            }),
          );
        }),
      );
    });
  }, [activeChatId, resultTarget]);

  // ─── View models and context ──────────────────────────────────────────────
  const displayedGroupInviteToken = editingGroup
    ? editGroupInviteToken ||
      String(activeChat?.inviteToken || activeChat?.invite_token || "")
    : "";
  const displayedGroupInviteLink = buildInviteLinkForChat({
    group_username: newGroupForm.username,
    group_visibility: newGroupForm.visibility,
    inviteToken: displayedGroupInviteToken,
    invite_token: displayedGroupInviteToken,
  });
  const showGroupInviteManagement = Boolean(editingGroup);
  const isInCall =
    callState !== "idle" || Boolean(groupCall.room) || groupCall.joining;

  const messagingValue = {
    ...messaging,
    chats,
    headerActions: {
      toggleMute: () => toggleMuteChat(activeChatId),
      deleteChat: () => requestDeleteChats([activeChatId]),
      openAppearance: () => {
        if (window.matchMedia("(max-width: 767px)").matches)
          setMobileTab("settings");
        setSettingsPanel("appearance");
      },
    },
    loadedMessageCount: messages.length,
    chat: activeChat,
    groupCall,
    isInCall: callState !== "idle",
    reloadChats: () => loadChats({ silent: true }),
    retryQueued: async (message) => {
      outboxRetryStateRef.current.delete(message._clientId);
      const next = {
        ...message,
        _delivery: "sending",
        _attempts: 0,
        _nextAttemptAt: 0,
        _queuedAt: Date.now(),
      };
      try {
        await saveOutboxMessage(user.id || user.username, next);
        if (next._chatId === activeChatIdRef.current) {
          setMessages((previous) =>
            previous.map((item) =>
              item._clientId === next._clientId ? next : item,
            ),
          );
        }
        void outboxSendRef.current?.(next);
        return true;
      } catch (error) {
        messaging.setError(error.message);
        return false;
      }
    },
    removeQueued: async (message) => {
      if (sendingClientIdsRef.current.has(message._clientId)) {
        messaging.setError("Wait for the current send attempt to finish.");
        return false;
      }
      try {
        await removeOutboxMessage(user.id || user.username, message._clientId);
        setMessages((previous) =>
          previous.filter((item) => item._clientId !== message._clientId),
        );
        return true;
      } catch (error) {
        messaging.setError(error.message);
        return false;
      }
    },
    openResult: (message) => {
      messaging.setPanel(null);
      setActiveChatId(message.chatId);
      setMobileTab("chat");
      setResultTarget(message);
    },
  };

  // ─── Screen composition ───────────────────────────────────────────────────
  const viewModel = {
    acceptCall,
    activeChat,
    activeChatId,
    activeChatMuted,
    activeFallbackTitle,
    activeGroupAvatarColor,
    activeGroupAvatarUrl,
    activeHeaderAvatar,
    activeHeaderAvatarIcon,
    activeUploadProgress,
    adminPanelEnabled,
    appInfo,
    appInfoError,
    appInfoLoading,
    avatarPreview,
    callDuration,
    callEndReason,
    callQuality,
    callState,
    callType,
    calls,
    callsEditMode,
    canCurrentUserViewInvite,
    canDeleteMessageForEveryone,
    canJoinMentionChat,
    canSendInActiveChat,
    canStartChat,
    canSwipeReply,
    channelSeenCounts,
    chatAppearance,
    chatScrollRef,
    chats,
    chatsScrollToTopEpoch,
    chatsSearchFocused,
    chatsSearchQuery,
    clearPendingUploads,
    clearPendingVoiceMessage,
    closeChat,
    closeContextMenu,
    closeNewChatModal,
    closeNewGroupModal,
    closeProfileModal,
    composerInputRef,
    confirmDeleteCall,
    confirmDeleteCallOpen,
    confirmDeleteChats,
    confirmDeleteOpen,
    confirmLeaveGroupById,
    confirmLeaveOpen,
    contextMenu,
    copyToastVisible,
    createdGroupInviteLink,
    createdGroupInviteType,
    creatingGroup,
    dataCacheStats,
    discoverChannels,
    discoverGroups,
    discoverLoading,
    discoverSaved,
    discoverUsers,
    dismissPermissionsPrompt,
    dismissWhatsNew,
    displayInitials,
    displayName,
    displayedGroupInviteLink,
    editMode,
    editTarget,
    editingGroup,
    enableNotifications,
    endCall,
    exitSearchMode,
    fileUploadInProgress,
    forwardMessageTarget,
    forwardSavedChat,
    forwardedChatStatusById,
    forwardedChatsById,
    forwardedUserStatusByKey,
    forwardedUsersById,
    groupAvatarPreview,
    groupInviteOpen,
    groupModalType,
    handleAvatarChange,
    handleAvatarRemove,
    handleChatScrollWithSeen,
    handleClearCache,
    handleClearEdit,
    handleClearReply,
    handleCreateGroup,
    handleDeleteAccount,
    handleDeleteActiveGroup,
    handleDeleteCalls,
    handleDeleteChats,
    handleEnterEdit,
    handleExitEdit,
    handleFloatingDayNavigate,
    handleForwardMessageSubmit,
    handleGroupAvatarChange,
    handleGroupAvatarRemove,
    handleJoinMentionChat,
    handleJumpToLatest,
    handleLogout,
    handleMessageInput,
    handleMessageMediaLoaded,
    handleNewCallSubmit,
    handleOpenForwardModal,
    handleOpenForwardOrigin,
    handleOpenNewCall,
    handleOpenProfileChat,
    handleOpenSettings,
    handleOpenWhatsNew,
    handlePasswordSave,
    handleProfileRemoteChannelStatusChange,
    handleProfileSave,
    handleProfileStartVideoCall,
    handleProfileStartVoiceCall,
    handleRegenerateGroupInvite,
    handleRemoveGroupMember,
    handleSend,
    handleStartCallFromRow,
    handleStartReached,
    handleStartReply,
    handleStartVideoCall,
    handleStartVoiceCall,
    handleTestPush,
    handleToggleMessagePreview,
    handleToggleNotifications,
    handleUploadFilesSelected,
    handleUserScrollIntent,
    handleVoiceRecorded,
    hasOlderMessages,
    headerAvatarColor,
    isActiveChannelChat,
    isActiveGroupChat,
    isActiveSavedChat,
    isAtBottom,
    isAtBottomRef,
    isCallClosing,
    isCameraOff,
    isCameraUnavailable,
    isConnected,
    isDark,
    isInCall,
    isMentionProfileReadOnly,
    isMuted,
    isOffline,
    isRemoteCameraOff,
    isSpeakerOn,
    isUpdatingChats,
    lastMessageIdRef,
    loadingCalls,
    loadingChats,
    loadingMessages,
    loadingOlderMessages,
    localVideoRef,
    mentionProfile,
    mentionProfileChat,
    mentionProfileUser,
    mentionRefreshToken,
    messageDeleteScopeOpen,
    messageMaxChars,
    messagePreviewEnabled,
    messages,
    messaging,
    messagingValue,
    microphonePermission,
    mobileTab,
    newCallOpen,
    newChatError,
    newChatLoading,
    newChatOpen,
    newChatResults,
    newChatSelection,
    newChatUsername,
    newGroupError,
    newGroupForm,
    newGroupMembers,
    newGroupOpen,
    newGroupSearch,
    newGroupSearchLoading,
    newGroupSearchResults,
    notificationPermission,
    notificationStatusLabel,
    notificationsActive,
    notificationsDebugLine,
    notificationsDisabled,
    notificationsEnabled,
    notificationsModalOpen,
    notificationsSupported,
    openActiveChatProfile,
    openContextMenu,
    openDiscoverGroup,
    openDiscoverUser,
    openEditGroupFromProfile,
    openMemberProfileFromList,
    openMemberProfileFromMessage,
    openMentionProfile,
    openNewChannelModal,
    openNewGroupModal,
    openOwnProfileModal,
    openSavedMessages,
    openSelfProfileEditor,
    passwordError,
    passwordForm,
    pendingDeleteCallIds,
    pendingDeleteIds,
    pendingDeleteMessage,
    pendingLeaveChatId,
    pendingUploadFiles,
    pendingUploadType,
    pendingVoiceMessage,
    performDeleteMessage,
    permissionSetupOpen,
    permissionsPrompt,
    profileError,
    profileForm,
    profileInviteLink,
    profileInviteLinkLoading,
    profileModalMember,
    profileModalOpen,
    profileRemoteChannelStatus,
    profileTargetUser,
    pushSubscribeStatus,
    regeneratingGroupInviteLink,
    registerMessageRef,
    rejectCall,
    remoteAudioRef,
    remoteVideoRef,
    removePendingUpload,
    replyTarget,
    requestDeleteCall,
    requestDeleteChats,
    requestLeaveGroupById,
    requestMicrophonePermission,
    resolvedCallPeer,
    resolvedHeaderSubtitle,
    selectedCalls,
    selectedChats,
    setActiveChatId,
    setActivePeer,
    setCallsEditMode,
    setChatsScrollToTopEpoch,
    setChatsSearchFocused,
    setChatsSearchQuery,
    setConfirmDeleteCallOpen,
    setConfirmDeleteOpen,
    setConfirmLeaveOpen,
    setCreatedGroupInviteType,
    setForwardMessageTarget,
    setForwardSavedChat,
    setGroupInviteOpen,
    setIsAtBottom,
    setIsDark,
    setMessageDeleteScopeOpen,
    setMobileTab,
    setNewCallOpen,
    setNewChatError,
    setNewChatOpen,
    setNewChatSelection,
    setNewChatUsername,
    setNewGroupError,
    setNewGroupForm,
    setNewGroupMembers,
    setNewGroupSearch,
    setNotificationsModalOpen,
    setPasswordForm,
    setPendingDeleteMessage,
    setPendingLeaveChatId,
    setPermissionSetupOpen,
    setProfileForm,
    setSelectedCalls,
    setSettingsPanel,
    setStatusSelection,
    setUnreadInChat,
    settingsButtonRef,
    settingsMenuRef,
    settingsPanel,
    shouldShowMembersList,
    showFloatingLabel,
    showGroupInviteManagement,
    showSettings,
    sidebarScrollEpoch,
    smoothScrollLockRef,
    sseConnected,
    startDirectMessage,
    statusSelection,
    statusTextClass,
    statusValue,
    toggleCamera,
    toggleMute,
    toggleMuteChat,
    toggleSelectCall,
    toggleSelectChat,
    toggleSpeaker,
    toggleTheme,
    typingIndicator,
    unreadInChat,
    unreadMarkerId,
    uploadError,
    user,
    userColor,
    userScrolledUp,
    visibleChats,
    whatsNewOpen,
  };
  return <ChatPageView model={viewModel} />;
}
