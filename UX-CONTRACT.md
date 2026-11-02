# Songbird UX Contract

## Product context

Songbird is a self-hosted messenger for direct messages, groups and channels on desktop and mobile browsers. Preserve the visual language in [DESIGN.md](./DESIGN.md). English and Persian content must retain readable typography and direction. New controls target keyboard operation and WCAG 2.2 AA; this is an implementation target, not a claim of independently verified conformance.

## Business-context sources

| Scope | Maintained source |
|---|---|
| Membership, ownership and message permissions | `server/api/chats.js`, `server/api/messages.js` |
| Authentication and session expiry | `server/api/auth.js`, `server/lib/sessions.js` |
| Message identity and duplicate prevention | `server/lib/services/messagePublicationService.js`, `server/db.js` |
| Device-local draft lifecycle | `client/src/utils/chatDrafts.js` |
| Device-local queued work | `client/src/utils/chatOutbox.js`, `client/src/utils/cacheDb.js` |
| Cache eviction | `client/src/hooks/chat/useChatCacheStats.js` |
| Voice playback preferences | `client/src/utils/voicePlayback.js` |
| Chat tools, search, sessions, topics and group permissions | `server/api/messaging.js`, `server/db.js` |
| Scheduled publication and group posting policy | `server/lib/services/messagingService.js` |
| Transactional event journal | `server/migrations/042-messaging-tools.js`, `server/migrations/043-transactional-chat-events.js` |
| Group call membership and signaling | `server/api/messaging.js`, `client/src/utils/groupCallSession.js` |
| Locale and message formatting | `client/src/i18n/locale.js`, `client/src/i18n/fa.js` |

The API and domain sources own permissions and lifecycle rules. This contract records their user-interface consequences; it does not grant additional permissions.

## Canonical UI Map

| Capability | Owner | Contract |
|---|---|---|
| Visual tokens and global scrollbars | `client/src/index.css`, `DESIGN.md` | Reuse existing theme, typography and scroll surfaces. |
| Message composition | `MessageComposer.jsx` | Native textarea, automatic sizing, explicit validation and duplicate-submit prevention. |
| Drafts | `chatDrafts.js` | Separate by normalized username and conversation; preserve text and reply target. |
| Persistent sending queue | `chatOutbox.js` | Save message identity and file bytes before clearing composition. |
| Voice speed and seek | `VoicePlaybackControls.jsx` | Native range input for pointer and keyboard seek; one browser-local speed preference. |
| Modal focus | `useFocusTrap.js` and shared modal components | Portal, dialog semantics, keyboard focus containment and focus restoration. |
| HTTP | `client/src/api/chatApi.js` | Use the credentialed API boundary for application requests. |
| Chat tools and shared forms | `components/chat/tools/ToolDialog.jsx`, `ToolsPanels.jsx` | One modal owner, localized controls and explicit busy/error states. Native select/date controls accept platform popup behavior. |
| Conversation filters and preferences | `MessagingToolbar.jsx`, `useMessagingTools.js` | Server-owned pin/archive/folder preferences; account-local active filter. |
| Search and paginated tool data | `useToolData.js`, `messagingApi.js` | Cancel superseded requests; ignore stale results; explicit pagination. |
| Message engagement | `MessageEngagement.jsx` | Shared reaction, pin, poll and topic actions under server authorization. |
| Group call lifecycle | `useGroupCall.js`, `groupCallSession.js`, `GroupCallPanel.jsx` | Six-participant mesh room, explicit leave and media cleanup. |
| Local performance measurements | `usePerfTelemetry.js`, `PerformancePanel.jsx` | Device-local measurements and user-controlled long-task recording. |

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
- Songbird's cache-clearing action must preserve queued work and drafts. Clearing browser site data can remove them.
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

- Migrations 42 and 43 establish the tool data and transactional event journal. The durable event and source mutation commit together for covered database changes.
- Replay only after the account's saved cursor and reapply current membership/viewer restrictions. Persist a cursor only after processing that page of changes.
- Reconcile loaded edits/deletions and invalidate affected inactive-history caches. A live-event connection alone is not proof that all prior changes have been applied.
- Journal replay is synchronization, not deleted-content recovery or a backup. Do not label PostgreSQL behavior verified based solely on SQLite tests.

## Scheduling, polls, topics and group policy

- Schedule text as a server-owned operation. Convert browser-local date/time to an absolute instant; preserve the form if validation or server save fails.
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

- Keep the chosen English/Persian locale in the current browser; application chrome follows its direction while user content uses its own direction.
- Shared chat tools obtain labels, errors and dates through `i18n/locale.js`; preserve Persian typography and native date/select keyboard behavior.
- Performance measurements remain device-local. The panel distinguishes loaded messages from rendered message bubbles and exposes explicit refresh and optional long-task recording.

## Voice playback

- Supported speeds are 1, 1.25, 1.5, 1.75 and 2. Cycle back to 1 after 2.
- Store the selected speed in the current browser and apply it consistently to voice players. The original recording is unchanged.
- The native range control exposes an accessible name, current position and total duration; keyboard focus must be visible.
- Seek must preserve the playing/paused choice. Seeking before metadata is available is applied once metadata arrives.
- Disable unavailable playback and seek actions while processing; disable seek if the duration is unknown.
- Clicking or dragging voice controls must not trigger the enclosing message's swipe or context actions.

## Flow ledger

| Operation | Pending | Success | Failure recovery |
|---|---|---|---|
| Send a new message | Save text, reply and attachments locally | Clear composition and display sending state; retain request identity | Keep input if local save fails; preserve queued work through network interruption |
| Reopen a conversation | Load that account's draft and queued entries | Restore text/reply and pending rows without duplicating acknowledged rows | Preserve available cached history; retry through the existing sending flow |
| Clear cache | Remove cache-owned entries | Keep drafts and pending work | Preserve the original cache error behavior |
| Change voice speed | Apply locally | Update audio playback and browser preference | Retain a usable session preference if persistence is unavailable |
| Seek in a voice message | Update target position | Update playback position without changing play/pause intent | Defer the seek until metadata is available |
| Save chat preference | Await server result | Refresh account preferences and active filter | Preserve the confirmed state and show inline error |
| Search/load more | Cancel or invalidate earlier request | Append only to the matching committed search | Preserve current input and expose an actionable error |
| Schedule message | Await durable server save | Clear the schedule form and reload the list | Retain text/time and show validation or dispatch error |
| Change role / revoke device | Explicit confirmation, then await server | Refresh affected membership/session state | Keep confirmation context and show the server error |
| Join/leave group call | Request media and room admission | Maintain the room independently of panel visibility | Clean up partial resources and show rejoin/permission error |

## Verification

Run client unit tests, relevant Chromium and Firefox component tests, client lint and the production build. Server changes require the server suite; documentation changes require `npm run docs:build`. A static UI audit supplements, rather than replaces, runtime verification.

Focused evidence includes `client/test/utils/chatDrafts.test.js`, `client/test/components/chat/ChatOutbox.test.jsx` and `client/test/components/chat/VoicePlaybackControls.test.jsx`, with tool, journal, permission and call coverage alongside the implementation. Test local save failure, account/conversation isolation, file-byte restoration, cache eviction, acknowledged retries, keyboard seek and remembered playback speed. Verify narrow and desktop viewports, light/dark themes and Persian text with reply context.

Exercise search paging and stale queries, edits/deletions during disconnection, lost group permissions, failed scheduled sends, device revocation, topic/poll permissions and group-call admission/media cleanup. Verify migrations and concurrent writes independently on each deployed database; functional checks do not establish a production capacity limit.
