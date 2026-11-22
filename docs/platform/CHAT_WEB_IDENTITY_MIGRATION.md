# Chat ↔ Web identity migration

Status: **CHAT SOURCE IMPLEMENTED, FEATURE-FLAGGED OFF, SYNTHETIC LOCAL WEB INTEGRATION ACCEPTED** (Sprint 2.5 snapshot: 2026-11-21). No production migration, deployment, or capacity acceptance is claimed.

Owj Web is the canonical human identity authority. Chat continues to own its stable user IDs, conversations, messages, memberships, support sessions, and realtime authorization. The implementation never reads or writes Web database collections.

## Current and target behavior

Existing Chat accounts remain in `users`. Messages, files, memberships, read state, and audit records continue to reference the original Chat UUID. Local `/api/login` and `/api/register` still exist as a temporary compatibility path for unmigrated users; the Owj website reverse proxy must expose only the support integration paths, not those legacy login routes.

When `OWJ_SUPPORT_ENABLED=true`, Chat verifies a one-time Web assertion, resolves an explicit one-to-one identity link, checks current account state through Web's internal API, and issues a separate support-only session. It does not turn a Web assertion into an unrestricted legacy Chat session.

## Federation assertion v1

Web publishes public keys at the configured JWKS URL (target: `GET /.well-known/jwks.json`). Chat accepts only compact JWTs signed with RS256.

JOSE header:

```json
{ "alg": "RS256", "typ": "JWT", "kid": "web-key-2026-01" }
```

Payload shape (the federation claims are required; optional defaults are noted below):

```json
{
  "iss": "https://configured-web-issuer.example/",
  "sub": "stable-web-user-or-guest-subject",
  "aud": "owj-chat",
  "iat": 1795220000,
  "exp": 1795220300,
  "jti": "one-time-assertion-id",
  "token_use": "support_registered",
  "scope": "support:conversation:create",
  "account_status": "active",
  "ver": 1
}
```

`kid` is required in the JOSE header, not duplicated in the payload. `typ` is optional, but if present it must be `JWT`; `crit` is rejected. The required payload claims are `iss`, `sub`, `aud`, `iat`, `exp`, `jti`, `token_use`, and `scope`. `account_status` defaults to `active` when omitted; Web should send it explicitly. `ver` defaults to `1` when omitted for backward compatibility; if supplied, it must be the numeric value `1`, otherwise Chat returns `IDENTITY_CLAIMS_VERSION_INVALID`. Runtime configuration normalizes the expected issuer as an absolute URL, after which token `iss` must match that exact string.

| `token_use` | Principal | Maximum lifetime | Required/allowed scopes |
|---|---|---:|---|
| `support_registered` | Linked registered customer | 5 minutes | exactly `support:conversation:create` |
| `support_guest` | Web-issued anonymous guest | 10 minutes | exactly `support:conversation:create` |
| `support_agent` | Linked support agent | 5 minutes | requires `support:agent`; may also contain `support:conversation:create` |

The base verifier policy above permits the second agent scope, while the actual staff bootstrap route requires **both** `support:agent` and `support:conversation:create`.

The compact credential is capped at 16 KiB. `aud` may be one string or an array of at most four entries. `scope` may be a space-separated string or an array, with at most 16 input entries before normalization/deduplication; the shared Web contract should use the string form shown above. `kid` and `jti` are capped at 128 characters, while issuer/subject values are capped at 200.

Chat rejects unsigned/malformed tokens, algorithms other than RS256, `crit` headers, wrong issuer/audience, unknown `kid`, invalid signature, future or expired times, excessive lifetime/scope, unsupported token use, inactive status, and replay. Clock tolerance defaults to five seconds and is capped at 30 seconds.

The JWKS response is capped at 128 KiB and eight keys. Accepted keys must be RSA, have a unique non-empty `kid`, and, when present, declare `alg:RS256` and `use:sig`. Cache age follows `Cache-Control: max-age` within a 1-second to 15-minute bound (five-minute fallback). An unknown `kid` triggers a bounded refresh no more than once per second. Redirects are rejected. HTTP JWKS is allowed only outside production when `OWJ_WEB_ALLOW_INSECURE_HTTP=true`.

Every accepted `(issuer, jti)` is inserted into `platform_identity_assertion_jtis`; a unique index prevents replay across Chat restarts, and a BSON-Date TTL index expires the record after the assertion expires. A failed or unavailable replay store fails closed.

Web's old long-lived HMAC JWT and `JWT_SECRET` are not accepted or shared.

## Additive identity storage

`platform_identity_links` maps one Web subject to one existing Chat account:

```json
{
  "id": "uuid",
  "provider": "owj-web",
  "web_user_id": "stable-web-subject",
  "chat_user_id": "existing-chat-uuid",
  "status": "active",
  "revision": 1,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "linked_by_web_user_id": "operator-or-user-subject",
  "revoked_at": null,
  "revocation_reason": null
}
```

Unique indexes cover `id`, `(provider, web_user_id)`, and `chat_user_id`. Concurrent identical requests are idempotent; incompatible Web- or Chat-side collisions return `IDENTITY_LINK_CONFLICT`. Deactivation changes link status/revision and revokes access without deleting the Chat account or rewriting history.

`createPlatformIdentityLinkService` requires a separate injected Web proof that binds the exact `webUserId` and `chatUserId`. A normal support bootstrap assertion cannot claim an arbitrary historical Chat account. The exact Web proof endpoint/credential is still a cross-repository dependency; no public account-link HTTP route is exposed by Chat yet.

Guest subjects are not password accounts. Chat stores a namespaced SHA-256 digest and a pseudonymous `support-guest:<hex>` actor. `support_guest_identity_links` records proof-gated guest conversion using a digested guest subject. The proof service and idempotent repositories are implemented, but the end-to-end Web conversion endpoint is not yet composed; production must not call the low-level repository directly.

## Frozen current Web account-status contract

For registered customers and agents, Chat calls `POST /api/internal/v1/identity/status` with the dedicated, directional `OWJ_CHAT_TO_WEB_SERVICE_TOKEN`. Both this outbound credential and the inbound `OWJ_WEB_TO_CHAT_SERVICE_SECRET` must contain at least 32 characters and must be independent.

```http
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
X-Owj-Service: ouj-chat
X-Correlation-Id: <request-id>
Content-Type: application/json
```

Frozen Sprint 2.5 request:

```json
{
  "subject": "stable-web-subject",
  "tokenIssuedAt": 1795161600,
  "jti": "verified-assertion-jti"
}
```

Frozen success response:

```json
{
  "version": 1,
  "subject": "stable-web-subject",
  "status": "active",
  "role": "user",
  "support": { "allowed": true, "staff": false },
  "authorizationCacheMaxAgeSeconds": 60,
  "checkedAt": "2026-11-20T08:00:00.000Z",
  "requestId": "fixture-chat-correlation-1"
}
```

`tokenIssuedAt` and `jti` are copied only from the signature-verified assertion. They allow Web to compare issuance to `authRevokedBefore`; Chat does not trust browser-supplied values. Allowed statuses are `active`, `disabled`, `revoked`, and `deleted`. The response must contain the exact subject, a bounded role, both support booleans, a valid check timestamp, and an integer cache instruction from 0 through 60.

Ordinary authorization cache age is the lower of Web's instruction, `OWJ_IDENTITY_STATUS_CACHE_MS`, and 60 seconds. The default status-call concurrency is 16 and runtime configuration is capped at 64. Identical in-flight checks are coalesced. Bootstrap and staff reply/assign/resolve force refresh; passive reads/session/realtime may use a valid cache entry. A staff-role denial revokes only `agent` sessions for the subject; disabled/revoked/deleted or general support denial is broader. Upstream outage, timeout, malformed response, or expired cache fails closed. Guests never use the registered identity-status route.

### Additive support-session assertion metadata

New registered and agent support sessions store optional `identity_issued_at` and `bootstrap_jti` fields. The first is the verified assertion `iat` converted to Unix seconds; the second is its verified one-time `jti`. The Mongo validator permits these fields without adding them to the required set, so existing documents need no destructive migration or rewrite.

Existing guest sessions do not require the fields. An old non-guest session missing either field cannot be checked against Web's current revocation boundary; it fails closed and must re-bootstrap to receive a fresh authorized support session. Rollback never fabricates metadata for an old record.

### Actual local Web acceptance

An initial request against the stale Web image exposed the former legacy mismatch as `400 IDENTITY_REFERENCE_INVALID`; Chat did not weaken its client. After rebuilding Web from the aligned source, the real Chat container sent `{subject,tokenIssuedAt,jti}` and received the exact flat HTTP 200 response with the lowercase Web role, support policy, a 60-second cache bound, timestamp, and echoed correlation ID.

The synthetic local acceptance then passed registered bootstrap/resume/history, staff bootstrap/queue/assignment/reply, and current-state revocation. A temporary Web-owned `authRevokedBefore` update made an existing registered support session fail with `401 SUPPORT_SESSION_REVOKED`, after which the dedicated fixture was restored and confirmed active/non-revoked. This proves the exact request/response contract for the tested local revision; it does not prove a production migration, every disabled/deleted/role transition, or a real previous-key rotation window.

The authoritative synthetic fixtures start at `docs/platform/fixtures/support-v1/manifest.json`; `identity-status.json` freezes this request/response boundary.

## Safe migration tool

Input may be a top-level array or `{ "links": [...] }` and contains only explicit reviewed IDs:

```json
{
  "links": [
    {
      "provider": "owj-web",
      "webUserId": "web-user-1",
      "chatUserId": "existing-chat-uuid",
      "linkedByWebUserId": "reviewer-web-id"
    }
  ]
}
```

Fields such as username, phone, nickname, display name, or email are rejected. The planner caps input at 100,000 rows and reports row numbers/codes without logging identity values.

Dry run (no database connection or write):

```bash
node server/scripts/platform-identity-migrate.js --input /absolute/path/synthetic-links.json
```

Apply is deliberately restricted to a loopback `mongodb://` URI and a database name containing `test`, `e2e`, `local`, `dev`, or `disposable`:

```bash
MONGODB_URI='mongodb://127.0.0.1:27017/ouj_chat_local?replicaSet=rs0' \
MONGODB_DATABASE='ouj_chat_local' \
node server/scripts/platform-identity-migrate.js \
  --input /absolute/path/synthetic-links.json \
  --apply --disposable-local
```

Apply preflights conflicts against existing links, verifies every target Chat UUID exists, creates only additive collections/indexes, and inserts links idempotently. It is not a production migration command and must never be pointed at production. Inserts are individually idempotent but the whole file is not one transaction; an unexpected mid-run failure can leave a safe partial prefix that must be reconciled and rerun.

## Production rollout and rollback (later phase)

Before production: back up `ouj_chat`, test restore, inventory referential integrity, obtain reviewed ID mappings from Web, contract-test actual JWKS/status/proof endpoints, benchmark, and prepare an application/image rollback. Do not inspect message bodies to infer identity.

Rollout should add schema first, dry-run the reviewed mapping, apply with a separately reviewed production-safe migration wrapper, shadow-check status, then enable small cohorts. Local login remains available only through the documented compatibility path until a separate retirement decision.

Rollback disables `OWJ_SUPPORT_ENABLED`, stops new links, revokes affected support sessions, and returns to the known-good image. Additive links may remain dormant. Never drop/rename `users`, rewrite message authors, merge by profile fields, or delete conversations as rollback.

## Required Web dependencies

- RS256 issuer and JWKS at the agreed URL, with overlapping key rotation.
- Assertion claims/token-use/scope contract exactly as above.
- `POST /api/internal/v1/identity/status` updated to the frozen `{subject,tokenIssuedAt,jti}` request and role/support/cache response, plus the 32-character outbound Chat credential.
- A reviewed exact-ID account-link proof contract.
- A reviewed guest-to-registered conversion proof contract.
- Same-origin reverse-proxy/cookie integration and actual Web+Chat contract tests.

The actual local Web endpoint now passes the shared status boundary and synthetic registered/staff/revocation flows. Do not enable a production cohort until browser automation, previous-key rotation, production-like TLS/proxy behavior, restore/rollback, resource measurements, and separately reviewed identity-link migration gates also pass.

