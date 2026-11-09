# Ouj Chat UX Contract

## Product context

Ouj Chat / گفتگوی اوج is the dedicated messenger for املاک اوج (`oujamlak.ir`), built on the open-source Ouj Chat project for direct messages, groups and channels on desktop and mobile browsers. Preserve the visual language in [DESIGN.md](./DESIGN.md), and retain upstream license, copyright notices and attribution. Persian is the default locale; English is available throughout the application. New controls target keyboard operation and WCAG 2.2 AA; this is an implementation target, not a claim of independently verified conformance.

## Business-context sources

| Scope | Maintained source |
|---|---|
| Membership, ownership and message permissions | `server/api/chats.js`, `server/api/messages.js` |
| Authentication and session expiry | `server/api/auth.js`, `server/lib/sessions.js` |
| Message identity and duplicate prevention | `server/lib/services/messagePublicationService.js`, `server/db.js` |
| Device-local draft lifecycle | `client/src/utils/chatDrafts.js` |
| Device-local queued work | `client/src/utils/chatOutbox.js`, `client/src/utils/cacheDb.js` |
| Camera attachments and native picker | `client/src/components/chat/messages/MessageComposer.jsx`, `client/src/pages/ChatPage.jsx` |
| Cache eviction | `client/src/hooks/chat/useChatCacheStats.js` |
| Voice playback preferences | `client/src/utils/voicePlayback.js` |
| Voice and circular-video media presentation | `client/src/components/chat/media/MessageFiles.jsx`, `client/src/components/chat/media/VideoMessageRecorder.jsx`, `client/src/components/chat/media/VideoNotePlayer.jsx`, `client/src/utils/videoNote.js`, `client/src/components/chat/messages/MessageComposer.jsx` |
| Chat tools, search, sessions, topics and group permissions | `server/api/messaging.js`, `server/db.js` |
| Scheduled publication and group posting policy | `server/lib/services/messagingService.js` |
| MongoDB persistence and transactional event journal | `server/db.js`, `server/db/mongoRepository.js`, `server/db/mongoSchema.js` and their modules; SQL migrations 42/43 are legacy import history |
| Group call membership and signaling | `server/api/messaging.js`, `client/src/utils/groupCallSession.js` |
| Locale and message formatting | `client/src/i18n/locale.js`, `client/src/i18n/fa.js` |
| Theme controls and persisted appearance | `client/src/components/common/ThemeSwitcher.jsx`, `client/src/App.jsx` |
| Installation metadata and notification locale | `client/public/manifest.webmanifest`, `client/public/manifest.en.webmanifest`, `client/public/sw.js`, `client/src/i18n/locale.js` |
| New-account default avatar colors | `server/settings/colors.js` |
| Product identity and brand values | User-requested Ouj identity, recorded in `DESIGN.md`; runtime tokens in `client/src/brand.css`, imported by `client/src/index.css` |

The API and domain sources own permissions and lifecycle rules. This contract records their user-interface consequences; it does not grant additional permissions.

## Visual contract

- `DESIGN.md` owns the Ouj identity and exact brand anchors: primary purple `#66308d` and secondary teal `#01ae9b`.
- `client/src/brand.css`, imported by `client/src/index.css`, owns the runtime `brand-*` and `accent-*` palettes, neutral surfaces and the `ouj-glass` shared surface. The exact anchors are `brand-600`/`--ouj-primary` and `accent-500`/`--ouj-secondary`. Components consume these owners rather than duplicating their own palettes.
- Keep the majority of both themes neutral. Purple identifies primary actions and selected states; teal identifies restrained secondary/positive states. Danger remains semantically distinct.
- Shared glass surfaces retain sufficient neutral opacity for legibility, with opaque fallbacks for unsupported filtering and reduced-transparency preference. Reduced motion removes decorative effects while preserving layout, state feedback and media controls.
- A theme, locale or reduced-effects change preserves panel geometry, reading position, keyboard reachability and focus visibility.
- The shared light/dark control sits beside the language control in conversation and administration headers. Its accessible name describes the mode it will activate, and the chosen appearance is browser-local.
- New-account avatar defaults use the restrained Ouj-compatible palette. Do not rewrite existing saved user colors as part of a branding or theme change.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Composer business previews | `messages/ComposerBusinessActions.jsx`, `business/BusinessPreviewSheet.jsx`, shared `tools/ToolDialog.jsx`, `useSheetDismissGesture.js` | Explicitly labeled local sample listings with local search/type filters and a read-only sample daily report. Two 44px actions inside the paperclip menu close that menu and load the sheet on demand. Keep the composer in one row. Header-only downward drag follows the pointer without React renders per move; release past 20% height bounded to 72–120px dismisses after a 320ms exit, while short/cancelled gestures return. Ignore horizontal/upward intent, extra touches and interactive controls; body scrolling stays independent. Reduced motion settles/closes immediately. Trap focus, restore it to the paperclip trigger, close outside/Escape, clear state on account/chat changes, and isolate Enter/paste/drop events from sending while preserving Tab navigation. Cancel animation/listeners on unmount. No API, Web collection access, persistence, or chat publication. Web owns eventual real data and authorization. | Shared attachment menu and opt-in draggable modal bottom sheet | ToolDialog.dragDismiss.test.jsx; ComposerBusinessActions.test.jsx; MessageComposer.uploadMenu.test.jsx |
| Visual tokens and global scrollbars | `client/src/brand.css`, `client/src/index.css`, `DESIGN.md` | Reuse Ouj brand/accent and neutral tokens, shared `ouj-glass`, typography and scroll surfaces. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Message composition | `MessageComposer.jsx` | Native textarea, automatic sizing, explicit validation and duplicate-submit prevention. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Composer emojis | `EmojiPickerPopover.jsx`, shared `ToolDialog.jsx`, `useSheetResizeGestures.js`, `emoji-picker.css`, `emojiPreferences.js`, `emojiLocale.js` | React Aria modal bottom sheet, virtualized categories, Persian/English labels and search, native glyphs and skin tones. Start at half height (300px minimum within the visible viewport); scrolling down expands and reverse scrolling halves it after 48px of vertical intent. Ignore horizontal/multi-touch/zoom gestures. A 44px resize button supports click/Enter and ArrowDown/ArrowUp. A reversible 420ms height transition preserves mounted search/grid state; reduced motion removes it. Lazy same-origin catalog with pinned CLDR Persian labels; no CDN or private-text request. Insert at the saved selection, preserve draft/reply/edit, and reject a whole sequence beyond the message limit. Last 24 selections/tone are browser-local per account. Backdrop clicks/taps dismiss without activating underlying actions. Trap focus; Escape/close restores the trigger, selection returns the caret to the message, and resize Enter never submits pending chat attachments. | Native Unicode from pinned emoji-picker-react catalog; OS/font support applies | EmojiPickerSheet.test.jsx; MessageComposer.emoji.test.jsx; emojiPreferences.test.js |
| Drafts | `chatDrafts.js` | Separate by stable account ID (normalized username fallback) and conversation; preserve text and reply target. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Persistent sending queue | `chatOutbox.js` | Save message identity and file bytes before clearing composition. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Voice speed and seek | `VoicePlaybackControls.jsx` | Native range input for pointer and keyboard seek; one browser-local speed preference. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Recording gesture and voice capture | `RecordingButton.jsx`, `useHoldToRecord.js`, `useVoiceRecording.js`, `MessageComposer.jsx` | Tap switches mode; hold records; upward drag locks; unlocked release queues immediately. Locked capture supports explicit send, review and cancellation. | Shared | MessageComposer.recording.test.jsx; video-note-flow.mjs |
| Circular video recording and playback | `VideoMessageRecorder.jsx`, `VideoNotePlayer.jsx`, `videoNote.js` and `MessageComposer.jsx` | Distinct `video_note` kind, centered hold capture, locked review/send and shared durable upload path. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Camera attachments | `MessageComposer.jsx`, `ChatPage.jsx` | Separate photo/video native capture inputs prefer the rear camera; browser/OS owns camera UI and may provide a file-picker fallback. No stream is requested on menu open. Cancel preserves the draft and attachments; stale picker results after account/chat changes are ignored. Captures use existing type/size/count checks, media preview and explicit Send; failed uploads retain the existing retry path. | Native photo / ordinary video, distinct from circular notes | MessageComposer.uploadMenu.test.jsx |
| Anchored menus | `components/common/AnchoredMenu.jsx`, `SidebarHeader.jsx`, `UserMenuButton.jsx`, `MessageComposer.jsx` | Portal outside clipped/glass surfaces at the shared menu layer above chat cards; logical start/end alignment, preferred top/bottom placement, visual-viewport bounds, keyboard navigation and focus restoration. The account variant retains a wider profile header and scrolls vertically within short viewports. Inner content fills the available width after padding/borders and any vertical scrollbar; long profile text truncates without horizontal overflow. Attachment actions open above their trigger toward the inside of the chat; touch opening preserves composer focus, keyboard opening focuses the menu. | Actions / account | SidebarHeader.createMenu.test.jsx; UserMenuButton.layers.test.jsx; MessageComposer.uploadMenu.test.jsx |
| Modal focus | `useFocusTrap.js` and shared modal components | Portal, dialog semantics, keyboard focus containment and focus restoration. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Message context and reactions | `context-menu/MessageContextMenu.jsx`, `useContextMenuTrigger.js`, `hooks/chat/useMessageActions.js` | A 450ms bubble hold, right-click, Shift+F10 or inline React opens one bounded glass dialog with seven existing reactions, authorized pin/topic actions and ordinary message actions. Upper-half messages open the menu below; lower-half messages open it above, with a gap and side-limited action scrolling. Recalculate on viewport/anchor changes; use the visible viewport as a fallback when neither side has usable room. Cancel hold on movement, scroll, early release, pointer cancellation, recycled content or unmount; retain the original anchor across async touch events. Trap/restore focus, dismiss outside/Escape, retain failed mutations for retry and guard duplicates, offline/pending messages and stale conversation targets. Blur exists only with the overlay; honor reduced motion/transparency. | Message variant; chat/user menus retain their shared owner | ContextMenuGesture.test.jsx; MessageContextMenu.test.jsx; MessageItemOfflineControls.test.jsx |
| Admin contact-name prefill | `components/admin/ContactNameImport.jsx`, `AdminUserModal.jsx`, `utils/contactImport.js` | Explicit, secure top-level native selection of one name, or one local UTF-8 vCard up to 256 KiB. Fill nickname only, preserve credentials and manual entry, ignore late results after dismissal, prevent submission while reading and require shortening over-limit names. No address-book cache, phone identity mapping or network request before ordinary explicit Create user; existing administrative API/authorization applies. Localized loading, capability guidance and recoverable errors. | Native picker where supported / local file / manual | AdminUserModal.contacts.test.jsx; contactImport.test.js |
| HTTP | `client/src/api/chatApi.js` | Use the credentialed API boundary for application requests. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Chat tools and shared forms | `components/chat/tools/ToolDialog.jsx`, `ToolsPanels.jsx` | React Aria modal owner coordinates nested calendar/clock overlays, focus restoration and Escape; localized controls and explicit busy/error states. Native selects accept platform popup behavior. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Conversation layout | `ChatLayout.jsx`, `ChatSidebar.jsx`, `ChatWindowPanel.jsx` | Separate desktop folder rail, bounded pointer/keyboard resize with browser-local preferred width, contiguous flexible conversation, full-width mobile panels; mirrored logical directions. | Desktop / mobile | ChatLayout.test.jsx; responsive-chat-layout.mjs |
| Conversation filters and preferences | `ConversationFilters.jsx`, `ChatHeaderActions.jsx`, `FolderPanel` in `ToolsPanels.jsx`, `useMessagingTools.js` | Server-owned pin/archive/folder preferences and account-local active filter. Desktop rail and single scrolling mobile row share choices and locally derived counts; custom titles remain user content. Secondary actions use the anchored conversation menu and preserve existing permissions/confirmations. | Rail / tabs | ConversationFilters.test.jsx; ChatHeaderActions.test.jsx; responsive-chat-layout.mjs |
| Search and paginated tool data | `useToolData.js`, `messagingApi.js` | Cancel superseded requests; ignore stale results; explicit pagination. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Message engagement | `MessageEngagement.jsx` | Shared reaction, pin, poll and topic actions under server authorization. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Group call lifecycle | `useGroupCall.js`, `groupCallSession.js`, `GroupCallPanel.jsx` | Six-participant mesh room, explicit leave and media cleanup. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Local performance measurements | `usePerfTelemetry.js`, `PerformancePanel.jsx` | Device-local measurements and user-controlled long-task recording. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Application language | `components/common/LanguageSwitcher.jsx` and `i18n/locale.js` | Persian default, saved English/Persian preference, available on signed-out and signed-in routes. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Field typography | `client/src/index.css`, `adminShared.js`, `toolStyles.js`, `PersianDateTimeField.jsx` | All editable fields use `text-base`, including shared form/search styles and date/time segments. Native and contenteditable fields have a 16px minimum, respect larger root text sizes, and retain the same size on focus in both languages and themes. | Native, segmented and third-party fields | FormTypography.test.jsx |
| Placeholder alignment | `client/src/index.css`, shared search fields and `MessageComposer.jsx` | Empty native fields follow UI direction: Persian right, English left. Filled values keep content/technical direction; locale changes preserve text. Native placeholders remain visible and unobscured by search decorations. | All text/password/technical fields | PlaceholderAlignment.test.jsx |
| Application theme | `components/common/ThemeSwitcher.jsx` and `App.jsx` | One light/dark preference and consistent control beside language in conversation/admin headers. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| PWA identity and background locale | `manifest.webmanifest`, `manifest.en.webmanifest`, `sw.js`, `i18n/locale.js` | Locale-specific install metadata, Ouj square icons and browser-local notification language; platform owns installation UI. | Existing documented variant | Component tests; relevant browser flow in client/test/e2e/ |
| Select/Listbox | Native select in MessageEngagement.jsx, MessagingToolbar.jsx and ToolsPanels.jsx | DESIGN.md; this contract accepts platform-owned popups | Native | Browser component tests and messaging-flow.mjs |
| Date | `components/common/PersianDateTimeField.jsx` | React Aria primitives, Ouj theme tokens, Jalali calendar in both languages; Saturday week start; whole-field click/tap opens the picker, keyboard segments remain editable, clear/today actions and bounded portaled popup. Date/clock icons share the UI logical end edge; Clear never opens a picker. | Authored | PersianDateTimeField.test.jsx; persianDateTime.test.js |
| Time | `components/common/PersianDateTimeField.jsx` | React Aria segmented 24-hour field, custom hour/minute choices; whole-field click/tap opens the clock without intercepting its own buttons or portaled events; `Asia/Tehran` conversion in utils/persianDateTime.js | Authored | PersianDateTimeField.test.jsx; persianDateTime.test.js |

Existing unrelated screens retain their established behavior until migrated through their shared owner.

## Composition and draft recovery

- Persist ordinary new-message text and its reply target for the current account and conversation on the current browser profile. Prefer the stable account ID; use the normalized username only when an ID is unavailable.
- Restore the conversation draft when opening that conversation; never reuse another account's or conversation's draft.
- Expire drafts seven days after the latest saved change.
- Editing an existing message must not overwrite the ordinary new-message draft.
- A new-message draft is cleared only when the send handler accepts the message into local storage.
- Selected attachments become durable on Send, rather than being represented as text drafts.
- Enter submission must respect IME composition and the existing desktop/mobile Enter behavior.

## Async and resilience

New-message sending is queued locally and displayed optimistically after the durable write succeeds. A queued message is not presented as server-confirmed until acknowledgement.

- Keep one request identity through restoration and retry. Server-side duplicate prevention remains authoritative.
- Store File/Blob bytes with IndexedDB structured cloning. Recreate document-specific object URLs after restoration.
- Scope restored queue entries by account and conversation.
- Keep the outbox separate from evictable history, media preview and waveform caches.
- Ouj Chat's cache-clearing action must preserve queued work and drafts. Clearing browser site data can remove them.
- A local-storage failure must retain composition and present an actionable inline error.
- Preserve readable history during network interruption. Reconnect and resume use the existing chat refresh and retry owners.
- Background sending must not require keeping the destination conversation selected. Bound automatic attempts to five and use increasing delays for transient failures; preserve failed entries for explicit retry or removal.
- Outbox removal acts on local pending work and must not be presented as deletion of a server-confirmed message. Do not remove an item while its current send attempt is in progress.
- Authentication or permission errors remain server-controlled; locally retaining a message does not authorize its delivery.

## Conversation organization and data navigation

- Pin, archive and folder assignment are server-owned preferences for the current account. Archiving preserves membership and message content.
- Keep pin/archive/folder mutation feedback consistent in the shared toolbar. A failed save retains the previous server-confirmed preference and provides an inline error.
- Shared media is paginated and filtered by media kind. File access continues through authenticated upload routes.
- Message search supports conversation/all-conversation scope, sender and date constraints. Clear immediately; debounce typed queries and respect IME composition.
- Search decrypts bounded authorized pages for text matching; it does not create a plaintext search index. A page with no matches can still expose a continuation cursor.
- Search results must navigate to the selected conversation/message. Membership, hidden-message and expiry rules remain server-owned.
- Keep search text and device-local diagnostic state out of URLs; these tool panels are transient and can contain sensitive content.
- Virtual history renders a bounded visible window and measures variable message heights. Loading media or older history must preserve reading position; new messages must not pull a reader away from older content.

## Durable event recovery

- MongoDB is the active indexed record store. It preserves public UUIDs and API field names, stores messages as separate encrypted records, and commits covered state changes and their journal events in one transaction. A replica set is required; standalone MongoDB and a blank URI are not silent fallback modes. Historical SQL migrations 42/43 are legacy import history.
- Replay only after the account's saved cursor and reapply current membership/viewer restrictions. Persist a cursor only after processing that page of changes.
- Reconcile loaded edits/deletions and invalidate affected inactive-history caches. A live-event connection alone is not proof that all prior changes have been applied.
- Journal replay is synchronization, not deleted-content recovery or a backup. File metadata is in MongoDB; local/S3 binaries remain separate. An import, transaction, restore or cloud topology is verified only by the checks actually exercised against it.

## Scheduling, polls, topics and group policy

- Schedule text as a server-owned operation. Convert the selected Jalali date and 24-hour Tehran time to a UTC ISO instant; validate the 10-second to one-year window and preserve the form if validation or server save fails. Search date bounds include the entire selected Tehran day through its final millisecond.
- Holding Send for 450 ms with mouse/touch, its context menu, or Alt+ArrowDown opens a lazy composer scheduling dialog for the captured text draft. Short click/Enter sends immediately. The shared `ScheduleMessageForm.jsx` owns validation and date/time entry in both this dialog and Chat tools. Save failures/cancel retain the draft; successful saves clear only the matching original account/chat draft and preserve reply/topic context through delivery. Pending files/voice and edits retain their immediate send/save behavior. Send icons point left in Persian and right in English using the shared RTL icon rule.
- Device setup after signup/first login and first installed-PWA use is optional, account scoped, bilingual and reopenable from notification settings. Notifications, microphone and camera each require an explicit button. Media permission checks immediately stop all tracks. Show notification activation only after its subscription is saved successfully; preserve valid subscriptions across ordinary refreshes and bind endpoint updates/removal to the signed-in account. Shared owners: `DevicePermissionsSetup.jsx`, `devicePermissions.js`, `useChatNotifications.js`, `server/api/push.js`, and the MongoDB repository.
- Web Push belongs to `client/public/sw.js` and `server/lib/push.js`; each device receives eligible message pushes independently of presence elsewhere, excluding muted chats. Every accepted push creates a visible notification as required by WebKit; focused-window notifications are quiet, test notifications remain normal, and finished calls replace ringing notices with a quiet completion notice. SSE avoids duplicating registered push notifications. Await badge operations in the push lifetime, clear zero unread counts and reconcile counts on foreground reads. Ignore stale-account pushes; logout clears badges/notifications and removes this device's subscription. Notification clicks open the target conversation and cannot navigate to external origins. HTTPS, stable VAPID credentials, user/browser/OS permission, connectivity and platform support are required. Numeric badges are not guaranteed on every launcher; iOS/iPadOS16.4+ requires a Home Screen web app.
- The server must be running to dispatch scheduled work. On dispatch, recheck account, membership, channel role and group posting rules; expose failures instead of bypassing permission changes.
- Keep cancel eligibility server-controlled and protect scheduled publication from duplicate dispatch using its stable request identity.
- Polls accept one current choice per member. Reflect counts and the current user's choice; closing prevents further voting. Creation and closing follow the API's posting/manager rules.
- Group managers create/close/reopen topics. An author can classify their own message; assigning another author's message requires manager authorization.
- Group posting/upload restrictions and slow mode apply on the server. Administrator promotion/removal is owner-only and requires explicit confirmation. Group roles must remain distinct from server-wide administrator roles.

## Active devices and group calls

- Device sessions expose labels and last activity, not session tokens. Mark the current session, confirm revocation and revoke only the selected session. Revoking the current session returns this browser through authentication.
- Group calling requires current group membership and enabled call settings. Offer an optional camera choice and explicit microphone/camera permission recovery.
- Cap a mesh room at six participants and show participant count. Call audio can remain active while the controls panel is closed; keep a route back to the active room controls.
- Leave/unmount cleanup releases local media tracks, peer connections and room membership. Disable conflicting simultaneous-call actions.
- Describe HTTPS and TURN requirements in the call guide. Do not present the mesh implementation as an SFU, a large conference room, or Telegram-scale capacity.

## Locale and diagnostics

- Default to Persian when no valid preference has been saved. Restore a saved English/Persian preference in the current browser, and make the shared language control available on authentication, invitation, chat and administration routes.
- Application chrome follows the selected locale's direction; user content uses its own direction. Locale changes must not rewrite user messages, names, usernames, code blocks, URLs, identifiers, configuration keys or secret values.
- All application-owned labels, actions, accessibility names, tooltips, placeholders, confirmations, validation, loading/empty/error states and human-readable API error presentation follow the shared locale owner. Keep technical codes and logs stable; a raw untranslated server error is not the localized user explanation.
- Dates and numbers generally use the selected locale. The shared date/calendar/time entry controls always use Persian/Jalali presentation even in English, with app-localized labels/actions/errors, 24-hour Tehran time and accessible React Aria keyboard behavior. Native selects remain platform controls. Calendar/clock popovers respect the viewport, light/dark mode, reduced transparency and nested modal focus; Escape dismisses the innermost overlay first.
- Select the Persian/RTL or English/LTR PWA manifest for the active locale. Both use 192×192 and 512×512 square icons derived from the original Ouj logo; retain original upstream licensing/attribution.
- Persist notification-language preference locally for the background worker. Application-owned fallback wording and call prompts follow that preference, while sender names and message previews retain their received content. Do not imply notification delivery where platform/permission settings prevent it.
- Browser/operating-system installation behavior remains platform-owned. Testing language/theme in web routes does not certify every installed-app platform or browser version.
- Performance measurements remain device-local. The panel distinguishes loaded messages from rendered message bubbles and exposes explicit refresh and optional long-task recording.

## Account chat backgrounds

- `shared/chatAppearance.js` owns the bounded wallpaper IDs and versioned preference contract. `ChatWallpaper.jsx`, `chatWallpapers.js`, `brand.css`, `ChatBackgroundSettingsPanel.jsx` and `useChatAppearance.js` own rendering, selection and account synchronization.
- Settings → Chat background provides eight static vector patterns and Plain. A thumbnail changes only the local preview; Apply waits for server confirmation before changing the actual conversation surface. Closing settings discards this explicitly temporary preview. Saving failure preserves it while the panel is open. Native buttons expose selected state and visible keyboard focus in both locales/themes.
- One private account preference applies to direct messages, groups, channels and Saved messages. Store it as bounded `users.chat_appearance`; never expose it in public profiles or user-search results. Arbitrary CSS/URLs/uploads are not accepted as wallpaper values.
- The existing login and `/api/me` response carry the setting. Reuse the current account's session snapshot without adding a wallpaper request or blocking first paint on a separate fetch. Unchanged snapshots are not rewritten. Build-hashed SVG assets use immutable static caching; only the visible conversation's selected asset is requested before opening the gallery. Do not evict history/media, drafts or outbox on a background change.
- A save binds the rendered account ID to the authenticated session and uses optimistic concurrency with the current numeric revision. A changed cookie/account context rejects the save instead of editing another account. A conflict supplies authoritative state, preserves the chosen preview and requires another explicit Apply. The MongoDB update and its private replay record commit in the same transaction. Live and replay notifications target only the account; stale or other-account events/responses must not overwrite its setting. Appearance-only replay does not invalidate message caches.
- Patterns reserve no message layout space and share a stationary layer beneath the timeline. Theme changes recolor the same mask, and plain/forced-colors modes retain the same scroll geometry. Clearing evictable chat caches preserves this account setting.

## Voice playback

- Use the large circular play/pause action, a dense seekable waveform, elapsed/total time and file size as one coherent media control. Keep pointer targets and visible keyboard focus usable in both themes and both directions.
- Supported speeds are 1, 1.25, 1.5, 1.75 and 2. Cycle back to 1 after 2.
- Store the selected speed in the current browser and apply it consistently to voice players. The original recording is unchanged.
- The native range control exposes an accessible name, current position and total duration; keyboard focus must be visible.
- Seek must preserve the playing/paused choice. Seeking before metadata is available is applied once metadata arrives.
- Disable unavailable playback and seek actions while processing; disable seek if the duration is unknown.
- Clicking or dragging voice controls must not trigger the enclosing message's swipe or context actions.

## Circular video messages

- Preserve `kind=video_note` as a distinct media type throughout upload metadata, durable queue restoration and message rendering. Ordinary video attachments retain their existing rectangular presentation.
- Render the recorder through a portal centered in the viewport on mobile and desktop. Reuse modal semantics, focus containment, Escape/cancel and focus restoration; the dialog must not inherit positioning or clipping from the composer.
- Camera/microphone capture requires a supported secure context (HTTPS or localhost) and explicit browser permissions. Provide actionable permission/unsupported errors without publishing a message.
- The shared composer button switches voice/video on a short tap. A 250 ms hold requests devices and starts capture when ready. An upward movement of 72 CSS pixels locks capture. Releasing an unlocked recording immediately queues it; releasing after locking does not send it. Prevent the original release's synthesized click from activating locked Send.
- The video recorder is centered on the viewport on phones and desktop. Hold capture starts automatically once the preview is ready. The standalone/manual retry flow offers preview and Start. Releasing before device acquisition completes cancels the request and stops any late-arriving tracks.
- Locked recording provides explicit Send, review and cancellation. Video also supports pause/resume; cap recorded content at 60 seconds. Review and the duration limit retain a preview without publication. A record-again action leaves the old gesture and requires a new explicit Start.
- Offer keyboard hold with Space/Enter, Arrow Up to lock, Escape to cancel and an explicit Lock alternative. Application-owned instructions, permission recovery and errors follow the selected locale.
- Closing, cancelling, changing conversation or unmounting stops every owned media track, releases recorder resources and discards active capture. If an asynchronous capture request resolves after dismissal, stop its returned tracks instead of reattaching them.
- Preview and unfinished capture are not durable queued work. On unlocked release or explicit Send, reuse attachment validation, request identity, upload progress and the persistent outbox; clear accepted composition only after its durable save succeeds. If local queuing fails, retain captured voice/video bytes for retry and show a localized error.
- Render video-note playback inline in a circular frame with play/pause, seek, mute/unmute and time. Keep seek and mute keyboard-accessible, and avoid propagating those actions to enclosing message gestures.
- Preserve file availability/processing/error behavior from the shared media infrastructure. Do not claim recording or playback compatibility on browser/OS versions that were not exercised.

## Flow ledger

| Operation | Pending | Success | Failure recovery |
|---|---|---|---|
| Send a new message | Save text, reply and attachments locally | Clear composition and display sending state; retain request identity | Keep input if local save fails; preserve queued work through network interruption |
| Reopen a conversation | Load that account's draft and queued entries | Restore text/reply and pending rows without duplicating acknowledged rows | Preserve available cached history; retry through the existing sending flow |
| Clear cache | Remove cache-owned entries | Keep drafts and pending work | Preserve the original cache error behavior |
| Change voice speed | Apply locally | Update audio playback and browser preference | Retain a usable session preference if persistence is unavailable |
| Seek in a voice message | Update target position | Update playback position without changing play/pause intent | Defer the seek until metadata is available |
| Record voice or circular video | Hold to acquire devices and capture; drag up to lock | Unlocked release queues immediately; locked capture requires explicit Send or review | Retain bytes if local queue fails; cancel/context change discards capture and releases devices |
| Save chat preference | Await server result | Refresh account preferences and active filter | Preserve the confirmed state and show inline error |
| Search/load more | Cancel or invalidate earlier request | Append only to the matching committed search | Preserve current input and expose an actionable error |
| Schedule message | Await durable server save | Clear the schedule form and reload the list | Retain text/time and show validation or dispatch error |
| Change role / revoke device | Explicit confirmation, then await server | Refresh affected membership/session state | Keep confirmation context and show the server error |
| Join/leave group call | Request media and room admission | Maintain the room independently of panel visibility | Clean up partial resources and show rejoin/permission error |

## Verification

Run client unit tests, relevant Chromium and Firefox component tests, client lint and the production build. Server changes require the server suite; documentation changes require `npm run docs:build`. A static UI audit supplements, rather than replaces, runtime verification.

Focused evidence includes `client/test/utils/chatDrafts.test.js`, `client/test/components/chat/ChatOutbox.test.jsx` and `client/test/components/chat/VoicePlaybackControls.test.jsx`, with tool, journal, permission and call coverage alongside the implementation. Test local save failure, account/conversation isolation, file-byte restoration, cache eviction, acknowledged retries, keyboard seek and remembered playback speed. Verify narrow and desktop viewports, light/dark themes and Persian text with reply context.

Exercise search paging and stale queries, edits/deletions during disconnection, lost group permissions, failed scheduled sends, device revocation, topic/poll permissions and group-call admission/media cleanup. Verify Persian-first startup and saved English selection on signed-out, invitation, chat and admin routes, including errors and accessibility labels. Exercise both themes and their header controls, opaque/reduced-transparency fallback, reduced motion and unchanged user/code content after locale changes. Check both manifests, icon dimensions, background-worker locale persistence, unchanged notification message content and preservation of existing avatar colors. For video notes, exercise centered phone/desktop dialogs, tap-to-switch, hold-to-record, upward lock, unlocked-release sending, locked review, video pause/resume, duration limit, explicit Send, denied permissions, late capture after dismissal, conversation changes and complete media-track cleanup. Verify `video_note` survives queue restoration/upload metadata and remains distinct from ordinary videos; verify inline seek/mute and the voice time/size controls with keyboard and touch. State the browsers/platforms actually exercised; do not generalize from web-route tests to untested installed-app environments. Verify collection/index initialization and concurrent transactions against the deployed replica set. Native backup archives contain records and encryption-key material; keep binary-file backups separate. Online MongoDB restore is rejected with HTTP 409, and offline restore requires stopped writers plus explicit `--yes --offline`. Isolated unit/API tests use injected repositories; real-Mongo integration uses a dedicated test/e2e database or a temporary real replica set. Functional checks do not establish a production capacity limit.
