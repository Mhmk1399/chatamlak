import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, I18nProvider, Popover } from "react-aria-components";
import EmojiPicker from "emoji-picker-react";
import english from "emoji-picker-react/data/emojis-en";
import persian from "../../../i18n/emoji-fa.json";
import { t, useLocale } from "../../../i18n/locale.js";
import { Close } from "../../../icons/lucide.js";
import { localizeEmojiData } from "../../../utils/emojiLocale.js";
import { readEmojiPreferences, saveEmojiPreferences, withRecentEmoji } from "../../../utils/emojiPreferences.js";
import "./emoji-picker.css";

export default function EmojiPickerPopover({ anchorRef, owner, onClose, onSelect, isDesktop, id }) {
  const locale = useLocale();
  const popoverRef = useRef(null);
  const [preferences, setPreferences] = useState(() => readEmojiPreferences(owner));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    // Non-modal React Aria popovers close on blur, but blank chat areas do not
    // take focus. Capture outside pointers without blocking the clicked action.
    const closeOutside = (event) => {
      const path = event.composedPath();
      if (path.includes(popoverRef.current) || path.includes(anchorRef.current)) return;
      onClose();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [anchorRef, onClose]);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const categories = [
    { category: "suggested", name: t("Recently used") },
    { category: "smileys_people", name: t("Smileys and people") },
    { category: "animals_nature", name: t("Animals and nature") },
    { category: "food_drink", name: t("Food and drink") },
    { category: "travel_places", name: t("Travel and places") },
    { category: "activities", name: t("Activities") },
    { category: "objects", name: t("Objects") },
    { category: "symbols", name: t("Symbols") },
    { category: "flags", name: t("Flags") },
  ];
  // Rebuild only on locale changes; no query or message text leaves the device.
  const dataset = useMemo(() => localizeEmojiData(english, persian.annotations, [], locale), [locale]);
  const labels = {
    searchPlaceholder: t("Search emojis"), searchLabel: t("Search emojis"), searchClear: t("Clear search"),
    searchResultsNone: t("No emojis found"), searchResultsOne: t("One emoji found"), searchResultsMany: t("%n emojis found"),
    categoryNavigation: t("Emoji categories"), reactions: t("Reactions"), expandReactions: t("All emojis"),
    loading: t("Loading emojis…"), loadingError: t("Could not load emojis. Try again."), retryLoading: t("Try again"),
    skinToneNeutral: t("Default skin tone"), skinToneLight: t("Light skin tone"), skinToneMediumLight: t("Medium light skin tone"),
    skinToneMedium: t("Medium skin tone"), skinToneMediumDark: t("Medium dark skin tone"), skinToneDark: t("Dark skin tone"),
  };
  const updatePreferences = (next) => { setPreferences(next); saveEmojiPreferences(owner, next); };
  return <I18nProvider locale={locale === "fa" ? "fa-IR" : "en-US"}><Popover ref={popoverRef} isOpen triggerRef={anchorRef} onOpenChange={(open) => { if (!open) onClose(); }}
    placement="top start" offset={8} containerPadding={8} className="ouj-emoji-popover" isNonModal>
    <Dialog id={id} aria-label={t("Choose emoji")} className="ouj-emoji-dialog" dir={locale === "fa" ? "rtl" : "ltr"}>
      <header className="ouj-emoji-heading">
        <h3>{t("Emojis")}</h3>
        <button type="button" autoFocus={!isDesktop} onClick={onClose} aria-label={t("Close emoji picker")} className="ouj-emoji-close"><Close size={18} /></button>
      </header>
      <EmojiPicker className="ouj-emoji-picker" cssLayer="components" width="100%" height="min(390px, calc(100dvh - 150px))" emojiStyle="native"
        colorScheme={dark ? "dark" : "light"} dir={locale === "fa" ? "rtl" : "ltr"} lang={locale}
        emojiData={dataset} categories={categories} labels={labels} autoFocusSearch={isDesktop} keepSearchFocus
        previewConfig={{ showPreview: false }} suggestedEmojis={preferences.recent} skinTone={preferences.tone}
        onSkinToneChange={(tone) => updatePreferences({ ...preferences, tone })}
        onEmojiClick={(emoji) => { if (onSelect(emoji.emoji)) updatePreferences(withRecentEmoji(preferences, emoji.unified)); }} />
    </Dialog>
  </Popover></I18nProvider>;
}
