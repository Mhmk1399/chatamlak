# Owj Chat native realtime protocol v1

Status: the base Chat-owned HTTP/raw-WebSocket/SSE protocol is **IMPLEMENTED TODAY**; the admission/session/media hardening described as sprint work is **IMPLEMENTED IN SPRINT** in this source tree. It is the integration target for Owj Web. **Owj Chat does not implement Socket.IO.** This is not evidence that the audited source is deployed.

## Transport overview

```text
Web/browser ── authenticated HTTP commands ──> Chat
            <─ JSON command responses ────────
            <─ raw WebSocket JSON (/ws) ───── preferred live events
            <─ SSE data frames (/api/events)  fallback live events
             ─ HTTP replay cursor ───────────> /api/messaging/sync
```

HTTP is authoritative for message mutations and acknowledgements. WebSocket/SSE are notification transports; receiving a live event is not a persistence acknowledgement. Replay repairs supported missed events, but consumers must refetch authoritative chat/message state after reconnect.

## Authentication

- Current browser auth is the same-origin `sid` cookie: HttpOnly, SameSite=Lax, `Path=/`, and Secure on production HTTPS.
- Raw WebSocket upgrades authenticate before acceptance using that cookie. Query parameters named `token` or `sid` are rejected to prevent URL/log leakage. A legacy `username` query may be present, but it is not identity authority.
- SSE calls `GET /api/events?username=<name>` with credentials; the query username must match the authenticated session.
- HTTP calls use cookies (`credentials: "include"` in the Chat client) and recheck membership/role for the requested resource.
- Logout or device-session revocation closes the matching raw WebSocket and SSE stream. Admin ban, password reset, or account deletion closes every raw WebSocket and SSE stream for the affected Chat username.
- Platform/guest credentials are not yet wired into these routes. Web must not place a future capability in a URL.

## Raw WebSocket

Endpoints: `GET` upgrade on `/ws` (primary) or `/api/ws` (alias). Use `wss:` under HTTPS.

Admission controls in the sprint source include allowed browser origin/same-host validation, authentication timeout, maximum payload bytes, per-IP connection ceiling, message-rate window, heartbeat, and explicit session disconnect. Nginx deployments must configure trusted client-IP behavior so a per-IP ceiling does not accidentally treat every user as the proxy container.

Server events are one JSON object per text frame:

```json
{
  "type": "chat_message",
  "chatId": "uuid",
  "messageId": "uuid",
  "userId": "uuid",
  "username": "name",
  "body": "message text"
}
```

Common `type` values consumed by the client include:

- `chat_message`, `chat_message_updated`, `chat_message_deleted`;
- `chat_read`, `chat_typing`, `chat_list_changed`, `chat_updated`, `chat_deleted`;
- `presence_update`, `profile_updated`, `chat_appearance_updated`;
- `chat_tools_updated`, `remote_channel_queue`, `video:ready`;
- `group_call_updated`, `group_call_signal`, `call:*`;
- `session_revoked` and protocol `error`.

Payloads vary by event; consumers must ignore unknown fields/types and refetch state. There is no Socket.IO event name/room handshake and no WebSocket delivery acknowledgement ID.

Client-to-server WebSocket messages are limited. Supported protocol control is `{ "type": "ping" }` → `{ "type": "pong", "timestamp": ... }`; WebRTC signaling uses an authenticated `call_signal` action with a valid chat and server-side membership checks. Ordinary message sending remains HTTP.

Oversized payload closes with 1009. Authentication/rate violations close with policy code 1008 or reject the HTTP upgrade. Invalid JSON receives `{ "type": "error", "error": "Invalid WebSocket payload." }`.

## SSE fallback

Endpoint: `GET /api/events?username=<authenticated username>` with cookies.

Response is `text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. First frame:

```text
data: {"type":"connected"}

```

Each event is `data: <JSON>\n\n`; a comment heartbeat `: ping` is written about every 25 seconds. SSE carries the same JSON payload family as WebSocket. It is server-to-client only, so all commands remain HTTP. On disconnect, the client reconnects with bounded exponential backoff and jitter.

Chat event fan-out resolves current members. Membership-changing events invalidate the short member cache so a removed member does not continue receiving later protected conversation events.

Each SSE response is associated in memory with a digest-derived identifier for the `sid` that opened it. Explicit logout/device revocation ends only matching streams; account-wide ban/password-reset/delete ends all streams for that username. The raw token is not retained as the identifier. An already-open WebSocket or SSE stream is not yet periodically revalidated solely because its idle/absolute expiry time passes, so production timeout configuration and this defense-in-depth follow-up remain rollout work.

## Core HTTP message contract

All private operations require the session and current membership. The current native UI includes a username for legacy compatibility; the server requires it to match the session rather than trusting it.

| Purpose | Endpoint | Key request/response behavior |
|---|---|---|
| List messages | `GET /api/messages?chatId=&username=&beforeId=&beforeCreatedAt=&afterId=&afterCreatedAt=&limit=` | Bounded/cursor window; returns `{ chatId, messages, hasMore }`. |
| Send message | `POST /api/messages` | JSON text route; returns persisted message ID/result. Use `clientRequestId` for idempotence. |
| Send with files | `POST /api/messages/upload` | Multipart/presigned descriptors; ownership and membership are checked. |
| Edit/delete/forward | `POST /api/messages/edit`, `/delete`, `/forward` | HTTP response is command acknowledgement; realtime event tells viewers to refresh. |
| Typing | `POST /api/messages/typing` | Ephemeral; not included in durable replay. |
| Read all visible | `POST /api/messages/read` | Body includes `chatId`, matching username; emits `chat_read`. |
| Read one | `POST /api/messages/read-one` | Also validates that `messageId` belongs to `chatId`; emits `chat_read`. |
| Read counts | `POST /api/messages/read-counts` | Validates membership and bounded IDs. |
| First unread | `GET /api/messages/first-unread` | Membership-scoped anchor. |

The extended tools API lives below `/api/messaging`: preferences, search, reactions, pins, scheduled messages, polls, topics, group policy/roles, call state, media list, devices, changes, and replay. Each route derives the actor from the session.

## Reconnect and replay

`GET /api/messaging/sync?after=<non-negative integer>` requires authentication. It returns at most 200 membership-scoped journal entries in ascending sequence:

```json
{
  "events": [
    { "type": "chat_message_updated", "chatId": "uuid", "messageId": "uuid", "sequence": 42 }
  ],
  "cursor": 42,
  "hasMore": false
}
```

Continue while `hasMore` is true, then store the cursor per account. The native client polls about every 15 seconds and on online/visibility transitions. Replay entries are invalidation hints; fetch `/api/chats`, `/api/messages`, or `/api/messaging/chats/:chatId/changes?ids=...` for authoritative content.

`chat_typing` and `chat_read` are intentionally not journaled. Not every historical event producer is guaranteed to have a transactionally coupled journal record, so Web must also refresh state after a gap, cursor reset, schema upgrade, or suspicious sequence.

## Files and media

Message responses expose protected URLs such as:

- `GET /api/uploads/file/:fileId` — resolves file → message → chat; authorizes current membership or explicit public-channel visibility; may stream/decrypt or redirect to a short-lived object-store URL.
- `GET /api/uploads/thumbs/:fileId` — same authorization for thumbnails.
- `GET /api/uploads/messages/:storedName` — same authorization, local range support, or authorized remote redirect.

Private responses are `Cache-Control: private, no-store`; explicit public-channel media may use public caching. Avatar routes are separate public profile assets and are not message-attachment authorization.

Presigned flow:

1. `POST /api/uploads/presign` with actor-bound `chatId`, purpose and either target `messageId` or future-message `clientRequestId`.
2. Browser uploads bytes to the returned provider URL.
3. Message publication consumes a pending descriptor, or `POST /api/uploads/complete` completes an existing-message upload. Completion records `upload_completed_at`, awaits persistence and queue admission, preserves the pending claim on overload, consumes it on success, and treats an ownership-checked retry as idempotent.
4. Processing callback `POST /api/uploads/webhook/processed` is internal and fails closed without the shared secret.
5. `chat_message_updated`/`video:ready` tells clients to refetch; protected file URLs remain stable.

The browser must never treat a caller-supplied storage key, user ID, or MIME value as proof of ownership.

## Web integration rules

- Adapt the old Web Socket.IO widget to these HTTP/raw-WebSocket/SSE contracts; do not add Socket.IO to Chat.
- Establish a Chat session or another approved non-URL credential exchange before opening realtime transport.
- Reuse `clientRequestId` and idempotency keys across timeout retries.
- Treat HTTP 401/403 as terminal identity/authorization failures, 409 as state conflict, 429/503 as bounded retry with backoff, and reconnect only with jitter.
- Never put private message text, cookies, bearer/capability tokens, or presigned URL query strings in logs/telemetry.
- Contract-test native WS and SSE fallback, replay, removed membership, session revocation, file/range authorization, and rolling-version compatibility before rollout.
