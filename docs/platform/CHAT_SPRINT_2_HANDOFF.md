# Owj Chat Sprint 2 handoff

Date: 2026-11-20

Repository/service: Owj Chat (`chatamlak`), owner of conversations, messages, support sessions, assignment, realtime delivery, and Chat media processing. Owj Web remains the owner of canonical human identity, login/OTP, global roles, and account status.

## Executive status

Sprint 2 has an implemented, feature-flagged Chat-side identity and support backend in this source tree. It is **not a claim of production readiness or completion of the cross-repository rollout**.

- `OWJ_SUPPORT_ENABLED` defaults to `false`.
- No production service, database, Nginx configuration, image registry, deployment, commit, or push was intentionally touched by this sprint.
- Actual Owj Web assertion issuance, JWKS rotation, status authorization, BFF cookie placement, and end-to-end Web UI behavior have not been proven together with Chat.
- The Chat-owned local Docker topology passed the bounded runtime checks recorded below. This does not validate Owj Web, a shared reverse proxy, production deployment, or production capacity.
- Existing Chat IDs, messages, memberships, and attachments remain authoritative. The Sprint 2 identity model is additive.

## Milestone ledger

| Milestone | Source status | What is implemented | Remaining acceptance gate |
|---|---|---|---|
| CHAT-S2-01 | Implemented locally | RS256/JWKS verifier, exact claims, token-use/scope policies, one-time JTI persistence, bounded key cache | Test against actual Web issuer/JWKS and rotation behavior |
| CHAT-S2-02 | Partially integrated | Additive one-to-one links, uniqueness, proof-gated link service, conflict/idempotency handling, local-only migration CLI | Web-owned link proof endpoint/workflow and reviewed production mapping/migration |
| CHAT-S2-03 | Implemented locally | Authenticated internal bootstrap, assertion verification, idempotent conversation selection, opaque digested support session | Actual Web BFF service-auth and cookie integration |
| CHAT-S2-04 | Partial | Guest bootstrap, isolated conversation/session/actions, reconnect/logout, prepared idempotent conversion persistence | Compose and expose the Web-proof guest conversion workflow end to end |
| CHAT-S2-05 | Implemented locally | Versioned customer and staff support HTTP routes with bounded pagination/idempotent messages | Contract tests with actual Web widget and staff client |
| CHAT-S2-06 | Implemented locally | Native support WS/SSE, strict origins, replay/deduplication, limits, expiry/revocation; native Chat open-session revalidation | Real reverse-proxy, reconnect, rolling-version, and browser tests |
| CHAT-S2-07 | Implemented against mock contract | Chat→Web status client, directional service token, at-most-60-second cache, fail-closed writes, session revocation | Actual Web endpoint/credential interoperability and outage drill |
| CHAT-S2-08 | Backend implemented | Staff queue/detail/reply APIs, transactionally coupled assignment+membership, idempotent resolve/close, and deduplicated inbox notifications | Staff UI and actual Web role eligibility integration |
| CHAT-S2-09 | Implemented with noted limits | HMAC worker calls, replay protection, destination validation, open-session expiry, Mongo-backed media job runner wired for memory fallback | Media restart/runtime test; residual DNS TOCTOU limitation remains |
| CHAT-S2-10 | Locally validated | Final image build, healthy Chat/worker/MongoDB, non-root/read-only application containers, authenticated replica set, dedicated DB user, internal ports, writable named volume, and message persistence across a Chat-only restart | Production capacity and the shared Web/proxy topology remain separate acceptance work |
| CHAT-S2-11 | Partial | Full server/real-Mongo/worker/client-unit runs plus local integration cases 20 and 21; strict mocks cover the Chat-side identity/support contracts | Case 23 was not run; case 24 is partial; actual Web+Chat, reverse-proxy/browser behavior, and media-job restart persistence remain unproven |

The overall sprint must remain open until the partial milestones and external acceptance gates are completed.

## Identity adapter changes

Primary files:

- `server/lib/webIdentityVerifier.js`
- `server/lib/platformIdentityAdapter.js`
- `server/lib/webIdentityStatusClient.js`
- `server/lib/platformIdentityLinkService.js`
- `server/db/platformIdentitySchema.js`
- `server/db/platformIdentityRepository.js`
- `server/db/mongoSchema.js`
- `server/db/mongoRepository.js`

Implemented contract:

- compact JWT with `alg=RS256`, required `kid`, exact configured `iss`, and `aud=owj-chat`;
- required `sub`, `iat`, `exp`, `jti`, `token_use`, and `scope` claims;
- `support_registered` and `support_agent` maximum lifetime of five minutes;
- `support_guest` maximum lifetime of ten minutes;
- exact scope allowlists; agent bootstrap requires `support:agent` plus `support:conversation:create`;
- durable one-time assertion consumption with unique `(issuer, jti)` and MongoDB TTL;
- bounded JWKS response size/key count/cache lifetime with unknown-`kid` refresh throttling and no redirects;
- rejection of HMAC/old Web JWTs, unknown algorithms, critical headers, malformed/future/expired assertions, extra scopes, and replay;
- additive one-to-one `platform_identity_links`; no username, phone, or display-name auto-merge;
- current-state authorization through Web's authenticated status API, not browser claims.

The exact token and status request/response schemas are in [CHAT_WEB_IDENTITY_MIGRATION.md](./CHAT_WEB_IDENTITY_MIGRATION.md).

## Existing-account migration strategy

Files:

- `server/lib/platformIdentityMigration.js`
- `server/scripts/platform-identity-migrate.js`

The current CLI accepts only an explicit JSON array of `provider`, `webUserId`, `chatUserId`, and optional `linkedByWebUserId`. It never guesses identity from a username, phone number, or message content.

Default execution is a database-free validation/dry run. `--apply` is intentionally limited to an explicitly local loopback MongoDB URI, a disposable-looking database name, and the additional `--disposable-local` acknowledgement. It verifies target Chat users and existing one-to-one conflicts, then performs idempotent additive inserts. It does not edit historical messages or membership.

This is a local validation tool, **not a production migration runner**. A later production phase needs an approved mapping source, backup and restore rehearsal, conflict review, a separately authorized apply path, observable batches, rollback export, and a compatibility-window decision. Rollback means disabling/removing the additive link after proving no active support session depends on it; it never rewrites historical Chat IDs.

Existing Chat-local login remains the temporary compatibility path for unmigrated native Chat accounts. It must not become the website visitor authentication path.

## Support backend

Primary files:

- `server/api/support.js`
- `server/lib/supportRuntime.js`
- `server/lib/supportSessions.js`
- `server/lib/supportSessionStore.js`
- `server/lib/supportRealtime.js`
- `server/db/mongoSupport.js`
- `server/index.js`
- `server/api/index.js`

Chat exposes:

- Web backend only: `POST /internal/v1/support/bootstrap`;
- customer: `GET /support/v1/session`, `GET/POST /support/v1/messages`, `GET /support/v1/events`, native upgrade `/support/v1/ws`, and `POST /support/v1/logout`;
- staff: list/detail/reply/assign/resolve below `/support/v1/staff/conversations`.

Bootstrap uses timestamp/nonce/request-bound HMAC service authentication, an `Idempotency-Key`, and a one-time Web assertion. It returns an opaque `ocs_*` credential only to Web. Chat stores only its digest. Web is expected to set `owj_support_sid` with `Path=/support/v1`, `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

Support sessions are a restricted authorization class. Default idle and absolute lifetimes are 30 minutes and 12 hours. Customer actions are limited to session/messages/events/logout. Agents require an actual `support_agent` assertion and `support:agent` scope; Chat still enforces assignment and conversation lifecycle.

Guest identity is stored as a digest-derived subject binding. Guests cannot select arbitrary conversations or access native Chat discovery/admin/CRM/Analytics APIs. Guest-to-registered conversion primitives preserve the conversation, require a proof identifier, and are idempotent, but the Web proof verifier and public/internal orchestration endpoint are not yet composed. Message retries require the same body for a reused `(conversation, actor, clientRequestId)`; a different body returns `409 SUPPORT_IDEMPOTENCY_CONFLICT`.

Known product gap: a resolved/closed identity currently resumes the existing unavailable conversation; a reopen/new-case policy is not implemented.

The full request, response, cookie, error, and rate-limit contract is in [CHAT_SUPPORT_API_CONTRACT_V1.md](./CHAT_SUPPORT_API_CONTRACT_V1.md).

## Realtime and session security

Relevant transport files are `server/lib/supportRealtime.js`, `server/lib/sse.js`, and `server/lib/websocketGateway.js`.

Support WebSocket and SSE use the same support cookie and action check, require an allowlisted `Origin`, bind fan-out to one conversation, and revalidate authorization every 15 seconds by default. WS defaults include a 16-KiB payload ceiling, 20 connections per IP, four hub subscriptions per support session, a five-second authentication deadline, and ping/pong liveness.

Durable `chat_message` replay is read from Chat's MongoDB event journal, normalized to the support v1 envelope, and uses stable message cursors. Queue/assignment/lifecycle notifications include in-process events; staff must refetch the HTTP queue after restart. Replay is bounded to 200 records and reports `hasMore`/`gap` on both SSE connection completion and WebSocket resume. Clients must page/deduplicate and refetch authoritative state when a gap is reported.

The native Chat `sid` WebSocket/SSE paths also now periodically revalidate already-open sessions, resolving the Sprint 1 expiry gap without introducing Socket.IO or another broker. Support authentication always enforces expiry, an hourly bounded task purges expired support-session records, and application shutdown closes the support WS/SSE runtime and its timers.

See [CHAT_REALTIME_PROTOCOL_V1.md](./CHAT_REALTIME_PROTOCOL_V1.md).

## Media and worker reliability

Primary files:

- `shared/serviceAuth.js`
- `server/api/remoteMirror.js`
- `server/api/uploadsRemote.js`
- `worker/index.js`
- `server/db/mongoMediaJobs.js`
- `server/lib/durableMediaQueue.js`
- `server/lib/mediaWorker.js`
- `server/db.js`
- `server/index.js`

The worker dispatch and callback paths support timestamped, nonce-bound HMAC authentication with bounded replay caches. Strict verification is controlled by `WORKER_REQUIRE_SIGNED_REQUESTS` and is enabled in the supplied local Compose topology. The standalone worker defaults `WORKER_ALLOW_LOOPBACK_URLS` to false, rejects redirects, and validates resolved destination addresses against private/reserved ranges and an explicit origin allowlist. Only the intentionally co-located legacy child-worker manager opts into loopback explicitly.

A MongoDB `media_processing_jobs` repository and bounded runner are wired when the legacy queue would otherwise be in memory. The schema initializer creates the strict validator for a new collection and skips `collMod` when an installed validator already matches exactly. A mismatched existing validator requires an explicit, privileged, one-time `collMod` migration; do not grant that database-administration privilege to the ordinary Chat runtime user. Jobs are uniquely deduplicated, claimed with stale-lock recovery, retried with bounded backoff/attempts, and completed records use a BSON `Date` compatible with the seven-day TTL index. Concurrency defaults to one; application shutdown waits for the runner and media manager to close.

Remaining limitation: validation and the later HTTP connection do not pin the same resolved address, leaving a DNS rebinding/time-of-check-to-time-of-use window. Use a narrowly controlled worker origin allowlist and private network; do not treat arbitrary user destinations as trusted.

## Local Docker topology

Files:

- `docker-compose.local.yaml`
- `docker-compose.yaml`
- `worker/docker-compose.yaml`
- `scripts/local-mongo-init.sh`
- `Dockerfile`
- `worker/Dockerfile`
- `.env.example`

The local topology contains one authenticated MongoDB 8 single-node replica set (`ouj-rs`), a dedicated read/write user restricted to `ouj_chat`, Chat, and a separate media worker. The Mongo server defaults to `${MONGO_IMAGE:-mongo:8.2.7}` because `mongo:8.0.34` rejected the current Ubuntu host kernel 7.0.0 during validation. Service ports are exposed only to the internal `ouj-platform-internal` network. The application containers run as uid/gid 1000, with read-only roots, writable named data volume, tmpfs, dropped capabilities, PID/resource ceilings, and no Docker socket.

Provisional ceilings are Chat 400 MiB/0.75 CPU, worker 600 MiB/1 CPU, and MongoDB 1536 MiB/1.25 CPU. They are test ceilings, not evidence of measured production capacity. Pool/concurrency defaults are bounded (`MONGODB_MAX_POOL_SIZE=10` in local Compose and worker concurrency 1).

Commands and destructive-reset warnings are documented in [CHAT_LOCAL_DOCKER_TESTING.md](./CHAT_LOCAL_DOCKER_TESTING.md).

## Data ownership, privacy, and resource impact

- New/extended Chat-owned collections: `platform_identity_links`, `platform_identity_assertion_jtis`, `support_guest_identity_links`, `support_conversations`, `support_sessions`, and `media_processing_jobs`.
- Chat never reads or writes Web collections. It receives minimal assertions/status responses through authenticated contracts.
- No public Analytics/Divar data or CRM customer profile is stored by these support additions. Support messages remain private Chat content and must not enter general logs/events.
- New request costs are bounded JWKS/status HTTP calls, support MongoDB lookups/writes, and bounded replay queries. Each durable replay page reads at most 201 journal rows, one support-conversation record, and projected author/timestamp metadata for at most 200 message IDs. Status cache age is capped at 60 seconds; JWKS caching is bounded; Mongo pools remain shared and bounded.
- Realtime adds one authorized connection per browser transport, capped per IP/session. Replay pages are capped at 200; message pages at 100; text at 4,000 characters/16 KiB.
- Media durability adds a small indexed job collection and one polling runner in the memory-fallback configuration. It does not add Redis, Kafka, Socket.IO, or another MongoDB process.

## Verification record

Sprint 2's direct test surface is represented by:

- identity/link/migration: `server/test/lib/webIdentityVerifier.test.js`, `platformIdentityAdapter.test.js`, `webIdentityStatusClient.test.js`, `platformIdentityLinkService.test.js`, `platformIdentityMigration.test.js`, `server/test/db/platformIdentityRepository.test.js`, `platformIdentitySchema.test.js`, `server/test/scripts/platformIdentityMigrationCli.test.js`, and `server/test/mongo/platformIdentity.test.js`;
- support/session/realtime: `server/test/api/support.test.js`, `server/test/lib/supportRuntime.test.js`, `supportSessions.test.js`, `supportSessionStore.test.js`, `supportRealtime.test.js`, `server/test/mongo/support.test.js`, plus native `sse.sessionRevocation.test.js` and `websocketGateway.test.js` coverage;
- reliability/deployment: `server/test/lib/serviceAuth.test.js`, `mediaWorker.test.js`, `durableMediaQueue.test.js`, `server/test/db/mongoMediaJobs.test.js`, `server/test/deploymentSecurity.test.js`, `worker/test/server.test.js`, and `worker/test/mirror.test.js`.

This is test-surface inventory, not a statement that every file was rerun after every final edit. The command results below are the evidence boundary.

Final command evidence from the Sprint 2 source state:

| Check | Result |
|---|---|
| `npm --prefix server test` | **Passed:** 140 files, 1,189/1,189 tests |
| `npm --prefix server run test:mongo` | **Passed:** 8 files, 56/56 tests against the disposable real replica-set suite |
| Complete worker suite | **Passed:** 6 files, 46/46 tests |
| `npm --prefix client run test:unit` | **Passed:** 48 files, 457/457 tests |
| Client production build | **Passed;** two existing ineffective dynamic-import warnings remained |
| Client lint | **Failed:** pre-existing duplicate `Ouj Chat` key in `client/src/i18n/fa-ui.js`, plus five warnings. That file predates Sprint 2 and was not changed by this work |
| Client browser run | **Partial/failing:** 66 files passed and 5 failed; Chromium passed 808/815 tests with 7 failures, and the Firefox browser binary was missing. The reported failures are existing client UI tests unrelated to Sprint 2; this is not a green browser-suite claim |
| `npm run docs:build` | **Passed** in the final rerun after the English/Persian evidence reconciliation |
| `docker compose ... config --quiet` | **Passed** with synthetic `/tmp` credentials |
| Final Docker image rebuild | **Passed** |
| Local Compose startup | **Passed:** MongoDB, Chat, and worker were healthy |
| Container boundary checks | **Passed:** Chat and worker ran non-root with read-only roots and the intended writable named volume |
| Replica/user/isolation | **Passed:** MongoDB was primary in `ouj-rs`; the Chat user had exactly `readWrite` on `ouj_chat`; reading `ouj_business_local` was denied with MongoDB code 13 |
| Message persistence across Chat restart | **Passed:** a repository message write was read back after restarting only Chat |
| Media-job persistence across restart | **Not run/proven;** it is distinct from message persistence |
| Actual Web+Chat issuer/status/bootstrap/widget | **Not run** |
| Actual reverse-proxy cookie/SSE/WS upgrade | **Not run** |

The stack was stopped with normal `down`; its three named volumes were retained. No production data or deployment was involved.

Sprint 2 integration cases have the following evidence boundary:

| Case | Result |
|---|---|
| 20 — message persistence over Chat-only restart | **Passed** |
| 21 — separate Chat database credentials and cross-database denial | **Passed** |
| 23 — reverse-proxy cookie/SSE/native-WS behavior | **Not run** |
| 24 — Web stays available while Chat restarts | **Partial:** the Chat restart/readback passed, but no Web process was running |

The server, real-Mongo, worker, and client-unit suites are green. The known client lint/browser results above and the unrun Web/proxy/media checks mean repository-wide and cross-repository acceptance is not fully green.

## Unresolved Web dependencies

1. Exact production `OWJ_WEB_ISSUER` and HTTPS JWKS/status URLs.
2. Web RS256 key lifecycle, current/next key overlap, and signed fixtures for all three token uses.
3. Matching HMAC bootstrap signer using the exact method/path/timestamp/nonce canonicalization.
4. Directional Chat→Web bearer service credential and least-privilege status authorization.
5. BFF cookie placement/removal and proxy routing for `/support/v1/*` including WebSocket upgrade and SSE buffering.
6. Web-owned verified account-link and guest-conversion proof workflows.
7. Web role/account-state policy for staff eligibility and disabled/deleted users.
8. Product behavior for reopening or creating a new support case after resolution.

## Production migration and rollout requirements

1. Complete the remaining media-job restart, browser/proxy, and actual Web+Chat tests on disposable local infrastructure.
2. Freeze/version the shared schemas and keep fixtures in both repositories.
3. Back up and restore-test Chat MongoDB and required local/S3 metadata before any schema/data rollout.
4. Inventory real Chat↔Web mappings through an authorized offline process; review every conflict. Never infer from phone/name.
5. Build a separately approved production migration path with dry run, batch checkpoints, audit output, rollback export, and no destructive ID rewrite.
6. Deploy support disabled, verify schema/index health and resource baselines, then configure least-privilege secrets/URLs.
7. Run a small canary through the real reverse proxy; verify status revocation, link conflict, replay, reconnect, logout, and restart.
8. Measure RSS, CPU, event-loop delay, MongoDB p95/connections, API p95, open realtime connections, media queue lag, disk, and errors before enforcing/tightening ceilings.
9. Preserve the native Chat compatibility login only for the explicitly approved migration window; define its retirement separately.
10. Enable `OWJ_SUPPORT_ENABLED` only after rollback and incident ownership are agreed. Rollback is disabling the feature/routing and revoking support sessions; never delete conversations/messages as a rollback shortcut.

## Git and deployment statement

Repository instructions prohibit automatic Git commands, commits, and pushes. This handoff therefore does not invent a Git working-tree report; the human operator must inspect it. Suggested commit message after review:

```text
feat(platform): add federated support identity and realtime backend
```
