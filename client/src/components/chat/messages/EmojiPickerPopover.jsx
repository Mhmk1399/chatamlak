import { memo, useEffect, useMemo, useState } from "react";
import { I18nProvider } from "react-aria-components";
import EmojiPicker from "emoji-picker-react";
import english from "emoji-picker-react/data/emojis-en";
import persian from "../../../i18n/emoji-fa.json";
import { t, useLocale } from "../../../i18n/locale.js";
import ToolDialog from "../tools/ToolDialog.jsx";
import { localizeEmojiData } from "../../../utils/emojiLocale.js";
import { readEmojiPreferences, saveEmojiPreferences, withRecentEmoji } from "../../../utils/emojiPreferences.js";
import "./emoji-picker.css";

const EmojiCatalog = memo(function EmojiCatalog({ owner, onSelect, isDesktop }) {
  const locale = useLocale();
  const [preferences, setPreferences] = useState(() => readEmojiPreferences(owner));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
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
  return <div className="ouj-emoji-sheet-content" dir={locale === "fa" ? "rtl" : "ltr"}>
    <EmojiPicker className="ouj-emoji-picker" cssLayer="components" width="100%" height="100%" emojiStyle="native"
      colorScheme={dark ? "dark" : "light"} dir={locale === "fa" ? "rtl" : "ltr"} lang={locale}
      emojiData={dataset} categories={categories} labels={labels} autoFocusSearch={isDesktop} keepSearchFocus
      previewConfig={{ showPreview: false }} suggestedEmojis={preferences.recent} skinTone={preferences.tone}
      onSkinToneChange={(tone) => updatePreferences({ ...preferences, tone })}
      onEmojiClick={(emoji) => { if (onSelect(emoji.emoji)) updatePreferences(withRecentEmoji(preferences, emoji.unified)); }} />
  </div>;
});

export default function EmojiPickerPopover({ owner, onClose, onSelect, isDesktop, id }) {
  const locale = useLocale();
  const [sheetSize, setSheetSize] = useState("half");
  useEffect(() => {
    // Clearing the picker's search may briefly leave focus on the body.
    const escape = (event) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      const targetDialog = event.target.closest?.('[role="dialog"]');
      if (targetDialog && targetDialog.id !== id) return;
      event.preventDefault(); event.stopPropagation(); onClose();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [id, onClose]);
  return <div onKeyDown={(event) => { if (event.key === "Enter") event.stopPropagation(); }}
    onPaste={(event) => event.stopPropagation()} onDrop={(event) => event.stopPropagation()}>
    <I18nProvider locale={locale === "fa" ? "fa-IR" : "en-US"}>
    <ToolDialog id={id} title="Emojis" label="Choose emoji" closeLabel="Close emoji picker" variant="sheet"
      sheetSize={sheetSize} onSheetSizeChange={setSheetSize} onClose={onClose} bodyClassName="ouj-emoji-sheet-body">
      <EmojiCatalog owner={owner} onSelect={onSelect} isDesktop={isDesktop} />
    </ToolDialog>
  </I18nProvider></div>;
}
