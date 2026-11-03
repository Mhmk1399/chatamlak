import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import Avatar from "../../common/Avatar.jsx";
import VerifiedBadge from "../../common/VerifiedBadge.jsx";
import UserRoleBadge from "../../common/UserRoleBadge.jsx";
import {
  Chat,
  LogOut,
  Pencil,
  Phone,
  Settings,
} from "../../../icons/lucide.js";
import { hasPersian } from "../../../utils/fontUtils.js";

export default function UserMenuButton({
  user = {},
  displayName = "",
  displayInitials = null,
  userColor = "#66308d",
  statusValue = "online",
  statusTextClass = "",
  mobileTab = "chats",
  onNavigateChats,
  onNavigateSettings,
  onNavigateCalls,
  onEnterEdit,
  canEdit = true,
  handleLogout,
  onOpenOwnProfile,
}) {
  useAppLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const resolvedName =
    displayName || user?.nickname || user?.username || "User";
  const resolvedStatus = statusValue || user?.status || "online";
  const resolvedStatusClass =
    statusTextClass ||
    (resolvedStatus === "online"
      ? "font-semibold text-brand-500 dark:text-brand-300"
      : "text-slate-500 dark:text-slate-400");

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const buttonBaseCls =
    "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm font-semibold text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 dark:text-slate-100 dark:hover:bg-brand-500/10 dark:hover:text-brand-200";
  const divider = <div className="my-1 h-px bg-slate-100 dark:bg-white/5" />;

  return (
    <div className="relative inline-flex items-center" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={localize("User menu")}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="group relative inline-flex items-center justify-center rounded-full transition hover:ring-2 hover:ring-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Avatar
          src={user?.avatarUrl}
          alt={resolvedName}
          name={resolvedName}
          color={userColor}
          initials={displayInitials}
          className="h-9 w-9 shrink-0 transition group-hover:ring-1 group-hover:ring-brand-300"
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={localize("User menu options")}
          className="absolute top-full start-0 mt-3 z-30 w-72 max-w-[90vw] overflow-hidden rounded-2xl border border-brand-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-brand-950/10 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100"
        >
          {/* User header: avatar + nickname + status */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenOwnProfile?.();
            }}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-brand-50 dark:hover:bg-brand-500/10"
          >
            <Avatar
              src={user?.avatarUrl}
              alt={resolvedName}
              name={resolvedName}
              color={userColor}
              initials={displayInitials}
              className="h-10 w-10 shrink-0 transition group-hover:ring-2 group-hover:ring-brand-300"
            />
            <div className="min-w-0 flex-1">
              <p
                className="flex items-center gap-0.5 truncate text-sm font-semibold text-brand-700 transition group-hover:text-brand-600 dark:text-brand-200 dark:group-hover:text-brand-300"
                dir="ltr"
              >
                <span
                  className={`truncate ${hasPersian(resolvedName) ? "font-fa" : ""}`}
                  dir="auto"
                >
                  {resolvedName}
                </span>
                {Boolean(user?.verified) && <VerifiedBadge size={14} />}
                <UserRoleBadge role={user?.role} size={14} />
              </p>
              <p className={`truncate text-xs ${resolvedStatusClass}`}>
                {resolvedStatus}
              </p>
            </div>
          </button>

          {divider}

          {/* Settings option (or Chats option when on settings page) */}
          {mobileTab === "settings" ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onNavigateChats?.();
              }}
              className={buttonBaseCls}
            >
              <Chat
                size={18}
                className="shrink-0 text-brand-500 icon-anim-drop"
              />{localize("Chats")}</button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onNavigateSettings?.();
              }}
              className={buttonBaseCls}
            >
              <Settings
                size={18}
                className="shrink-0 text-brand-500 icon-anim-spin-dir"
              />{localize("Settings")}</button>
          )}

          {/* Calls option (or Chats option when on calls page) */}
          {mobileTab === "calls" ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onNavigateChats?.();
              }}
              className={buttonBaseCls}
            >
              <Chat
                size={18}
                className="shrink-0 text-brand-500 icon-anim-drop"
              />{localize("Chats")}</button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onNavigateCalls?.();
              }}
              className={buttonBaseCls}
            >
              <Phone
                size={18}
                className="shrink-0 text-brand-500 icon-anim-bob"
              />{localize("Calls")}</button>
          )}

          {/* Edit button (for chats or calls list, not on settings page) */}
          {mobileTab !== "settings" ? (
            <button
              type="button"
              role="menuitem"
              disabled={!canEdit}
              onClick={() => {
                setIsOpen(false);
                onEnterEdit?.();
              }}
              className={`${buttonBaseCls} ${
                !canEdit
                  ? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-slate-700 dark:hover:text-slate-100"
                  : ""
              }`}
            >
              <Pencil
                size={18}
                className="shrink-0 text-brand-500 icon-anim-sway"
              />{localize("Edit")}</button>
          ) : null}

          {divider}

          {/* Log out button */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              handleLogout?.();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            <LogOut
              size={18}
              className="shrink-0 text-rose-500 icon-anim-slide"
            />{localize("Log out")}</button>
        </div>
      )}
    </div>
  );
}
