# Chat support API contract v1

Status: **IMPLEMENTED AND ACCEPTED IN THE SYNTHETIC LOCAL WEB+CHAT STACK; DISABLED BY DEFAULT** (Sprint 2.5 snapshot: 2026-11-21). This is local contract evidence, not a production migration, deployment, capacity result, or browser-automation result.

## Ownership and routing

Web owns canonical people, login, account state, global roles, RS256 assertion issuance, JWKS, and browser bootstrap. Chat owns support conversations, support sessions, messages, assignment, and native realtime. Neither service writes the other service's database.

The intended routes are:

- `POST /internal/v1/support/bootstrap`: internal Web-to-Chat command; never expose it to browsers.
- `/support/v1/*`: same-origin browser support surface proxied to Chat.

Chat support is inert unless `OWJ_SUPPORT_ENABLED=true`. Do not proxy Chat's legacy login/register, global directory, admin, channels, calls, or CRM routes into the website support widget.

## Required runtime configuration

When support is enabled, Chat fails startup closed unless these values are valid:

| Variable | Contract |
|---|---|
| `OWJ_WEB_ISSUER` | Exact absolute Web issuer; HTTPS in production |
| `OWJ_WEB_JWKS_URL` | Absolute Web JWKS URL; HTTPS in production |
| `OWJ_WEB_STATUS_URL` | Absolute Web identity-status URL; HTTPS in production |
| `OWJ_WEB_TO_CHAT_SERVICE_SECRET` | Dedicated directional bootstrap HMAC secret, at least **32 characters** |
| `OWJ_CHAT_TO_WEB_SERVICE_TOKEN` | Dedicated directional status Bearer credential, at least **32 characters** |
| `OWJ_SUPPORT_ALLOWED_ORIGINS` | Exact comma-separated browser origins; otherwise `APP_PUBLIC_URL` must be present |

The two directional credentials are different credentials and must not reuse Web signing keys, `JWT_SECRET`, MongoDB credentials, or browser tokens. `OWJ_WEB_ALLOW_INSECURE_HTTP=true` is accepted only outside production for local development.

Current-state bounds:

- ordinary status cache: at most 60 seconds;
- default status concurrency: 16; runtime configuration is capped at 64;
- equal in-flight status checks are coalesced;
- support sessions: 30-minute idle and 12-hour absolute defaults;
- message pages: at most 100; replay pages: at most 200;
- message text: at most 4,000 characters and 16 KiB.

## Web-to-Chat bootstrap authentication

`POST /internal/v1/support/bootstrap` uses timestamp/nonce HMAC-SHA256, not Bearer auth:

```http
X-Ouj-Service-Auth-Version: 1
X-Ouj-Service-Auth-Timestamp: <13-digit Unix milliseconds>
X-Ouj-Service-Auth-Nonce: <16-128 base64url characters>
X-Ouj-Service-Auth-Signature: <lowercase hex HMAC-SHA256>
Idempotency-Key: <1-180 characters>
```

The signing input is exactly:

```text
ouj-service-auth-v1
<timestamp>
<nonce>
POST
/internal/v1/support/bootstrap
```

Timestamp skew is five minutes by default. Nonces use a bounded ten-minute in-process replay guard. The verified assertion's unique `jti` is durably consumed in MongoDB, so replay remains denied across Chat restarts.

Customer bootstrap body:

```json
{
  "assertion": "<one-time Web-issued RS256 assertion>",
  "bootstrapType": "customer",
  "locale": "fa-IR",
  "context": {
    "page": "/listing/public-safe-id",
    "publicListingId": "public-token"
  }
}
```

Customer assertions are `support_registered` or `support_guest`; staff bootstrap uses `bootstrapType:"staff"`, `support_agent`, and both `support:agent` and `support:conversation:create`. Context is allowlisted to `page`, `locale`, and `publicListingId`, bounded to 2 KiB, and must not contain CRM/contact/private listing data.

Bootstrap performs a forced, uncached Web status check for registered customers and agents. A successful response is `201` for a new logical conversation or `200` when resumed:

```json
{
  "version": 1,
  "conversationId": "11111111-1111-4111-8111-111111111111",
  "supportSessionCredential": "ocs_<opaque-random-value>",
  "expiresAt": "2026-11-21T12:00:00.000Z",
  "created": true,
  "assigned": false,
  "supportAvailable": true
}
```

Chat stores only a namespaced SHA-256 digest of the opaque credential. Web must write the credential to:

```http
Set-Cookie: owj_support_sid=<credential>; Path=/support/v1; HttpOnly; SameSite=Lax; Secure
```

`Secure` is required under HTTPS. Browser support endpoints accept only this cookie—never a Bearer header or query-string credential.

### Ambiguous bootstrap recovery

Web may retry one ambiguous timeout/unavailability result with:

- the same logical `Idempotency-Key` and identity;
- a fresh service-auth timestamp, nonce, and signature;
- a fresh Web assertion with a new `jti`.

The retry resumes the same logical conversation but may return a new plaintext support-session credential. Chat never persists or replays the old plaintext credential. Reusing the original assertion must fail as replay.

## Frozen Chat-to-Web status contract

Registered and agent authorization uses a dedicated Bearer service credential:

```http
POST /api/internal/v1/identity/status
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
Content-Type: application/json
X-Owj-Service: ouj-chat
X-Correlation-Id: <request-id>
```

The Sprint 2.5 request body is frozen as:

```json
{
  "subject": "507f1f77bcf86cd799439011",
  "tokenIssuedAt": 1795161600,
  "jti": "fixture-registered-jti-1"
}
```

`tokenIssuedAt` and `jti` come only from the verified RS256 assertion. They let Web compare assertion issuance to its revocation boundary.

Success must be:

```json
{
  "version": 1,
  "subject": "507f1f77bcf86cd799439011",
  "status": "active",
  "role": "user",
  "support": { "allowed": true, "staff": false },
  "authorizationCacheMaxAgeSeconds": 60,
  "checkedAt": "2026-11-20T08:00:00.000Z",
  "requestId": "fixture-chat-correlation-1"
}
```

Chat accepts status values `active`, `disabled`, `revoked`, and `deleted`; validates the exact subject; requires role and support booleans; and clamps Web's cache instruction to 0–60 seconds and Chat's own ceiling. Guests are never sent to this endpoint. Missing configuration, timeout, non-definitive upstream errors, malformed payloads, and expired cache fail closed.

Passive session/read/realtime checks may use the bounded cache. Bootstrap, staff reply, assignment, and resolution force a refresh. A current staff-role denial revokes only that subject's `agent` support sessions; it does not end a separate registered-customer session for the same Web subject. Account disabled/revoked/deleted and general support denial revoke the affected active support authorization as appropriate.

### Persisted assertion reference

New registered/agent support sessions persist two additive optional fields:

- `identity_issued_at`: verified assertion `iat` in Unix seconds;
- `bootstrap_jti`: verified assertion `jti`.

The Mongo validator permits these fields but does not require them, so no destructive migration or historical rewrite is required. Existing guest sessions remain valid without them. An existing non-guest session missing either field fails closed on current-state authorization and must re-bootstrap with a fresh assertion/session.

## Browser customer API

### `GET /support/v1/session`

Returns only widget state: `version`, `conversationId`, `status`, `identityKind`, `allowedActions`, `expiresAt`, and `supportAvailable`. It never returns the Web subject, Chat actor ID, role, token digest, or admin fields.

### `GET /support/v1/messages?cursor=<base64url>&limit=50`

The conversation comes from the support session. The cursor is opaque base64url JSON over the oldest returned `{id,createdAt}`. Response:

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

### `POST /support/v1/messages`

The request schema is exact:

```json
{ "body": "Hello", "clientRequestId": "unique-request-id" }
```

Conversation identity is never accepted from the body. `clientRequestId` is 1–120 characters from `[A-Za-z0-9._:-]`. The existing Chat repository binds idempotency to `(conversation, actor, clientRequestId)`:

- new persistence: HTTP `201`, `deduped:false`;
- exact retry: HTTP `200`, same `messageId`, `deduped:true`;
- same key with a different body: HTTP `409 SUPPORT_IDEMPOTENCY_CONFLICT`.

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messageId": "uuid",
  "deduped": false
}
```

Message and durable event-journal hint share the MongoDB transaction. HTTP history is authoritative for message bodies/files; the realtime notification deliberately omits the body.

### Realtime and logout

- Native WebSocket: `/support/v1/ws`.
- SSE: `/support/v1/events`.
- Logout: `POST /support/v1/logout` revokes locally, disconnects known streams, clears only `owj_support_sid`, and works even when Web is unavailable.

See [CHAT_REALTIME_PROTOCOL_V1.md](./CHAT_REALTIME_PROTOCOL_V1.md).

## Staff API

Every staff route requires `actorKind:"agent"`, `support:agent`, an active link, current Web staff authorization, and the relevant session action.

| Method/path | Contract |
|---|---|
| `GET /support/v1/staff/conversations?status=...` | Bounded available/assigned/open/resolved/closed list |
| `GET /support/v1/staff/conversations/:conversationId` | Assigned agent plus Chat membership only |
| `POST .../:conversationId/assign` | `Idempotency-Key`; forced status refresh; one transactional winner |
| `POST .../:conversationId/reply` | Exact message schema; forced status refresh; assigned state only |
| `POST .../:conversationId/resolve` | `Idempotency-Key`; forced status refresh; `resolved` or `closed` transition |

Chat implements backend routes only; it does not grant agents the Chat admin panel or add a staff UI.

## Errors and machine-readable fixtures

Wrapped HTTP errors are:

```json
{
  "error": {
    "code": "SUPPORT_REQUEST_INVALID",
    "message": "Safe text",
    "requestId": "request-or-generated-id"
  }
}
```

Representative statuses are 400 for invalid input, 401 for missing/expired session or internal service auth, 403 for scope/conversation/staff denial, 409 for idempotency/assignment/lifecycle conflict, 426 for normal HTTP on the WS path, 429 for limits, and 503 for unavailable required providers. Credentials and private message text must not appear in logs/errors.

The Chat-authoritative fixture manifest is:

`docs/platform/fixtures/support-v1/manifest.json`

It covers assertion policies, HMAC, recovery, cookie, status, messages, and realtime. Fixtures are synthetic and contain no production secrets or private signing key.

## Local cross-repository acceptance — 2026-11-21

The first request against a stale Web image returned the old `400 IDENTITY_REFERENCE_INVALID` shape. Web was rebuilt from its aligned source; Chat then sent the frozen `{subject,tokenIssuedAt,jti}` body with its dedicated Bearer credential and received HTTP 200 with the exact flat subject, active role/support policy, 60-second cache instruction, timestamp, and echoed correlation ID. Chat did not add a legacy fallback.

The isolated shared Docker stack then passed these synthetic flows:

- real Web guest assertion and HMAC bootstrap, scoped `owj_support_sid`, conversation/message/history, same-conversation retry with `created:false`, exact retry dedupe, and different-body `409` conflict;
- separate Guest B isolation even when Guest A's conversation ID was supplied as an extra query value;
- staff bootstrap, queue visibility, assignment and reply; registered bootstrap, same-conversation recovery and persisted history;
- a temporary Web-owned `authRevokedBefore` update caused an existing registered Chat session to receive `401 SUPPORT_SESSION_REVOKED`; the synthetic fixture was restored immediately;
- logout returned 200 and the old guest cookie subsequently received 401.

This closes the Sprint 2.5 status-contract blocker in the tested local revision. It does not prove production readiness, a production key-rotation event, actual browser automation, deployment, migration, or measured capacity.
