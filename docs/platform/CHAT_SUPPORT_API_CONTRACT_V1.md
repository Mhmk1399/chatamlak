# Chat support API contract v1

Status: **IMPLEMENTED IN SOURCE, DISABLED BY DEFAULT, NOT DEPLOYED** (Sprint 2, 2026-11-20). The contract has local mock/real-Mongo coverage, but the actual Owj Web service has not been tested with Chat.

## Trust and routing model

Web is the public identity authority and browser-facing BFF. Chat owns support conversations, messages, assignment, support sessions, and realtime authorization. Chat never reads Web collections.

The reverse proxy should expose only these integration paths to the website:

- `POST /internal/v1/support/bootstrap` — backend-to-backend only; never browser-accessible.
- `/support/v1/*` — same-origin browser support surface.

Do not proxy legacy `/api/login`, `/api/register`, global Chat directory, admin, calls, channels, or CRM routes into the website widget.

Successful support JSON responses use `version: 1`. Wrapped HTTP errors use the stable unversioned envelope below:

```json
{
  "error": {
    "code": "SUPPORT_REQUEST_INVALID",
    "message": "The support request is invalid.",
    "requestId": "request-or-generated-uuid"
  }
}
```

The server accepts a bounded `X-Request-Id` and echoes it; otherwise it generates one. The direct normal-HTTP response on `/support/v1/ws` is a documented exception: its 426 error object contains `code` and `message` but no `requestId`; native upgrade rejection is plain HTTP text. Credentials, assertion bodies, message text, and presigned queries must not be logged.

## Enablement and environment

Support is inert unless `OWJ_SUPPORT_ENABLED=true`. When enabled, startup fails closed unless the following are valid:

| Variable | Contract |
|---|---|
| `OWJ_WEB_ISSUER` | Exact absolute Web issuer; HTTPS in production |
| `OWJ_WEB_JWKS_URL` | Absolute JWKS URL; HTTPS in production |
| `OWJ_WEB_STATUS_URL` | Absolute identity-status URL; HTTPS in production |
| `OWJ_WEB_TO_CHAT_SERVICE_SECRET` | Directional inbound HMAC secret, at least 32 characters |
| `OWJ_CHAT_TO_WEB_SERVICE_TOKEN` | Directional outbound bearer credential, at least 16 characters |
| `OWJ_SUPPORT_ALLOWED_ORIGINS` | Comma-separated exact browser origins; falls back to `APP_PUBLIC_URL`, but one of them is required |

`OWJ_WEB_ALLOW_INSECURE_HTTP=true` permits HTTP issuer endpoints/origins only outside production for local development. Never enable it in production.

Operational bounds are configurable through `OWJ_IDENTITY_STATUS_CACHE_MS` (hard maximum 60 seconds), `SUPPORT_SESSION_IDLE_TIMEOUT_MS`, `SUPPORT_SESSION_ABSOLUTE_TIMEOUT_MS`, `SUPPORT_REALTIME_REVALIDATE_MS`, `SUPPORT_REALTIME_MAX_REPLAY`, `SUPPORT_MAX_CONNECTIONS_PER_SESSION`, `SUPPORT_WS_MAX_CONNECTIONS_PER_IP`, and `SUPPORT_BOOTSTRAP_RATE_LIMIT`. `WS_TRUST_PROXY` affects trusted client-IP extraction and must match the controlled proxy topology.

## Web → Chat service authentication

Bootstrap uses the dedicated `OWJ_WEB_TO_CHAT_SERVICE_SECRET` (minimum 32 characters at runtime), not Web's JWT signing key. Web sends four headers:

```http
X-Ouj-Service-Auth-Version: 1
X-Ouj-Service-Auth-Timestamp: <13-digit Unix milliseconds>
X-Ouj-Service-Auth-Nonce: <16-128 base64url characters>
X-Ouj-Service-Auth-Signature: <lowercase hex HMAC-SHA256>
```

The HMAC input is exact, newline-separated text:

```text
ouj-service-auth-v1
<timestamp>
<nonce>
POST
/internal/v1/support/bootstrap
```

Timestamp skew is bounded (five minutes by default). Nonces are held in a bounded 10-minute in-process replay cache. A Chat restart clears this service-nonce cache, but the signed assertion's durable unique `jti` still prevents bootstrap replay across restarts. Missing/invalid service auth returns `SUPPORT_SERVICE_UNAUTHORIZED`.

## Bootstrap

`POST /internal/v1/support/bootstrap`

Required headers: service-auth headers, `Content-Type: application/json`, and `Idempotency-Key` (1–180 characters). The implementation also accepts `body.idempotencyKey` as a compatibility fallback, but Web must use the header. The assertion is capped at 16 KiB. The Web assertion itself is one-time; retry after an ambiguous result should obtain a new assertion with the same Web subject. Conversation identity uniqueness makes that retry resume the same conversation; the current implementation does not replay the prior opaque session credential by idempotency key.

Customer request:

```json
{
  "assertion": "<one-time RS256 JWT>",
  "bootstrapType": "customer",
  "locale": "fa-IR",
  "context": {
    "page": "/listing/public-safe-id",
    "publicListingId": "public-token"
  }
}
```

`bootstrapType` defaults to `customer`. Customer assertions may be only `support_registered` or `support_guest` and require `support:conversation:create`. Context is allowlisted (`page`, `locale`, `publicListingId`), capped at 2 KiB as JSON, and effectively limited to 300 characters for `page` and 120 for the other context fields. The top-level `locale` is accepted up to 35 characters but persistence currently retains at most 24; Web should therefore send no more than 24. Do not send CRM/customer/contact data.

Staff request uses `"bootstrapType":"staff"`, `token_use:"support_agent"`, and both `support:agent` and `support:conversation:create`. Staff must also have an active explicit Web↔Chat link and pass Web's current-status check.

Response (`201` created, `200` resumed):

```json
{
  "version": 1,
  "conversationId": "chat-conversation-uuid",
  "supportSessionCredential": "ocs_<opaque-random-value>",
  "expiresAt": "2026-11-21T12:00:00.000Z",
  "created": true,
  "assigned": false,
  "supportAvailable": true
}
```

The bootstrap response is `Cache-Control: private, no-store`. Only the authenticated Web backend receives the opaque credential. The current issuer uses 32 random bytes (`ocs_` plus 43 base64url characters). Chat stores only a namespace-bound SHA-256 digest, never the raw value. Web must place it into a same-origin cookie:

```http
Set-Cookie: owj_support_sid=<credential>; Path=/support/v1; HttpOnly; SameSite=Lax; Secure
```

Use `Secure` on HTTPS and a cookie expiry no later than `expiresAt`. Browser API and realtime requests accept this cookie only; bearer/query credentials are not supported.

Default support-session limits are 30 minutes idle and 12 hours absolute (`SUPPORT_SESSION_IDLE_TIMEOUT_MS`, `SUPPORT_SESSION_ABSOLUTE_TIMEOUT_MS`). A session carries only explicit customer actions (`read`, `send`, `events`, `logout`) or staff actions (plus `staff:list`, `staff:assign`, `staff:resolve`). It is not a legacy Chat session.

## Browser customer API

### `GET /support/v1/session`

Returns only widget state:

```json
{
  "version": 1,
  "conversationId": "uuid",
  "status": "active",
  "identityKind": "guest",
  "allowedActions": ["read", "send", "events", "logout"],
  "expiresAt": "ISO-8601",
  "supportAvailable": true
}
```

It never returns the Chat actor UUID, Web subject, token digest, role, or admin fields.

### `GET /support/v1/messages?cursor=<base64url>&limit=50`

The conversation comes from the support session; a caller cannot select one. `limit` defaults to 50 and is capped at 100. The opaque cursor is base64url JSON containing the oldest returned `{ "id", "createdAt" }`. Messages are chronological within the page:

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messages": [
    {
      "id": "uuid",
      "body": "Hello",
      "authorKind": "customer",
      "createdAt": "ISO-8601",
      "editedAt": null,
      "files": []
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

File entries expose only bounded public fields and protected Chat URLs. Version 1 has no support-widget upload mutation; message creation is text-only even though historical/native Chat attachments can be represented on reads.

### `POST /support/v1/messages`

```json
{ "body": "bounded text", "clientRequestId": "widget-request-uuid" }
```

Text is required, capped at 4,000 characters/16 KiB. `clientRequestId` is 1–120 characters from `[A-Za-z0-9._:-]`. Chat checks the session-bound conversation and open/assigned lifecycle, then calls the existing transactional/idempotent message repository. Retry the identical request with the same identifier.

Message idempotency is bound to `(conversation, actor, clientRequestId)`. An exact retry returns the originally persisted message with HTTP 200 and `deduped:true`. Reusing that key with a different body returns `409 SUPPORT_IDEMPOTENCY_CONFLICT`; it never replaces the first message. Clients must generate a new key for every intentional message.

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messageId": "uuid",
  "deduped": false
}
```

New persistence returns `201`; a deduplicated retry returns `200`. The message and durable journal record share the Mongo transaction; live broadcasting does not write a second journal entry.

### `GET /support/v1/events` and `GET /support/v1/ws`

SSE and native WebSocket contracts are defined in [Realtime protocol v1](./CHAT_REALTIME_PROTOCOL_V1.md). A normal HTTP GET to the WS path returns `426 SUPPORT_WEBSOCKET_UPGRADE_REQUIRED`.

### `POST /support/v1/logout`

Revokes the local support session, disconnects known streams, clears only `owj_support_sid`, and returns `{ "version":1, "ok":true }`. Logout remains locally available if Web status is unavailable or the session has already expired.

## Staff API

All staff routes require `actorKind:"agent"`, scope `support:agent`, an active Web↔Chat link/current Web status, and the relevant support-session action.

| Method/path | Behavior |
|---|---|
| `GET /support/v1/staff/conversations?status=available|assigned|open|resolved|closed&limit=` | Available/open are unassigned; assigned/resolved/closed are restricted to the current agent. Page size ≤100. |
| `GET /support/v1/staff/conversations/:conversationId?cursor=&limit=` | Only the assigned agent with Chat membership can read; messages use the safe customer/agent schema. |
| `POST /support/v1/staff/conversations/:conversationId/assign` | Requires `Idempotency-Key`; one Mongo transaction couples the atomic assignment claim with Chat membership. One agent wins and resolved/closed work never reopens. |
| `POST /support/v1/staff/conversations/:conversationId/reply` | Same text/idempotency schema; allowed only while status is `assigned`. |
| `POST /support/v1/staff/conversations/:conversationId/resolve` | Requires `Idempotency-Key`; body `{ "resolution":"resolved" }` or `closed`; only the assigned agent. Allowed transitions are assigned→resolved/closed and resolved→closed. |

Staff command keys are stored only as digests. A repeated assignment/state transition returns the authoritative current state and suppresses another realtime event. Reusing a resolution key for a different outcome returns `409 SUPPORT_IDEMPOTENCY_CONFLICT`; invalid or concurrent lifecycle transitions return a stable 409 conflict.

The implementation supplies backend routes only; it does not add a new staff frontend or grant the Chat admin panel to agents.

## Authorization and current-state rules

- Registered sessions require exact conversation identity, active link, current membership, active Chat account, and Web status.
- Guest sessions compare a digested Web guest subject to exactly one support conversation. Guests are not inserted into `users` and cannot access legacy/global APIs.
- Agent assignment and membership are transactionally coupled. Reading/replying additionally requires the current assignment and Chat membership.
- Web status is cached per operation for at most 60 seconds. Once stale, Web outage fails registered/agent operations closed; guest operation remains local.
- Resolved/closed conversations remain readable by their assigned agent but customer/staff sends stop. A later bootstrap resumes that same closed conversation with `supportAvailable:false`; creating a second case/reopening is not yet implemented.
- Expired/revoked support sessions are rejected and cleaned periodically; open realtime connections revalidate independently.

## Stable error families

| HTTP | Representative code | Meaning |
|---:|---|---|
| 400 | `SUPPORT_REQUEST_INVALID` | Invalid/capped field, cursor, context, or conversation UUID |
| 401 | `SUPPORT_SERVICE_UNAUTHORIZED` | Invalid Web→Chat service authentication |
| 401 | `SUPPORT_SESSION_REQUIRED` | Missing/malformed/unknown support cookie |
| 401 | `SUPPORT_SESSION_EXPIRED` / `SUPPORT_SESSION_REVOKED` | Local support session no longer active |
| 401/403 | `IDENTITY_*` | Signature/claim/replay/link/current-state rejection |
| 403 | `SUPPORT_ACTION_DENIED` | Session class lacks the required action |
| 403 | `SUPPORT_CONVERSATION_DENIED` | Conversation, lifecycle, membership, or assignment denied |
| 403 | `SUPPORT_AGENT_REQUIRED` | Customer attempted a staff route |
| 403 | `SUPPORT_SCOPE_DENIED` / `SUPPORT_ORIGIN_DENIED` | Assertion class/scope or realtime Origin denied |
| 409 | `SUPPORT_IDEMPOTENCY_CONFLICT` / `SUPPORT_ASSIGNMENT_CONFLICT` / `SUPPORT_ASSIGNMENT_CLOSED` / `SUPPORT_RESOLUTION_CONFLICT` | Retry input, assignment, or lifecycle conflict |
| 426 | `SUPPORT_WEBSOCKET_UPGRADE_REQUIRED` | Normal HTTP request used instead of a native WS upgrade |
| 429 | `SUPPORT_RATE_LIMITED` / `SUPPORT_CONNECTION_LIMIT` | Bounded abuse/connection ceiling |
| 500 | `SUPPORT_INTERNAL_ERROR` | Redacted fallback for an unexpected server error |
| 503 | `SUPPORT_PROVIDER_UNAVAILABLE` | Required Web/store/provider unavailable; fail closed |

Default HTTP limits are 3,000 bootstrap requests per 15 minutes per resolved client IP (configurable) and 60 message writes per minute. `trust proxy` must match the controlled reverse proxy topology; otherwise IP-based limits can be misleading.

## Known cross-repository dependencies

- Actual RS256 issuer/JWKS and assertion fixtures from Web.
- Actual identity-status endpoint and directional Chat→Web credential.
- Web BFF signing of inbound service-auth headers and setting the exact cookie.
- Reverse-proxy tests for cookie path, Origin, SSE buffering, and WS upgrade.
- Verified account-link and guest-conversion proof endpoints.
- A product decision and implementation for reopening/creating a new case after resolution.

Do not describe the integration as production-complete until actual Web+Chat tests pass.

