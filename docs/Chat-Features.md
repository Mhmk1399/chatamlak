# Ouj Chat Features

**Ouj Chat / گفتگوی اوج** is the dedicated messenger for **املاک اوج** at `oujamlak.ir`. It includes conversation organization, message search, polls, topics, group controls, and group calls. Open the selected conversation's **three-dot menu → Chat tools** to reach its panels; global **Chat tools** is also available in the account menu. Some panels appear only after selecting a conversation or when your role permits the action.

Ouj Chat builds on the open-source Songbird project. The product branding preserves Songbird's upstream license, copyright notices and attribution.

## Appearance and accessibility

The Ouj identity uses primary purple **`#66308d`** for selected states and primary actions, with secondary teal **`#01ae9b`** for restrained accents and positive status. Most of the interface remains neutral in both light and dark themes so long conversations remain comfortable to read.

Use the app's light/dark theme control to change the appearance; the Admin Panel also provides it in its header. Its accessible label names the mode the button will activate. The choice is remembered in this browser.

Selected shell and overlay surfaces use a subtle shared glass treatment. If reduced transparency is requested or backdrop filtering is unavailable, those surfaces remain opaque and readable. Reduced-motion preferences suppress decorative effects while keeping controls and status feedback available. Theme and language changes do not modify the text of your messages.

New default avatar colors use restrained tones that fit the Ouj palette. Existing saved user colors are preserved.

## Chat backgrounds

Open **Settings → Chat background** to choose from eight subtle built-in vector patterns or **Plain**. The live sample previews your selection; choose **Apply** to save it. A failed save keeps the pending selection available so you can retry.

If the browser's signed-in account changes in another tab, saving is rejected and you must sign in again, protecting the other account's background.

The saved background is private to your account and applies to all your direct messages, groups, channels and saved messages. It does not change another participant's background. Each pattern adapts automatically to the current light or dark theme and remains static, without animation.

The preference is stored in MongoDB as `users.chat_appearance`, with `wallpaperId`, `revision` and `updatedAt`. It travels with the existing account/session snapshot and `/api/me` response, without a separate wallpaper request at startup. An unchanged appearance revision does not trigger another appearance-cache write. Updating it changes the appearance/session cache while preserving messages, media, queued sends and text drafts.

Saving uses the authenticated `PUT /api/profile/appearance` endpoint and checks the submitted revision. A stale edit is rejected with HTTP `409` instead of silently replacing a newer saved choice. Own-account live events and journal recovery synchronize the accepted setting across devices as they connect or reconnect.

## Start a conversation

Open the **+** menu beside the conversation list to choose **New direct message**, **New group**, or **New channel**. The menu appears beside its button above the surrounding interface, follows the current right-to-left or left-to-right layout, and shifts or opens on the other side when needed to stay within the viewport. Use the arrow keys to move between choices and **Escape** to close it.

## Responsive conversation layout

At widths of **768 px and above**, a **76 px** navigation rail sits beside the resizable conversation list. Drag the separator between the list and the conversation to resize it. Your preferred list width is remembered in this browser and constrained by the space available for the conversation.

With the separator focused, **ArrowLeft/ArrowRight** change the width in **16 px** steps according to the current RTL/LTR layout. **Home** selects the **280 px** minimum; **End** selects up to **560 px**, limited by available space. **Enter** or a double-click resets the preferred width to **360 px**.

Desktop filters form a vertical rail for **All**, **Unread**, **Groups**, **Channels**, **Archived** and your server-saved folders. On mobile, the list or open conversation uses the full width, and filters occupy one horizontally scrollable row. Counts use existing conversation data; custom folder names remain exactly as you entered them in either interface language.

The conversation uses one **72 px** header: mobile Back, avatar/title/status at the start of the current writing direction, then Search, voice/group-call controls and the three-dot menu as available. Video, media, pin/archive, folder assignment, profile, mute, wallpaper, delete and **Chat tools** are reached through that menu according to the conversation and your permissions. Deleting still requires the existing confirmation. Topic and pinned-message strips appear only when relevant content exists, keeping general actions in the header menu.

## Drafts

Start typing in a conversation, then open another conversation or reload the page. Ouj Chat restores the unfinished text when you return. If the draft includes a reply, its reply target is restored too.

- Drafts are separate for each account and conversation. The stable account ID is used when available, with a username fallback.
- A draft expires seven days after its latest saved change.
- Drafts are local to the browser; they do not sync to another device.
- Editing an existing message does not replace the conversation's ordinary draft.
- A new-message draft is cleared after the message has been accepted into the local sending queue.

Selected attachments are not part of a text draft. They become part of the persistent queue when you send the message.

## Persistent sending queue

When you send a new text or attachment message, Ouj Chat first saves it in the browser's IndexedDB storage. The composer is cleared only after that local save succeeds. The queue includes the message text, reply target, original request identity, and attachment bytes.

If connectivity is interrupted, unsent messages can be restored after a page reload and sent using the same request identity, allowing the server to recognize repeated attempts. While Ouj Chat is open, queued messages can also be sent in the background when you view another conversation.

Transient failures use increasing retry delays. After at most five automatic attempts, the message remains failed rather than retrying indefinitely. Open **Chat tools → Outbox** to inspect queued work, retry a failed message, or remove a queued message. Removing an item from this queue is different from deleting a message that the server has already accepted.

A locally queued message is not yet a server-confirmed message. Its sending state remains visible until delivery is confirmed or an error requires attention. If local storage is unavailable or full, the composer retains the input and shows an error.

The queue is separate from the history cache. **Clear cache** in Ouj Chat's data settings does not remove queued messages or text drafts. Clearing the site's data in browser settings, deleting the browser profile, or losing the device removes local drafts and queued work.

:::info Device-local storage
Drafts and the sending queue belong to this browser profile. They are not a backup of server history and are not transferred when you sign in on another device.
:::

## Record voice and video messages

With an empty composer and no pending attachments, use the **shared microphone/camera button**. Its icon identifies the selected recording mode. A short tap switches between voice and circular video; it does not start recording or send a message.

| Action | Result |
|---|---|
| Hold the button for about **250 ms** | Begin capture in the selected mode once the required permissions and recording stream are ready. |
| Release an active recording without locking | Finish and immediately submit it through the persistent sending queue. |
| Drag upward by at least **72 px**, or use **Lock** | Keep recording after release, with explicit **Send** and **Cancel** controls. |
| Choose **Review** for a locked voice recording | End capture and retain a preview until you explicitly choose **Send** or **Cancel**; review does not publish it. |
| Cancel, close the recorder, or switch conversations | Discard active capture and release its microphone/camera tracks without publishing it. |

For keyboard access, focus the recording button and hold **Space** or **Enter**. Use **ArrowUp** to lock and **Escape** to cancel. Releasing the key during an unlocked active recording follows the same immediate-send behavior as releasing the pointer. The visible **Lock**, **Send**, and **Cancel** buttons provide alternatives to the drag gesture. Locked voice recording supports **Review**, **Send**, and **Cancel**. Recording pause/resume is available only for video.

Use HTTPS outside `localhost` and allow the microphone, plus the camera for video. Releasing before capture has actually started, denying permission, cancelling, or changing conversations must not send a message; a permission response arriving after cancellation is discarded. Camera and microphone tracks are stopped when capture is discarded.

Immediate submission still waits for successful local persistence in the outbox; it is not server delivery confirmation. A recording preview that has not entered the queue is temporary and does not survive closing the recorder or reloading the page. See [Persistent sending queue](#persistent-sending-queue) for offline delivery and retry behavior.

## Voice message playback

### Play, pause and details

Use the large round play/pause button to control a voice message. The denser waveform shows the played portion and also acts as the seek area. Elapsed/total time and file size are displayed with the recording, so you can check its duration and download size before continuing.

### Playback speed

Use the speed button beside the voice waveform to cycle through:

**1× → 1.25× → 1.5× → 1.75× → 2× → 1×**

Ouj Chat remembers the selected speed in the browser and applies it to other voice players. Changing the speed does not change the original recording.

### Playback position

Click or drag along the waveform to move to another point in the recording. The elapsed and total time show the current position.

The playback-position control also supports the keyboard: focus it with **Tab**, then use the arrow keys to change the time. Seeking preserves the playing or paused state. Seeking is unavailable while the recording is still being processed or its duration is not yet known.

## Circular video messages

A video message is a short circular recording, distinct from an ordinary attached video. Sending a regular video file, including one recorded from the paperclip menu, keeps its normal rectangular presentation; it does not automatically become a circular video message.

### Record and send

Select the camera mode with a short tap on the shared microphone/camera button, then hold to record using the [recording controls above](#record-voice-and-video-messages). The video recorder appears in a centered dialog on both mobile and desktop, rather than being constrained to the message input area.

1. Use HTTPS, or `localhost` for local development, and allow camera and microphone access when the browser asks.
2. The dialog displays the camera preview and recording controls. Granting access or viewing a preview alone does not send a message.
3. Hold to record. Release an unlocked active recording to send immediately, or drag upward/use **Lock** to continue hands-free. Video messages are limited to **60 seconds** of recorded content.
4. In locked mode, use pause, resume and stop/review as needed, then explicitly send or cancel. Stopping to review does not publish the clip.

Cancelling, closing the recorder, or switching conversations stops camera and microphone tracks and discards the active capture. Late permission results cannot publish a discarded clip. If access is denied or the browser cannot record, the recorder shows an error without sending a message.

Releasing an unlocked recording or choosing **Send** in locked mode submits the clip through the same attachment upload and persistent sending queue as other message files. Its video-message type is preserved through that path, and the server's normal attachment limits still apply. Until the queue has accepted it, a preview is temporary and should not be treated as saved work after closing the recorder.

### Playback

Received video messages play inline in a circular frame. Use play/pause, the seek control and mute/unmute to control playback; the time display shows the current position. These controls belong to the video message, so they do not require opening the ordinary video viewer.

## Conversation organization

Use the selected conversation's three-dot menu for **Pin chat** and **Archive**. To assign a folder, open **Chat tools → Folder**:

- Pinned conversations are prioritized in your list.
- Archived conversations are available through the **Archived** filter. Use **Unarchive** to return them to the ordinary list.
- Enter a folder name in the Folder panel to group a conversation with others; save an empty name to remove its folder assignment. The filter rail or mobile filter row offers your saved folders alongside the built-in filters.

These preferences belong to your account and are saved on the server. Archiving does not delete messages or remove you from a group.

## Emoji in messages

Open **Choose emoji** inside the composer to browse categories, search with English or Persian keywords, and select an available skin tone. Choosing an emoji inserts native Unicode text at the caret or replaces the selected text. If the whole emoji would exceed the existing message-length limit, it is rejected rather than cut in half.

Selecting an emoji does not send the message. Choose **Send** explicitly; the usual draft, reply, edit and persistent-queue rules still apply. Skin-tone preferences and up to **24 recently used choices** are saved separately for each account in this browser. They are not synchronized to the server or another device, and clearing browser data removes them.

The panel follows Persian/English direction and the light/dark theme on mobile and desktop. Close it with **Escape**, its close button or a click outside. It loads on demand from this site and uses native glyphs without a CDN; searches and message text are not sent to a third-party emoji service. First use may need a connection. After loading, offline reopening depends on the browser retaining the required cached assets.

The bundled `emoji-picker-react` **5.1.4** catalog contains **1,906 base entries** and **3,931 entries including variations**, covering Unicode versions up to **16**. Native appearance and support depend on the operating system and font; the picker filters unsupported glyphs. English/Persian search includes vendored Unicode CLDR annotations with their pinned source and Unicode-3.0 license retained in the repository.

Check search, skin tones, insertion position and on-screen keyboard layout on the target phone/browser; desktop checks alone do not establish native rendering on every device.

## Reactions, pinned messages and mentions

Use the controls beside a message to add or remove a supported emoji reaction. Reaction counts update for participants. Group and channel owners or administrators can pin a message; pinned messages appear above the history and can be opened from there.

When writing a message, type `@` followed by part of a member's username to see mention suggestions. Selecting a suggestion inserts the username into the composer.

## Shared media

Open the composer's **paperclip menu → Take photo / Record video** to capture an ordinary media attachment. These actions request the rear/environment camera through the browser's native file-capture controls. The operating system and browser manage the camera interface and permissions, and may show a file picker instead, especially on desktop. Opening the attachment menu alone does not start a camera stream or recording.

Captured files pass through the existing type, size and attachment-count checks, then appear in the attachment preview with the current caption and reply context. Choose **Send** explicitly to use the normal upload, persistent queue and retry flow; capture does not publish a message automatically. Cancelling keeps the text draft and pending attachments. Results returned after the account or conversation changes are ignored.

Verify camera opening, cancellation, preview and sending on each target phone/browser. Desktop file-picker or automated upload checks cover file handling and do not establish that the phone's native camera interface works.

Open **three-dot menu → Media** to browse a conversation's attachments. Filter by images, video, voice/audio, or documents. The list is paginated; use **Load more** or **Previous** to browse older files. Opening an attachment uses the normal authenticated file route.

## Dates, times and the Persian calendar

Product date/time inputs use shared, keyboard-accessible controls with the Persian calendar (`fa-IR-u-ca-persian`), including when the interface language is English. Weeks start on **Saturday**. Type into the date and time segments or open the app's calendar to navigate months, jump to today, or clear the selection. Time uses the **24-hour** clock.

The calendar popup belongs to Ouj Chat and follows its light/dark styling and responsive layout. Field labels follow your selected Persian or English interface language; changing that language does not switch the calendar to Gregorian.

Business dates and times use **Asia/Tehran**, regardless of the browser's local timezone. Scheduling converts the selected Tehran wall date/time to a UTC ISO timestamp for the API. The existing API and MongoDB date fields keep their current format.

## Message search

Use **Search** in the conversation header and choose **This chat** or **All chats**. You can also restrict results by sender username and a date range. Open a result to navigate to its conversation and message.

Select the date range with the shared Persian-calendar controls. The selected dates include the full corresponding days in **Asia/Tehran**, from the beginning of the first day through the end of the last day, even if your device uses another timezone.

Search covers messages you are currently allowed to see, including text that is stored encrypted on the server. The server decrypts bounded pages of eligible messages for matching instead of creating a plaintext search index. Use **Load more** to continue through older pages; a page without matches can still have more history to scan.

This approach preserves the existing encrypted storage format but can be slower on large histories than a dedicated search index. Deleted, hidden, expired, or inaccessible messages are excluded according to the server's visibility rules.

## Reconnection and synchronization

The server keeps a persistent event journal for message and chat-tool changes. When the app reconnects or becomes visible, it can replay changes after its last stored cursor, refresh affected conversations, and reconcile edits or deletions in loaded history.

The journal complements live WebSocket/SSE events. Your current membership and message visibility still determine what can be returned. Event replay is not a backup and does not restore deleted content.

## Active devices

Open **Chat tools → Devices** to inspect your account's sessions, their browser/device labels, and last activity. The current session is marked. **Sign out device** asks for confirmation and revokes only the selected session. Signing out the current session returns this browser to authentication.

## Scheduled messages

Hold **Send** with a mouse or touch for about **450 ms** to open a themed scheduling dialog for the current text draft. Use the Send button's context menu or **Alt+ArrowDown** for alternative access. A short click or **Enter** still sends immediately. The Send icon is on the left in Persian and on the right in English.

Choose a future Persian/Jalali date and 24-hour time, then confirm **Schedule message**. The calendar stays Persian in both interface languages; **Asia/Tehran** wall time is converted to a UTC ISO timestamp for the server. Scheduling accepts times between ten seconds and one year ahead.

Scheduling currently supports new text messages only. Editing, pending media uploads and voice keep their existing immediate-send behavior; attachments cannot be scheduled. Cancelling or a failed save preserves the draft. A successful server save clears only the submitted draft.

Text scheduled from Send retains its original reply target and selected topic; dispatch still checks the current conversation permissions.

Scheduled messages are saved on the server, so you can close the browser. **The Ouj Chat server must be running to dispatch them.** If it is stopped at the due time, pending work is handled after it starts again. Sending rechecks membership, account state, and posting permissions. An item that fails those checks is shown with an error rather than bypassing the current rules.

**Chat tools → Schedule** remains an alternative way to create a scheduled text message, inspect the list and cancel an item that is still eligible for cancellation.

If a scheduling or chat-tool request fails, including an empty or malformed HTTP response, the interface shows a readable error in the selected language and retains the form values for correction or retry. Raw JSON parser errors are not shown as user-facing failure messages.

## Polls

Open **Chat tools → Polls** and enter a question plus two to ten distinct options, one per line. Participants choose one option and can change their vote while the poll is open. Counts update as votes arrive. The poll creator or a conversation administrator can close the poll; closed polls no longer accept votes.

## Group topics and permissions

Group owners and administrators can create topics and close or reopen them through **Topics**. Assign a message to an open topic using its message controls, then use the topic selector to filter the conversation. Authors can classify their own messages; moving another author's message requires administrator permission.

Under **Group settings**, owners and administrators can configure:

- Whether ordinary members may send messages.
- Whether ordinary members may upload files.
- Slow mode, with a delay from zero to 3,600 seconds between a member's messages.

The group owner can promote a member to administrator or remove that role, with confirmation. These are group roles, separate from the server-wide Admin Panel roles. The server enforces the posting restrictions, including when forwarding or dispatching scheduled messages.

## Group voice and video calls

Open **Group call** in a group conversation. Optionally enable the camera, then choose **Join call**. Allow microphone access and, for video, camera access. During the call, you can mute, toggle an available camera, or leave.

Group calls support **up to six participants** using peer-to-peer WebRTC mesh connections. Audio can continue while the call panel is closed; reopen **Group call** to see its controls. Leaving releases the local microphone/camera streams and peer connections.

Use HTTPS outside localhost. Configure TURN for participants on restrictive or mobile networks; see [Voice and video calls](./Voice-Video-Calls). Mesh calls use more participant upload bandwidth as the room grows. This implementation is for small groups and is not a large-room SFU or a claim of Telegram-scale calling.

## Language and direction

Persian is the default when this browser has no saved language preference. Use the global **فارسی / English** control to select either language on sign-in, invitation, chat and administration screens. The choice is remembered in this browser, including an explicitly selected English preference.

Application-owned labels, dialogs, validation, status messages, human-readable errors and accessibility labels follow the selected language. Persian mode uses right-to-left application layout and localized date/number formatting. Date/time inputs retain the Persian calendar and Tehran business timezone in both languages. User-written messages, names, usernames, links, code snippets, identifiers and technical configuration keys retain their original content and direction where appropriate.

## Installation and background notifications

Where the browser offers installation, Ouj Chat uses Persian/RTL installation metadata for Persian and English/LTR metadata for English. Both manifests use square 192×192 and 512×512 icons derived from the original Ouj logo. Select your preferred language before opening the browser's install action; installed-app presentation is controlled by the browser and operating system.

### Optional device setup

After signup, sign in through the existing login flow. Your first authenticated chat offers an optional setup guide in the selected Persian or English language. The guide can also appear once on first use of the installed PWA, and you can reopen it from **Settings → Notifications**.

Choose notifications, microphone and camera separately with their explicit buttons. Opening the guide never requests browser permissions automatically. Microphone/camera checks immediately stop the streams they acquire; they do not leave a recording running. Notification setup reports enabled only after the server has saved this device's push subscription. Use the test-notification button to check delivery.

Your message-preview preference is preserved. The background worker remembers the selected language for application-owned notification wording, including generic message text and call prompts. Sender names and any permitted message preview retain their received content rather than being translated.

### Background delivery and platform support

Web Push can reach the service worker while the app interface is closed. It requires HTTPS, stable VAPID keys, a reachable server and push service, browser/OS notification permission and network access. Force-stopping the browser or app, battery restrictions and other OS policies can prevent delivery; closing the interface alone is different from forcing the application to stop.

Accepted message pushes display a visible notification even while this device is focused on the app; focused-device message notifications request no sound. The explicit test notification keeps its normal alert behavior. WebKit requires a visible notification for each processed push; updating a badge alone is insufficient. See [WebKit's visible-push requirements](https://webkit.org/blog/16535/).

SSE avoids creating a duplicate notification when Web Push is registered. Activity on another device does not suppress pushes to this device. A call-end or dismissal push replaces the incoming-call notice with a quiet **Call ended** notification.

- **iPhone/iPad:** iOS/iPadOS **16.4 or later** requires the app to be added to the Home Screen and notification permission requested from that installed app. See [WebKit's Web Push guidance](https://webkit.org/blog/13878/).
- **Android:** supported browsers can opt into Web Push. Icon badges depend on the browser, operating system and launcher; a numeric unread badge is not guaranteed on every Android device. See [MDN's badge support guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Display_badge_on_app_icon).

### Badges and account privacy

Where supported, the service worker updates or clears the installed app's badge and opens the target conversation when you select a notification. Returning to the foreground reconciles unread counts, excluding muted conversations. A badge may be a number, a dot or unavailable. On iOS/iPadOS, badge display also depends on notification permission and system settings; see [WebKit's Home Screen badge guidance](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/).

Signing out clears this app's badge and notifications and removes the device subscription. Account-ownership checks reject stale pushes belonging to a previous account, so a device shared between accounts does not reuse another account's notification ownership.

## Long histories and performance

The message history uses virtual rendering so that loaded messages outside the visible window do not all require active message elements. The timeline measures message heights and maintains its reading position as media loads.

Open **Chat tools → Performance** to compare **Loaded messages** with **Rendered message bubbles**, refresh measurements, and optionally record long browser tasks. Measurements remain on this device. The panel shows recent chat-open and long-task measurements; it does not upload a performance report.

## Deployment notes

Normal server startup initializes the MongoDB collections and indexes required by this branch. Message changes and their replay-journal records use MongoDB transactions, so a replica set is required. Existing SQL releases and their migrations 42/43 are legacy import sources; use the explicit [MongoDB import procedure](./MongoDB#import-a-legacy-sql-installation) rather than starting the active server against a SQL database.

Back up MongoDB records, encryption keys and local/S3 binary files together. The MongoDB change preserves public UUIDs and API field names; files remain with their storage provider and are not moved into chat documents or GridFS. Verify imports, permissions, journal replay and concurrent writes on your own deployment. The features above do not imply Telegram-scale capacity; measure your workload before increasing user counts.

## Related guides

- [Voice and video calls](./Voice-Video-Calls)
- [Push notifications](./Push-Notification-Proxy)
- [Troubleshooting](./Troubleshooting)
