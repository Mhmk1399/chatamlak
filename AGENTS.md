# Repository Guidelines: Songbird

Songbird is a self-hosted real-time communication platform built as a Node.js/React monorepo.

## Workspace Architecture

- **`client/`**: React 19 SPA (Vite, Tailwind CSS 4, Vitest + Playwright).
- **`server/`**: Node.js Express 5 backend (WebSocket/SSE realtime updates, native MongoDB driver, Vitest + Supertest).
- **`docs/`**: Dual-language VitePress documentation (English & Persian/Farsi).

## Essential Commands

```bash
# Development & Build
npm run dev                  # Concurrent client + server dev servers
npm --prefix client run dev  # Frontend dev server (Vite)
npm --prefix server run dev  # Backend dev server (Node --watch)
npm run build                # Build client frontend

# Testing
npm test                     # Run client and server tests concurrently
npm --prefix client run test # Client Vitest (unit + browser)
npm --prefix client run test:unit    # Fast Node-only unit tests
npm --prefix client run test:browser # Playwright browser component tests (Chromium + Firefox)
npm --prefix server run test # Server Vitest (unit + Supertest API integration)
npm --prefix server run test:mongo # Real MongoDB replica-set integration tests

# Docs
npm run docs:dev             # VitePress dev server
npm run docs:build           # Build documentation site
```

## Critical Architecture Quirks & Pitfalls

- **Design & Styling (`DESIGN.md`)**: Respect and follow [`DESIGN.md`](./DESIGN.md) for all frontend styling, UI component design, typography, color system, accessibility, and UI patterns.
- **Node Requirement**: Requires Node `>=24.18.0` and npm `>=11.18.0`.
- **Database (`server/db.js`)**: The active database is MongoDB 8 through the native Node.js driver 7; a replica set is required for transactions. Keep MongoDB queries and collection/index definitions in `server/db/` (including `mongoRepository.js` and `mongoSchema.js`), exposed through the `server/db.js` facade, and inject its operations into routes/services. Preserve public UUIDs and existing API field names. Store messages separately rather than embedding unbounded message arrays. SQL engines are legacy read-only import sources, not runtime fallback modes. SQL access is restricted to `server/db/legacyReader.js` and historical import/migration material; do not add SQL to active routes or services. `MONGODB_URI` must be explicitly configured; keep its value empty in `.env.example` and use `MONGODB_DATABASE=ouj_chat`.
- **Server Test Isolation**: `server/db.js` and `server/index.js` initialize live database/application state and must not be imported by isolated unit/API tests. API integration tests use `makeApp` from `server/test/helpers/makeApp.js` with injected dependencies. Run `test:mongo` for real transactional database coverage: `MONGODB_TEST_URI`, if supplied, must explicitly name a dedicated database containing `test` or `e2e`; otherwise the suite starts a temporary real replica set with `mongodb-memory-server`. Never point tests at application data.
- **Realtime & Durability**: Dispatch live events through `server/lib/sse.js` (`emitChatEvent`) and the WebSocket gateway. Persist covered source mutations and their replay-journal records in the same MongoDB transaction; a successful live broadcast is not durable event recovery. Uploaded-file metadata lives in MongoDB, while file bytes remain in the configured local/S3 storage provider and require separate backups.
- **Client Routing & API**: No React Router library. SPA navigation is managed manually in `client/src/App.jsx` via `window.history`. All client HTTP calls **must** use `apiFetch` in `client/src/api/chatApi.js` (`credentials: "include"`).
- **Documentation Updates**: Any update to documentation under `docs/` must update both English (`docs/*.md`) and Persian (`docs/fa/*.md`) documents, matching the structure in `docs/.vitepress/config.mjs`. Call the `documentor` subagent to update docs when you implant a new feature.

## Development & Git Workflow

- **Git Execution**: **NEVER** run `git` commands automatically. Suggest a commit message in the format `type(scope): description` and let the user execute git operations.
- **Bug Fixing Workflow**: Do not guess or fix immediately upon a bug report. First write a test reproducing the issue under test scenarios, verify it catches the bug, then apply the fix.
- **Response Style**: Keep task completions concise. Do not generate unrequested markdown summary files.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output. Always prefer graphify query commands over raw text grepping on graphify-out/.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Superpowers

When using superpowers skills, create the plans or specs docs under `.superpowers/docs`.




[11/3/2026 1:50 PM] Mohmd Khani: # Owj Platform — Shared Development Rules

> Applies to: owj-web / owjamlak (business website and CRM), owj-chat (real-time messaging), and owj-market-analytics (public-data crawler, valuation, and search).
>
> Usage: Place a copy of this file at the root of each repository as AGENTS.md. Repository-specific instructions may add stricter requirements, but must not weaken privacy, security, ownership, or resource protections here.
>
> Baseline: 2026-11-03. Revise this document whenever measured capacity, deployment topology, repository ownership, or product requirements materially change.

## 0. Operating principle

Build one connected Owj platform, not one tightly coupled application. Favor reliable user-facing business operations over background throughput. Optimize within today's single 4-vCPU, ~7.8-GiB-RAM Ubuntu VPS; keep component boundaries clean so services can be relocated later without rewriting domain logic.

Directive strength: MUST = required; SHOULD = strong default; MAY = optional after evidence. If a request conflicts with a MUST, describe the conflict and propose a safe alternative before implementing.

## 1. Facts, planned changes, and discovery

### Confirmed current facts

- Host: 4 vCPUs, ~7.8 GiB RAM, Ubuntu 24.04, no swap in the last snapshot; approximately 29 GB root disk. Media/large assets use a separate S3-compatible bucket. Keep an eye on local MongoDB growth, indexes, logs, images, and build cache regardless.
- Running production containers in the last snapshot: web-app-1, web-chat-1, web-nginx-1, web-mongo-1. The Web application used roughly 1.1 GiB at idle/low load; Chat roughly 50 MiB, MongoDB roughly 198 MiB. These are not peak-load benchmarks.
- Existing Docker containers have no explicit memory or CPU limits. Docker's current logging driver is json-file; build cache was approximately 7.2 GB. Do not assume resource isolation or log rotation already exists.
- Web is a Next.js 15 business platform with users/roles, auth, listings (Poster), consultants/agencies, CRM cases/tasks, and media. It currently composes the sibling Chat service and local MongoDB 8.
- Chat is a separate sibling repository providing chat HTTP/Socket.IO functionality; its internals require a dedicated audit. Web also has a legacy `/api/chatroom` route, separate from the Chat service's /api/chat/* and /socket.io/*.
- Analytics currently uses MongoDB Atlas for testing and stores sanitized Divar public listings, observations, crawler state, and runs. Moving Analytics data to the local MongoDB host is a desired migration, not yet a completed fact.
- Analytics targets 168 approved Tehran areas; historical collection coverage, lifecycle reconciliation, and scoring-model confidence still need improvement.

### Target architecture (implement incrementally)

- Docker Compose on one host; separate deployable Web, Chat, Analytics API, crawler worker, and incremental-scoring worker processes.
- One local MongoDB engine with separately owned *logical databases* (proposed: owj_business, owj_chat, owj_analytics) and least-privilege credentials; avoid multiple MongoDB processes on the same small host. Do not rename/move current databases without a migration and rollback.
- Web is the identity authority and owner of business mutations. Other services use authenticated API contracts; do not directly write another service's collections.
- Prefer lean host monitoring and durable background jobs before adding Redis, Kafka, Elasticsearch, Kubernetes, Swarm, Prometheus/Loki stacks, or other resource-intensive infrastructure.

At the start of every task: Identify the active repository, affected service, current versus target behavior, its authoritative data owner, expected user-facing latency, and whether the change adds CPU, RAM, disk I/O, database queries, connections, or external requests. Inspect code before asserting a capability is already implemented.

## 2. Repository boundaries and database ownership
[11/3/2026 1:50 PM] Mohmd Khani: | Service | Owns | Must NOT own/do |
|---|---|---|
| Web | Account identity, sessions, permissions, roles, agencies, consultants, business Poster advertisements, CRM customers/cases/tasks/activity, business workflows | Read/write Chat's private messages or Analytics ingestion collections directly merely for convenience |
| Chat | Conversations, messages, delivery/read state, realtime transport | Mutate Web CRM collections or implement duplicate CRM authorization; maintain an independent Owj user identity store |
| Analytics | Sanitized public listing observations, extraction state, public market search, model versions, valuations/scores, analytical aggregates | Store contact/advertiser identity; write Web Poster, user, CRM, or Chat records |
| Infrastructure | Compose/deployment wiring, networks, health checks, resource controls, logs, backups | Own domain rules or include production secrets in the repository |

- MUST have one documented owner for every collection/schema and for each state transition.
- MUST use an owning service's authenticated API or event contract for cross-repository actions. Shared MongoDB *infrastructure* is not authorization to access all its databases.
- MUST use separate DB users/roles per service where feasible. Never reuse MongoDB root credentials inside ordinary app services.
- MUST NOT import another repository's Mongoose model to bypass the owning API.
- MUST NOT assume separate logical MongoDB databases provide CPU/I/O isolation; they still share the same mongod process and disk.
- SHOULD retain a single local MongoDB process initially. Consider physical separation only when benchmarks show contention or uptime requirements demand it.
- Define cross-repository contracts with versioned JSON schemas/OpenAPI/TypeScript types without sharing internal ORM models. Changes require consumer compatibility tests and migration notes.

## 3. Identity, authentication, authorization, and user actions

- Web remains the canonical identity authority. Chat and Analytics MUST NOT create a second user-registration or password/OTP database.
- User-initiated private/business actions MUST be authenticated by Web or verified against Web-issued, audience-restricted identity. Permissions MUST be checked for the requested resource/scope on every mutation.
- Never trust `userId`, `role`, `agencyId`, or `consultantId` supplied by the browser as authoritative. Derive the actor from a verified session/token and re-check current role/account/agency status where needed.
- Do not distribute Web's JWT signing secret to every service. Prefer a Web BFF for authenticated operations on today's architecture; if independent token verification is needed, design short-lived audience-limited tokens with asymmetric verification or another audited mechanism.
- Internal service-to-service requests MUST use authenticated service identities and least-privilege scope; distinguish the service identity from the initiating human user. Protect internal APIs from public exposure.
- Standardize legacy token vs Authorization: Bearer handling before new integrations; do not silently weaken old route permissions.
- Chat -> Web CRM task: Chat calls a Web-owned authorized API. Web checks actor, state transitions, assignee permissions, and records CRM activity. Add an idempotency key; do not treat a correlation ID alone as deduplication.
- Analytics -> consultant 'Save to My Panel': Search may run in Analytics, but saving is a Web-owned authenticated operation. Store a (userId, source, listingToken) association in Web's own collection, with a unique compound index and optionally a sanitized public snapshot. Analytics does not need a user database.
- Saving an external public listing is NOT the same as publishing a Web Poster. Creating a Poster requires the existing verified ownership/contact, validation, and approval workflow. Never fabricate identity/contact information to satisfy its schema.
- Enforce role/scope-based access to private chat, CRM, inspections, and uploads. Add abuse protection and rate limits for login, OTP, API, and uploads.
[11/3/2026 1:50 PM] Mohmd Khani: ## 4. Analytics public-data privacy — non-negotiable

- Collect only from unauthenticated public Divar endpoints explicitly allowed by the project's public extraction design; do not call contact/chat endpoints or access authenticated information.
- Never retain: phone numbers, contact objects, advertiser/agency names or identities, credentials, access tokens, cookies, authenticated responses, or contact/chat actions from Divar.
- Sanitize descriptions before persistence; use the explicit extraction attribute allowlist. Apply the same controls to error logs, traces, queue payloads, test fixtures, exports, caches, and backups.
- Store only safe image metadata as permitted by the analytics schema; do not ingest personal identifiers through fallback extraction.
- Respect access restrictions and reasonable request rates; do not evade protective controls. Throttle and stop on repeated errors or access-policy signals.
- Web's own CRM/Chat legitimately handles customer data, but Analytics must not receive or retain that identity data. Cross-service search should use sanitized search criteria, not CRM profiles/phone numbers.
- Voice input/transcripts SHOULD be ephemeral by default; do not persist raw audio/transcripts or send private CRM details to third parties without explicit design and approvals.

## 5. Resource budget and performance on the CURRENT VPS

Hard constraint: 4 shared vCPUs, ~7.8 GiB physical RAM. Protect interactive Web/Chat/CRM over crawler throughput. No service may assume it has the entire host.

Provisional test ceilings — NOT production-proven settings and NOT reservations:

| Container/process | Initial memory ceiling to test |
|---|---:|
| Web app | 2.0 GiB |
| Single local MongoDB engine | 1.5 GiB |
| Chat | 0.4 GiB |
| Analytics API | 0.5 GiB |
| Crawler | 0.6 GiB |
| Incremental scorer | 0.8 GiB |
| Nginx + tiny agents | 0.2 GiB |
| Total container ceilings | ~6.0 GiB |
| Remaining for host, cache, spikes | ~1.8 GiB |

- MUST measure RSS, peak memory, CPU, event-loop delay, MongoDB latency, and API p95 *before* enforcing/tightening ceilings. An OOM kill is a failed capacity assumption, not an acceptable normal operating mode.
- MUST bound concurrency, arrays/batches, queues, file sizes, HTTP response sizes, MongoDB connection pools, and third-party request rates.
- MUST NOT run full model retraining, unbounded backfill, or large citywide analytics computations on a user-facing request path.
- MUST isolate crawler and scoring from the Web/Chat processes. Separate containers/processes should have independent restarts and checkpoints.
- SHOULD begin with one active crawl-area discovery job, small permitted detail-fetch concurrency, one incremental scorer, and small database-write batches; increase only after observing resource and service latency metrics.
- SHOULD throttle/pause background work if RAM headroom, CPU, MongoDB latency, disk, or CRM p95 deteriorates. Prefer explicit backpressure and durable retries to crashing the host.
- SHOULD train models in a separate scheduled job, reducing or stopping crawler/scorer concurrency during training on this VPS. Benchmark required training RAM first.
- SHOULD build Docker images in CI/off-host and deploy immutable tagged images, avoiding CPU/RAM-intensive production builds.
- MUST NOT add Redis, Kafka, Elasticsearch, K8s/K3s, Swarm, Loki, full Prometheus, or other infrastructure by default. Require a measured bottleneck, cost/resource budget, and rollback plan.

## 6. Database and query rules
[11/3/2026 1:50 PM] Mohmd Khani: - MUST use selective projections, indexes based on real query patterns, bounded pagination/cursors, and lean() for suitable read-only Mongoose queries.
- MUST NOT load entire collections via find({}) or massive arrays into Node memory for filtering/scoring/search. Prefer server-side indexed queries, small batches, streaming/cursors, and precomputed read models.
- MUST inspect explain('executionStats') for newly expensive queries. Review documents examined versus returned, sort strategy, latency, and index maintenance overhead.
- MUST make ingestion idempotent: use unique listing token, safe upserts, revisions/change fingerprints, deduplicated observations where appropriate, and retryable checkpoints.
- MUST keep transactions short and necessary; distinguish document-level atomicity from multi-document consistency. Verify deployment topology before using change streams or transactions (MongoDB replica set requirements).
- MUST reuse MongoDB clients/pools instead of creating a new connection per request or document. Bound connections; never blindly increase maxPoolSize to fix a latency problem.
- MUST make schema/index migrations explicit, versioned, backed up, tested, and reversible wherever possible. Do not drop/rename business collections or change login behavior as part of an Analytics feature.
- SHOULD use separate credentials for Web, Chat, and Analytics DB access; never grant Analytics access to business PII collections.
- SHOULD use one MongoDB process on this small host; tune WiredTiger cache and memory limits only after confirming the actual config and taking a tested backup.
- SHOULD precompute market aggregates and searchable latest scores; don't recompute them on every page load or voice query.

## 7. Crawler, history, and scoring reliability

- Split crawler discovery into fair, resumable per-area jobs for all 168 approved Tehran areas; no alphabetical starvation. Keep durable area checkpoints and bounded retries with backoff/jitter.
- Separate current discovery from optional public-detail enrichment and historical backfill; lower-priority work must not starve discovery or critical user traffic.
- Do not equate a failed or partial crawl with evidence that unseen listings disappeared. Lifecycle reconciliation must use sufficiently complete, reliable crawl coverage.
- Record lastSeen, listing revision, extraction provenance, completeness/quality flags, and meaningful changes; do not repeatedly rescore unchanged properties.
- Queue scoring asynchronously after relevant updates, coalesce duplicate work, and use revision-aware/idempotent jobs. Ensure crashes between listing writes and job publication are recoverable (outbox or reconciliation scan).
- Distinguish model training, incremental valuation, and interactive search ranking. Search should use indexed records and precomputed, versioned scores; never fit the model during a request.
- Save score/model version, listing revision, timestamp, confidence, provenance, and freshness; never silently mix incompatible model versions as equivalent rankings.
- Current price-model validation is experimental, not production-approved. Present estimates as estimates, with uncertainty and data freshness; do not claim guaranteed bargains or market-wide coverage.
- The Analytics dataset has incomplete descriptions, historical details, uncertain advertiser classification, and incomplete area coverage. Do not treat unknown advertiser type as business/personal or trust all active lifecycle labels until reconciliation is reliable.

## 8. Cross-service messaging, events, and API contracts
[11/3/2026 1:50 PM] Mohmd Khani: - Use synchronous authenticated APIs for commands requiring a confirmed result, such as Chat creating a CRM task or Web saving a market listing.
- Use asynchronous durable events/jobs for side effects (notification, score refresh, analytics snapshot). Define event version, unique event ID, source, timestamp, correlation ID, and minimal non-sensitive payload.
- Producers MUST NOT declare success before the owning service acknowledges business completion. Consumers MUST be idempotent; retries must not create duplicate CRM tasks, alerts, or observations.
- Do not place CRM customer contact information, full private chat text, credentials, or prohibited Divar data on broadly consumed events.
- Timeouts, retries with bounded exponential backoff, idempotency, and a clear fallback/error message are required for service-to-service calls.
- Prefer API contract tests (request/response schema, authorization, error cases, idempotency) over tightly coupled cross-repo imports.

## 9. Deployment, operations, monitoring, and security

- MUST use Docker Compose for the current single-host deployment. Do not add an orchestrator unless requirements exceed Compose and more nodes exist.
- MUST deploy independently restartable services with health/readiness checks, restart policies, private networks, and only necessary public ports through Nginx.
- MUST configure and verify per-service memory/CPU limits once baseline load tests confirm settings; never assume Compose files from another repo enforce limits globally.
- MUST rotate and bound container logs. Do not deploy unbounded local logs/metrics retention on the shared VPS.
- MUST use structured logs with service, timestamp, severity, event, and correlation/request ID. Redact secrets, OTPs, passwords, private messages, PII, and prohibited crawler data.
- SHOULD monitor: host RAM available, memory RSS, container restarts/OOMs, CPU, MongoDB read/write p95, connection pools, Web/CRM API p95, Chat connection health, crawler queue lag/area completion, scoring freshness, disk remaining, and backup success.
- MUST keep .env, DB URIs, signing secrets, S3 keys, SMS credentials, and access tokens out of code, logs, commits, tests, screenshots, and shared examples. Maintain a redacted .env.example with names only.
- MUST use least-privilege service DB credentials and narrowly scoped API identities. Never expose MongoDB publicly.
- MUST back up MongoDB and required local metadata off-host, protect S3 assets appropriately, and periodically test restore. S3 media storage does not protect local database records or indexes.
- MUST avoid destructive deployment patterns (git reset --hard on live mutable code, unverified migrations, clearing volumes, docker system prune --volumes). Require an explicit tested rollback for risky changes.
- SHOULD use CI to test/build immutable Docker images; rollout should confirm readiness and preserve a known-good version.

## 10. Minimum tests and acceptance checks for each change

Before marking work complete, run the relevant checks or explain precisely what could not be run:
[11/3/2026 1:50 PM] Mohmd Khani: 1. Ownership: Is the changed collection/API owned by this repository? Are consumers affected?
2. Privacy: Are public Divar data allowlisted and sanitized? Are logs, queue payloads, tests, and exports free from forbidden data?
3. Security: Does the operation authenticate and authorize the real actor? Are service credentials scoped? Is browser-provided identity untrusted?
4. Correctness: Are changes idempotent or retry-safe? Are partial failures and repeated requests handled?
5. Performance: Are queries indexed/bounded? Are memory use, concurrency, and CPU work bounded? Is work off the critical request path when appropriate?
6. Compatibility: Are migrations versioned and backward-compatible where possible? Are Web/Chat/Analytics API contracts preserved?
7. Recovery: Can the worker resume after a restart? Is durable state consistent? Is a rollback possible?
8. Verification: Run relevant lint, typecheck, unit/integration/contract tests and a small resource/performance smoke test; report actual results, not assumptions.

### Coding-agent response format

For nontrivial work, report briefly:

- Repository/service: what changed and which domain owns it.
- Files/contracts/migrations: exact paths; any newly introduced collection, endpoint, job, permission, or dependency.
- Resource impact: expected RAM/CPU/query/connection/I/O effects and concurrency limits.
- Security/privacy: actor validation and cross-service data boundary.
- Verification: tests run and results; remaining gaps and deployment/rollback notes.

## 11. Change-control rules for growing later

Update this file when any of these occur:

- VPS CPU/RAM/disk is upgraded or a second node is introduced.
- Analytics migration from Atlas to local MongoDB completes.
- Chat database ownership is audited and separated from legacy /api/chatroom.
- An identity protocol, message broker, dedicated search engine, or orchestrator is introduced.
- Actual load testing justifies changing memory/CPU budgets, scoring freshness targets, or crawler concurrency.

Do not silently turn future architecture into current fact. For proposed changes, document migration steps, compatibility, measurement, fallback, and rollback first.