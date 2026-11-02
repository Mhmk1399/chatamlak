# Chat Features

Songbird includes conversation organization, message search, polls, topics, group controls, and group calls. Open **Chat tools** above the conversation to reach the available panels. Some panels appear only after selecting a conversation or when your role permits the action.

## Drafts

Start typing in a conversation, then open another conversation or reload the page. Songbird restores the unfinished text when you return. If the draft includes a reply, its reply target is restored too.

- Drafts are separate for each account and conversation. The stable account ID is used when available, with a username fallback.
- A draft expires seven days after its latest saved change.
- Drafts are local to the browser; they do not sync to another device.
- Editing an existing message does not replace the conversation's ordinary draft.
- A new-message draft is cleared after the message has been accepted into the local sending queue.

Selected attachments are not part of a text draft. They become part of the persistent queue when you send the message.

## Persistent sending queue

When you send a new text or attachment message, Songbird first saves it in the browser's IndexedDB storage. The composer is cleared only after that local save succeeds. The queue includes the message text, reply target, original request identity, and attachment bytes.

If connectivity is interrupted, unsent messages can be restored after a page reload and sent using the same request identity, allowing the server to recognize repeated attempts. While Songbird is open, queued messages can also be sent in the background when you view another conversation.

Transient failures use increasing retry delays. After at most five automatic attempts, the message remains failed rather than retrying indefinitely. Open **Chat tools → Outbox** to inspect queued work, retry a failed message, or remove a queued message. Removing an item from this queue is different from deleting a message that the server has already accepted.

A locally queued message is not yet a server-confirmed message. Its sending state remains visible until delivery is confirmed or an error requires attention. If local storage is unavailable or full, the composer retains the input and shows an error.

The queue is separate from the history cache. **Clear cache** in Songbird's data settings does not remove queued messages or text drafts. Clearing the site's data in browser settings, deleting the browser profile, or losing the device removes local drafts and queued work.

:::info Device-local storage
Drafts and the sending queue belong to this browser profile. They are not a backup of server history and are not transferred when you sign in on another device.
:::

## Voice message playback

### Playback speed

Use the speed button beside the voice waveform to cycle through:

**1× → 1.25× → 1.5× → 1.75× → 2× → 1×**

Songbird remembers the selected speed in the browser and applies it to other voice players. Changing the speed does not change the original recording.

### Playback position

Click or drag along the waveform to move to another point in the recording. The elapsed and total time show the current position.

The playback-position control also supports the keyboard: focus it with **Tab**, then use the arrow keys to change the time. Seeking preserves the playing or paused state. Seeking is unavailable while the recording is still being processed or its duration is not yet known.

## Conversation organization

Use **Pin chat**, **Archive**, and **Folder** above the selected conversation:

- Pinned conversations are prioritized in your list.
- Archived conversations are available through the **Archived** filter. Use **Unarchive** to return them to the ordinary list.
- Enter a folder name to group a conversation with others. The sidebar offers each folder alongside **All**, **Unread**, **Groups**, and **Channels**.

These preferences belong to your account and are saved on the server. Archiving does not delete messages or remove you from a group.

## Reactions, pinned messages and mentions

Use the controls beside a message to add or remove a supported emoji reaction. Reaction counts update for participants. Group and channel owners or administrators can pin a message; pinned messages appear above the history and can be opened from there.

When writing a message, type `@` followed by part of a member's username to see mention suggestions. Selecting a suggestion inserts the username into the composer.

## Shared media

Open **Media** to browse a conversation's attachments. Filter by images, video, voice/audio, or documents. The list is paginated; use **Load more** or **Previous** to browse older files. Opening an attachment uses the normal authenticated file route.

## Message search

Open **Search** and choose **This chat** or **All chats**. You can also restrict results by sender username and a date range. Open a result to navigate to its conversation and message.

Search covers messages you are currently allowed to see, including text that is stored encrypted on the server. The server decrypts bounded pages of eligible messages for matching instead of creating a plaintext search index. Use **Load more** to continue through older pages; a page without matches can still have more history to scan.

This approach preserves the existing encrypted storage format but can be slower on large histories than a dedicated search index. Deleted, hidden, expired, or inaccessible messages are excluded according to the server's visibility rules.

## Reconnection and synchronization

The server keeps a persistent event journal for message and chat-tool changes. When the app reconnects or becomes visible, it can replay changes after its last stored cursor, refresh affected conversations, and reconcile edits or deletions in loaded history.

The journal complements live WebSocket/SSE events. Your current membership and message visibility still determine what can be returned. Event replay is not a backup and does not restore deleted content.

## Active devices

Open **Chat tools → Devices** to inspect your account's sessions, their browser/device labels, and last activity. The current session is marked. **Sign out device** asks for confirmation and revokes only the selected session. Signing out the current session returns this browser to authentication.

## Scheduled messages

Open **Chat tools → Schedule**, enter a text message and a future date/time, and choose **Schedule message**. The entered time uses your browser's local timezone and is sent to the server as an absolute time. Scheduling accepts times between ten seconds and one year ahead.

Scheduled messages are saved on the server, so you can close the browser. **The Songbird server must be running to dispatch them.** If it is stopped at the due time, pending work is handled after it starts again. Sending rechecks membership, account state, and posting permissions. An item that fails those checks is shown with an error rather than bypassing the current rules.

Use the schedule list to cancel an item that is still eligible for cancellation. This interface schedules text; it does not schedule attachments.

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

Use **فارسی / English** above the conversation to switch the chat interface and tools. The selection is remembered in the browser. Persian mode uses right-to-left application layout, localized labels and date/number formatting; user-written messages retain content-dependent direction.

## Long histories and performance

The message history uses virtual rendering so that loaded messages outside the visible window do not all require active message elements. The timeline measures message heights and maintains its reading position as media loads.

Open **Chat tools → Performance** to compare **Loaded messages** with **Rendered message bubbles**, refresh measurements, and optionally record long browser tasks. Measurements remain on this device. The panel shows recent chat-open and long-task measurements; it does not upload a performance report.

## Deployment notes

Normal server startup applies migration **42** for messaging-tool data and migration **43** for transactional event journaling. Back up your existing database before upgrading, following the [database guide](./Database-Commands).

SQLite and PostgreSQL code paths are provided. Successful checks on one database do not certify the other: verify migrations, permissions, journal replay, and concurrent writes against the database you deploy. The features above do not imply Telegram-scale capacity; measure your own workload before increasing user counts.

## Related guides

- [Voice and video calls](./Voice-Video-Calls)
- [Push notifications](./Push-Notification-Proxy)
- [Troubleshooting](./Troubleshooting)
