# Design Language & Style Guide: Ouj Chat

This document defines the design language, UI patterns, color system, typography, and component conventions for **Ouj Chat / گفتگوی اوج**, the dedicated messenger for **املاک اوج** at `oujamlak.ir`. The product is a branded distribution of the open-source Ouj Chat project. Preserve the upstream license, copyright notices and attribution while adapting product-facing names and visuals.

The approved identity is a quiet neutral chat surface with restrained purple and teal accents. Long conversations, property-related communication and routine account tasks must remain easy to read in both light and dark themes. Do not introduce property-listing, payment or transaction workflows merely because the brand belongs to a real-estate business.

---

## 1. Core Principles

1. **Calm & Purposeful**: A quiet, uncluttered conversation interface for Ouj real-estate communication, focused on readability, speed and real-time communication. Keep most of each screen neutral; use brand color to establish hierarchy and selected state.
2. **Lightweight & Fast**: Zero unnecessary heavy UI component libraries. Built with native Tailwind CSS 4 utilities and clean React 19 functional components.
3. **Persian First, Fully Bilingual**: Persian is the default when no language preference has been saved. English remains selectable through one global language control on authentication, invitation, chat and administration screens. Application-owned copy and errors follow the selected language; user messages and technical values retain their original content.
4. **Adaptive Dark Mode**: Full dark mode support using Tailwind's `.dark` class targeting slate and dark neutral tones.
5. **Mobile-First & Touch Ready**: Responsive across viewports with notch safe-area handling, iOS input zoom mitigation, and PWA integration.

---

## 2. Tech Stack & UI Framework

- **Framework**: React 19 SPA (JSX, Vite).
- **Routing**: Lightweight custom routing in `client/src/App.jsx` using native `window.history` and `getRoute`.
- **Styling**: Tailwind CSS 4 with custom `@theme` variables and custom utilities in `client/src/index.css`.
- **Runtime Token Owner**: `client/src/brand.css`, imported by `client/src/index.css`, owns the `brand-*` purple palette, `accent-*` teal palette, neutral surface/text tokens and the shared `ouj-glass` surface. `index.css` remains the owner of global typography, shared application styles and scrollbar behavior. `DESIGN.md` owns their product meaning and the two exact brand anchors below. Components consume these tokens; do not create parallel local palettes or silently redefine the standard emerald palette as a brand alias.
- **Icons**: Centralized re-exports from Lucide Icons in `client/src/icons/lucide.js` and brand SVGs in `client/src/icons/BrandIcons.jsx`. *Always import icons from `client/src/icons/lucide.js` or `BrandIcons.jsx`, never directly from `lucide-react`*.
- **API Boundary**: All HTTP requests **must** use `apiFetch` in `client/src/api/chatApi.js` (`credentials: "include"`). *Do not call native `fetch` directly inside components*.

---

## 3. Typography & Fonts

### Font Families
- **Display Font**: `'Fraunces', serif` (`--font-display`).
- **Body Font (Latin)**: `'DM Sans', system-ui, sans-serif` (`--font-body`).
- **Persian / Arabic Font**: `'Vazirmatn', 'DM Sans', system-ui, sans-serif` (`--font-fa`).

### Text & Language Rules
- With no stored preference, render Persian application chrome with `lang="fa"`, `dir="rtl"` and the Persian font. Restore an explicitly saved English preference before first paint where possible.
- Keep one shared language control available outside authenticated chat too. Its name and accessible label must make the available language choice clear in both modes.
- All application-owned headings, actions, tooltips, placeholders, validation, loading/empty/error text, confirmations, document titles and accessibility labels follow the current locale. Translate human-readable explanations, including server-error presentation, through the shared locale owner.
- Empty native input/textarea placeholders align right in Persian and left in English, including technical examples and password hints. `index.css` owns this through `:placeholder-shown` and the root direction; placeholder font follows the UI locale. Do not mask native hints with centered text overlays or override their alignment inline. Filled message/technical values keep their own automatic or explicit direction; changing UI language must preserve entered content.
- Never translate or rewrite user messages, nicknames, usernames, code snippets, URLs, identifiers, environment-variable keys or secret values. Message direction follows the content independently of application layout.
- Use `hasPersian()` from `client/src/utils/fontUtils.js` to dynamically apply the `.font-fa` utility when user-generated content (messages, user names, avatar initials) contains Persian characters.
- Global CSS applies `:lang(fa)` and `[lang="fa"]` rules automatically to enforce Vazirmatn.
- Standard form inputs (`input`, `textarea`, `select`) use `text-base`; shared field styles and editable date/time segments follow the same size. `index.css` enforces `font-size: max(16px, 1rem) !important` for native and contenteditable fields, including third-party search inputs, to prevent iOS Safari focus zoom while respecting larger user text settings. Do not add smaller font utilities, inline sizes or scaling transforms to editable fields.
- Date and time entry use the shared `PersianDateTimeField.jsx` controls built on React Aria's accessible date/calendar/time primitives. These are loaded with chat tools or the composer's scheduling dialog, styled with Ouj tokens, and replace browser-native date/time popups. Date segments, month/day names and numerals always use the Persian/Jalali calendar, including in the English interface; field labels, actions and validation follow the application language. Weeks start on Saturday. Time entry is 24-hour and always interpreted in `Asia/Tehran`, independent of the device timezone; APIs continue to receive UTC ISO instants. Search bounds include the complete selected Tehran calendar days. Other date/number presentation continues to follow the application locale unless the surface explicitly displays a scheduled Tehran instant.
- Date and clock icons share the field's logical end edge: left in Persian, right in English. Clicking or tapping the field's blank area or numeric segments opens its picker. Preserve keyboard segment editing and independent Clear/trigger actions; ignore events from portaled popup content when handling field activation.

---

## 4. Color Palette & Dark Mode

### Primary & Accent Colors
- **Primary / Brand**: Purple anchored at **`#66308d`** (`--color-brand-600`, with `--ouj-primary` as the application semantic alias), exposed through the `brand-*` token family.
  - Ouj identity, the main submit/send action, selected navigation, focus treatment and small selection highlights. Use light brand tints for selected surfaces and sent-message treatment; avoid large saturated purple panels.
- **Secondary / Accent**: Teal anchored at **`#01ae9b`** (`--color-accent-500`, with `--ouj-secondary` as the application semantic alias), exposed through the `accent-*` token family.
  - Online presence, positive status and restrained secondary emphasis. Use a contrast-safe darker tone for text or small controls on light surfaces and an appropriate lighter tone on dark surfaces. The exact anchor is not a requirement to put white small text on that background.
- **Destructive / Alert Accent**: `rose` (`rose-500`, `rose-600`, dark: `rose-300`/`rose-400`).
  - Warnings, delete message scopes, leave group confirmation, destructive buttons, error badges.
- **Other Semantic Highlights**: Keep amber warnings and neutral information tones only when they convey a real state. Do not add unrelated decorative accent colors.

### Neutral Backgrounds & Text

The runtime mapping in `brand.css` supplies both themes through the same semantic variables:

| Role | Runtime owner | Light | Dark |
|---|---|---|---|
| Application canvas | `--ouj-canvas` | `#f8f8fb` | `#110f18` |
| Opaque surface / glass fallback | `--ouj-surface` | `#ffffff` | `#1b1823` |
| Conversation canvas | `--ouj-chat-canvas` | `#f6f5f9` | `#15121c` |
| Glass fill | `--ouj-glass` | White at 85% opacity | `#1b1823` at 88% opacity |
| Selection tint | `--ouj-selection` | Brand purple at 18% opacity | Light brand purple at 30% opacity |

Use `slate-*` runtime neutral tokens for surrounding text/borders and semantic surface variables for shared canvas/glass roles. Keep the palette values in `brand.css` and the role mapping here synchronized when they change.
- **Light Theme**:
  - Background: White and quiet near-white neutral surfaces.
  - Borders: Low-contrast neutral boundaries; use a brand tint only for selected or focused elements.
  - Text Primary: `slate-900` / `slate-800`.
  - Text Secondary: `slate-600` / `slate-500`.
- **Dark Theme** (`.dark` on `html`):
  - Background: Quiet dark neutral surfaces with enough separation between shell, list, message area and overlays.
  - Borders: Subtle neutral boundaries; limited brand, accent or danger tint for the state that requires it.
  - Text Primary: `slate-100` / `slate-200`.
  - Text Secondary: `slate-400` / `slate-300`.

### Selection, Surfaces & Motion
- Account-selected chat wallpapers use the shared `ChatWallpaper.jsx` surface and eight small repeating vector masks in `client/src/assets/wallpapers/`; plain remains available. Architectural arches, courtyard geometry and restrained organic/line motifs complement Ouj's identity without reducing message contrast. Patterns are static and never apply blur to the timeline. `brand.css` owns their theme mapping: brand-700 at 13% opacity in light mode, brand-200 at 11% in dark mode, over `--ouj-chat-canvas`; forced colors removes the decorative mask. Keep this mapping in the shared surface, including settings thumbnails and preview.
- Selection and focus use a small, legible brand-purple treatment. Maintain sufficient text contrast and communicate state with labels/icons as well as color.
- Prefer a subtle boundary or short elevation change on hover. Avoid persistent neon glows, saturated full-screen gradients and animated decorative backgrounds.
- `ouj-glass` is the shared, restrained glass surface for selected shell/header/overlay surfaces. Keep its neutral fill sufficiently opaque for readable text and use a modest backdrop blur. Do not apply blur to message text, every card, every bubble or every scrolling row.
- Unsupported backdrop filtering and `prefers-reduced-transparency: reduce` use an opaque neutral surface with the same geometry and readable boundary. In forced-colors mode, preserve visible system-compatible edges and controls.
- `prefers-reduced-motion: reduce` removes decorative transitions, pulsing, floating and entry effects. Preserve useful state feedback and direct user control of media; reduce motion without hiding controls or changing layout.
- Light/dark theme, transparency and motion preferences must not change focus order, control dimensions, scroll ownership or the meaning of status colors.

---

## 5. Component Patterns & Styling Conventions

### Conversation layout and navigation
- Emoji selection uses the shared modal bottom sheet in half-height by default, expanding to the available visual viewport when scrolling down through emoji and returning to half height on reverse scrolling. On short screens, keep a 300px usable minimum within viewport bounds. The same labeled 44px resize button supports click/Enter and ArrowDown/ArrowUp. Height interpolates over 420ms with `cubic-bezier(.22, 1, .36, 1)` and reverses from its current height without restarting or remounting the catalog. Reduced motion removes the transition. Preserve search, list position, drafts and preferences; trap focus, restore the emoji trigger on dismissal, and consume backdrop clicks without activating chat actions underneath.
- The paperclip attachment menu includes My listings and Daily work report after its media/document actions. Selecting either closes the menu and opens the shared `ToolDialog.jsx` bottom-sheet variant, loaded only on demand. Keep the composer in one row; these choices do not add buttons beside recording/send. On sheet dismissal, restore focus to the persistent paperclip trigger. Local examples are explicitly labeled as demo content; they never represent account data or send into chat. Real listings and reports remain owned by Web and require a separately implemented authenticated API contract. The sheet uses Ouj neutral surfaces, restrained brand accents, a bounded scrolling body, safe-area padding and reduced-effects fallbacks.
- Those two business previews opt into header-only drag dismissal through `useSheetDismissGesture.js`. Follow a downward pointer with a composited translation; a short or cancelled pull returns gently, while releasing beyond 20% of sheet height (bounded to 72–120px) closes. Return/exit lasts 320ms with the shared soft easing; reduced motion settles/closes immediately. Ignore header buttons, upward/horizontal intent and additional touches; never hijack body scrolling. Keep Close/Escape/backdrop alternatives and restore focus after the exit. The emoji sheet retains its separate half/full resize behavior.
- The message field has an emoji button at its logical end, with padding based on the UI locale independently of the message's automatic direction. `EmojiPickerPopover.jsx` owns the portaled React Aria dialog and adapts the virtualized native `emoji-picker-react` picker to Ouj colors, Persian/English labels and search. Load the picker, its catalog and vendored CLDR Persian annotations on demand in separate same-origin chunks; keep them out of the eager vendor bundle. The installed catalog's Unicode coverage and native glyph detection follow the pinned dependency; do not claim unsupported OS glyphs or newer Unicode versions. Keep 24 recent choices and one skin tone locally per account; insert complete emoji sequences at the saved caret/selection and preserve the normal draft, edit and explicit Send behavior. Respect the message limit without truncating a sequence. No query or message text is sent to an emoji service. Unicode data attribution ships in `client/public/licenses/unicode.txt`, with pinned CLDR provenance in `client/src/i18n/emoji-fa.json`.
- `ChatLayout.jsx` owns the responsive shell. At 768px and wider, a separate 76px folder rail precedes the chat list at the logical start edge; the conversation fills the remaining width. Keep these surfaces contiguous, without outer card gaps. The Ouj neutral/brand tokens retain the product identity.
- The chat list starts at 360px, supports pointer and keyboard resizing from 280px to 560px, and reserves at least 360px for the conversation where space allows. Save the preferred width locally, clamp the displayed width on smaller screens, and restore the preference when space returns. The separator mirrors pointer/arrow direction in Persian; Home/End set bounds and Enter/double-click reset. Below 768px, use full-width panels and hide the separator.
- `ConversationFilters.jsx` owns both folder presentations. Desktop uses the separate vertical rail. Mobile uses one non-wrapping row with horizontal scrolling, selected-state indication and unread counts derived from existing data. Custom folder names remain user content. Long desktop labels wrap to at most two lines; the rail scrolls independently.
- The conversation has one 72px header with back navigation on mobile, avatar/title/status at logical start, and Search, voice/group-call and More actions at logical end. `ChatHeaderActions.jsx` uses the shared portaled `AnchoredMenu.jsx` conversation variant for secondary actions. Video call, media, pin/archive/folder, profile, mute, appearance and delete retain their existing authorization and confirmation paths. Only populated topic and pinned-message strips remain below the header. Global Chat tools stays reachable from the account menu.

### Modal & Dialog Windows
- Message action menus open below messages in the upper half of the visible viewport and above messages in the lower half, with a 10px gap. Constrain the action list to the chosen side instead of covering the message; if neither side has usable room, keep the panel within 12px viewport margins and scroll its actions. Recompute placement and available height on anchor/viewport changes, including the mobile visual viewport, and let the entrance motion originate from the message edge.
- Message actions use the `MessageContextMenu.jsx` React Aria modal variant: a floating, horizontally scrollable strip of seven existing reactions above one anchored action card. Use the shared Ouj glass fill with a stronger neutral shadow, 44px reaction targets and a bounded, independently scrolling action list. Blur the backdrop only while this overlay is mounted; use an opaque fallback for reduced transparency/unsupported blur, and remove press/entry/exit motion for reduced motion. Holding a bubble provides brief scale feedback without changing timeline geometry. Keep Persian/English layout, existing action authorization, keyboard access and focus restoration consistent across touch hold, right-click and the inline React button.
- The admin create-user form offers optional contact-name prefilling through `ContactNameImport.jsx`. Ask for one name only when the administrator chooses the native contact action; show capability/HTTPS guidance and a bounded, local single-contact `.vcf` fallback. Preserve manual entry and existing username/password fields, disclose that final creation remains explicit, and expose cancellation, loading, errors and name-limit recovery in both languages. Never derive credentials from a phone number or retain the address book. Reuse restrained Ouj surfaces and 44px actions that stack on narrow screens.
- The paperclip attachment menu offers gallery media, Take photo, Record video and documents in both locales. Photo/video capture uses separate native file inputs with a rear-camera preference; the OS/browser owns capture and permission UI, with the ordinary picker as its platform fallback. Feed accepted captures into the existing media validation/preview and explicit Send flow. Opening the menu never acquires a media stream; cancel preserves composition, and late picker results are discarded after an account or conversation change.
- Shared anchored action menus scroll vertically within the viewport. Their inner wrappers fill the available content width without a second fixed width or independent viewport constraint; long profile text truncates, and horizontal scrolling is disabled at the shared menu surface.
1. **Portals**: Always render modals into `document.body` using React `createPortal`.
2. **Focus Management**: Wrap modal root refs with `useFocusTrap(dialogRef, open)` for keyboard accessibility.
3. **Semantics**: Root element must have `role="dialog"` and `aria-modal="true"`.
4. **Overlay**: Backdrop must use `fixed inset-0 z-320 flex items-center justify-center bg-black/40 px-6`.
5. **Card Container**: Keep the established rounded neutral card and width/spacing conventions. A documented `ouj-glass` variant may be used on the modal surface while preserving an opaque fallback, content contrast and focus visibility.

### Buttons & Interactive Controls
- **Shape**: Prefer rounded pill shapes (`rounded-full`) for dialog action buttons and chip elements; `rounded-xl` / `rounded-lg` for form inputs and panel controls.
- **Sizing & Text**: Compact text sizes (`text-xs font-semibold` or `text-sm font-medium`).
- **States**:
  - `disabled`: `disabled:opacity-50 disabled:cursor-not-allowed`.
  - Hover / Active: Smooth transitions (`transition duration-150`).
- **Cursor**: Buttons have `cursor: pointer` automatically when not disabled.

### Avatars & Status Indicators
- Use `Avatar` from `client/src/components/common/Avatar.jsx`.
- Dynamic color background is computed via `getAvatarStyle(color)`.
- Online indicators use the `accent-*` teal family with a neutral boundary that remains visible in both themes. Keep an accessible textual status; color alone does not establish presence.
- Badges: Use shared components (`VerifiedBadge.jsx`, `UserRoleBadge.jsx`).

### Selection & Text Interaction
- Content selection is restricted by default (`user-select: none`).
- Inputs, editable areas, and target chat content explicitly enable selection via `user-select: text` or `.ouj-context-menu-selection-target`.

---

## 6. Code Style & Architecture Rules for AI Models

1. **Component Design**: Functional components only, utilizing standard React hooks (`useState`, `useRef`, `useMemo`, `useCallback`, `useEffect`).
2. **Exports**: Use `export default` for React UI components, and named exports for utility modules/helpers.
3. **No Inline SQL / Direct Fetch**: Do not fetch endpoints with `window.fetch` or `axios`; use `apiFetch` from `client/src/api/chatApi.js`.
4. **Tailwind Class Ordering**: Group utility classes logically: layout/positioning (`flex items-center justify-between`), sizing/spacing (`w-full p-4 mt-2`), visuals (`rounded-2xl bg-white border border-slate-200`), dark variants (`dark:bg-slate-950 dark:border-slate-800`), typography (`text-sm font-semibold text-slate-800 dark:text-slate-100`), states (`transition hover:bg-slate-50`).
5. **RTL & Bilingual Awareness**: Never hardcode text alignment without checking if dynamic Persian script support (`font-fa` / `dir="rtl"`) is affected.
