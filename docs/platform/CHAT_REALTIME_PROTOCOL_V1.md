# Owj Chat realtime protocol v1

Status: the native Chat realtime stack and the Sprint 2 support realtime stack are implemented in this source tree. Support remains disabled unless `OWJ_SUPPORT_ENABLED=true`. This document is a source contract, not evidence of an Owj Web integration, reverse-proxy validation, Docker run, or production deployment.

Owj Chat uses native WebSocket and Server-Sent Events (SSE). It does **not** implement Socket.IO.

## Protocol families

| Audience | WebSocket | SSE | Mutation/replay API | Credential |
|---|---|---|---|---|
| Native Chat client | `/ws` (`/api/ws` alias) | `/api/events` | Existing `/api/*` and `/api/messaging/sync` | Chat `sid` cookie |
| Owj Web support widget/staff | `/support/v1/ws` | `/support/v1/events` | `/support/v1/*` and `/internal/v1/support/*` | `owj_support_sid` cookie |

HTTP responses acknowledge commands. A live event is only a notification; clients must use the HTTP/replay contracts to repair state after reconnects.

## Support realtime admission

Both support transports require all of the following:

- a valid `owj_support_sid` cookie issued by the bootstrap contract;
- a session with the `events` action;
- a request `Origin` that exactly matches an origin in `OWJ_SUPPORT_ALLOWED_ORIGINS` (or `APP_PUBLIC_URL` when the explicit list is absent);
- continuing authorization to the same conversation.

Missing `Origin` is denied. WebSocket query parameters named `token`, `sid`, or `supportSession` are rejected. Do not send credentials or replay secrets in URLs. The only supported SSE query value is the non-secret replay `cursor`.

The support session is periodically revalidated; the default is every 15 seconds (`SUPPORT_REALTIME_REVALIDATE_MS`). It is also closed at the session's effective expiry. Revocation, logout, expiration, account-status failure, identity-link change, conversation-authorization failure, or shutdown terminates live access.

## Support event envelope

Support events are JSON objects. A newly published live message notification has this shape:

```json
{
  "version": 1,
  "type": "chat_message",
  "conversationId": "conversation-uuid",
  "chatId": "conversation-uuid",
  "messageId": "message-uuid",
  "userId": "chat-user-uuid",
  "actorKind": "customer",
  "cursor": "message-uuid",
  "eventId": "message:message-uuid",
  "occurredAt": "2026-11-21T09:00:00.000Z"
}
```

Common fields are:

| Field | Contract |
|---|---|
| `version` | `1` on Sprint 2 live, replayed, and protocol-generated events. |
| `type` | Event discriminator. Ignore unknown types safely. |
| `conversationId` | Conversation boundary used for authorization and fan-out. |
| `cursor` | Opaque replay position, at most 256 characters. Store it exactly; do not parse it. |
| `eventId` | Stable deduplication identity when available. |
| `occurredAt` | ISO timestamp on live/journal events; protocol-control events may omit it. |

Implemented event types include:

- `chat_message`;
- `support_request_created` and `support_queue_updated`;
- `support_assigned`, `support_resolved`, and `support_closed`;
- protocol events `connected`, `replay_complete`, `session_revoked`, `error`, and `pong`.

Message cursor/event IDs are stable (`<messageId>` and `message:<messageId>`). Durable message replay comes from the MongoDB chat event journal. Replay normalization adds `version:1`, `conversationId`, `chatId`, stable `cursor`/`eventId`, `occurredAt`, and numeric `sequence` to legacy journal rows. For a message that still exists, it also loads the stored author and derives `userId`/`actorKind` against the support conversation. HTTP message reads remain authoritative for body, author classification, timestamps, and files, especially if the underlying message was removed.

Other live support events use an in-process `sr_*` cursor unless a caller provides a valid cursor. The staff inbox fan-out is in-memory only; after a process restart staff must refetch the authoritative HTTP list.

## Support SSE

Open:

```http
GET /support/v1/events
Cookie: owj_support_sid=...
Origin: https://web.example
Last-Event-ID: <opaque cursor>   # optional
```

Alternatively use `?cursor=<opaque cursor>`. If both are present, `Last-Event-ID` wins. The response uses:

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: private, no-store, no-transform
X-Accel-Buffering: no
```

Each event contains `id`, `event`, and JSON `data` fields. A `: ping` comment heartbeat is sent every 25 seconds. The server subscribes before loading replay, buffers bounded live events during replay, and suppresses duplicate event/cursor identities. Replay is bounded to 200 events.

After replay, SSE emits `connected` with `cursor`, `hasMore`, and `gap`. If `hasMore` is true, reconnect with the returned cursor (or switch to WebSocket replay) until the durable backlog is consumed, deduplicating any redelivery. If `gap` is true, refetch authoritative HTTP state before accepting the stream as repaired.

On revocation the server attempts to emit `session_revoked` and then ends the stream. Browsers may reconnect automatically; the widget must stop retrying on terminal identity/authorization failures and obtain a fresh bootstrap through Web.

## Support WebSocket

Open a native `wss:` upgrade to `/support/v1/ws`. A normal HTTP GET returns `426 SUPPORT_WEBSOCKET_UPGRADE_REQUIRED`.

Default admission and lifecycle limits are:

| Control | Default |
|---|---:|
| Maximum frame | 16 KiB |
| Connections per client IP | 20 (`SUPPORT_WS_MAX_CONNECTIONS_PER_IP`) |
| Connections per support session across SSE/WS hub subscriptions | 4 (`SUPPORT_MAX_CONNECTIONS_PER_SESSION`) |
| Authentication timeout | 5 seconds |
| Server ping interval | 30 seconds |
| Pong timeout | 10 seconds |
| Session revalidation | 15 seconds |
| Replay page | 200 events |

`WS_TRUST_PROXY` must match the controlled proxy topology before `X-Forwarded-For` is trusted. Incorrect proxy configuration can collapse all users to one IP or allow caller-supplied addresses.

Client control frames:

```json
{ "type": "ping" }
```

returns `pong`. To replay:

```json
{ "type": "resume", "cursor": "opaque-cursor-or-empty-string" }
```

The server sends replayed events followed by:

```json
{
  "version": 1,
  "type": "replay_complete",
  "conversationId": "conversation-uuid",
  "cursor": "latest-opaque-cursor",
  "hasMore": false,
  "gap": false
}
```

If `hasMore` is true, issue another `resume` with the returned cursor. If `gap` is true, refetch HTTP state before continuing. Only one replay runs per socket. Error codes include `INVALID_PAYLOAD`, `INVALID_REPLAY_CURSOR`, `REPLAY_IN_PROGRESS`, `REPLAY_UNAVAILABLE`, and `UNSUPPORTED_ACTION`.

Oversized frames close with WebSocket code 1009. Session-policy failures close with 1008. Connection-ceiling failures may close with 1013 or reject the upgrade with HTTP 429. `session_revoked` is best-effort before a policy close and must not be treated as the only revocation signal.

## Support replay and durability boundary

`chat_message` is created through Chat's existing transactional/idempotent message path. Its message mutation and journal hint are written together; the richer live publication deliberately does not journal it a second time. Support replay reads and normalizes that journal with conversation and viewer visibility filters. The authoritative HTTP message read supplies body, author classification, timestamps, and files.

Replay accepts either a numeric journal sequence or a stable message/event identifier. Results are ascending, bounded, and include `hasMore` and `gap`. Consumers must deduplicate by `eventId`, falling back to `cursor`, and must tolerate redelivery.

Assignment, resolution, queue refresh, connection, presence, and heartbeat signals are not all durable events. The authoritative recovery sequence is:

1. reconnect with the last stored cursor;
2. consume all replay pages;
3. if `gap` is true or state is suspicious, refetch the conversation/messages/agent queue over HTTP;
4. persist the new cursor only after applying the corresponding state.

## Native Chat realtime

The original Chat UI remains on its separate `sid`-authenticated protocol:

- raw WebSocket upgrades on `/ws` or `/api/ws`;
- SSE on `/api/events?username=<authenticated username>`;
- HTTP mutations and `/api/messaging/sync?after=<numeric sequence>` for bounded replay.

The query username is legacy compatibility data and must match the authenticated session; it is not identity authority. Native WebSocket rejects credential query parameters. Current message, membership, presence, call, media, and invalidation events keep their existing shapes, which are not the support envelope contract.

Native SSE and WebSocket now revalidate open Chat sessions periodically (60 seconds by default through `SSE_SESSION_REVALIDATE_MS` and `WS_SESSION_REVALIDATE_MS`). Explicit logout/device revocation disconnects the matching session; account-wide ban, password reset, or deletion disconnects all sessions for the username.

## Client behavior and errors

- Prefer WebSocket when it works through the deployed proxy; use SSE as the one-way fallback. All writes remain HTTP.
- Reconnect with bounded exponential backoff and jitter. Do not retry terminal 401/403 responses indefinitely.
- Treat 409 as a state/idempotency conflict and 429/503 as a bounded retry case honoring service health.
- Never log cookies, assertions, bearer/service credentials, private message bodies, or presigned URL query strings.
- Ignore unknown event types and fields for forward compatibility.
- Refetch after replay gaps, server restarts, cursor resets, schema/version changes, or suspected missed state.

## Verification still required outside this repository

Before rollout, test both transports through the real Web/Nginx topology: cookie path and Secure behavior, strict Origin handling, WebSocket upgrades, SSE buffering, proxy timeouts, client-IP trust, reconnect/replay, account disablement, link revocation, logout, assignment changes, and rolling-version compatibility. None of those cross-repository/deployment checks is proven merely by the Sprint 2 source and isolated tests.
