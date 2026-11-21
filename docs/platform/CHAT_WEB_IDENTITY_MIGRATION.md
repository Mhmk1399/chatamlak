# Chat ↔ Web identity migration

Status: **IMPLEMENTED IN SOURCE, FEATURE-FLAGGED OFF BY DEFAULT, NOT DEPLOYED** (Sprint 2, 2026-11-20).

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

## Current Web account status

For registered customers and agents, Chat calls:

`POST /api/internal/v1/identity/status`

with a dedicated outbound service credential:

```http
Authorization: Bearer <OWJ_CHAT_TO_WEB_SERVICE_TOKEN>
X-Owj-Service: ouj-chat
X-Request-Id: <uuid>
Content-Type: application/json
```

```json
{
  "version": 1,
  "subject": { "provider": "owj-web", "webUserId": "stable-web-subject" },
  "operation": "support:session"
}
```

Expected response:

```json
{
  "version": 1,
  "subject": { "webUserId": "stable-web-subject", "status": "active" },
  "authorized": true,
  "revision": 7
}
```

Chat sends these exact `operation` values:

| Context | `operation` |
|---|---|
| Registered customer bootstrap | `support:bootstrap` |
| Agent bootstrap | `support:agent:bootstrap` |
| Registered customer session/realtime revalidation | `support:session` |
| Agent session/realtime revalidation | `support:agent` |

Allowed statuses are `active`, `disabled`, `revoked`, and `deleted`. Results are cached by subject and operation for at most 60 seconds (`OWJ_IDENTITY_STATUS_CACHE_MS`) in a bounded 5,000-entry default cache. The request timeout defaults to three seconds, redirects are rejected, and responses over 32 KiB are rejected. Any `authorized:false` or non-`active` response denies the operation and revokes every active local support session for that Web subject. Upstream errors, non-2xx responses, malformed payloads, and subject mismatches fail closed after any still-valid cache entry expires. Guests are never sent to this registered-user endpoint.

This client is implemented and tested against a strict mock; the actual Web endpoint and credential have not been tested together with Chat.

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
- `POST /api/internal/v1/identity/status` and the outbound Chat credential.
- A reviewed exact-ID account-link proof contract.
- A reviewed guest-to-registered conversion proof contract.
- Same-origin reverse-proxy/cookie integration and actual Web+Chat contract tests.

