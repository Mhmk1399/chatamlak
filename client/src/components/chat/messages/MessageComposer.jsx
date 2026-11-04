import { tError as localizeError } from "../../../i18n/locale.js";
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState, useCallback } from "react";
import { readChatDraft, saveChatDraft, clearChatDraft } from "../../../utils/chatDrafts.js";
import { t, useLocale } from "../../../i18n/locale.js";
import {
  Check,
  Pencil,
  File,
  ImageIcon,
  Camera,
  Video,
  Mic,
  Paperclip,
  Phone,
  Play,
  Reply,
  Send,
  Close,
  Lock,
  Pause,
  Trash,
  SmilePlus,
} from "../../../icons/lucide.js";
import { hasPersian } from "../../../utils/fontUtils.js";
import { renderMarkdownInlinePlain } from "../../../utils/markdown.js";
import {
  getCallLogLabel,
  parseCallLogBody,
} from "../../../utils/messageContent.js";
import VerifiedBadge from "../../common/VerifiedBadge.jsx";
import UserRoleBadge from "../../common/UserRoleBadge.jsx";
import Tooltip from "../../common/Tooltip.jsx";
import AnchoredMenu from "../../common/AnchoredMenu.jsx";
import VideoMessageRecorder from "../media/VideoMessageRecorder.jsx";
import RecordingButton from "../media/RecordingButton.jsx";
import { useHoldToRecord } from "../../../hooks/useHoldToRecord.js";
import { useVoiceRecording } from "../../../hooks/chat/useVoiceRecording.js";
import { useContextMenuTrigger } from "../../../hooks/useContextMenuTrigger.js";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { insertEmojiAtSelection } from "../../../utils/emojiPreferences.js";

const ScheduleMessageDialog = lazy(() => import("../tools/ScheduleMessageDialog.jsx"));
let emojiPickerPromise;
const loadEmojiPicker = () => emojiPickerPromise ||= import("./EmojiPickerPopover.jsx").catch((error) => { emojiPickerPromise = null; throw error; });
const CAMERA_PICKERS = [
  { kind: "photo", label: "Take photo", Icon: Camera, accept: "image/*" },
  { kind: "video", label: "Record video", Icon: Video, accept: "video/*" },
];

function applyTextareaSize({
  textareaEl,
  maxTextareaHeight,
  composerEl,
  onComposerResize,
  onComposerHeightChange,
}) {
  if (!textareaEl) return;
  textareaEl.style.height = "0px";
  const nextHeight = Math.min(textareaEl.scrollHeight, maxTextareaHeight);
  textareaEl.style.height = `${Math.max(44, nextHeight)}px`;
  textareaEl.style.overflowY =
    textareaEl.scrollHeight > maxTextareaHeight ? "auto" : "hidden";
  onComposerResize?.();
  if (composerEl) {
    onComposerHeightChange?.(Number(composerEl.offsetHeight || 0));
  }
}

function focusElementPreventScroll(element) {
  if (!element) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export function MessageComposer({
  activeChatId,
  isDesktop,
  handleSend,
  onComposerResize,
  replyTarget,
  onClearReply,
  editTarget,
  onClearEdit,
  pendingUploadFiles,
  pendingUploadType,
  pendingVoiceMessage,
  fileUploadEnabled,
  mediaInputRef,
  documentInputRef,
  onClearPendingUploads,
  onRemovePendingUpload,
  onUploadFilesSelected,
  onVoiceRecorded,
  onClearPendingVoiceMessage,
  uploadError,
  activeUploadProgress,
  messageMaxChars = null,
  onMessageInput,
  uploadBusy,
  showUploadMenu,
  setShowUploadMenu,
  uploadMenuRef,
  handleVideoThumbLoadedMetadata,
  onComposerHeightChange,
  onComposerFocusChange,
  composerInputRef,
  currentUsername = "",
  draftAccountId = "",
  mentionCandidates = [],
  maxVideoNoteBytes,
}) {
  const locale = useLocale();
  const composerRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const emojiSelectionRef = useRef(null);
  const emojiContextRef = useRef(null);
  const emojiPickerId = useId();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [EmojiPicker, setEmojiPicker] = useState(null);
  const [emojiLoading, setEmojiLoading] = useState(false);
  const [emojiError, setEmojiError] = useState("");
  const photoCaptureRef = useRef(null);
  const videoCaptureRef = useRef(null);
  const pendingCaptureContextRef = useRef(null);
  const uploadMenuId = useId();
  const [focusUploadMenu, setFocusUploadMenu] = useState(true);
  const closeUploadMenu = useCallback((restoreFocus = true) => {
    setShowUploadMenu(false);
    if (restoreFocus) uploadButtonRef.current?.focus({ preventScroll: true });
  }, [setShowUploadMenu]);
  const draftOwner = draftAccountId || currentUsername;
  const composingRef = useRef(false);
  const lastDraftReplyRef = useRef(replyTarget);
  const [draftError, setDraftError] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionTerm, setMentionTerm] = useState(null);
  const fallbackInputRef = useRef(null);
  const messageInputRef = composerInputRef || fallbackInputRef;
  const keepFocusRef = useRef(false);
  const previousEditIdRef = useRef(0);
  const appliedEditIdRef = useRef(0);
  const [messageValue, setMessageValue] = useState(() => readChatDraft(draftOwner, activeChatId)?.body || "");
  const [submitting, setSubmitting] = useState(false);
  const [recordingMode, setRecordingMode] = useState("voice");
  const [videoRecorderOpen, setVideoRecorderOpen] = useState(false);
  const [videoCommand, setVideoCommand] = useState("hold");
  const recordingContext = String(draftOwner) + ":" + String(activeChatId);
  const messaging = useMessagingContext();
  const [scheduleDraft, setScheduleDraft] = useState(null);
  const [scheduledNotice, setScheduledNotice] = useState(false);
  const activeComposerContext = useRef(null);
  useLayoutEffect(() => {
    activeComposerContext.current = recordingContext;
    pendingCaptureContextRef.current = null;
    return () => {
      activeComposerContext.current = null;
      pendingCaptureContextRef.current = null;
    };
  }, [recordingContext]);
  useEffect(() => { setScheduleDraft(null); setScheduledNotice(false); }, [recordingContext]);
  useEffect(() => { setEmojiOpen(false); setEmojiLoading(false); setEmojiError(""); emojiContextRef.current = null; }, [recordingContext]);
  const voice = useVoiceRecording({ contextKey: recordingContext, maxBytes: maxVideoNoteBytes,
    onSend: sendRecordedMessage, onReview: onVoiceRecorded, onComplete: () => gesture.reset() });
  const isRecording = voice.status !== "idle";
  const recordingMs = voice.milliseconds;
  const gesture = useHoldToRecord({ contextKey: recordingContext,
    disabled: uploadBusy || submitting || !fileUploadEnabled || Boolean(editTarget) || Boolean(pendingVoiceMessage) || Boolean(pendingUploadFiles?.length),
    onTap: () => setRecordingMode((mode) => mode === "voice" ? "video" : "voice"),
    onStart: () => {
      setEmojiOpen(false);
      messageInputRef.current?.blur(); setShowUploadMenu(false);
      if (recordingMode === "video") { setVideoCommand("hold"); setVideoRecorderOpen(activeChatId); return true; }
      return voice.start();
    },
    onFinish: () => { if (recordingMode === "video") setVideoCommand("send"); else voice.stop(); },
    onCancel: () => { voice.cancel(); setVideoRecorderOpen(false); },
  });
  useEffect(() => { setVideoRecorderOpen(false); }, [activeChatId]);
  async function sendRecordedMessage(payload) {
    if (!composerRef.current) return false;
    setSubmitting(true);
    try { return await handleSend({ preventDefault() {}, currentTarget: composerRef.current }, payload); }
    finally { setSubmitting(false); }
  }
  const maxTextareaHeight = 136;
  const openFilePicker = useCallback((inputRef) => {
    const input = inputRef?.current;
    if (!input || input.disabled) return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.click();
      }
    } catch {
      try {
        input.click();
      } catch {
        // ignore
      }
    }
  }, []);
  const formatDuration = (totalSeconds) => {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  };
  const normalizeReplyBody = (value) => {
    if (typeof value === "string")
      return value === "[object Object]" ? "" : value;
    if (value && typeof value === "object") {
      const text = value.text ?? value.body;
      return typeof text === "string" ? text : "";
    }
    return "";
  };
  const replyBodyText = normalizeReplyBody(replyTarget?.body);
  const editBodyText = normalizeReplyBody(editTarget?.body);
  const composerHasPersian = hasPersian(messageValue);
  const suggestions = mentionTerm === null ? [] : mentionCandidates.filter((member) => member.username && member.username !== currentUsername &&
    `${member.username} ${member.nickname || ""}`.toLowerCase().includes(mentionTerm.toLowerCase())).slice(0, 6);
  const chooseMention = (member) => {
    const input = messageInputRef.current;
    const end = input?.selectionStart ?? messageValue.length;
    const before = messageValue.slice(0, end);
    const next = before.replace(/@[a-zA-Z0-9._]*$/, `@${member.username} `) + messageValue.slice(end);
    const caret = before.replace(/@[a-zA-Z0-9._]*$/, `@${member.username} `).length;
    setMessageValue(next); setMentionTerm(null);
    if (!editTarget) setDraftError(!saveChatDraft(draftOwner, activeChatId, next, replyTarget));
    onMessageInput?.(next);
    requestAnimationFrame(() => { input?.focus({ preventScroll: true }); input?.setSelectionRange(caret, caret); });
  };
  useEffect(() => {
    if (editTarget || composingRef.current) return;
    if (!replyTarget && !lastDraftReplyRef.current) return;
    lastDraftReplyRef.current = replyTarget;
    const existing = readChatDraft(draftOwner, activeChatId);
    saveChatDraft(draftOwner, activeChatId, existing?.body || "", replyTarget);
  }, [replyTarget, editTarget, draftOwner, activeChatId]);
  const editHasFiles = Array.isArray(editTarget?.files) && editTarget.files.length > 0;
  const editBodyLooksLikeFileSummary =
    /^Sent (a media file|a photo|a video|a document|a voice message|\d+ (files|photos|videos|documents|media files|voice messages))$/i.test(
      String(editBodyText || "").trim(),
    );
  const replyBodyNormalized = String(replyBodyText || "").trim();
  const replyCallLog = parseCallLogBody(replyBodyNormalized);
  const replyCallLogLabel = replyCallLog
    ? getCallLogLabel(
        replyCallLog,
        String(replyTarget?.username || "").toLowerCase() ===
          String(currentUsername || "").toLowerCase(),
      )
    : null;
  const isPluralMediaSummary =
    /^Sent \d+ (files|photos|videos|documents|media files)$/i.test(
      replyBodyNormalized,
    );
  const isGenericReplyMediaText =
    /^Sent (a media file|a file|a photo|a video|a document|\d+ (files|photos|videos|documents|media files))$/i.test(
      replyBodyNormalized,
    );
  const isGenericReplyVoiceText =
    /^Sent (a voice message|\d+ voice messages)$/i.test(replyBodyNormalized);
  const derivedReplyIcon = (() => {
    if (!replyTarget) return null;
    if (replyCallLog) return replyCallLog.type === "video" ? "video" : "callVoice";
    if (replyTarget.icon) return replyTarget.icon;
    if (/^Sent \d+ media files/i.test(replyBodyText)) return "image";
    if (/^Sent (a voice message|\d+ voice messages)/i.test(replyBodyText))
      return "voice";
    if (/^Sent (a video|\d+ videos)/i.test(replyBodyText)) return "video";
    if (/^Sent (a photo|\d+ photos)/i.test(replyBodyText)) return "image";
    if (/^Sent a media file/i.test(replyBodyText)) return "image";
    if (/^Sent (a file|a document|\d+ documents|\d+ files)/i.test(replyBodyText))
      return "document";
    return null;
  })();
  const resolvedReplyText = replyCallLog
    ? replyCallLogLabel
    : derivedReplyIcon === "voice"
      ? isGenericReplyVoiceText
        ? "Sent a voice message"
        : replyBodyText || "Message"
      : derivedReplyIcon === "video"
        ? isGenericReplyMediaText && !isPluralMediaSummary
          ? "Sent a video"
          : replyBodyText || "Message"
        : derivedReplyIcon === "image"
          ? isGenericReplyMediaText && !isPluralMediaSummary
            ? "Sent a photo"
            : replyBodyText || "Message"
          : replyBodyText || "Message";
  const resolvedReplyHtml = renderMarkdownInlinePlain(resolvedReplyText);

  const hasText = Boolean(String(messageValue || "").trim());
  const hasPendingUploads = Boolean(pendingUploadFiles?.length);
  const hasPendingVoice = Boolean(pendingVoiceMessage);
  const isEditMode = Boolean(editTarget);
  const micMode =
    !isEditMode && !hasText && !hasPendingUploads && !hasPendingVoice && !isRecording;
  const micDisabled = uploadBusy || submitting || !fileUploadEnabled || isEditMode;
  const canSubmitMessage = isEditMode
    ? hasText
    : hasText || hasPendingUploads || hasPendingVoice;
  const canSchedule = hasText && !isEditMode && !hasPendingUploads && !hasPendingVoice && !isRecording && !uploadBusy && !submitting;
  const openScheduling = () => {
    if (!canSchedule || scheduleDraft) return;
    messageInputRef.current?.blur();
    setScheduleDraft({ body: messageValue, chatId: activeChatId, contextKey: recordingContext,
      replyToMessageId: replyTarget?.id || null, topicId: messaging?.topic || null });
    setMentionTerm(null); setShowUploadMenu?.(false);
    setEmojiOpen(false);
  };
  const scheduleTrigger = useContextMenuTrigger({ disabled: !canSchedule, contextKey: recordingContext,
    isMobile: !isDesktop, holdOnMouse: true, holdDelayMs: 450, onOpen: openScheduling });
  const scheduleHintId = useId();

  useEffect(() => {
    applyTextareaSize({
      textareaEl: messageInputRef.current,
      maxTextareaHeight,
      composerEl: composerRef.current,
      onComposerResize,
      onComposerHeightChange,
    });
  }, [maxTextareaHeight, messageInputRef, onComposerHeightChange, onComposerResize]);

  useEffect(() => {
    applyTextareaSize({
      textareaEl: messageInputRef.current,
      maxTextareaHeight,
      composerEl: composerRef.current,
      onComposerResize,
      onComposerHeightChange,
    });
  }, [
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onComposerResize,
    pendingUploadFiles?.length,
  ]);

  useEffect(() => {
    applyTextareaSize({
      textareaEl: messageInputRef.current,
      maxTextareaHeight,
      composerEl: composerRef.current,
      onComposerResize,
      onComposerHeightChange,
    });
  }, [
    editTarget,
    draftOwner,
    activeChatId,
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onComposerResize,
    replyTarget,
  ]);

  useEffect(() => {
    const nextEditId = String(editTarget?.id || "").trim();
    if (!nextEditId) return;
    if (appliedEditIdRef.current === nextEditId) return;
    const nextValue =
      editHasFiles && editBodyLooksLikeFileSummary ? "" : String(editBodyText || "");
    const frameId = requestAnimationFrame(() => {
      appliedEditIdRef.current = nextEditId;
      previousEditIdRef.current = nextEditId;
      setMessageValue(nextValue);
      if (typeof onMessageInput === "function") {
        onMessageInput(nextValue);
      }
      applyTextareaSize({
        textareaEl: messageInputRef.current,
        maxTextareaHeight,
        composerEl: composerRef.current,
        onComposerResize,
        onComposerHeightChange,
      });
      focusElementPreventScroll(messageInputRef.current);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    editBodyLooksLikeFileSummary,
    editBodyText,
    editHasFiles,
    editTarget?.id,
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onMessageInput,
    onComposerResize,
  ]);

  useEffect(() => {
    if (editTarget) return;
    if (!previousEditIdRef.current) return;
    const frameId = requestAnimationFrame(() => {
      previousEditIdRef.current = 0;
      appliedEditIdRef.current = 0;
      setMessageValue(readChatDraft(draftOwner, activeChatId)?.body || "");
      if (typeof onMessageInput === "function") {
        onMessageInput("");
      }
      applyTextareaSize({
        textareaEl: messageInputRef.current,
        maxTextareaHeight,
        composerEl: composerRef.current,
        onComposerResize,
        onComposerHeightChange,
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    editTarget,
    draftOwner,
    activeChatId,
    maxTextareaHeight,
    messageInputRef,
    onComposerHeightChange,
    onComposerResize,
    onMessageInput,
  ]);

  const restoreComposerFocus = () => {
    if (!keepFocusRef.current) return;
    keepFocusRef.current = false;
    requestAnimationFrame(() => focusElementPreventScroll(messageInputRef.current));
  };

  const captureComposerFocus = () => {
    if (typeof document === "undefined") return;
    if (document.activeElement === messageInputRef.current) {
      keepFocusRef.current = true;
    }
  };

  const openCameraPicker = (inputRef) => {
    pendingCaptureContextRef.current = recordingContext;
    // Keep the native picker inside the user's click gesture, including on iOS.
    openFilePicker(inputRef);
    setShowUploadMenu(false);
  };

  const handleCameraSelection = (event) => {
    const files = Array.from(event.currentTarget.files || []);
    const captureContext = pendingCaptureContextRef.current;
    pendingCaptureContextRef.current = null;
    // Snapshot FileList before clearing it so the same capture can be selected again.
    event.currentTarget.value = "";
    if (
      files.length && !uploadBusy && fileUploadEnabled &&
      captureContext === activeComposerContext.current
    ) {
      onUploadFilesSelected(files, "media", pendingUploadType === "media");
    }
    restoreComposerFocus();
  };

  const cancelCameraSelection = () => {
    pendingCaptureContextRef.current = null;
    restoreComposerFocus();
  };

  const toggleEmojiPicker = async () => {
    if (emojiOpen) { setEmojiOpen(false); return; }
    const input = messageInputRef.current;
    emojiSelectionRef.current = { start: input?.selectionStart ?? messageValue.length, end: input?.selectionEnd ?? messageValue.length };
    emojiContextRef.current = recordingContext;
    setShowUploadMenu?.(false); setMentionTerm(null); setEmojiError(""); setEmojiOpen(true);
    input?.blur();
    emojiButtonRef.current?.focus({ preventScroll: true });
    if (EmojiPicker) return;
    setEmojiLoading(true);
    try {
      const module = await loadEmojiPicker();
      if (activeComposerContext.current === recordingContext) setEmojiPicker(() => module.default);
    } catch {
      if (activeComposerContext.current === recordingContext) { setEmojiOpen(false); setEmojiError("Could not load emojis. Try again."); }
    } finally {
      if (activeComposerContext.current === recordingContext) setEmojiLoading(false);
    }
  };

  const selectEmoji = (emoji) => {
    if (emojiContextRef.current !== activeComposerContext.current || submitting || scheduleDraft) return false;
    const result = insertEmojiAtSelection(messageValue, emoji, emojiSelectionRef.current, messageMaxChars);
    setEmojiOpen(false);
    if (!result) { setEmojiError("This emoji exceeds the message length limit."); emojiButtonRef.current?.focus({ preventScroll: true }); return false; }
    setMessageValue(result.value); setMentionTerm(null); setScheduledNotice(false); setEmojiError("");
    if (!editTarget) setDraftError(!saveChatDraft(draftOwner, activeChatId, result.value, replyTarget));
    onMessageInput?.(result.value);
    requestAnimationFrame(() => {
      if (activeComposerContext.current !== recordingContext) return;
      const input = messageInputRef.current;
      focusElementPreventScroll(input); input?.setSelectionRange(result.caret, result.caret);
      applyTextareaSize({ textareaEl: input, maxTextareaHeight, composerEl: composerRef.current, onComposerResize, onComposerHeightChange });
    });
    return true;
  };

  useEffect(() => {
    const handleWindowFocus = () => {
      if (!keepFocusRef.current) return;
      keepFocusRef.current = false;
      requestAnimationFrame(() => focusElementPreventScroll(messageInputRef.current));
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [messageInputRef]);

  useEffect(() => {
    if (isDesktop || typeof window === "undefined") return undefined;
    const node = composerRef.current;
    if (!node) return undefined;

    const blockComposerViewportScroll = (event) => {
      event.stopPropagation();
      event.preventDefault?.();
    };

    const handleTouchStart = (event) => {
      event.stopPropagation();
    };

    node.addEventListener("touchstart", handleTouchStart, { capture: true });
    node.addEventListener("touchmove", blockComposerViewportScroll, {
      capture: true,
      passive: false,
    });
    node.addEventListener("wheel", blockComposerViewportScroll, {
      capture: true,
      passive: false,
    });
    node.addEventListener("gesturestart", blockComposerViewportScroll, {
      capture: true,
      passive: false,
    });
    return () => {
      node.removeEventListener("touchstart", handleTouchStart, { capture: true });
      node.removeEventListener("touchmove", blockComposerViewportScroll, {
        capture: true,
      });
      node.removeEventListener("wheel", blockComposerViewportScroll, {
        capture: true,
      });
      node.removeEventListener("gesturestart", blockComposerViewportScroll, {
        capture: true,
      });
    };
  }, [isDesktop]);

  if (!activeChatId) return null;

  return (
    <form
      noValidate
      ref={composerRef}
      onDragOver={(event) => { if (fileUploadEnabled && event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => {
        if (!fileUploadEnabled || !event.dataTransfer.files.length) return;
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files);
        const type = files.every((file) => /^(image|video)\//.test(file.type)) ? "media" : "document";
        onUploadFilesSelected?.(files, type, pendingUploadType === type);
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files || []);
        if (!fileUploadEnabled || !files.length) return;
        event.preventDefault();
        const type = files.every((file) => /^(image|video)\//.test(file.type)) ? "media" : "document";
        onUploadFilesSelected?.(files, type, pendingUploadType === type);
      }}
      className="sticky bottom-0 z-30 flex shrink-0 flex-col gap-3 border-t border-slate-300/80 bg-white px-4 py-3 dark:border-brand-500/20 dark:bg-slate-900 sm:px-6 md:static md:mt-auto"
      style={{
        paddingBottom: isDesktop
          ? "0.75rem"
          : "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
        overscrollBehaviorY: isDesktop ? undefined : "none",
        touchAction: isDesktop ? undefined : "none",
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting || scheduleDraft || uploadBusy) return;
        if (!canSubmitMessage) {
          event.preventDefault();
          return;
        }
        setSubmitting(true);
        let accepted = false;
        try { accepted = await handleSend(event); } finally { setSubmitting(false); }
        if (accepted !== true) return;
        if (!editTarget) clearChatDraft(draftOwner, activeChatId);
        requestAnimationFrame(() => {
          if (!editTarget) {
            setMessageValue("");
          }
          applyTextareaSize({
            textareaEl: messageInputRef.current,
            maxTextareaHeight,
            composerEl: composerRef.current,
            onComposerResize,
            onComposerHeightChange,
          });
          if (!isDesktop) {
            focusElementPreventScroll(messageInputRef.current);
          }
        });
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing)
          return;
        if (!pendingUploadFiles?.length) return;
        if (!isDesktop) return;
        const activeEl = document.activeElement;
        if (activeEl === messageInputRef.current) return;
        event.preventDefault();
        event.currentTarget?.requestSubmit?.();
      }}
    >
      {scheduleDraft && <Suspense fallback={<p role="status" className="text-xs text-slate-500">{t("Opening scheduling…")}</p>}>
        <ScheduleMessageDialog draft={scheduleDraft} maxLength={messageMaxChars || 4000} onClose={() => setScheduleDraft(null)}
          onScheduled={() => {
            const snapshot = scheduleDraft;
            const stored = readChatDraft(draftOwner, snapshot.chatId);
            if (stored?.body === snapshot.body && String(stored?.replyTo?.id || "") === String(snapshot.replyToMessageId || "")) clearChatDraft(draftOwner, snapshot.chatId);
            if (activeComposerContext.current !== snapshot.contextKey) return;
            setScheduleDraft(null); setScheduledNotice(true);
            if (messageInputRef.current?.value === snapshot.body) {
              setMessageValue(""); onMessageInput?.("");
              if (String(replyTarget?.id || "") === String(snapshot.replyToMessageId || "")) onClearReply?.();
              requestAnimationFrame(() => applyTextareaSize({ textareaEl: messageInputRef.current, maxTextareaHeight, composerEl: composerRef.current, onComposerResize, onComposerHeightChange }));
            }
          }} />
      </Suspense>}
      {scheduledNotice && <p role="status" className="text-xs text-accent-700 dark:text-accent-300">{t("Message scheduled.")}</p>}
      {videoRecorderOpen === activeChatId && <VideoMessageRecorder key={activeChatId} maxBytes={maxVideoNoteBytes}
        gesture={gesture.locked ? "locked" : videoCommand}
        onGestureLock={gesture.lock}
        onClose={() => { setVideoRecorderOpen(false); gesture.reset(); }}
        onSend={sendRecordedMessage} />}
      {voice.error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{t(voice.error)}</p>}
      {draftError && <p role="status" className="text-xs text-rose-600 dark:text-rose-300">{t("Draft could not be saved on this device.")}</p>}
      {suggestions.length > 0 && <div id={`mention-list-${activeChatId}`} role="listbox" aria-label={t("Mention a member")} className="max-h-48 overflow-y-auto rounded-xl border border-brand-200 bg-white p-1 dark:border-brand-500/30 dark:bg-slate-950">
        {suggestions.map((member, index) => <button key={member.id || member.username} id={`mention-${activeChatId}-${index}`} type="button" role="option" aria-selected={index === mentionIndex} onPointerDown={(event) => event.preventDefault()} onClick={() => chooseMention(member)} className={`block min-h-10 w-full rounded-lg px-3 py-2 text-start text-sm transition hover:bg-brand-50 dark:hover:bg-brand-500/10 ${index === mentionIndex ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}>{member.nickname || member.username} <span className="text-slate-500">@{member.username}</span></button>)}
      </div>}
      {editTarget ? (
        <div className="rounded-2xl border border-brand-200/80 bg-brand-50/70 p-2 dark:border-brand-500/30 dark:bg-slate-950/70">
          <div className="flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              <Pencil size={20} className="icon-anim-sway" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={`truncate text-[11px] font-semibold text-brand-700 dark:text-brand-200 ${
                  hasPersian(
                    "Edit Message",
                  )
                    ? "font-fa"
                    : ""
                }`}
                dir="auto"
                style={{ unicodeBidi: "isolate" }}
              >{t("Edit Message")}</span>
              <span
                className={`mt-1 min-w-0 truncate text-xs text-slate-600 dark:text-slate-300 ${
                  hasPersian(editBodyText) ? "font-fa" : ""
                }`}
                dir="auto"
                style={{ unicodeBidi: "isolate" }}
              >
                {editBodyText || t("Message")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearEdit?.();
                restoreComposerFocus();
              }}
              onPointerDown={(event) => {
                captureComposerFocus();
                if (!isDesktop) event.preventDefault();
              }}
              className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
              aria-label={t("Cancel edit")}
            >
              <Close size={20} className="icon-anim-pop" />
            </button>
          </div>
        </div>
      ) : replyTarget ? (
        <div className="rounded-2xl border border-brand-200/80 bg-brand-50/70 p-2 dark:border-brand-500/30 dark:bg-slate-950/70">
          <div className="flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              <Reply size={20} className="icon-anim-sway" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <Tooltip
                label={replyTarget.displayName || replyTarget.username || t("message")}
                asChild
              >
                <span
                  className="flex items-center gap-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-200"
                  dir="ltr"
                >
                  <span
                    className={`truncate ${
                      hasPersian(
                        replyTarget.displayName || replyTarget.username || "message",
                      )
                        ? "font-fa"
                        : ""
                    }`}
                    dir="auto"
                    style={{ unicodeBidi: "isolate" }}
                  >{t("Reply to")}{" "}
                    {replyTarget.displayName || replyTarget.username || t("message")}
                  </span>
                  {Boolean(replyTarget.verified) && <VerifiedBadge size={13} />}
                  <UserRoleBadge role={replyTarget.role} size={13} />
                </span>
              </Tooltip>
              <span
                className="mt-1 flex min-w-0 items-baseline gap-1 text-xs text-slate-600 dark:text-slate-300"
                dir="ltr"
                style={{ unicodeBidi: "isolate" }}
              >
                {derivedReplyIcon === "voice" ? (
                  <Mic
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : derivedReplyIcon === "callVoice" ? (
                  <Phone
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : derivedReplyIcon === "video" ? (
                  <Video
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : derivedReplyIcon === "image" ? (
                  <ImageIcon
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : derivedReplyIcon === "document" ? (
                  <File
                    size={12}
                    className="translate-y-[3px] shrink-0 text-slate-500 dark:text-slate-400"
                  />
                ) : null}
                <span
                  className={`min-w-0 truncate ${
                    hasPersian(resolvedReplyText) ? "font-fa" : ""
                  }`}
                  dir="auto"
                  style={{ unicodeBidi: "isolate" }}
                  dangerouslySetInnerHTML={{
                    __html: String(resolvedReplyHtml || ""),
                  }}
                />
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearReply?.();
                restoreComposerFocus();
              }}
              onPointerDown={(event) => {
                captureComposerFocus();
                if (!isDesktop) event.preventDefault();
              }}
              className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
              aria-label={t("Cancel reply")}
            >
              <Close size={20} className="icon-anim-pop" />
            </button>
          </div>
        </div>
      ) : null}
      {pendingVoiceMessage ? (
        <div className="rounded-2xl border border-brand-200/80 bg-brand-50/70 p-2 dark:border-brand-500/30 dark:bg-slate-950/70">
          <div className="flex items-start gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              <Mic size={20} className="icon-anim-sway" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[11px] font-semibold text-brand-700 dark:text-brand-200">{t("Voice message")}</span>
              <span className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {formatDuration(pendingVoiceMessage.durationSeconds || 0)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearPendingVoiceMessage?.();
                restoreComposerFocus();
              }}
              onPointerDown={(event) => {
                captureComposerFocus();
                if (!isDesktop) event.preventDefault();
              }}
              className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
              aria-label={t("Cancel voice message")}
            >
              <Close size={20} className="icon-anim-pop" />
            </button>
          </div>
        </div>
      ) : null}
      {pendingUploadFiles?.length ? (
        <div className="rounded-2xl border border-brand-200/80 bg-brand-50/70 p-2 dark:border-brand-500/30 dark:bg-slate-950/70">
          <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-brand-700 dark:text-brand-200">
            <span>
              {pendingUploadType === "media" ? t("Photo or Video") : t("Document")} (
              {pendingUploadFiles.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!fileUploadEnabled}
                onClick={() => {
                  if (!fileUploadEnabled) return;
                  if (pendingUploadType === "media") {
                    openFilePicker(mediaInputRef);
                  } else {
                    openFilePicker(documentInputRef);
                  }
                  restoreComposerFocus();
                }}
                onPointerDown={(event) => {
                  captureComposerFocus();
                  if (!isDesktop) event.preventDefault();
                }}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${
                  fileUploadEnabled
                    ? "border-brand-200/70 text-brand-700 hover:border-brand-300 hover:bg-brand-100 dark:border-brand-500/30 dark:text-brand-200 dark:hover:bg-brand-500/10"
                    : "cursor-not-allowed border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500"
                }`}
              >
                <Paperclip size={12} />{t("Add")}</button>
              <button
                type="button"
                onClick={() => {
                  onClearPendingUploads?.();
                  restoreComposerFocus();
                }}
                onPointerDown={(event) => {
                  captureComposerFocus();
                  if (!isDesktop) event.preventDefault();
                }}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200/70 px-2 py-0.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                <Close size={12} className="icon-anim-pop" />{t("Clear")}</button>
            </div>
          </div>
          <div className="chat-scroll grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {pendingUploadFiles.map((item) => {
              const forceDocPreview = pendingUploadType === "document";
              const isImage =
                !forceDocPreview && item.mimeType?.startsWith("image/");
              const isVideo =
                !forceDocPreview && item.mimeType?.startsWith("video/");
              return (
                <div
                  key={item.id}
                  className="relative overflow-hidden rounded-xl border border-brand-200/70 bg-white/90 p-2 text-[11px] dark:border-brand-500/30 dark:bg-slate-900/70"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onRemovePendingUpload?.(item.id);
                      restoreComposerFocus();
                    }}
                    onPointerDown={(event) => {
                      captureComposerFocus();
                      if (!isDesktop) event.preventDefault();
                    }}
                    className="absolute right-1 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-rose-200 bg-white/90 text-rose-600 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200"
                    aria-label={t("Remove file")}
                  >
                    <Close size={11} className="icon-anim-pop" />
                  </button>
                  {isImage ? (
                    <div className="mb-1 flex h-24 items-center justify-center rounded-md">
                      <img
                        src={item.previewUrl}
                        alt={item.name}
                        className="h-24 w-auto max-w-full rounded-md object-contain"
                      />
                    </div>
                  ) : isVideo ? (
                    <div className="relative mb-1 flex h-24 items-center justify-center rounded-md">
                      {item.previewUrl ? (
                        <video
                          src={item.previewUrl}
                          muted
                          playsInline
                          preload="auto"
                          onLoadedMetadata={handleVideoThumbLoadedMetadata}
                          onLoadedData={handleVideoThumbLoadedMetadata}
                          onCanPlay={handleVideoThumbLoadedMetadata}
                          className="h-24 w-auto max-w-full rounded-md object-contain"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-md bg-slate-200/80 dark:bg-slate-800/80" />
                      )}
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white">
                          <Play size={14} className="translate-x-px" />
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="mb-1 flex h-24 w-full items-center justify-center rounded-md bg-slate-100 text-brand-700 dark:bg-slate-800 dark:text-brand-200">
                      <File size={16} />
                    </div>
                  )}
                  <p className="truncate pr-5 text-slate-700 dark:text-slate-200">
                    {item.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {uploadError ? (
        <p className="text-xs text-rose-600 dark:text-rose-300">
          {localizeError(uploadError)}
        </p>
      ) : null}
      {emojiError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{t(emojiError)}</p>}
      {activeUploadProgress !== null ? (
        <div className="rounded-xl border border-brand-200/70 bg-brand-50/60 px-3 py-2 dark:border-brand-500/30 dark:bg-slate-950/70">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-brand-700 dark:text-brand-200">
            <span>{t("Uploading files...")}</span>
            <span>{Math.round(activeUploadProgress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-150"
              style={{ width: `${activeUploadProgress}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-row items-center gap-3">
        {!isRecording ? (
          <>
            <div className="relative" ref={uploadMenuRef}>
              <button
                type="button"
                ref={uploadButtonRef}
                disabled={uploadBusy}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}
                onPointerDown={(event) => {
                  captureComposerFocus();
                  if (!isDesktop) event.preventDefault();
                }}
                onClick={(event) => {
                  if (uploadBusy) return;
                  setFocusUploadMenu(isDesktop || event.detail === 0);
                  setShowUploadMenu((prev) => !prev);
                  restoreComposerFocus();
                }}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent bg-transparent transition ${
                  !uploadBusy
                    ? "text-brand-700 hover:border-brand-300 hover:bg-brand-100 hover:shadow-[0_0_16px_rgba(102,48,141,0.22)] dark:text-brand-200 dark:hover:border-brand-500/30 dark:hover:bg-brand-500/10"
                    : "cursor-not-allowed text-slate-400 dark:text-slate-500"
                }`}
                aria-label={t("Attach file")}
                aria-haspopup="menu"
                aria-expanded={Boolean(showUploadMenu && !uploadBusy)}
                aria-controls={showUploadMenu && !uploadBusy ? uploadMenuId : undefined}
              >
                <Paperclip size={18} className="icon-anim-sway" />
              </button>
              {showUploadMenu && !uploadBusy ? (
                <AnchoredMenu anchorRef={uploadButtonRef} onClose={closeUploadMenu} id={uploadMenuId} label={t("Attach file")} placement="top" align="start" autoFocus={focusUploadMenu}>
                  <button
                    type="button" role="menuitem"
                    onPointerDown={(event) => {
                      captureComposerFocus();
                      if (!isDesktop) event.preventDefault();
                    }}
                    onClick={() => {
                      openFilePicker(mediaInputRef);
                      setShowUploadMenu(false);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                  >
                    <ImageIcon size={18} className="shrink-0 text-brand-500 icon-anim-sway" />{t("Photo or Video")}</button>
                  {CAMERA_PICKERS.map(({ kind, label, Icon }) => (
                    <button
                      key={label}
                      type="button" role="menuitem"
                      onPointerDown={(event) => {
                        captureComposerFocus();
                        if (!isDesktop) event.preventDefault();
                      }}
                      onClick={() => openCameraPicker(kind === "photo" ? photoCaptureRef : videoCaptureRef)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                    >
                      <Icon size={18} className="shrink-0 text-brand-500" />{t(label)}
                    </button>
                  ))}
                  <button
                    type="button" role="menuitem"
                    onPointerDown={(event) => {
                      captureComposerFocus();
                      if (!isDesktop) event.preventDefault();
                    }}
                    onClick={() => {
                      openFilePicker(documentInputRef);
                      setShowUploadMenu(false);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                  >
                    <File size={18} className="shrink-0 text-brand-500 icon-anim-lift" />{t("Document")}</button>
                </AnchoredMenu>
              ) : null}
              {CAMERA_PICKERS.map(({ kind, label, accept }) => (
                <input
                  key={label}
                  ref={kind === "photo" ? photoCaptureRef : videoCaptureRef}
                  type="file"
                  accept={accept}
                  capture="environment"
                  aria-label={t(label)}
                  tabIndex={-1}
                  className="sr-only"
                  disabled={uploadBusy}
                  onChange={handleCameraSelection}
                  onCancel={cancelCameraSelection}
                />
              ))}
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="sr-only"
                disabled={uploadBusy}
                onChange={(event) => {
                  onUploadFilesSelected(
                    event.target.files,
                    "media",
                    pendingUploadType === "media",
                  );
                  event.target.value = "";
                  restoreComposerFocus();
                }}
              />
              <input
                ref={documentInputRef}
                type="file"
                multiple
                className="sr-only"
                disabled={uploadBusy}
                onChange={(event) => {
                  onUploadFilesSelected(
                    event.target.files,
                    "document",
                    pendingUploadType === "document",
                  );
                  event.target.value = "";
                  restoreComposerFocus();
                }}
              />
            </div>
            <div className="relative min-w-0 flex-1">
            <textarea
              ref={messageInputRef}
              name="message"
              rows={1}
              placeholder={t("Type a message")}
              aria-label={
                editTarget
                  ? t("Edit message")
                  : replyTarget
                  ? t("Reply to {value0}", { value0: replyTarget.displayName || replyTarget.username || "message" })
                  : t("Type a message")
              }
              value={messageValue}
                readOnly={submitting || !!scheduleDraft}
              maxLength={
                Number.isFinite(Number(messageMaxChars))
                  ? messageMaxChars
                  : undefined
              }
              lang={composerHasPersian ? "fa" : "en"}
              dir="auto"
              aria-controls={suggestions.length ? `mention-list-${activeChatId}` : undefined}
              aria-activedescendant={suggestions.length ? `mention-${activeChatId}-${mentionIndex}` : undefined}
              onCompositionStart={() => { composingRef.current = true; setMentionTerm(null); }}
              onCompositionEnd={(event) => { composingRef.current = false; if (!editTarget) setDraftError(!saveChatDraft(draftOwner, activeChatId, event.currentTarget.value, replyTarget)); }}
              onInput={(event) => {
                const value = event.currentTarget.value || "";
                setScheduledNotice(false);
                setMessageValue(value);
                if (!editTarget && !composingRef.current) setDraftError(!saveChatDraft(draftOwner, activeChatId, value, replyTarget));
                const prefix = value.slice(0, event.currentTarget.selectionStart);
                const match = prefix.match(/(?:^|\s)@([a-zA-Z0-9._]*)$/);
                setMentionTerm(match ? match[1] : null);
                setMentionIndex(0);
                applyTextareaSize({
                  textareaEl: event.currentTarget,
                  maxTextareaHeight,
                  composerEl: composerRef.current,
                  onComposerResize,
                  onComposerHeightChange,
                });
                if (typeof onMessageInput === "function") {
                  onMessageInput(value);
                }
              }}
              onFocus={() => onComposerFocusChange?.(true)}
              onBlur={() => onComposerFocusChange?.(false)}
              onKeyDown={(event) => {
                if (event.isComposing || composingRef.current) return;
                if (suggestions.length && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) {
                  event.preventDefault(); event.stopPropagation();
                  if (event.key === "Escape") setMentionTerm(null);
                  else if (event.key === "Enter") chooseMention(suggestions[mentionIndex]);
                  else setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
                  return;
                }
                if (!isDesktop) return;
                if (
                  event.key !== "Enter" ||
                  event.shiftKey ||
                  event.isComposing
                )
                  return;
                if (!canSubmitMessage) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              className={`chat-scroll block w-full min-w-0 resize-none rounded-2xl border border-brand-200 bg-white py-2 text-start text-base text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100 ${locale === "fa" ? "pl-12 pr-4" : "pl-4 pr-12"} ${
                composerHasPersian ? "font-fa" : ""
              }`}
              style={{
                minHeight: "44px",
                maxHeight: `${maxTextareaHeight}px`,
                unicodeBidi: "plaintext",
                whiteSpace: "pre-wrap",
                wordBreak: "normal",
                overflowWrap: "break-word",
                overflowX: "hidden",
              }}
            />
            <button ref={emojiButtonRef} type="button" aria-label={t("Choose emoji")} title={t("Choose emoji")}
              aria-haspopup="dialog" aria-expanded={emojiOpen} aria-controls={emojiOpen && EmojiPicker ? emojiPickerId : undefined}
              aria-busy={emojiLoading || undefined} disabled={submitting || !!scheduleDraft}
              onPointerDown={(event) => event.preventDefault()} onClick={toggleEmojiPicker}
              onKeyDown={(event) => { if (event.key === "Escape" && emojiOpen) { event.preventDefault(); event.stopPropagation(); setEmojiOpen(false); } }}
              className="absolute end-1 bottom-1 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-200">
              <SmilePlus size={21} className={emojiLoading ? "animate-pulse" : undefined} />
            </button>
            {emojiLoading && emojiOpen && <span role="status" className="sr-only">{t("Loading emojis…")}</span>}
            {emojiOpen && EmojiPicker && <EmojiPicker key={recordingContext} id={emojiPickerId} anchorRef={emojiButtonRef}
              owner={draftOwner} isDesktop={isDesktop} onClose={() => setEmojiOpen(false)} onSelect={selectEmoji} />}
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-brand-200 bg-white px-3 py-2 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-slate-900 dark:text-brand-200">
            <button type="button" onClick={gesture.cancel} disabled={voice.status === "stopping" || voice.status === "sending"} aria-label={t("Cancel recording")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-500/10"><Trash size={19} /></button>
            <span role="status" className="flex min-w-0 flex-1 items-center gap-2 text-sm tabular-nums"><span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500" /><span dir="ltr">{formatDuration(recordingMs / 1000)}</span><span className="truncate text-xs">{t(voice.status === "requesting" ? "Opening microphone…" : voice.status === "sending" ? "Sending…" : gesture.locked ? "Recording locked" : "Release to send; swipe up to lock")}</span></span>
            {gesture.active && !gesture.locked && <button type="button" onClick={gesture.lock} aria-label={t("Lock recording")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-brand-50 dark:hover:bg-brand-500/10"><Lock size={18} /></button>}
            {gesture.locked && voice.status === "recording" && <button type="button" onClick={() => { gesture.reset(); voice.stop("review"); }} aria-label={t("Review voice message")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-brand-50 dark:hover:bg-brand-500/10"><Pause size={18} /></button>}
          </div>
        )}
        {micMode || isRecording ? <RecordingButton mode={recordingMode} gesture={gesture} disabled={micDisabled} busy={isRecording && !gesture.active} onFocusCapture={captureComposerFocus} /> : <button
          type="submit" {...scheduleTrigger}
          onPointerDown={(event) => { captureComposerFocus(); scheduleTrigger.onPointerDown?.(event); if (!isDesktop) event.preventDefault(); }}
          onKeyDown={(event) => {
            scheduleTrigger.onKeyDown?.(event);
            if (canSchedule && ((event.altKey && event.key === "ArrowDown") || (event.shiftKey && event.key === "F10") || event.key === "ContextMenu")) {
              event.preventDefault(); event.stopPropagation(); openScheduling();
            }
          }}
          disabled={!canSubmitMessage || submitting || uploadBusy}
          aria-label={editTarget ? t("Save edit") : t("Send message")}
          aria-haspopup={canSchedule ? "dialog" : undefined} aria-expanded={canSchedule ? !!scheduleDraft : undefined}
          aria-keyshortcuts={canSchedule ? "Alt+ArrowDown" : undefined} aria-describedby={canSchedule ? scheduleHintId : undefined}
          style={{ touchAction: "none", WebkitTouchCallout: "none", userSelect: "none" }}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-70">
          {editTarget ? <Check className="icon-anim-slide" /> : <Send className="icon-anim-slide" />}
        </button>}
        {canSchedule && <span id={scheduleHintId} className="sr-only">{t("Hold to schedule. Keyboard: Alt + Down Arrow.")}</span>}
      </div>
    </form>
  );
}
