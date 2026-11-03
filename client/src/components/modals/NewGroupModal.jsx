import { tError as localizeError } from "../../i18n/locale.js";
import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Close,
  CloudSync,
  Copy,
  ImageIcon,
  LoaderCircle,
  Lock,
  Pencil,
  Refresh,
  SatelliteDish,
  Trash,
  UserPlus,
  Users,
} from "../../icons/lucide.js";
import { SongbirdIcon, TelegramIcon } from "../../icons/BrandIcons.jsx";
import { copyTextToClipboard } from "../../utils/clipboard.js";
import { getAvatarStyle } from "../../utils/avatarColor.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { useNameLimits } from "../../utils/nameLimits.js";
import ConfirmPasswordModal from "./ConfirmPasswordModal.jsx";
import Avatar from "../common/Avatar.jsx";
import UserRoleBadge from "../common/UserRoleBadge.jsx";
import VerifiedBadge from "../common/VerifiedBadge.jsx";
import Tooltip from "../common/Tooltip.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

export default function NewGroupModal({
  open,
  groupForm,
  setGroupForm,
  groupSearchQuery,
  setGroupSearchQuery,
  groupSearchResults,
  groupSearchLoading,
  selectedGroupMembers,
  setSelectedGroupMembers,
  groupError,
  setGroupError,
  creatingGroup,
  onCreate,
  onClose,
  title = "New group",
  submitLabel = "Create",
  avatarPreview = "",
  avatarColor = "#66308d",
  avatarName = "Group",
  onAvatarChange,
  onAvatarRemove,
  showAvatarField = false,
  hideSelectedMemberChips = false,
  fileUploadEnabled = true,
  showInviteManagement = false,
  currentInviteLink = "",
  regeneratingInviteLink = false,
  onRegenerateInvite,
  showRemoteChannelSettings = false,
  remoteChannelAvailable = true,
  remoteChannelTelegramAvailable = true,
  remoteChannelMediaStreamAllowed = false,
  remoteQueueSlot = null,
  entityLabel = "Group",
  onDeleteChat,
  chatId: _chatId = null,
  username: _username = "",
  extraFields = null,
  autoAddToggleSlot = null,
  showMemberSearch = true,
  addAllMembersSelected = false,
  onToggleAddAllMembers,
}) {
  useAppLocale();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [remoteSourceMenuOpen, setRemoteSourceMenuOpen] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const groupPhotoInputRef = useRef(null);
  const groupSearchInputRef = useRef(null);
  const remoteSourceButtonRef = useRef(null);
  const remoteSourceMenuRef = useRef(null);
  const { nicknameMax: NICKNAME_MAX, usernameMax: USERNAME_MAX } = useNameLimits();
  const ignoreRemoteSourceButtonClickRef = useRef(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);
  const remoteMenuShouldClose =
    !open ||
    !showRemoteChannelSettings ||
    groupForm.visibility === "private" ||
    !remoteChannelAvailable ||
    !groupForm.remoteChannelEnabled;

  useEffect(() => {
    if (!open || !remoteSourceMenuOpen) return undefined;
    const ownerDocument = remoteSourceMenuRef.current?.ownerDocument || document;
    const handleOutsideInteraction = (event) => {
      const menu = remoteSourceMenuRef.current;
      const button = remoteSourceButtonRef.current;
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      if (menu && (menu.contains(event.target) || path.includes(menu))) return;
      if (button && (button.contains(event.target) || path.includes(button))) {
        ignoreRemoteSourceButtonClickRef.current = true;
      }
      setRemoteSourceMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setRemoteSourceMenuOpen(false);
    };
    ownerDocument.addEventListener("pointerdown", handleOutsideInteraction, true);
    ownerDocument.addEventListener("mousedown", handleOutsideInteraction, true);
    ownerDocument.addEventListener("touchstart", handleOutsideInteraction, true);
    ownerDocument.addEventListener("focusin", handleOutsideInteraction, true);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener(
        "pointerdown",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener(
        "mousedown",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener(
        "touchstart",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener(
        "focusin",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, remoteSourceMenuOpen]);

  useEffect(() => {
    if (!remoteMenuShouldClose || !remoteSourceMenuOpen) return undefined;
    const timeoutId = window.setTimeout(() => setRemoteSourceMenuOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [remoteMenuShouldClose, remoteSourceMenuOpen]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const selectedMemberNames = new Set(
    selectedGroupMembers.map((member) => String(member?.username || "")),
  );
  const nicknameHasPersian = hasPersian(groupForm.nickname || "");
  const usernameHasPersian = hasPersian(groupForm.username || "");
  const groupSearchHasPersian = hasPersian(groupSearchQuery || "");
  const remoteSourceHasPersian = hasPersian(groupForm.remoteChannelSource || "");
  const remoteStatus = groupForm.remoteChannelStatus || null;
  const remoteSource = remoteStatus?.source || null;
  const remoteLastError =
    remoteSource?.lastError || remoteStatus?.error || "";
  const remoteChannelEnabled = Boolean(groupForm.remoteChannelEnabled);
  const remoteChannelSyncMetadata = Boolean(
    groupForm.remoteChannelSyncMetadata,
  );
  const privateChatEnabled = groupForm.visibility === "private";
  const memberInvitesLocked = !privateChatEnabled;
  const memberInvitesEnabled =
    memberInvitesLocked || groupForm.allowMemberInvites !== false;
  const remoteChannelLocked = privateChatEnabled || !remoteChannelAvailable;
  const effectiveRemoteChannelEnabled =
    privateChatEnabled ? false : remoteChannelEnabled;
  const remoteChannelStreamMediaLocked = !fileUploadEnabled || !remoteChannelMediaStreamAllowed;
  const remoteChannelStreamMedia =
    fileUploadEnabled &&
    Boolean(groupForm.remoteChannelStreamMedia);
  const remoteProviderLabel =
    groupForm.remoteChannelProvider === "songbird" ? "Songbird" : "Telegram";
  const remoteSourcePlaceholder =
    groupForm.remoteChannelProvider === "songbird"
      ? "https://example.com/invite/channelname"
      : "@channel or https://t.me/channel";
  const privacyOptionClass = (locked = false) =>
    `flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-start text-sm font-semibold transition ${
      locked
        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500"
        : "border-brand-200/70 bg-white/90 text-brand-700 hover:border-brand-300 hover:bg-brand-50 hover:shadow-[0_0_18px_rgba(102,48,141,0.18)] dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-brand-200 dark:hover:bg-brand-500/10"
    }`;
  const renderSwitch = (enabled, muted = false) => (
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
        enabled && muted
          ? "justify-end bg-brand-300 dark:bg-brand-500/50"
          : enabled
          ? "justify-end bg-brand-600"
          : "justify-start bg-slate-300 dark:bg-slate-700"
      }`}
      aria-hidden="true"
    >
      <span className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" />
    </span>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-140 flex items-center justify-center bg-black/40 px-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-group-modal-title"
          className="app-scroll max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-brand-100/70 bg-white p-6 shadow-xl dark:border-brand-500/30 dark:bg-slate-950"
        >
          <div className="flex items-center justify-between">
            <h3 id="new-group-modal-title" className="text-lg font-semibold text-brand-700 dark:text-brand-200">
              {localize(title)}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
            >
              <Close size={18} className="icon-anim-pop" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {showAvatarField ? (
              <div className="py-2">
                <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {localize(entityLabel)}{" "}{localize("photo")}</p>
                <div className="mt-3 flex justify-center">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (!fileUploadEnabled) return;
                        groupPhotoInputRef.current?.click();
                      }}
                      disabled={!fileUploadEnabled}
                      className={`group relative h-14 w-14 overflow-hidden rounded-full border-2 transition focus:outline-hidden focus:ring-2 focus:ring-brand-300/70 ${
                        fileUploadEnabled
                          ? "cursor-pointer border-brand-200 hover:border-brand-300 hover:shadow-lg dark:border-brand-500/30 dark:hover:border-brand-400/60"
                          : "cursor-not-allowed border-slate-300 opacity-70 dark:border-slate-700"
                      }`}
                      aria-label={localize("Change {value0} photo", { value0: localize(entityLabel.toLowerCase()) })}
                    >
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt={localize("{value0} avatar preview", { value0: localize(entityLabel) })}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span
                          className={`flex h-full w-full items-center justify-center text-lg font-bold ${hasPersian(getAvatarInitials(avatarName || "G")) ? "font-fa" : ""}`}
                          style={getAvatarStyle(avatarColor || "#66308d")}
                        >
                          {getAvatarInitials(avatarName || "G")}
                        </span>
                      )}
                      {fileUploadEnabled ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                          <Pencil size={18} className="icon-anim-pop" />
                        </span>
                      ) : null}
                    </button>
                    <input
                      ref={groupPhotoInputRef}
                      id="groupPhotoInput"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={onAvatarChange}
                      disabled={!fileUploadEnabled}
                    />
                    {avatarPreview ? (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onAvatarRemove?.();
                        }}
                        className="absolute -right-2 -top-2 z-10 inline-flex h-6 min-h-6 w-6 min-w-6 flex-none items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-0 text-rose-600 shadow-md transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-lg dark:border-rose-500/30 dark:bg-rose-900 dark:text-rose-200 dark:hover:bg-rose-800"
                        aria-label={localize("Remove {value0} photo", { value0: localize(entityLabel.toLowerCase()) })}
                      >
                        <Trash size={12} className="icon-anim-sway" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {localize(entityLabel)}{" "}{localize("nickname")}</label>
              <div className="relative mt-2">
                <input
                  value={groupForm.nickname}
                  onChange={(event) => {
                    setGroupForm((prev) => ({
                      ...prev,
                      nickname: event.target.value,
                    }));
                    setGroupError("");
                  }}
                  maxLength={NICKNAME_MAX}
                  placeholder={localize("My {value0}", { value0: localize(entityLabel.toLowerCase()) })}
                  lang={nicknameHasPersian ? "fa" : "en"}
                  dir={nicknameHasPersian ? "rtl" : "ltr"}
                  className={`w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                    nicknameHasPersian ? "font-fa text-end" : "text-start"
                  }`}
                  style={{ unicodeBidi: "plaintext" }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500">
                  {String(groupForm.nickname || "").length}/{NICKNAME_MAX}
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {localize(entityLabel)}{" "}{localize("username")}</label>
              <div className="relative mt-2">
                <input
                  value={groupForm.username}
                  onChange={(event) => {
                    setGroupForm((prev) => ({
                      ...prev,
                      username: event.target.value.toLowerCase(),
                    }));
                    setGroupError("");
                  }}
                  maxLength={USERNAME_MAX}
                  placeholder={`my${entityLabel.toLowerCase()}`}
                  lang={usernameHasPersian ? "fa" : "en"}
                  dir={usernameHasPersian ? "rtl" : "ltr"}
                  className={`w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                    usernameHasPersian ? "font-fa text-end" : "text-start"
                  }`}
                  style={{ unicodeBidi: "plaintext" }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500">
                  {String(groupForm.username || "").length}/{USERNAME_MAX}
                </span>
              </div>
            </div>

            {extraFields}

            <div className="rounded-2xl border border-brand-200 p-3 dark:border-brand-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{localize("Privacy")}</p>
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={privateChatEnabled}
                  onClick={() =>
                    setGroupForm((prev) => ({
                      ...prev,
                      visibility:
                        prev.visibility === "private" ? "public" : "private",
                      allowMemberInvites: true,
                      remoteChannelEnabled:
                        prev.visibility === "private"
                          ? prev.remoteChannelEnabled
                          : false,
                    }))
                  }
                  className={privacyOptionClass()}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Lock size={18} className="shrink-0 icon-anim-bob" />
                    <span className="truncate">{localize("Private {entity}", { entity: localize(entityLabel) })}</span>
                  </span>
                  {renderSwitch(privateChatEnabled)}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={memberInvitesEnabled}
                  disabled={memberInvitesLocked}
                  onClick={() => {
                    if (memberInvitesLocked) return;
                    setGroupForm((prev) => ({
                      ...prev,
                      allowMemberInvites: prev.allowMemberInvites === false,
                    }));
                  }}
                  className={privacyOptionClass(memberInvitesLocked)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <UserPlus size={18} className="shrink-0 icon-anim-pop" />
                    <span className="truncate">{localize("Members Can Invite")}</span>
                  </span>
                  {renderSwitch(memberInvitesEnabled, memberInvitesLocked)}
                </button>
              </div>
            </div>

            {showInviteManagement ? (
              <div className="rounded-2xl border border-brand-200 p-3 dark:border-brand-500/30">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{localize("Invite link")}</p>
                {onRegenerateInvite ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{localize("Regenerating creates a new link and expires the previous one.")}</p>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    const value = String(currentInviteLink || "");
                    if (!value) return;
                    await copyTextToClipboard(value);
                    setInviteLinkCopied(true);
                    setTimeout(() => setInviteLinkCopied(false), 1500);
                  }}
                  disabled={!currentInviteLink}
                  className="mt-2 flex w-full items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/70 p-3 text-start text-xs text-brand-800 transition hover:border-brand-300 hover:bg-brand-50 focus:outline-hidden focus:ring-2 focus:ring-brand-300/60 disabled:cursor-default disabled:opacity-70 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/15"
                  aria-label={localize("Copy invite link")}
                >
                  <span className="min-w-0 flex-1 break-all">
                    {currentInviteLink || localize("No invite link available.")}
                  </span>
                  {currentInviteLink ? (
                    <span className="ml-1 shrink-0 text-brand-600 dark:text-brand-400">
                      {inviteLinkCopied ? <Check size={14} /> : <Copy size={14} />}
                    </span>
                  ) : null}
                </button>
                {onRegenerateInvite ? (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Tooltip
                      label={
                        privateChatEnabled
                          ? localize("Regenerate invite link")
                          : localize("Private chats can regenerate invite links")
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!privateChatEnabled) return;
                          onRegenerateInvite();
                        }}
                        disabled={!privateChatEnabled || regeneratingInviteLink}
                        className="inline-flex h-8 items-center gap-2 rounded-full border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50 hover:shadow-[0_0_14px_rgba(102,48,141,0.2)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-brand-200 dark:hover:bg-brand-500/10"
                      >
                        {regeneratingInviteLink ? (
                          <LoaderCircle size={12} className="animate-spin" />
                        ) : (
                          <Refresh size={12} className="icon-anim-spin-dir" />
                        )}{localize("Regenerate")}</button>
                    </Tooltip>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showRemoteChannelSettings ? (
              <div className="rounded-2xl border border-brand-200 p-3 dark:border-brand-500/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{localize("Connection")}</p>
                  {groupForm.remoteChannelLoading ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <LoaderCircle size={14} className="animate-spin text-brand-500" />{localize("Loading...")}</span>
                  ) : null}
                </div>
                {!groupForm.remoteChannelLoading && remoteLastError ? (
                  <p className="mt-2 wrap-break-word text-xs text-rose-600 dark:text-rose-200">
                    {localizeError(remoteLastError)}
                  </p>
                ) : null}
                {!groupForm.remoteChannelLoading ? (
                  <div className="mt-3">
                    <button
                    type="button"
                    role="switch"
                    aria-checked={effectiveRemoteChannelEnabled}
                    disabled={remoteChannelLocked}
                    onClick={() => {
                      if (remoteChannelLocked) return;
                      setRemoteSourceMenuOpen(false);
                      setGroupForm((prev) => ({
                        ...prev,
                        remoteChannelEnabled: !prev.remoteChannelEnabled,
                      }));
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-start text-sm font-semibold transition ${
                      remoteChannelLocked
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500"
                        : "border-brand-200/70 bg-white/90 text-brand-700 hover:border-brand-300 hover:bg-brand-50 hover:shadow-[0_0_18px_rgba(102,48,141,0.18)] dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-brand-200 dark:hover:bg-brand-500/10"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <SatelliteDish size={18} className="icon-anim-sway" />{localize("Remote Channel")}</span>
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                        effectiveRemoteChannelEnabled
                          ? "justify-end bg-brand-600"
                          : "justify-start bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" />
                    </span>
                  </button>
                </div>
                ) : null}
                {effectiveRemoteChannelEnabled ? (
                  <div className="mt-3 space-y-3">
                    <div className="relative">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{localize("Source")}</label>
                      <button
                        ref={remoteSourceButtonRef}
                        type="button"
                        onClick={() => {
                          if (ignoreRemoteSourceButtonClickRef.current) {
                            ignoreRemoteSourceButtonClickRef.current = false;
                            return;
                          }
                          setRemoteSourceMenuOpen((current) => !current);
                        }}
                        className="relative mt-2 flex w-full items-center rounded-2xl border border-brand-200 bg-white px-4 py-3 pr-12 text-start text-sm font-semibold text-slate-700 outline-hidden transition hover:border-brand-300 hover:bg-brand-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-brand-500/10"
                        aria-expanded={remoteSourceMenuOpen}
                        aria-haspopup="listbox"
                      >
                        <span className="flex items-center gap-2">
                          {groupForm.remoteChannelProvider === "songbird"
                            ? <SongbirdIcon size={16} />
                            : <TelegramIcon size={16} className="shrink-0" />}
                          {remoteProviderLabel}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`absolute right-4 top-1/2 -translate-y-1/2 text-brand-500 transition-transform ${
                            remoteSourceMenuOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {remoteSourceMenuOpen ? (
                        <div
                          ref={remoteSourceMenuRef}
                          className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-brand-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-brand-950/10 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <Tooltip
                            label={!remoteChannelTelegramAvailable ? localize("Telegram is not configured on this server") : ""}
                            className="w-full"
                          >
                            <button
                              type="button"
                              disabled={!remoteChannelTelegramAvailable}
                              onClick={() => {
                                if (!remoteChannelTelegramAvailable) return;
                                setRemoteSourceMenuOpen(false);
                                setGroupForm((prev) => ({
                                  ...prev,
                                  remoteChannelProvider: "telegram",
                                  remoteChannelSource: "",
                                }));
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start transition ${
                                remoteChannelTelegramAvailable
                                  ? "hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                                  : "cursor-not-allowed opacity-40"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <TelegramIcon size={16} className="shrink-0" />{localize("Telegram")}</span>
                              {(groupForm.remoteChannelProvider === "telegram" ||
                                !groupForm.remoteChannelProvider) && remoteChannelTelegramAvailable ? (
                                <span className="h-2 w-2 rounded-full bg-brand-600" />
                              ) : null}
                            </button>
                          </Tooltip>
                          <button
                            type="button"
                            onClick={() => {
                              setRemoteSourceMenuOpen(false);
                              setGroupForm((prev) => ({
                                ...prev,
                                remoteChannelProvider: "songbird",
                                remoteChannelSource: "",
                              }));
                            }}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                          >
                            <span className="flex items-center gap-2">
                              <SongbirdIcon size={16} />{localize("Songbird")}</span>
                            {groupForm.remoteChannelProvider === "songbird" ? (
                              <span className="h-2 w-2 rounded-full bg-brand-600" />
                            ) : null}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{localize("Target Channel")}</label>
                      <input
                        value={groupForm.remoteChannelSource || ""}
                        onChange={(event) => {
                          setGroupForm((prev) => ({
                            ...prev,
                            remoteChannelSource: event.target.value,
                          }));
                          setGroupError("");
                        }}
                        placeholder={remoteSourcePlaceholder}
                        lang={remoteSourceHasPersian ? "fa" : "en"}
                        dir={remoteSourceHasPersian ? "rtl" : "ltr"}
                        className={`mt-2 w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                          remoteSourceHasPersian
                            ? "font-fa text-end"
                            : "text-start"
                        }`}
                        style={{ unicodeBidi: "plaintext" }}
                      />
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={remoteChannelSyncMetadata}
                      onClick={() =>
                        setGroupForm((prev) => ({
                          ...prev,
                          remoteChannelSyncMetadata:
                            !prev.remoteChannelSyncMetadata,
                        }))
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-brand-200/70 bg-white/90 px-4 py-3 text-start text-sm font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50 hover:shadow-[0_0_18px_rgba(102,48,141,0.18)] dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-brand-200 dark:hover:bg-brand-500/10"
                    >
                      <span className="flex items-center gap-3">
                        <CloudSync size={18} className="icon-anim-sway" />{localize("Sync Channel Metadata")}</span>
                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                          remoteChannelSyncMetadata
                            ? "justify-end bg-brand-600"
                            : "justify-start bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" />
                      </span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={remoteChannelStreamMedia}
                      disabled={remoteChannelStreamMediaLocked}
                      onClick={() => {
                        if (remoteChannelStreamMediaLocked) return;
                        setGroupForm((prev) => ({
                          ...prev,
                          remoteChannelStreamMedia:
                            !prev.remoteChannelStreamMedia,
                        }));
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-start text-sm font-semibold transition ${
                        !remoteChannelStreamMediaLocked
                          ? "border-brand-200/70 bg-white/90 text-brand-700 hover:border-brand-300 hover:bg-brand-50 hover:shadow-[0_0_18px_rgba(102,48,141,0.18)] dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-brand-200 dark:hover:bg-brand-500/10"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <ImageIcon size={18} className="icon-anim-pop" />{localize("Stream Media Files")}</span>
                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                          remoteChannelStreamMedia
                            ? "justify-end bg-brand-600"
                            : "justify-start bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" />
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showRemoteChannelSettings && remoteQueueSlot ? remoteQueueSlot : null}

            {showMemberSearch ? (
            <div className="rounded-2xl border border-brand-200 p-3 dark:border-brand-500/30">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{localize("Add Members")}</p>
              </div>
              {autoAddToggleSlot ? <div className="mt-2">{autoAddToggleSlot}</div> : null}
              <div className="relative mt-2">
                <input
                  ref={groupSearchInputRef}
                  value={groupSearchQuery}
                  onChange={(event) => {
                    setGroupSearchQuery(event.target.value);
                    setGroupError("");
                  }}
                  placeholder={localize("username")}
                  disabled={addAllMembersSelected}
                  lang={groupSearchHasPersian ? "fa" : "en"}
                  dir={groupSearchHasPersian ? "rtl" : "ltr"}
                  className={`w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 ${onToggleAddAllMembers ? "pr-24" : "pr-14"} text-sm text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                    groupSearchHasPersian ? "font-fa text-end" : "text-start"
                  }`}
                  style={{ unicodeBidi: "plaintext" }}
                />
                {groupSearchQuery.trim() ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setGroupSearchQuery("")}
                    className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-rose-600 transition hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.22)] dark:text-rose-200 dark:hover:bg-rose-500/10"
                    aria-label={localize("Clear member search")}
                  >
                    <Close size={16} className="icon-anim-pop" />
                  </button>
                ) : onToggleAddAllMembers ? (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleAddAllMembers();
                      setGroupError("");
                    }}
                    className={`absolute right-2 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-2xl border px-2 text-[11px] font-semibold transition ${
                      addAllMembersSelected
                        ? "border-brand-500 bg-brand-600 text-white hover:bg-brand-500"
                        : "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20"
                    }`}
                    aria-pressed={addAllMembersSelected}
                  >
                    <Users size={14} />
                    {addAllMembersSelected ? localize("All selected") : localize("Add all")}
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {groupSearchResults.length ? (
                  <div className="app-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
                    {groupSearchResults.map((result) => {
                      const selected = selectedMemberNames.has(result.username);
                      const label = result.nickname || result.username;
                      const avatarInitials = getAvatarInitials(label);
                      return (
                        <button
                          key={result.username}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            if (selected) {
                              setSelectedGroupMembers((prev) =>
                                prev.filter(
                                  (member) =>
                                    member.username !== result.username,
                                ),
                              );
                              groupSearchInputRef.current?.focus?.();
                              return;
                            }
                            setSelectedGroupMembers((prev) => [
                              ...prev,
                              result,
                            ]);
                            setGroupSearchQuery("");
                            groupSearchInputRef.current?.focus?.();
                          }}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-start text-sm font-medium transition ${
                            selected
                              ? "border-brand-500 border-2 bg-brand-50 text-brand-900 shadow-md dark:border-brand-400 dark:bg-brand-500/20 dark:text-brand-100"
                              : "border-brand-100/70 bg-white/80 text-slate-700 hover:border-brand-300 dark:border-brand-500/30 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/50"
                          }`}
                        >
                          <Avatar
                            src={result.avatar_url}
                            alt={localize(label)}
                            name={label}
                            color={result.color || "#66308d"}
                            initials={avatarInitials}
                            showOnlineBadge={
                              String(result.status || "").toLowerCase() ===
                              "online"
                            }
                            className="h-8 w-8"
                          />
                          <div className="min-w-0">
                            <Tooltip label={localize(label)} asChild>
                              <p
                                className="flex items-center gap-0.5 truncate font-semibold"
                                dir="ltr"
                              >
                                <span className={`truncate ${hasPersian(label) ? "font-fa" : ""}`} dir="auto">{localize(label)}</span>
                                {Boolean(result.verified) && <VerifiedBadge size={14} />}
                                <UserRoleBadge role={result.role} size={14} />
                              </p>
                            </Tooltip>
                            <p
                              className="truncate text-xs text-slate-500 dark:text-slate-400"
                              dir="auto"
                            >
                              @{result.username}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : groupSearchLoading ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{localize("Searching...")}</p>
                ) : groupSearchQuery.trim() ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{localize("No users found.")}</p>
                ) : null}
              </div>
              {selectedGroupMembers.length && !hideSelectedMemberChips ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedGroupMembers.map((member) => {
                    const label = member.nickname || member.username;
                    const initials = getAvatarInitials(label);
                    return (
                      <button
                        key={`member-chip-${member.username}`}
                        type="button"
                        onClick={() =>
                          setSelectedGroupMembers((prev) =>
                            prev.filter(
                              (item) => item.username !== member.username,
                            ),
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
                      >
                        <Avatar
                          src={member.avatar_url}
                          alt={localize(label)}
                          name={label}
                          color={member.color || "#66308d"}
                          initials={initials}
                          className="h-4 w-4 text-[9px]"
                        />
                        <Tooltip label={member.username} asChild>
                          <span className="max-w-[160px] truncate" dir="auto">
                            @{member.username}
                          </span>
                        </Tooltip>
                        <Close size={12} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            ) : null}
          </div>

          {groupError ? (
            <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
              {localizeError(groupError)}
            </p>
          ) : null}

          {onDeleteChat ? (
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50"
            >
              <Trash size={16} className="icon-anim-sway" />{localize("Delete")}{" "}{localize(entityLabel.toLowerCase())}
            </button>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_0_14px_rgba(148,163,184,0.2)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70"
            >{localize("Cancel")}</button>
            <button
              type="button"
              onClick={onCreate}
              disabled={creatingGroup}
              className="inline-flex min-w-[88px] items-center justify-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-70"
            >
              {creatingGroup ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" />{localize("Saving...")}</>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </div>
      </div>

      <ConfirmPasswordModal
        open={deleteModalOpen}
        title={localize("Delete {value0}", { value0: localize(entityLabel.toLowerCase()) })}
        description={localize("This permanently deletes the {value0}, removes all members, and erases all messages.", { value0: localize(entityLabel.toLowerCase()) })}
        confirmLabel={localize("Continue")}
        deleteLabel={localize("Delete {value0}", { value0: localize(entityLabel.toLowerCase()) })}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={async (password) => {
          await onDeleteChat?.(password);
        }}
      />
    </>,
    document.body,
  );
}
