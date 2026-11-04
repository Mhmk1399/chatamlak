// CLDR annotations are vendored with their pinned source and Unicode license.
// The last name is the picker label; preceding names are searchable keywords.
export function localizeEmojiData(english, annotations, categories, locale) {
  return {
    categories: { ...english.categories, ...Object.fromEntries(categories.map((category) => [category.category, category])) },
    emojis: Object.fromEntries(Object.entries(english.emojis).map(([category, emojis]) => [category,
      emojis.map((emoji) => {
        const persian = annotations[emoji.u] || [];
        return { ...emoji, n: locale === "fa" ? [...emoji.n, ...persian] : [...persian, ...emoji.n] };
      }),
    ])),
  };
}
