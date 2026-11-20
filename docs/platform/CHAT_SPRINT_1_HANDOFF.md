# Owj Chat Sprint 1 handoff

Snapshot date: 2026-11-20. Repository: Owj Chat. This is a source handoff, not a deployment record. No production container, database, message, attachment, migration, commit, or push was changed.

## Status vocabulary

- **IMPLEMENTED TODAY**: behavior that existed before this sprint.
- **IMPLEMENTED IN SPRINT**: source and regression coverage added in this repository; it is not running in production until a coordinated deployment.
- **Partial**: useful protection exists, but an acceptance condition or operational rollout remains.
- **PROPOSED/DORMANT**: code-only preparation with no route, UI, startup wiring, or live schema change.
- **BLOCKED ON WEB**: Owj Web must approve or implement the identity/service contract.
- **REQUIRES MIGRATION/ROLLOUT**: an explicit backup, compatibility check, deployment step, or data operation is required; none was executed here.

## Work log and ownership

Chat remains the owner of conversations, membership, messages, read/delivery state, attachments, and raw WebSocket/SSE transport. Web remains the owner of canonical human identity and CRM tasks. Analytics was not modified.

| Task | Source status | What changed | What remains |
|---|---|---|---|
| CHAT-001 private media | Implemented in sprint | File-ID, stored-name, thumbnail, range, local, and object-storage paths resolve file → message → chat, then require current membership. Newly published message/event payloads use protected `/api/uploads/file/:id` and `/api/uploads/thumbs/:id` URLs instead of reusable provider URLs. An explicitly public channel is the only anonymous message-media case; private responses use `private, no-store`. | Deploy only with a private bucket and short presigned-download lifetime; an authorized redirect remains shareable until that provider URL expires. |
| CHAT-002 upload ownership | Implemented in sprint | Presign uses the real session `id`. A pre-message presign requires a bounded `clientRequestId`; pending uploads bind actor, chat, purpose, message/client request, and storage key. Publication/completion recheck message authorship and current membership. Completion records `upload_completed_at`, awaits persistence/queue admission, preserves the claim on overload, consumes it on success, and permits an ownership-checked idempotent retry. | Roll out server and client together because older clients do not send the stricter binding fields. Monitor orphan cleanup and retry behavior with the real object provider. |
| CHAT-003 sensitive logs | Implemented in sprint | HTTP debug, media, worker, storage, push, maintenance, admin, and remote-channel paths use structured allowlisted fields/stable error codes. Request/response bodies, cookies, authorization values, private messages, provider URLs/bodies, object keys, and raw errors are not serialized by the hardened paths. | Continue log-sink and dependency review during rollout; provider/query-string redaction must also be enforced outside this process. |
| CHAT-004 container privileges | Implemented in source; requires coordinated rollout | Final image runs as `node`; Compose drops all capabilities, enables `no-new-privileges`, and no longer mounts `/var/run/docker.sock`. In-app service/Nginx controls report that infrastructure owns the action. | Existing volume ownership must be prepared for uid/gid 1000 and the image rebuilt. Source is not deployed. |
| CHAT-005 worker/callback auth | Partial | Missing worker/callback secret fails closed; comparisons are timing-safe; request bodies, queue depth, concurrency, input bytes, fetch time, URL schemes/private/metadata targets, and storage keys are bounded. | The current shared secret is not an expiring credential. Approve a timestamped service-auth/rotation contract before claiming expired-credential coverage. DNS resolution/rebinding policy also needs a deployment review. |
| CHAT-006 privileged admin operations | Partial | Backup/reset/vacuum/clear/restore, secret display, infrastructure-log access, and disabled host controls require owner role plus a separate operator token. MongoDB restore/delete stay offline. Docker/Nginx control is disabled in-process. | Treat the static operator token as an interim step-up. Define rotation and an audited operator identity before production approval. |
| CHAT-007 sessions | Implemented in sprint, coordinated cutover required | New session tokens are stored as SHA-256 digests; the stored digest is not accepted as a browser bearer credential. Legacy plaintext rows remain readable and are upgraded on use. Idle/absolute expiry applies to HTTP and WebSocket upgrade. Logout/device revocation closes the matching WebSocket and SSE stream; admin ban/password reset/delete closes all WebSocket and SSE streams for that username. Cookies are HttpOnly, SameSite=Lax, and Secure on production HTTPS. | Set production timeout values and monitor the dual-read cutover. Do not bulk-delete sessions. Periodic expiry revalidation of an already-open WebSocket/SSE stream remains a defense-in-depth follow-up. |
| CHAT-008 WebSocket admission | Partial | Native `/ws` and `/api/ws` authenticate during upgrade using the `sid` cookie; query-string `token`/`sid` is rejected. Origin, payload, per-IP connections, auth timeout, message rate, heartbeat, invalid payload, and explicit session-revocation controls are bounded. Membership-cache invalidation prevents removed members receiving later chat fan-out; explicit account/session invalidation also closes SSE fallback streams. | Configure trusted proxy/IP handling for Nginx and approved origins. An already-open WebSocket/SSE stream is not yet periodically revalidated solely because its absolute/idle expiry time passes. |
| CHAT-009 broken contracts | Implemented in sprint | Topic closure awaits the repository mutation; automatic membership addition awaits async repository operations; upload persistence/save, callback save, queue admission, and pending-claim removal are awaited. Upload return values are normalized and protected-URL/ownership regressions cover the repaired contracts. | Observe real Mongo/object-provider behavior during staged rollout; no live migration or provider test was performed here. |
| CHAT-010 media bounds | Partial by design | In-process fallback and worker queues have bounded depth and concurrency; worker overload returns 503 with `Retry-After`; request/input/time limits are bounded. | In-memory work is not durable across restart. Existing Redis/BullMQ mode may be durable when explicitly configured, but no new broker was introduced. Add durable reconciliation only after an approved capacity decision. |

## Cross-repository preparation

The following modules are **proposed/dormant** and are not imported by runtime startup:

- `server/db/platformIdentitySchema.js`: additive `platform_identity_links` collection/index helper, disabled unless called with `enabled: true`. It is not part of `COLLECTION_KEYS`, is not called from `server/db.js`, and no migration ran.
- `server/lib/platformIdentityAdapter.js`: accepts an injected, already-approved credential verifier; checks configured issuer, audience, scopes, expiry, subject status, guest capability, explicit account link, and current Chat account status. It defines no JWT, signing key, or token exchange.
- `server/lib/supportAccessService.js`: authorizes `read`, `send`, or `acknowledge` for an already-verified principal. Guests are limited to capability-listed conversation IDs; registered users also need current Chat membership. It exposes no HTTP route.
- `server/lib/crmTaskCommand.js`: builds a versioned, minimal Web-owned CRM command with actor, conversation reference, request ID, idempotency key, and allowlisted task fields. It rejects message bodies/contact/transcripts and performs no network call.

Therefore ID-005–ID-007, CTR-003–CTR-006, SUP-003/SUP-004/SUP-006/SUP-008/SUP-010, and CRM-004–CRM-007 are preparation only wherever they depend on Web. Central login, guest support, and CRM task creation are not live.

## Security and data boundaries

- Browser-supplied `userId`, role, username, or consultant ID is not a federation authority. The current Chat session supplies the local actor; future platform actions must use a verified Web principal.
- Private media authorization is derived from file → message → conversation → current membership. Public-channel visibility is a separate explicit rule.
- Chat never writes Web CRM collections. The CRM proposal sends no private message body automatically.
- No customer records, production messages, production secrets, or production database were accessed.

## Resource impact

The changes add bounded membership/file lookups to media reads, one digest operation for session-token lookup, and small in-memory counters/queues. Defaults remain appropriate for measurement on the shared 4-vCPU/~8-GiB host: worker concurrency is capped at 4, worker queue depth at 256, server media concurrency at 4, and server media queue depth at 1,000 even if configuration asks for more. Production values should start lower and be adjusted only from RSS, CPU, event-loop delay, MongoDB p95, queue lag, and Web/Chat p95 measurements.

## Verification boundary

The final isolated server suite passed **1,092/1,092 tests in 125 files**; the integrated private-media/upload matrix passed 75/75; the worker suite passed 43/43; client unit tests passed 457/457; and Chromium component tests passed 334/334. Client lint, client production build, VitePress build, changed-JavaScript syntax checks, Docker Compose validation, and entrypoint shell syntax passed. HTTP tests require an ephemeral local listener; restricted-sandbox runs reported `listen EPERM` before assertions and passed when rerun with local loopback access. Bats was unavailable. Real MongoDB integration, live object storage, container image build, production load, and production migration were deliberately not run.

## Coordinated rollout order

1. Web and Chat approve identity issuer/audience/scope/guest and service-auth contracts.
2. Back up Chat MongoDB and verify restore. Do not touch existing user/message/member IDs.
3. Prepare named-volume ownership for uid/gid 1000; remove any Docker-socket dependency from external automation.
4. Configure long random `WEBHOOK_SECRET` and `OPERATOR_API_TOKEN`, approved origins, worker URL allowlist, queue/input limits, session timeouts, and Nginx proxy behavior.
5. Build immutable images in CI; run isolated server/worker/client/docs suites plus dedicated Mongo replica-set contract tests.
6. Deploy Chat security changes first with current local login still enabled; verify HTTP, `/ws`, `/api/events`, replay, uploads, range downloads, and revocation.
7. In a later release, run the reviewed additive identity-link migration and populate only verified mappings. Observe before enabling Web login for a small cohort.
8. Enable Web guest/registered support adapters only after contract tests pass. Keep a feature-flag rollback to local Chat auth.

## Remaining risks

- The audited source may be newer than the running `web-chat-1` image.
- Static worker/operator secrets need rotation and, for worker dispatch, an approved expiry/replay design.
- In-memory media fallback is bounded but not restart-durable.
- Private object-store policy and presigned-URL TTL must be verified outside this repository.
- Federation, guest support routes, and CRM task transport remain blocked on Web; enabling dormant code early would fail closed or create an incomplete identity boundary.
- The shared VPS still needs measured CPU/RAM/disk/connection ceilings and log rotation.

Suggested commit message (for the user to run): `feat(chat): harden sprint-one security boundaries`
