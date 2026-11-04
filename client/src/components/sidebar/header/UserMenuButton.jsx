"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  t as localize,
  useLocale as useAppLocale,
} from "../../../i18n/locale.js";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import {
  Chat,
  Folder,
  LogOut,
  Menu,
  Pencil,
  Phone,
  Settings,
} from "../../../icons/lucide.js";
import { hasPersian } from "../../../utils/fontUtils.js";
import AnchoredMenu from "../../common/AnchoredMenu.jsx";
import Avatar from "../../common/Avatar.jsx";
import VerifiedBadge from "../../common/VerifiedBadge.jsx";
import UserRoleBadge from "../../common/UserRoleBadge.jsx";

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
  triggerVariant = "avatar",
}) {
  useAppLocale();
  const messaging = useMessagingContext();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuContentRef = useRef(null);
  const menuId = useId();

  const resolvedName =
    displayName || user?.nickname || user?.username || "User";
  const resolvedStatus = statusValue || user?.status || "online";
  const resolvedStatusClass =
    statusTextClass ||
    (resolvedStatus === "online"
      ? "font-semibold text-brand-500 dark:text-brand-300"
      : "text-slate-500 dark:text-slate-400");

  const closeMenu = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() =>
        buttonRef.current?.focus({ preventScroll: true }),
      );
    }
  }, []);

  // A navigation change should never leave an account menu open over the next panel.
  useEffect(() => setIsOpen(false), [mobileTab]);

  // Focus enters the menu on open. The menu remains fully usable without a mouse.
  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = requestAnimationFrame(() => {
      menuContentRef.current
        ?.querySelector('[role="menuitem"]:not(:disabled)')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleMenuKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = Array.from(
      event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'),
    );
    if (!options.length) return;
    const index = options.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % options.length
            : index < 0
              ? options.length - 1
              : (index - 1 + options.length) % options.length;
    event.preventDefault();
    event.stopPropagation();
    options[next]?.focus({ preventScroll: true });
  };

  const runAction = (callback) => {
    closeMenu(false);
    callback?.();
  };

  const menuItemBase =
    "group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-[13px] font-medium outline-none transition-[background-color,color,transform] duration-150 active:scale-[0.985] focus-visible:bg-brand-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:focus-visible:bg-brand-500/10 motion-reduce:transform-none motion-reduce:transition-none";
  const menuItemNormal =
    "text-slate-700 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-100 dark:hover:bg-brand-500/10 dark:hover:text-brand-200";
  const menuIconClass = "h-[19px] w-[19px] shrink-0 text-brand-500";

  const menuEntries = [
    ...(!["chats", "chat"].includes(mobileTab)
      ? [
          {
            key: "chats",
            label: localize("Chats"),
            Icon: Chat,
            action: onNavigateChats,
          },
        ]
      : []),
    ...(mobileTab !== "calls"
      ? [
          {
            key: "calls",
            label: localize("Calls"),
            Icon: Phone,
            action: onNavigateCalls,
          },
        ]
      : []),
    ...(mobileTab !== "settings"
      ? [
          {
            key: "settings",
            label: localize("Settings"),
            Icon: Settings,
            action: onNavigateSettings,
          },
        ]
      : []),
  ];

  return (
    <div className="relative inline-flex items-center justify-center">
      <button
        ref={buttonRef}
        type="button"
        aria-label={localize("User menu")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        title={localize("User menu")}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className={`group relative inline-flex h-11 w-11 shrink-0 items-center justify-center outline-none transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-brand-500 motion-reduce:transform-none motion-reduce:transition-none ${
          triggerVariant === "navigation"
            ? "rounded-xl text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
            : "rounded-full hover:ring-2 hover:ring-brand-400"
        } ${
          isOpen
            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
            : ""
        }`}
      >
        {triggerVariant === "navigation" ? (
          <Menu size={23} strokeWidth={1.9} aria-hidden="true" />
        ) : (
          <Avatar
            src={user?.avatarUrl}
            alt={resolvedName}
            name={resolvedName}
            color={userColor}
            initials={displayInitials}
            className="h-9 w-9 shrink-0 transition-shadow duration-150 group-hover:ring-1 group-hover:ring-brand-300"
          />
        )}
      </button>

      {isOpen && (
        <AnchoredMenu
          anchorRef={buttonRef}
          onClose={closeMenu}
          id={menuId}
          label={localize("User menu options")}
          align="start"
          variant="account"
        >
          <div
            ref={menuContentRef}
            onKeyDown={handleMenuKeyDown}
            className="min-w-0 w-full space-y-0.5 p-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onOpenOwnProfile)}
              className="group flex min-h-[68px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start outline-none transition-colors duration-150 hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-brand-500/10 dark:focus-visible:bg-brand-500/10 motion-reduce:transition-none"
            >
              <Avatar
                src={user?.avatarUrl}
                alt={resolvedName}
                name={resolvedName}
                color={userColor}
                initials={displayInitials}
                className="h-11 w-11 shrink-0 transition-shadow group-hover:ring-2 group-hover:ring-brand-300"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-200">
                  <span
                    className={`min-w-0 truncate ${hasPersian(resolvedName) ? "font-fa" : ""}`}
                    dir="auto"
                  >
                    {resolvedName}
                  </span>
                  {Boolean(user?.verified) && (
                    <span className="shrink-0">
                      <VerifiedBadge size={14} />
                    </span>
                  )}
                  <span className="shrink-0">
                    <UserRoleBadge role={user?.role} size={14} />
                  </span>
                </span>
                <span
                  className={`truncate text-xs ${resolvedStatusClass}`}
                  dir="auto"
                >
                  {resolvedStatus}
                </span>
              </span>
            </button>

            <div
              role="separator"
              className="mx-2 my-1.5 h-px bg-slate-100 dark:bg-white/5"
            />

            {menuEntries.map(({ key, label, Icon, action }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => runAction(action)}
                className={`${menuItemBase} ${menuItemNormal}`}
              >
                <Icon className={menuIconClass} size={19} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {label}
                </span>
              </button>
            ))}

            {messaging && (
              <button
                type="button"
                role="menuitem"
                className={`${menuItemBase} ${menuItemNormal}`}
                onClick={() => runAction(() => messaging.setPanel?.("Devices"))}
              >
                <Folder
                  size={19}
                  className={menuIconClass}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {localize("Chat tools")}
                </span>
              </button>
            )}

            {mobileTab !== "settings" && (
              <button
                type="button"
                role="menuitem"
                disabled={!canEdit}
                onClick={() => runAction(onEnterEdit)}
                className={`${menuItemBase} ${menuItemNormal} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent`}
              >
                <Pencil
                  size={19}
                  className={menuIconClass}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {localize("Edit")}
                </span>
              </button>
            )}

            <div
              role="separator"
              className="mx-2 my-1.5 h-px bg-slate-100 dark:bg-white/5"
            />

            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(handleLogout)}
              className={`${menuItemBase} text-rose-600 hover:bg-rose-50 focus-visible:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10 dark:focus-visible:bg-rose-500/10`}
            >
              <LogOut
                size={19}
                className="h-[19px] w-[19px] shrink-0 text-rose-500"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {localize("Log out")}
              </span>
            </button>
          </div>
        </AnchoredMenu>
      )}
    </div>
  );
}
