# Chat support API contract v1

Status: **PROPOSED/DORMANT** and **BLOCKED ON WEB**. Registered-user support also **REQUIRES MIGRATION** of reviewed identity mappings. None of the `/api/platform/v1/...` routes below exists in the current Chat API. Do not expose an unauthenticated route based on this document.

## Trust model

Web is the public entry point and identity authority. Chat owns support conversations and messages. A Web BFF or approved exchange presents:

1. an authenticated, least-privilege Web service identity; and
2. a short-lived delegated principal for the initiating registered user or guest.

Chat verifies the configured issuer, `ouj-chat` audience, scope, expiry, and Web subject status. Registered principals must have an active explicit `web_user_id → chat_user_id` link. Guest principals must carry `support:conversation` and a bounded list containing the exact support conversation. Browser-supplied `userId`, role, or conversation ownership is never authoritative.

The transport/header format, asymmetric key discovery or BFF exchange, replay window, key rotation, and service scopes require Web security approval. Do not reuse Web's symmetric signing secret inside Chat.

## Proposed resources

All requests use JSON, HTTPS, a request/correlation ID, and a stable idempotency key for creation/mutation. Responses never include another guest's capability or the global Chat directory.

### Create or resume support conversation

`POST /api/platform/v1/support/conversations`

Required scope: `support:conversation:create`. The verified principal, not the body, identifies the visitor.

```json
{
  "requestId": "stable-request-id",
  "idempotencyKey": "web:support:visitor-or-user:request",
  "locale": "fa-IR",
  "context": { "page": "/listing/public-safe-id" }
}
```

`context` must use an approved, bounded allowlist and must not contain phone, CRM profile, credentials, cookies, or private listing/contact data.

```json
{
  "version": 1,
  "conversationId": "chat-conversation-uuid",
  "created": true,
  "assigned": false
}
```

The idempotency key returns the same conversation/result on retry. Web then issues or refreshes a capability restricted to this `conversationId`; Chat does not return a reusable password.

### Read bounded messages

`GET /api/platform/v1/support/conversations/:conversationId/messages?beforeId=...&limit=50`

Required scope: `support:conversation`. Chat runs `supportAccessService.authorizeConversation(..., operation: "read")`, then current membership/capability checks. `limit` must be bounded and response files use protected Chat media URLs.

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messages": [],
  "hasMore": false
}
```

### Send message

`POST /api/platform/v1/support/conversations/:conversationId/messages`

Required scope: `support:conversation`; operation `send`. Use `clientRequestId` for idempotence.

```json
{
  "clientRequestId": "uuid",
  "body": "bounded text",
  "replyToMessageId": null,
  "files": []
}
```

Attachments follow the same actor/chat/purpose/pending/final binding as native Chat uploads. A guest cannot attach an arbitrary storage key. The response acknowledges persistence, not delivery to an agent:

```json
{ "version": 1, "messageId": "uuid", "deduped": false }
```

### Acknowledge read state

`POST /api/platform/v1/support/conversations/:conversationId/read`

Required scope: `support:conversation`; operation `acknowledge`.

```json
{ "throughMessageId": "uuid", "requestId": "stable-request-id" }
```

```json
{ "version": 1, "ok": true }
```

### Realtime and replay

The first version may use the existing same-origin native WebSocket/SSE protocol after Web establishes a Chat session. If Web chooses a separate capability transport, it must be approved before adding it; query-string credentials are forbidden. Missed durable events are fetched with a bounded replay cursor as described in [Chat realtime protocol v1](./CHAT_REALTIME_PROTOCOL_V1.md).

## Server authorization matrix

| Principal | Create/resume | Read/send/acknowledge | Directory/admin/public Chat | CRM task |
|---|---:|---:|---:|---:|
| Verified guest | With create scope | Only capability-listed support conversation | No | No |
| Linked registered user | With create scope | Only current Chat memberships | No implicit access | Only after separate Web CRM delegation |
| Support agent | Web role/scope plus Chat membership/assignment | Assigned/authorized support conversations | Only separately granted Chat role | Only after separate Web CRM delegation |
| Chat admin/operator | Not a substitute for visitor identity | According to Chat permissions | Separate administrative contract | No direct Web DB access |

## Stable errors

Use JSON `{ "error": { "code": "...", "message": "...", "requestId": "..." } }` and do not reflect credentials or message bodies.

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `SUPPORT_REQUEST_INVALID` | Malformed/bounded-field failure |
| 401 | `SUPPORT_IDENTITY_REQUIRED` | Missing/invalid/expired credential |
| 403 | `SUPPORT_SCOPE_DENIED` | Scope is absent |
| 403 | `SUPPORT_CONVERSATION_DENIED` | Capability/membership does not grant the conversation |
| 404 | `SUPPORT_CONVERSATION_NOT_FOUND` | Not found after authorization-safe lookup |
| 409 | `SUPPORT_IDEMPOTENCY_CONFLICT` | Key reused with different input |
| 429 | `SUPPORT_RATE_LIMITED` | Bounded abuse protection; include `Retry-After` |
| 503 | `SUPPORT_PROVIDER_UNAVAILABLE` | Web verifier/provider or required store unavailable; fail closed |

## CRM task proposal

Chat must call a Web-owned authenticated command; it never inserts into Web `crmtasks`. `buildCrmTaskCommandV1` currently prepares this dormant payload:

```json
{
  "version": 1,
  "source": {
    "service": "ouj-chat",
    "conversationId": "uuid",
    "chatUserId": "uuid"
  },
  "actor": { "provider": "owj-web", "webUserId": "web-user-id" },
  "requestId": "stable-request-id",
  "idempotencyKey": "stable-deduplication-key",
  "task": {
    "title": "Follow up",
    "dueAt": "2026-11-21T08:00:00.000Z",
    "priority": "normal",
    "assigneeWebUserId": "optional-web-user-id"
  }
}
```

Web must re-authorize the human actor, conversation/business scope, assignee, and state transition, then return `{ "version": 1, "taskId": "canonical-web-id", "duplicate": false }`. Chat must use bounded timeout/retry and the same idempotency key. Message bodies, transcripts, phone/contact data, and customer objects are rejected. No CRM button or route is live.

## Acceptance before implementation

- Web publishes the versioned identity/service contract and key-rotation procedure.
- Contract tests cover guest isolation, registered membership, removed members, expiry/revocation, idempotent retries, upload ownership, rate limits, and no directory/admin escalation.
- Chat routes use injected repository/service operations; no cross-database access is added.
- Resource tests bound message pages, request bodies, active guest capabilities, connections, and external request timeouts.
- Rollback disables platform support routes without deleting conversations or historical Chat users.
