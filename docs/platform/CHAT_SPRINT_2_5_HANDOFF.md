# Owj Chat Sprint 2.5 handoff

Snapshot date: 2026-11-21. Repository/service: Owj Chat (`chatamlak`).

## Integration verdict

**LOCAL ACCEPTANCE PASSED — production rollout remains closed.** The synthetic shared Web+Chat Docker stack passed the core anonymous visitor → support conversation → staff reply → customer receive flow, plus registered-user, revocation, isolation, realtime and independent-restart checks. Browser automation, a real previous-key rotation window, production migration/deployment and capacity acceptance remain open.

No production VPS, production database, production conversation, DNS, Nginx, image registry, migration, deploy, commit, or push was touched. The source remains feature-flagged with `OWJ_SUPPORT_ENABLED=false` by default.

## Ownership and scope

Web remains authoritative for canonical user IDs, human authentication, account status, global roles, agency/consultant activation, RS256 issuance, JWKS, and guest issuance. Chat owns support conversations, support sessions, messages, history, acknowledgement/idempotency, assignment, and native WebSocket/SSE.

Chat never reads or writes Web collections. Web must use Chat's authenticated API rather than importing Chat models. Analytics and CRM were not modified.

## Sprint 2.5 milestone ledger

| Milestone | Source/test status | Remaining gate |
|---|---|---|
| CHAT-S2.5-01 identity interoperability | Running Web JWKS/assertions were accepted with strict RS256 issuer/audience/token-use/scope validation | A real previous-key token/rotation window was not available |
| CHAT-S2.5-02 bootstrap | Real Web HMAC bootstrap and fresh-JTI same-conversation recovery passed | Browser automation remains open |
| CHAT-S2.5-03 current Web status | Live aligned Web returned exact `{subject,role,support,cache}` response; revocation denied an existing session | Remaining status variants stay covered by contract tests rather than all being mutated in Docker |
| CHAT-S2.5-04 guests | Guest bootstrap, session, message/history, second-guest isolation, WS/SSE and logout passed | Browser-driven expiry/reconnect duration remains open |
| CHAT-S2.5-05 messages | New/duplicate/conflicting sends, history and restart persistence passed through the proxy | Widget automation remains open |
| CHAT-S2.5-06 native realtime | Native WS resume and SSE replay/Origin handling passed through Nginx; no Socket.IO | Chromium/Firefox automation and long reconnect remain open |
| CHAT-S2.5-07 staff | Real staff bootstrap, queue visibility, assignment and reply passed | No full staff dashboard acceptance was required or run |
| CHAT-S2.5-08 local Docker | Shared Web/Chat/Mongo/Nginx stack and independent Chat stop/start passed with retained volumes | Production-like TLS/resource acceptance remains open |
| CHAT-S2.5-09 reliability | Real Mongo tests prove accepted media-job recovery through a new client/runner, stale-lease recovery, retry ceiling, and dedupe | Full Docker worker/FFmpeg interruption and browser suite remain pending |
| CHAT-S2.5-10 platform flows | Guest, registered, revocation, isolation, staff reply, proxy and Chat-restart flows passed with synthetic local data | Production rollout is not authorized |

Sprint 2.5 is locally integrated at the stated revision. It is not production-ready while browser, rotation, migration/rollback, resource and production-like TLS gates remain open.

## Frozen identity-status contract

Chat calls:

```http
POST /api/internal/v1/identity/status
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
X-Owj-Service: ouj-chat
X-Correlation-Id: <request-id>
Content-Type: application/json
```

Request:

```json
{
  "subject": "507f1f77bcf86cd799439011",
  "tokenIssuedAt": 1795161600,
  "jti": "fixture-registered-jti-1"
}
```

Success:

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

Both directional service values—`OWJ_WEB_TO_CHAT_SERVICE_SECRET` for inbound HMAC and `OWJ_CHAT_TO_WEB_SERVICE_TOKEN` for outbound Bearer—must be independent and at least 32 characters.

Ordinary authorization caching never exceeds 60 seconds. Status-call concurrency defaults to 16 and runtime configuration is capped at 64. Concurrent identical checks share one in-flight request. Bootstrap and staff reply, assign, and resolve bypass the cache. Role denial for an otherwise active account revokes only agent sessions; it must not terminate the same subject's customer session.

## Support-session compatibility

New registered/agent sessions persist verified assertion metadata as additive optional Mongo fields:

- `identity_issued_at` — assertion `iat` converted to Unix seconds;
- `bootstrap_jti` — verified one-time assertion ID.

The schema did not add these fields to the required set, so existing support-session documents need no destructive migration. Existing guests can continue without them. Existing registered/agent sessions lacking either value fail closed and must re-bootstrap. Chat does not guess or backfill an assertion reference.

The browser credential remains `owj_support_sid` with `HttpOnly`, `SameSite=Lax`, `Path=/support/v1`, and `Secure` under HTTPS. Browser routes, WS, and SSE accept the cookie only—never Bearer or query credentials.

## Bootstrap recovery contract

Web signs `POST /internal/v1/support/bootstrap` with Chat's timestamp/nonce HMAC-SHA256 headers and sends `Idempotency-Key`. If the result is ambiguous, it may retry once with the same logical key/identity but a fresh nonce/signature and a fresh RS256 assertion/JTI.

The retry resumes the same logical conversation. It is not required to return the same plaintext support credential: Chat stores only a digest and may issue a fresh authorized session. Replaying the first assertion remains forbidden.

## Message and realtime contract

Message command:

```json
{ "body": "Hello", "clientRequestId": "unique-request-id" }
```

Acknowledgement:

```json
{
  "version": 1,
  "conversationId": "uuid",
  "messageId": "uuid",
  "deduped": false
}
```

New writes return `201`; exact retries return `200` with the same message ID and `deduped:true`; reusing a key with another body returns `409 SUPPORT_IDEMPOTENCY_CONFLICT`. History returns safe `{id,body,authorKind,createdAt,editedAt,files}` records in chronological page order with an opaque cursor.

Support realtime remains native WS `/support/v1/ws` and SSE `/support/v1/events`. A `chat_message` event carries conversation/message/user/actor/cursor/event/timestamp hints but no private body. HTTP history is authoritative. Consumers dedupe by `eventId`, then cursor; page up to 200 durable events; and refetch HTTP state on `gap:true`.

## Machine-readable contract

Authoritative fixture manifest:

`docs/platform/fixtures/support-v1/manifest.json`

It references:

- `assertion-policies.json`;
- `bootstrap-hmac.json`;
- `bootstrap-recovery.json`;
- `cookie.json`;
- `identity-status.json`;
- `messages.json`;
- `realtime.json`.

They contain synthetic data only, no production credential and no private signing key. The real local Web active key/assertions were verified; an actual token signed by the previous key was not available.

## Actual local Web+Chat acceptance

The running image initially still contained the legacy status route and returned `400 IDENTITY_REFERENCE_INVALID`. Chat remained strict. After the Web image was rebuilt from the aligned sibling source, a direct Chat-to-Web request using `X-Owj-Service: ouj-chat` returned HTTP 200 with the exact flat subject, lowercase `admin` role, both support booleans, 60-second cache instruction, timestamp and echoed correlation ID.

The shared stack then produced these synthetic results:

- Guest A: Web issued the real guest assertion, Chat created conversation `11a70796-3105-4d53-bd65-249f6e1b85ad`, message creation returned 201, exact retry returned 200/deduped with the same ID, a changed body returned `409 SUPPORT_IDEMPOTENCY_CONFLICT`, and history contained one copy.
- Ambiguous recovery: the same Web request resumed that conversation with `created:false` and a fresh opaque session.
- Isolation: Guest B received a different conversation; even with Guest A's ID in an extra query parameter, Chat returned Guest B's own empty history.
- Realtime: missing SSE Origin was denied; allowed-Origin SSE replay and native WS resume returned `chat_message` plus terminal replay metadata with `gap:false`. After staff reply, Guest A's SSE resumed from the customer cursor and received the agent event.
- Staff/registered: Web's verifier passed staff bootstrap, queue visibility, assignment and reply; registered bootstrap, same-conversation recovery and persisted history passed.
- Revocation: a temporary Web-owned `authRevokedBefore` update made the existing registered support session return `401 SUPPORT_SESSION_REVOKED`; the dedicated synthetic fixture was immediately restored and verified active/non-revoked.
- Restart/logout: Chat was stopped while the same Web container stayed healthy and returned HTTP 200; after Chat restarted both messages remained. Guest B logout returned 200 and the old cookie then returned 401.

No Web source was modified from this Chat task; the Web image was rebuilt from the concurrently aligned Web-owned source. No production system or volume was deleted. The sibling Web prose still drifts from its runtime: it spells the status header `X-Ouj-Service` instead of actual `X-Owj-Service`, omits `SERVICE_AUTH_INVALID`, and overstates `X-Request-Id` as required. Those Web-owned documents were not edited here; consumers must follow the tested machine fixture/runtime until Web reconciles them.

## Verification evidence

Only commands actually reported for the Sprint 2.5 source belong here:

| Check | Result |
|---|---|
| Focused contract command | **Passed 55/55**: `npm --prefix server exec vitest run test/lib/webIdentityStatusClient.test.js test/lib/supportRuntime.test.js test/lib/supportSessions.test.js test/lib/supportSessionStore.test.js test/db/mongoSupport.test.js test/api/support.test.js test/contracts/supportFixtures.test.js` |
| Fixture contract | **Passed 7/7**, already included in the focused 55—not an additional 7 |
| Full server suite | **Passed 141 files / 1,215 tests** after the fixture exactness and two guest/registered live-`actorKind` regression cases were added |
| Focused status client after those tests | **Passed 13/13** |
| Focused support API after live-envelope audit | Test-first mismatch reproduced for guest and registered, then **passed 18/18** after normalizing live `actorKind` to `customer` |
| Real MongoDB | **Passed 9 files / 58 tests**, including media jobs 2/2 and support metadata round trip 4/4 |
| Shared Docker Web+Chat/proxy | **Passed** with synthetic local data; all runtime services healthy after targeted proxy restart |
| Browser WS/SSE/widget | Native proxy transports passed; **browser automation not run** |

Sprint 2's earlier server/Mongo/worker/client/browser numbers are historical baselines, not Sprint 2.5 proof. Do not copy them forward as current evidence.

The real-Mongo media tests used synthetic metadata and a fresh Mongo client/repository/runner to prove one accepted job completes once after reconnect, and that a stale lease is reclaimed and reaches the retry limit without duplicate job rows. They do not prove a Docker worker/FFmpeg byte-processing interruption.

## Resource, security, and migration impact

- Status requests are bounded to a 3-second default timeout, 32-KiB response, 5,000 cache entries, 16 default/64 maximum runtime concurrency, and in-flight coalescing.
- Support-session metadata adds two small optional fields; no collection rewrite is needed.
- Force refresh increases Web calls on security-sensitive actions; it remains off the message-history hot path.
- Chat preserves private message ownership and does not send message bodies to the status endpoint or broad event channels.
- No Redis, Kafka, Socket.IO, second MongoDB process, or cross-database write was introduced.
- The current shared 4-vCPU/~7.8-GiB host still requires measured RSS, CPU, event-loop, Mongo p95, connection, queue, and disk data before production ceilings change.

## Required next steps

1. Keep Web and Chat copies of the exact lowercase-role, `X-Owj-Service` status fixture synchronized and run consumer contract tests on every change.
2. Exercise an actual token issued before/after a local signing-key rotation; do not infer previous-key acceptance only from JWKS listing/unit fixtures.
3. Run Chromium/Firefox widget automation, production-like HTTPS cookie/proxy tests and longer reconnect/gap scenarios.
4. Run a full Docker media-worker/FFmpeg interruption and collect bounded RSS, CPU, event-loop, Mongo p95, connection, queue and disk observations.
5. Review identity-link migration, backup/restore, incident ownership and rollback separately.
6. Only after those gates pass, prepare rollout. Do not enable production or rewrite historical Chat IDs as part of Sprint 2.5.
