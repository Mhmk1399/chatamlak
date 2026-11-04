"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Archive,
  Chat,
  Folder,
  Megaphone,
  MessageCircleMore,
  Users,
} from "../../../icons/lucide.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";

export default function ConversationFilters({ variant = "tabs", onSelect }) {
  const locale = useLocale();
  const context = useMessagingContext();
  const navigationRef = useRef(null);
  const selectedRef = useRef(null);
  const rawPreferences = context?.preferences;
  const rawChats = context?.chats;
  const filter = context?.filter || "all";

  const { folders, counts } = useMemo(() => {
    const preferences = new Map(
      (rawPreferences || []).map((item) => [String(item.chat_id), item]),
    );
    const counts = new Map();
    const add = (key, count) => {
      counts.set(key, (counts.get(key) || 0) + count);
    };

    for (const chat of rawChats || []) {
      const preference = preferences.get(String(chat.id)) || {};
      const unread = Math.max(0, Math.floor(Number(chat.unread_count) || 0));
      if (Number(preference.archived)) {
        add("archived", unread);
        continue;
      }
      add("all", unread);
      add("unread", unread);
      add(chat.type, unread);
      if (preference.folder) add(`folder:${preference.folder}`, unread);
    }

    return {
      counts,
      folders: [
        ...new Set(
          (rawPreferences || []).map((item) => item.folder).filter(Boolean),
        ),
      ],
    };
  }, [rawPreferences, rawChats]);

  useEffect(() => {
    if (filter.startsWith("folder:") && !folders.includes(filter.slice(7))) {
      context?.setFilter?.("all");
    }
  }, [filter, folders, context?.setFilter]);

  const choices = [
    ["all", t("All"), Chat],
    ["unread", t("Unread"), MessageCircleMore],
    ["group", t("Groups"), Users],
    ["channel", t("Channels"), Megaphone],
    ["archived", t("Archived"), Archive],
    ...folders.map((folder) => [`folder:${folder}`, folder, Folder]),
  ];
  const numbers = useMemo(
    () => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en"),
    [locale],
  );

  // Scroll the selected chip inside its own rail/tab scroller without jumping
  // the entire page. scrollBy's physical x delta also handles RTL correctly.
  useEffect(() => {
    const container = navigationRef.current;
    const selected = selectedRef.current;
    if (!container || !selected) return;

    const frame = requestAnimationFrame(() => {
      const outer = container.getBoundingClientRect();
      const inner = selected.getBoundingClientRect();
      const margin = 8;
      const horizontal = variant !== "rail";
      const delta = horizontal
        ? inner.left < outer.left + margin
          ? inner.left - outer.left - margin
          : inner.right > outer.right - margin
            ? inner.right - outer.right + margin
            : 0
        : inner.top < outer.top + margin
          ? inner.top - outer.top - margin
          : inner.bottom > outer.bottom - margin
            ? inner.bottom - outer.bottom + margin
            : 0;

      if (Math.abs(delta) < 1) return;
      const reduceMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      container.scrollBy?.({
        [horizontal ? "left" : "top"]: delta,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [filter, variant, folders.length]);

  if (!context) return null;

  const isRail = variant === "rail";
  const choiceBase =
    "ouj-folder-choice group relative shrink-0 select-none outline-none transition-[background-color,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none";

  return (
    <nav
      ref={navigationRef}
      aria-label={t("Chat folders")}
      className={`ouj-folder-filters ouj-sidebar-filter-scroll ${
        isRail
          ? "ouj-folder-filters-rail flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto py-1"
          : "ouj-folder-filters-tabs relative flex w-full items-stretch gap-0.5 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-2 dark:border-slate-800"
      }`}
    >
      {choices.map(([value, label, Icon]) => {
        const active = filter === value;
        const count = counts.get(value) || 0;
        const countText = `${numbers.format(Math.min(99, count))}${count > 99 ? "+" : ""}`;

        return (
          <button
            ref={active ? selectedRef : null}
            key={value}
            type="button"
            aria-pressed={active}
            title={label}
            onClick={() => {
              if (!active) context.setFilter?.(value);
              onSelect?.();
            }}
            className={`${choiceBase} ${
              isRail
                ? "flex min-h-[61px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-medium leading-tight"
                : "flex min-h-[46px] items-center justify-center gap-1.5 whitespace-nowrap rounded-t-lg px-3.5 py-2 text-[13px] font-semibold"
            } ${
              active
                ? isRail
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
                  : "text-brand-700 dark:text-brand-300"
                : "text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
            }`}
          >
            {isRail && (
              <span className="relative flex shrink-0 items-center justify-center">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.1 : 1.8}
                  aria-hidden="true"
                  className="ouj-folder-icon"
                />
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900"
                    style={{ insetInlineEnd: "-0.75rem" }}
                  >
                    {countText}
                  </span>
                )}
              </span>
            )}

            <span className="ouj-folder-label max-w-full truncate" dir="auto">
              {label}
            </span>

            {!isRail && count > 0 && (
              <span
                aria-label={t("{count} unread messages", { count })}
                className={`ouj-folder-count inline-flex min-h-[19px] min-w-[19px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none ${
                  active
                    ? "bg-brand-500 text-white"
                    : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-100"
                }`}
              >
                {countText}
              </span>
            )}

            {!isRail && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-3 bottom-0 h-[3px] origin-center rounded-full bg-brand-500 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                  active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
                }`}
              />
            )}
            {isRail && count > 0 && (
              <span className="sr-only">
                {t("{count} unread messages", { count })}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
