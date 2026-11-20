# Owj Chat Repository Architecture, Integration, and Scalability Audit

Audit date: 2026-11-20  
Repository: Owj Chat / package name **ouj-chat**  
Requested output name: **chat.md**  
Revision inspected: branch **main**, commit **1f1d5cb2da6e4dfbbd65d74469990a8055ad42d6**, application version **0.13.2**  
Method: static, read-only source and configuration inspection

> **Sprint 1 update (2026-11-20):** Sections 1–23 below are the historical, pre-remediation audit baseline. They must not be read as the current state of the modified source tree. Section 24 records the subsequent CHAT-001–CHAT-010 implementation work, and [`docs/platform/CHAT_SPRINT_1_HANDOFF.md`](docs/platform/CHAT_SPRINT_1_HANDOFF.md) is the rollout handoff. The sprint changed source and tests only: it did not deploy, migrate production data, inspect customer messages, commit, push, or change any running container.

## Audit conventions and scope

The status labels in this report have the following strict meanings:

- **IMPLEMENTED** — confirmed in executable source.
- **PARTIALLY IMPLEMENTED** — executable pieces exist, but a material requirement or path is missing or broken.
- **CONFIGURED** — declared in configuration; runtime use was not verified.
- **DOCUMENTED ONLY** — described outside executable code.
- **NOT FOUND** — the relevant source was searched and no implementation was found.
- **UNKNOWN** — this repository cannot establish the fact.
- **RECOMMENDATION** — future work; it is not current behavior.

This was a documentation-only audit. No application file, schema, environment file, service, database, migration, dependency, deployment, or Git state was changed. No actual environment file was opened. No tests, servers, workers, database commands, or network integrations were executed. Environment names were inspected through **.env.example** and source references only.

The repository contains **graphify-out/graph.json**, so the required graph-first workflow was attempted. The **graphify** executable was not installed or available in PATH; source was therefore inspected directly. Git branch and revision were read from repository metadata without executing a Git command. Runtime topology, production environment values, live data, database privileges, resource usage, and sibling-repository capabilities remain outside the evidence boundary.

## 1. Executive Summary

### 1.1 What this repository actually is

**IMPLEMENTED:** Owj Chat is a self-hosted communication application with three executable packages:

1. A React 19 single-page client.
2. An Express 5 HTTP, raw-WebSocket, and SSE server.
3. A separate HTTP media-transcoding/mirroring worker.

It owns conversations, memberships, messages, file metadata, read state, calls, local push subscriptions, remote-channel mirroring, and its own MongoDB-backed replay journal. It also currently owns usernames, bcrypt password hashes, sessions, global roles, and account administration. The latter is a material conflict with the platform rule that Owj Web is the canonical identity authority. Evidence: **package.json:2-25**, **server/api/auth.js:25-189**, **server/db/mongoSchema.js:3-17**.

**IMPLEMENTED:** The active datastore is MongoDB through the native driver. MongoDB must be a replica set, Atlas deployment, or sharded deployment because the application uses transactions. SQL packages, migrations, and query adapters remain solely for legacy import/history. Evidence: **server/db.js:12-20**, **server/db/mongoConnection.js:35-49**, **server/db/legacyReader.js**, **server/migrations/**.

**IMPLEMENTED:** Normal chat mutations use HTTP; live updates use raw WebSocket with SSE fallback. This repository does **not** use Socket.IO. A MongoDB event journal and a 15-second browser replay loop repair missed state after disconnects, although journal recording is inconsistent and can duplicate or non-atomically omit records. Evidence: **server/lib/websocketGateway.js**, **server/lib/sse.js:122-146**, **server/api/messaging.js:152-155**, **client/src/hooks/chat/useMessagingTools.js:63-117**.

**NOT FOUND:** No authenticated Web API client, Analytics API client, CRM-task contract, Web-issued identity verification, scoped internal service identity, cross-repository event schema, or direct write to a Web/Analytics collection exists. The “My listings” and “Daily work report” client controls are explicitly presentation-only samples. Evidence: **client/src/components/chat/messages/ComposerBusinessActions.jsx:12-15**, **client/src/components/chat/business/BusinessPreviewSheet.jsx:8-24,97**.

### 1.2 Maturity assessment

The application is functionally broad and has substantial unit/API/browser coverage, MongoDB transactional paths, message idempotency, bounded client caches, and a durable remote-channel queue. It is nevertheless **not ready for trusted multi-repository integration or horizontal production scaling** without changes:

- Shared identity is **BLOCKED** because Chat is a second account/password/session authority.
- Chat-to-Web CRM task creation is **BLOCKED** because no Web-owned command contract, delegated actor proof, authorization, idempotency, timeout, or retry behavior exists.
- Private media authorization has verified critical defects.
- Several internal async contracts are broken or only partly implemented.
- Realtime fan-out is only fully coherent in a single process; SSE, presence, DM call state, and some delivery state remain process-local.
- Background media work is often in memory and may compete with interactive traffic inside the main container.
- Compose provides no CPU/memory limits, log rotation, or explicit private network policy for the current 4-vCPU/~8-GiB host.

### 1.3 Highest-impact verified findings

| Priority | Status | Finding | Primary evidence |
|---|---|---|---|
| P0 | IMPLEMENTED vulnerability | Private message files and thumbnails can be retrieved without a session or chat-membership check; numeric file IDs are sequential. | **server/lib/uploads.js:395-489**; **server/api/uploadsRemote.js:508-580,870-948**; **server/db/mongoSchema.js:18** |
| P0 | IMPLEMENTED vulnerability | Presigned-upload ownership uses nonexistent **session.userId** instead of the active **session.id** shape; arbitrary message IDs are accepted without membership/author verification, bypassing ownership enforcement. | **server/api/uploadsRemote.js:219-224,324-351,408-423**; **server/db/mongoRepository.js:294-295** |
| P0 | IMPLEMENTED vulnerability | Debug middleware logs complete query, params, request body, and JSON response, including passwords, tokens, private messages, and owner secret responses. | **server/index.js:283-317** |
| P0 | CONFIGURED vulnerability | The main image runs as root and Compose mounts the Docker daemon socket. A server compromise can become host-level Docker control. | **Dockerfile:42-85**; **docker-compose.yaml:32-37** |
| P0 | PARTIALLY IMPLEMENTED | Worker and callback authentication fails open when **WEBHOOK_SECRET** is absent; reachable worker endpoints accept caller-controlled network/storage work. | **worker/index.js:608-623,648-785**; **server/api/uploadsRemote.js:583-594**; **server/api/remoteMirror.js:64-70** |
| P1 | Target conflict | Chat independently creates users, passwords, roles, and sessions and cannot verify Owj Web identity. | **server/api/auth.js:25-189**; **server/db/mongoRepository.js:294-315** |
| P1 | PARTIALLY IMPLEMENTED | Core mutations journal transactionally, then live emission can journal the same event again asynchronously; newer tools rely on a non-atomic fire-and-forget journal write. | **server/db/mongoRepository.js:170-193,242-278**; **server/lib/sse.js:122-126** |
| P1 | PARTIALLY IMPLEMENTED | Accepted media jobs use in-memory, unbounded queues and can be lost on restart; the server fallback retains completed queue entries. | **worker/index.js:49-85,684-785**; **server/lib/mediaQueue.js:131-145** |
| P1 | PARTIALLY IMPLEMENTED | Topic close calls a missing DB method; upload return contracts and the auto-add worker contract disagree with repository behavior. | **server/api/messaging.js:242-249**; **server/api/uploadsRemote.js:324-343,835-867**; **server/lib/workers/autoAddWorker.js:9-19** |

### 1.4 Ownership, latency, and resource posture

- **Authoritative data owner today:** this repository owns the **ouj_chat** logical database and Chat binaries. No direct Web or Analytics database access was found. Identity is locally owned in current code but must move behind or be reconciled with Web ownership under the platform target.
- **User-facing latency expectation:** message publication, reads, membership checks, list loads, and signaling run on interactive request paths and should remain subsecond. No source artifact proves actual p50/p95 latency.
- **Background latency expectation:** transcoding, mirroring, remote polling, cleanup, retention, and encryption backfill are asynchronous or scheduled, but several run in the API process/container and share CPU, memory, disk, MongoDB pool, and event loop.
- **Resource evidence:** no measured RSS, peak memory, event-loop delay, CPU, disk growth, MongoDB p95, API p95, or connection utilization was present. This report therefore labels resource concerns as code/configuration risks, not observed production incidents.

## 2. Repository Identity and Technology Stack

### 2.1 Identity and build

| Item | Current evidence-backed state |
|---|---|
| Repository/package | **ouj-chat**, Git remote metadata points to **Mhmk1399/chatamlak**; **package.json:2-12** |
| Version | **0.13.2**; **VERSION:1** |
| Languages | JavaScript/JSX ES modules, CSS, YAML, shell, Markdown; no TypeScript application source |
| Package manager | npm workspaces-by-prefix rather than an npm workspace declaration; root orchestrates package scripts |
| Runtime | Node **>=24.18.0**, npm **>=11.18.0**; Volta and **.nvmrc** pin Node **24.22.1**; **package.json:38-45**, **.nvmrc:1** |
| Development | Root **npm run dev** starts client, server, and worker concurrently; **package.json:13-20** |
| Production build | Vite builds the browser client; the server serves built static assets; **client/package.json:14-28**, **Dockerfile:3-85** |
| Main entry points | **client/src/main.jsx**, **server/index.js**, **worker/index.js**, **scripts/docker-entrypoint.sh** |
| Public components | Nginx TLS listener, React SPA, HTTP API, raw WebSocket upgrades, SSE, public-channel feed, selected public media/avatar paths |
| Background components | Server pollers/cleanup/scheduler, optional embedded worker, standalone worker, remote channel polling/queue, optional BullMQ |

### 2.2 Application frameworks and principal libraries

| Layer | Libraries and role | Evidence |
|---|---|---|
| Browser | React 19.3, React DOM, Vite 8.3, Tailwind CSS 4.3, React Aria, TanStack virtual list, DOMPurify, marked, highlight.js | **client/package.json:30-62** |
| Server | Express 5.3, native MongoDB driver 7.8, ws 8.22, multer, compression, bcryptjs, express-rate-limit, web-push | **server/package.json:55-74** |
| Optional queue/cache | BullMQ 6 and ioredis 6 | **server/package.json:59,65** |
| Object storage | AWS S3 SDK and presigner, compatible endpoints supported | **server/package.json:56-57** |
| Remote channels | Telegram/GramJS, undici, HTTPS proxy agent | **server/package.json:64,71-72** |
| Legacy import only | Knex, pg, sql.js, optional better-sqlite3 | **server/package.json:66,69-70,84-85** |
| Worker | Node HTTP, ffmpeg/ffprobe executables, AWS S3 SDK | **worker/package.json:22-29**, **worker/Dockerfile** |
| Testing | Vitest 5, Supertest, Playwright/Vitest browser, fast-check, mongodb-memory-server, Bats | package manifests and **scripts/test/** |
| Documentation | VitePress, English and Persian trees | **package.json:23-36**, **docs/**, **docs/fa/** |

### 2.3 Database and storage

**IMPLEMENTED:** One reused MongoClient is configured with a default maximum pool size of 20 and a ten-second server-selection timeout. The database defaults to **ouj_chat**, but production can select another logical name. An explicit Mongo URI is mandatory, and startup verifies replica-set/sharded capability. Evidence: **server/db/mongoConnection.js:35-49**.

**CONFIGURED / UNKNOWN:** The URI may point to local MongoDB, Atlas, or another reachable replica set. The repository cannot establish the production host. **docker-compose.mongo.yaml** supplies a loopback-only, unauthenticated, single-member MongoDB 8 replica set for host-based development; the primary application Compose expects an external URI.

**IMPLEMENTED:** File metadata lives in MongoDB. Binary attachments and avatars use either a local data directory or an S3-compatible provider. Backing up MongoDB alone does not back up those bytes. Evidence: **server/lib/storage/index.js:12-27**, **server/lib/storage/LocalStorageProvider.js**, **server/lib/storage/RemoteStorageProvider.js**.

### 2.4 External systems

Confirmed source integrations are MongoDB, optional Redis, S3-compatible storage, Telegram MTProto, other public Ouj Chat channel feeds, Web Push providers, static or Cloudflare TURN credentials, the media worker, and a client-side GitHub release/tag check. No Web business API or Analytics API integration was found.

## 3. Directory and Module Architecture

| Path | Responsibility and important boundaries |
|---|---|
| **client/** | React SPA. Manual History API routing, no React Router. API wrappers, realtime hooks, IndexedDB caches/outbox, PWA service worker, admin/chat/auth/invite pages. |
| **client/src/App.jsx** | Session restore, app feature metadata, manual route selection, login/register orchestration. |
| **client/src/pages/ChatPage.jsx** | Main 8,717-line interaction coordinator; chat lists/messages/uploads/calls/push/profile/realtime state. Its size is a change-risk hotspot. |
| **client/src/api/** | HTTP wrapper modules. **chatApi.js** uses credentials; several legacy wrappers target nonexistent server routes. |
| **client/src/hooks/chat/** | WebSocket/SSE handling, calls, message loading, sync/tool state, notifications, health, scrolling, telemetry. |
| **client/src/utils/** | IndexedDB, outbox, drafts, caching, media preprocessing, markdown sanitation, formatting, PWA/device utilities. |
| **server/index.js** | 1,410-line composition root: environment/settings, Mongo facade, Express middleware, storage/realtime/calls/push/media/remote components, route registration, startup maintenance, timers, HTTP/WS startup and shutdown. |
| **server/api/** | 20 route modules covering auth, chat, messages, calls, uploads, remote channels, admin, health, profile, presence, push, and newer messaging tools. |
| **server/db/** | Native Mongo store/schema/repositories plus legacy read-only SQL import adapters. Database queries and indexes are correctly centralized here. |
| **server/lib/services/** | Six named domain services: appearance, deletion, membership, message publication, messaging/scheduling, and Mongo admin. |
| **server/lib/** | Realtime gateways, presence/calls, push, remote channel engine, storage, encryption, media dispatch, cleanup/retention, admin/system helpers. |
| **server/lib/workers/** | In-process auto-add worker. |
| **server/scripts/** | Mongo administration, backup/restore/import, data inspection and storage migration tools. These can mutate state and were not executed. |
| **server/migrations/** | Historical SQL migrations. They are not active MongoDB startup migrations. |
| **worker/** | Independent/embedded media worker, ffmpeg orchestration, remote/local storage operations, encryption, tests, its own Docker image/Compose. |
| **shared/** | Cross-client/server chat-appearance constants/validation; not a cross-repository API contract. |
| **nginx/** | TLS reverse proxy, SSE buffering exception, WebSocket Upgrade forwarding. |
| **docs/** and **docs/fa/** | Parallel English/Persian VitePress documentation. |
| **scripts/** and **playbook.yaml** | Docker entrypoint, installer/certificate/data scripts, and configuration-management deployment. The very large installer retains legacy SQL/systemd paths. |
| **.github/workflows/** | Test/build, release, Docker image, documentation, and CodeQL workflows. |
| **graphify-out/** | Generated knowledge graph; present but its CLI was unavailable for this audit. |

The application layer is modular at file level, but **server/index.js**, **server/lib/remoteChannels.js** (about 2,993 lines), **client/src/pages/ChatPage.jsx**, and the legacy installer remain concentration points. The client has no centralized state library; React state/hooks and IndexedDB coordinate behavior. Server dependency injection exists for route factories and isolated tests, while importing **server/db.js** or **server/index.js** performs live initialization.

## 4. Complete Database Model Inventory

### 4.1 Database ownership and conventions

**IMPLEMENTED:** There are **35 persistent MongoDB collections**: 34 application collections declared in **COLLECTION_KEYS** plus the internal **counters** collection. The native driver is used directly; there are no Mongoose models, hooks, middleware, or virtual fields. Evidence: **server/db/mongoSchema.js:3-82**.

Unless noted otherwise:

- Documents inserted through the generic store receive ISO-string **created_at**.
- Public entity IDs are UUID strings. Five domain collections use numeric sequence IDs.
- MongoDB does not enforce foreign keys; relationship cleanup is explicit application logic.
- Only five collections have strict JSON-schema validation, and those validators cover a minimal subset.
- Readers/writers are Chat server modules and its maintenance CLI; no sibling-repository access was found.
- Field types below are confirmed from validators and writes or are application-implied where no validator exists.

### 4.2 All collections and meaningful fields

| # | Collection and responsibility | Fields, types, defaults, validation | Relationships, access, sensitivity, lifecycle/performance |
|---:|---|---|---|
| 1 | **users** — Chat-local identity/profile | **id:string UUID**, **username:string**, **password_hash:string** required; nickname/color/status/role/banned/verified; avatar URL/driver/key/encryption; chat_appearance object; last_seen string. Defaults role=user, status=online, banned=0, verified=0, nullable nickname/avatar, local avatar driver. | Username unique; one owner via partial unique role index. Read by auth/chat/profile/admin; written by auth/profile/admin/import. Sensitive identity/password hash. Independent identity conflicts with Web ownership. |
| 2 | **chats** — DM/group/channel/saved metadata | **id:string**, **type:dm/group/channel/saved** required; name; group_username/visibility; invite_token; created_by_user_id; verified; allow_member_invites; auto_add_new_users; color/avatar; saved_owner_id; dm_pair. Defaults dm/public and feature flags. | Unique group username, invite token, saved owner, and DM pair. Parent of members/messages/source/calls. Private metadata. Indexed discovery by type/visibility/time. |
| 3 | **chat_messages** — persisted messages | **id:string**, **chat_id:string**, **body:string encrypted envelope**, **created_at:string** required; user_id; edited/edited_body; read_at/read_by_user_id; hidden_everyone_at; expires_at; reply_to_message_id; client_request_id; forward origin fields. Defaults edit/read/hide/expiry/reply/request fields null/false. | Chat/time index; unique chat+user+client_request idempotency; expiry index. Parent of files/reads/reactions/topic/poll. Private content. Search must decrypt in Node. |
| 4 | **chat_message_files** — attachment metadata | **id:number**, **message_id:string**, **mime_type:string**, **stored_name:string** required; kind/original name/size; width/height/duration; storage driver/key/thumb key; processing status; encryption; blurhash/waveform; expires_at. Defaults ready/local/none and null metadata. | Sequential ID; message/storage/expiry indexes. Binary is outside Mongo. Sensitive filenames/object keys. Public download authorization is critically defective. |
| 5 | **chat_members** — conversation participation | **chat_id:string**, **user_id:string**, **role:owner/admin/member** required; created_at. Default member. | Composite unique key plus user/chat index. Central resource-authorization relation. No DB foreign key. |
| 6 | **chat_left_members** — voluntary leave marker | chat_id:string, user_id:string, left_at:string. | Composite unique. Prevents/reconciles implicit membership behavior. |
| 7 | **group_removed_members** — moderation removal marker | chat_id:string, user_id:string, removed_by_user_id:string, removed_at:string. | Composite unique. Sensitive moderation metadata. |
| 8 | **hidden_chats** — per-user chat hiding | user_id:string, chat_id:string, hidden_at:string. | Composite unique. Loaded into memory in chat-list paths. |
| 9 | **hidden_chat_messages** — per-user message hiding | user_id:string, message_id:string, hidden_at:string. | Composite unique plus message/user reverse index. Large hidden-ID sets can expand query filters. |
| 10 | **chat_message_reads** — per-recipient read receipt | message_id:string, user_id:string, read_at:string. | Composite unique plus user/message index. Potentially high growth; no TTL. Some whole-chat reads materialize many messages and write per item. |
| 11 | **chat_mutes** — per-user mute | user_id:string, chat_id:string, muted:boolean/number, updated_at:string. | Composite unique. Loaded with chat list. |
| 12 | **sessions** — opaque Chat sessions | token:string key, id/user_id:string actor reference, last_seen:string, created_at:string. | Unique raw token, user index. Highly sensitive. No server-enforced expiry or TTL; touched on authenticated requests. |
| 13 | **app_settings** — dynamic settings and secrets | key:string, value:string, updated_at:string. | Unique key. Stores application settings and generated admin/webhook/cron/encryption/VAPID/Telegram secret material in plaintext. Database backups therefore co-locate ciphertext and its key. |
| 14 | **push_subscriptions** — browser push credentials | endpoint:string, user_id:string, p256dh:string, auth:string, preview flag, locale, timestamps. | Endpoint unique; no user_id index found despite recipient queries. Sensitive push credentials. Invalid subscriptions are pruned on provider response. |
| 15 | **pending_presigned_uploads** — remote upload claims | storage_key:string, user_id:string/null, created_at/expires_at strings. | Storage key unique. Intended ownership is broken by the session.userId/session.id mismatch. No TTL index. |
| 16 | **remote_channel_sources** — mirror source config | id:number, chat_id:string, provider/source identifiers, title/avatar/URL, source_version:number, sync_metadata/stream_media/enabled/paused flags, last remote ID/error/seen timestamps. Defaults disabled/unpaused/version 1. | Unique ID and chat_id. Contains external metadata and configuration. Provider+enabled scan lacks a matching index. |
| 17 | **remote_channel_queue** — durable imported-post queue | id:number; source/provider/update/message/version IDs; payload_json; status; attempts; next_attempt_at; locked_at/owner; error; created_message_id; timestamps. Defaults pending, attempts 0. | Dedupe indexes for Telegram update/message identifiers; work index by status/next attempt/id. Completed rows purged after seven days. Payload can contain message/media metadata. |
| 18 | **remote_channel_provider_state** — polling checkpoint | provider:string, next offset, last error/poll/update timestamps. | Provider unique. Enables Telegram polling resume. |
| 19 | **admin_audit_logs** — privileged action history | id:number, ts/created_at, actor ID/name, action, target type/label, details, status. | Numeric unique and time indexes. Sensitive administrator/user metadata; no automatic retention. |
| 20 | **chat_preferences** — per-user chat organization | user_id:string, chat_id:string, pinned:number, archived:number, folder:string. Defaults 0/0/empty. | Composite unique. |
| 21 | **message_reactions** — reactions | message_id:string, user_id:string, emoji:string. | Composite unique across message/user/emoji. Tool mutations are not atomically journaled. |
| 22 | **chat_pinned_messages** — pinned messages | chat_id:string, message_id:string, user_id:string, created_at. | Composite unique chat/message. |
| 23 | **chat_topics** — forum-style topics | id:string UUID, chat_id:string, user_id:string, title:string, closed:boolean/number, created_at. | Unique ID, chat/time index. Active topic-state endpoint calls a missing persistence method. |
| 24 | **chat_message_topics** — message/topic assignment | message_id:string, topic_id:string. | Message ID unique; application-enforced relationship. |
| 25 | **chat_polls** — message poll definition | id:string UUID, chat_id:string, user_id:string, message_id:string, encrypted question/options, closed:number, created_at. Default closed=0. | Unique ID; chat/message index. Private poll content. |
| 26 | **chat_poll_votes** — per-user vote | poll_id:string, user_id:string, option index:number. | Composite unique. |
| 27 | **scheduled_messages** — durable scheduled publication | id:string UUID, user_id:string, chat_id:string, encrypted body, due_at:string, status, error, lease owner/until, reply/topic IDs. | Unique ID; status/due/lease index. Five-second poller claims leases. Completed/failed metadata has no retention. |
| 28 | **chat_group_policy** — sending policy | chat_id:string, slow_seconds:number, members_can_send boolean/number, members_can_upload boolean/number. | Chat ID unique. Manager-written, member-read. |
| 29 | **chat_event_log** — replay journal | id:number global sequence, chat_id:string/null, viewer_user_id:string/null, payload:object, created_at:string. | Unique numeric ID; chat/id and viewer/id indexes. No retention/TTL. Some events duplicate; some are non-atomic. |
| 30 | **session_devices** — device/session label | token_hash:string SHA-256, device label/string, created_at. | Token hash unique. Device/browser metadata. Used for session listing/revocation. |
| 31 | **group_call_rooms** — group-call generation | chat_id:string, version:number, created_at. | Chat ID unique. |
| 32 | **group_call_peers** — live group-call membership | id:string UUID, chat_id:string, user_id:string, video:boolean, updated_at:string, created_at. | Unique ID, chat/update index. Peers stale after about 45 seconds and are pruned by active call operations; no TTL. |
| 33 | **meta** — schema metadata | key:string, value:any, created_at. | Key unique; stores Mongo schema version. |
| 34 | **migration_runs** — legacy import checkpoint | id:string, checksum/status/counts, lease owner/until, current collection/progress, errors, timestamps. | ID unique. Import-resume state. Lease values use BSON Date while most application timestamps are strings. |
| 35 | **counters** — numeric sequences | _id:string, value:number. | Mongo _id unique. Sequences exist for files, remote sources/queue, audit/event logs, and chat events. Allocation gaps are allowed. |

Primary field evidence: **server/db/mongoSchema.js:3-73**, **server/db/mongoRepository.js:75-395**, **server/db/mongoMessaging.js:58-539**, **server/db/mongoRemote.js:2-69**, **server/db/mongoAdmin.js:31-58**, **server/db/mongoImport.js:72-106**.

Reader/writer and source mapping:

| Collections | Principal executable readers/writers |
|---|---|
| **users, sessions, chat members/leave/remove/hide/mute, chats, messages, files, reads, push subscriptions** | **server/db/mongoRepository.js**; invoked by auth/profile/chat/message/push/admin services and import. |
| **session_devices, chat_preferences, reactions, pins, topics/message topics, polls/votes, scheduled messages, group policy, group-call rooms/peers, chat_event_log** | **server/db/mongoMessaging.js** plus core repository transaction event calls; invoked by messaging APIs, scheduler and replay client. |
| **remote_channel_sources, remote_channel_queue, remote_channel_provider_state** | **server/db/mongoRemote.js** and **server/lib/remoteChannels.js**; admin/owner remote APIs also write configuration. |
| **pending_presigned_uploads** | Remote upload route dependencies in **server/api/uploadsRemote.js** through the Mongo facade/store. |
| **app_settings** | **server/lib/appSettings.js**, **server/lib/secrets.js**, **server/lib/remoteChannelSecrets.js** and admin settings routes. |
| **admin_audit_logs** | **server/db/mongoAdmin.js** and admin middleware/actions. |
| **meta, migration_runs** | **server/db/mongoSchema.js**, **server/db/mongoImport.js**, Mongo CLI migration/import commands. |
| **counters** | **server/db/mongoStore.js** sequence allocation and **mongoSchema.js** initialization. |

No collection is read or written by a confirmed Web/Analytics client in this repository. No database middleware, hook, virtual, populate mechanism, or ORM-level cascade exists; all lifecycle behavior is explicit code.

### 4.3 Validation, defaults, indexes, and lifecycle

**IMPLEMENTED:** Schema creation installs 63 declared indexes in total, in addition to implicit MongoDB _id indexes. Every application collection receives a unique logical-key index. Important additional indexes cover:

- username and the single owner;
- group usernames, invitations, saved owners, and deterministic DM pairs;
- public discovery by chat type/visibility/time;
- membership by user/chat;
- chat message cursor order and client-request idempotency;
- message/file expiry lookup;
- file storage names/keys;
- read and hidden-message reverse lookup;
- session user lookup;
- remote source/chat uniqueness, remote queue deduplication and leasing;
- event replay by chat or viewer;
- group-call stale-peer scans;
- scheduled-message claiming;
- topics, polls, and admin audit order.

Evidence: **server/db/mongoSchema.js:27-59**.

**PARTIALLY IMPLEMENTED:** Strict validators exist only for **users**, **chats**, **chat_messages**, **chat_members**, and **chat_message_files**, and they validate only their minimum required fields. The other 29 application collections are schemaless beyond application code. Evidence: **server/db/mongoSchema.js:20-26,75-79**.

**NOT FOUND:** No TTL index exists. Expiration is application-driven. Sessions, event logs, admin audits, read receipts, and completed scheduled-message metadata can grow indefinitely. Remote queue cleanup is the notable bounded lifecycle.

**RECOMMENDATION:** Confirm new indexes against production-shaped query plans using **explain("executionStats")**, especially:

- **remote_channel_sources(provider, enabled, id)** for polling;
- **push_subscriptions(user_id)** for recipient fan-out;
- bounded/admin list queries that currently sort or paginate after materialization;
- any replacement for regex/in-memory encrypted-message search.

### 4.4 Confirmed relationships

~~~mermaid
erDiagram
  USERS ||--o{ SESSIONS : owns
  USERS ||--o{ SESSION_DEVICES : labels
  USERS ||--o{ CHAT_MEMBERS : participates
  CHATS ||--o{ CHAT_MEMBERS : contains
  CHATS ||--o{ CHAT_MESSAGES : contains
  USERS ||--o{ CHAT_MESSAGES : authors
  CHAT_MESSAGES ||--o{ CHAT_MESSAGE_FILES : has
  CHAT_MESSAGES ||--o{ CHAT_MESSAGE_READS : receives
  CHAT_MESSAGES ||--o{ HIDDEN_CHAT_MESSAGES : hidden_for
  CHAT_MESSAGES ||--o{ MESSAGE_REACTIONS : receives
  CHAT_MESSAGES ||--o| CHAT_MESSAGE_TOPICS : assigned
  CHAT_TOPICS ||--o{ CHAT_MESSAGE_TOPICS : groups
  CHAT_MESSAGES ||--o| CHAT_POLLS : represents
  CHAT_POLLS ||--o{ CHAT_POLL_VOTES : receives
  CHATS ||--o| REMOTE_CHANNEL_SOURCES : mirrors
  REMOTE_CHANNEL_SOURCES ||--o{ REMOTE_CHANNEL_QUEUE : queues
  CHATS ||--o{ CHAT_EVENT_LOG : replays
  CHATS ||--o{ SCHEDULED_MESSAGES : schedules
  USERS ||--o{ SCHEDULED_MESSAGES : authors
  CHATS ||--o| GROUP_CALL_ROOMS : hosts
  GROUP_CALL_ROOMS ||--o{ GROUP_CALL_PEERS : contains
~~~

No Consultant, Agency, Property/Poster, CRM Customer, CRM Task, Analytics Listing, Score, or market-history collection exists in this repository. “Saved chat” means the user’s self-chat and is unrelated to the proposed Analytics “save to my panel” workflow.

### 4.5 Database operation concerns

- **server/db/mongoStore.js:24-27** implements generic list/aggregation with **toArray()**; caller bounds determine safety.
- **server/db/mongoRepository.js:211-228** materializes memberships, hidden/mute/read data and performs multiple per-chat queries before sorting.
- **server/db/mongoRepository.js:270-282** can load a whole visible conversation and transact per read receipt.
- **server/db/mongoMessaging.js:356-417** fetches/decrypts up to 500 messages in Node and performs per-result author lookups for text search.
- **server/db/mongoAdmin.js:13-29,48-49** enriches all matching chats and paginates in memory.
- **server/db/mongoMaintenance.js:13-38** materializes collections and performs synchronous gzip; restore permits a very large in-memory archive.
- **server/lib/mongoRetention.js:14-22** runs an unbounded sequential text-expiry backfill.
- **server/lib/mongoFileJobs.js:35-70** can materialize all file/avatar references and provider object listings.

These are verified code paths and scalability risks; no runtime incident or query latency is claimed.

## 5. Complete API Inventory

### 5.1 Inventory method and shared contracts

Static route extraction and handler inspection found **174 Express declarations representing 173 unique main-server method/path surfaces**. The duplicate is an alternative **POST /api/admin/db-tools** implementation; current registration selects the Mongo implementation. The media worker adds four HTTP surfaces, producing **177 unique HTTP method/path surfaces across the two processes**. The SPA wildcard and two raw WebSocket upgrade paths are not counted as HTTP API endpoints.

Access abbreviations used below:

- **Public** — no Chat session.
- **User** — valid Chat cookie session.
- **Member** — authenticated actor must belong to the target chat.
- **Manager/Owner** — chat role check in addition to membership.
- **Admin/Platform owner** — current global DB role check.
- **Internal secret** — Chat-local shared/per-job secret, not an Owj platform service identity.

Cross-cutting behavior:

- JSON bodies are globally capped at 1 MiB; upload paths have independent limits. Evidence: **server/index.js:263**.
- Most failures are an unversioned **{error: string}** with route-specific 400/401/403/404/409/429/500/503 status. No common typed error code, OpenAPI description, correlation ID, or versioned schema exists.
- The production-wide rate limiter is 1,000 API requests per 15 minutes, with admin paths using a separate 3,000-request bucket; SSE/admin exceptions apply. Login and registration have no credential-specific limiter. Evidence: **server/index.js:328-344,1200-1208**.
- UUID middleware is attached selectively, not globally. Hand-written validation and bounds vary by route.
- Main browser calls are cookie-based with credentials. There is no bearer/JWT service contract.

Most handlers are inline anonymous callbacks inside the cited route-registration function rather than named controllers; the source route and line are therefore the handler identity. The tables state external calls and unusual rate/pagination behavior where present. If no external system is named, the inspected handler stays within Chat services/Mongo/storage. Family preambles identify the collections commonly touched, and the database inventory maps those collections to repositories.

### 5.2 Core, authentication, health, and event stream — 7 endpoints

| Endpoint | Access | Input, output, state, and concerns | Source |
|---|---|---|---|
| **GET /api/app/info** | Public | Returns version/changelog/repository plus live client feature flags and limits. Reads settings and process environment; no pagination. Exposes operational feature configuration by design. | **server/api/app.js:6-56** |
| **GET /api/health** | Public | Returns **{ok:true}** only. Liveness does not check MongoDB, storage, worker, or readiness. | **server/api/health.js:12-14** |
| **GET /api/events** | User, query username must equal session | Opens SSE, registers presence, sends **connected**, comments every 25 seconds, cleans up on close. Long-lived response; no SSE event ID or Last-Event-ID recovery. | **server/api/health.js:16-54** |
| **POST /api/register** | Public when signup enabled | Body username/password. Normalizes/validates, bcrypt-hashes synchronously at cost 10, creates local user/session/device and cookie; may trigger auto-add. Returns user/session view. Conflicts with Web identity authority. | **server/api/auth.js:25-114** |
| **POST /api/login** | Public | Body username/password. Checks ban, bcrypt compare, creates local opaque session/device and cookie. No endpoint-specific brute-force limiter. | **server/api/auth.js:116-156** |
| **GET /api/me** | User | Resolves session and returns current Chat-local user/profile/role. Also participates in session touch behavior. | **server/api/auth.js:158-177** |
| **POST /api/logout** | Session optional | Deletes current session token when present and clears cookie; returns success. | **server/api/auth.js:179-189** |

### 5.3 Profile, presence, appearance, and push — 13 endpoints

| Endpoint | Access | Input, output, state, and concerns | Source |
|---|---|---|---|
| **GET /api/profile** | User | Query username; returns profile fields. Reads users; cross-user profile visibility is application-wide. | **server/api/profile.js:80-105** |
| **PUT /api/profile** | User/self | Body username/nickname/color and current identity fields; validates names, updates user, emits profile/list events. | **server/api/profile.js:107-198** |
| **POST /api/profile/avatar** | User/self | Multipart avatar or remote-upload metadata; validates configured upload and image constraints, stores metadata/binary, emits profile update. | **server/api/profile.js:200-322** |
| **PUT /api/password** | User/self | Body currentPassword/newPassword; verifies hash and writes a new bcrypt hash. Other session invalidation behavior is limited. | **server/api/profile.js:324-353** |
| **PUT /api/status** | User/self | Body username/status; only online or invisible, writes user and broadcasts presence. | **server/api/profile.js:355-381** |
| **POST /api/profile/delete** | User/self plus password | Cascades Chat account data, files, sessions/memberships/messages according to deletion service; non-recoverable business mutation. | **server/api/profile.js:383 onward** |
| **PUT /api/profile/appearance** | User/self | Body appearance and revision; validates shared schema, performs optimistic update and private journal/live event. | **server/api/appearance.js:5 onward** |
| **GET /api/presence** | User | Query username; returns effective/raw status and lastSeen. Any authenticated user can query a known account. | **server/api/presence.js:4-30** |
| **GET /api/push/public-key** | User | Returns VAPID public key or 503 if not configured. | **server/api/push.js:13-20** |
| **POST /api/push/subscribe** | User/self | Body username, HTTPS subscription keys, preview flag, locale; upserts endpoint credentials. | **server/api/push.js:22-52** |
| **POST /api/push/unsubscribe** | User/self | Body username/endpoint; removes actor’s subscription. | **server/api/push.js:54-68** |
| **POST /api/push/test** | User/self | Sends a test notification; external push call, may prune invalid subscriptions; 503/500 on provider failure. | **server/api/push.js:70-102** |
| **GET /api/push/debug** | User/self | Query username; returns configured flag, count, and the actor’s endpoint URLs. Sensitive diagnostics. | **server/api/push.js:104-123** |

### 5.4 Chats, membership, discovery — 24 endpoints

These handlers access **users**, **chats**, membership/left/removed/hidden/mute tables, messages/files, remote source state, and event records. Most return unversioned chat/user views. **GET /api/chats** has no server-side pagination and performs N+1 enrichment.

| Endpoint | Access | Input, output, state, and concerns | Source |
|---|---|---|---|
| **GET /api/chats** | User/self username | Returns all visible chats, latest message, unread/mute/remote metadata. Unpaginated; multiple DB queries per chat. | **server/api/chats.js:339-467** |
| **GET /api/chats/saved** | User | Creates or returns the actor’s self/saved chat. Idempotent through unique saved_owner_id. | **server/api/chats.js:469-494** |
| **POST /api/chats/dm** | User; body from must equal session | Body from/to usernames; creates or reuses deterministic DM and memberships, returns chat. | **server/api/chats.js:496-539** |
| **POST /api/chats** | User | Legacy body for group/channel creation; creates chat/members/invite and events. Compatibility surface overlaps the next endpoint. | **server/api/chats.js:541-580** |
| **POST /api/chats/group** | User | Body name, members, type/visibility/username/options; validates and creates group/channel with owner/members. Member array bounds require review. | **server/api/chats.js:582-749** |
| **GET /api/groups/invite/:token** | User | Token path; returns invite preview when valid. Reads chat/creator/member state. | **server/api/chats.js:751-800** |
| **POST /api/groups/invite/:token/join** | User | Joins through membership service; enforces visibility/removal/invite rules, emits list/update events. | **server/api/chats.js:802-859** |
| **GET /api/channels/:username/meta** | Public only for public channel while signup enabled | Path username; returns sanitized public-channel metadata. Used by remote federation. | **server/api/chats.js:861-891** |
| **GET /api/channels/:username/messages** | Same public gate | Cursor/query and capped limit 100; returns public channel messages for federation. No private channels. | **server/api/chats.js:893-955** |
| **GET /api/chats/:chatId/preview** | User; public or member | UUID path; returns preview/member state. | **server/api/chats.js:957-1009** |
| **GET /api/chats/group/:chatId/invite-link** | Member with invite permission | Returns current invite link/token. Sensitive bearer invitation. | **server/api/chats.js:1011-1054** |
| **POST /api/chats/group/:chatId/regenerate-invite** | Chat owner | Replaces invitation token and returns new link; invalidates old link. | **server/api/chats.js:1056-1098** |
| **PUT /api/chats/group/:chatId** | Chat owner | Body group metadata/options/membership changes; updates chat and emits changes. Broad mutation. | **server/api/chats.js:1100-1243** |
| **POST /api/chats/group/:chatId/leave** | Member | Removes/marks actor membership, may transfer/handle ownership by rules, emits list changes. | **server/api/chats.js:1245-1321** |
| **POST /api/chats/group/:chatId/delete** | Owner plus password | Deletes group/channel and dependent data/files; returns success after destructive service orchestration. | **server/api/chats.js:1323-1376** |
| **POST /api/chats/group/:chatId/remove-member** | Owner | Body target username/user ID; removes member and records moderation marker. | **server/api/chats.js:1378-1442** |
| **POST /api/chats/group/:chatId/avatar** | Owner | Multipart/remote avatar; stores binary/metadata and emits chat update. | **server/api/chats.js:1444-1568** |
| **DELETE /api/chats/group/:chatId/avatar** | Owner | Removes avatar metadata/binary and emits update. | **server/api/chats.js:1570-1624** |
| **PUT /api/chats/:chatId/mute** | Member | Body muted flag; upserts per-user mute and returns state. | **server/api/chats.js:1626-1653** |
| **POST /api/chats/hide** | User/self | Body chat IDs/username; hides chats for actor. Input-array bounds are not consistently explicit. | **server/api/chats.js:1655-1676** |
| **POST /api/chats/group/:chatId/join-public** | User; public group/channel | Adds actor unless removed/ineligible; emits membership/list changes. | **server/api/chats.js:1678-1741** |
| **GET /api/users** | User | Returns user directory/search data. Repository list can be unbounded depending query. | **server/api/chats.js:1743-1765** |
| **POST /api/mentions/resolve** | User | Body up to 50 mention names; resolves visible user data. | **server/api/chats.js:1767-1829** |
| **GET /api/discover** | User | Query text/type; regex-searches visible users/groups/channels with configured result limits. | **server/api/chats.js:1831 onward** |

### 5.5 Message publication, reads, and mutation — 11 endpoints

Message bodies are encrypted at rest before persistence. Membership is checked before normal access. Core create/edit/delete/read paths can journal inside the mutation transaction; live emission can subsequently duplicate the journal entry. The normal message list uses cursor/query pagination, but the repository accepts a maximum as high as 10,000.

| Endpoint | Access | Input, output, state, and concerns | Source |
|---|---|---|---|
| **GET /api/messages** | Member | Query chatId, before/after/around/limit and visibility context; returns decrypted message/file/author views. Limit can reach 10,000. | **server/api/messages.js:266-518** |
| **GET /api/messages/first-unread** | Member | Query chatId; finds first unread visible message. Read-ID expansion can be large. | **server/api/messages.js:520-547** |
| **POST /api/messages/read** | Member | Body chatId; marks all visible messages read and emits **chat_read**. Can load/write a whole conversation. | **server/api/messages.js:549-582** |
| **POST /api/messages/read-one** | Member | Body UUID chatId/messageId; validates membership/message and upserts one receipt. | **server/api/messages.js:584-626** |
| **POST /api/messages/read-counts** | Member | Body chatId/messageIds; returns per-message counts. **messageIds** is not explicitly bounded. | **server/api/messages.js:628-682** |
| **POST /api/messages/typing** | Member | Body chatId/typing; emits ephemeral typing event, no durable write. | **server/api/messages.js:684-734** |
| **POST /api/messages/upload** | Member | Multipart or remote upload metadata plus chat/reply/client IDs; validates policy/limits, persists message+file metadata, dispatches processing and emits. Large complex path. | **server/api/messages.js:736-1687** |
| **POST /api/messages** | Member | Body chatId/body/reply/clientRequestId; validates limits/policy, transactionally creates or reuses idempotent message, emits/pushes. | **server/api/messages.js:1689-1818** |
| **POST /api/messages/edit** | Author; edit limiter | Body chatId/messageId/body; validates author/time/content, transactionally edits and journals, emits update. | **server/api/messages.js:1820-1891** |
| **POST /api/messages/delete** | Member; author/owner for everyone | Body chatId/messageId/scope; hides for actor or deletes/hides globally, cleans files, journals/emits. | **server/api/messages.js:1893-1957** |
| **POST /api/messages/forward** | Member of source and every target | Body sourceMessageId/targetChatIds; copies content/files and publishes per target. Target list is unbounded and operation is non-atomic across targets. | **server/api/messages.js:1959-2105** |

### 5.6 Messaging tools — 27 endpoints

All routes use a common session wrapper and return a generic error envelope. Chat/member or manager checks are performed inside the handler. Data spans preferences, reactions, pins, topics, polls, schedules, group policy/role, calls, devices, media, and replay journal. Tool mutations generally emit **chat_tools_updated**; several are not atomically journaled.

| Endpoint | Access | Contract and side effects | Source |
|---|---|---|---|
| **GET /api/messaging/chats/:chatId/call** | Member | Returns group call room/active peers after pruning stale peers. | **server/api/messaging.js:45-47** |
| **POST /api/messaging/chats/:chatId/call/join** | Member | Body video flag; joins room, max six peers, persists peer and emits group-call update. | **server/api/messaging.js:49-56** |
| **POST /api/messaging/chats/:chatId/call/heartbeat** | Member/peer | Refreshes peer timestamp/video state; returns room state. | **server/api/messaging.js:58-63** |
| **POST /api/messaging/chats/:chatId/call/leave** | Member/peer | Deletes actor peer and emits room update. | **server/api/messaging.js:65-71** |
| **POST /api/messaging/chats/:chatId/call/signal** | Member/peer | Body target user and signal capped near 64 KiB; live user-directed signal, no durable media/session. | **server/api/messaging.js:73-83** |
| **GET /api/messaging/preferences** | User | Returns all actor chat preferences. | **server/api/messaging.js:86** |
| **PUT /api/messaging/chats/:chatId/preference** | Member | Body pinned/archived/folder; upserts actor preference. | **server/api/messaging.js:87-103** |
| **GET /api/messaging/chats/:chatId** | Member | Returns tool/extras snapshot for one chat. | **server/api/messaging.js:105-109** |
| **GET /api/messaging/chats/:chatId/changes** | Member | Query since/cursor; returns bounded recent tool changes. | **server/api/messaging.js:111-115** |
| **PUT /api/messaging/chats/:chatId/reaction** | Member | Body messageId/emoji/action; upserts/removes reaction and emits tool event. | **server/api/messaging.js:117-122** |
| **PUT /api/messaging/chats/:chatId/pin** | Member/manager rules | Body messageId/pinned; mutates pin and emits. | **server/api/messaging.js:124-130** |
| **GET /api/messaging/search** | User/member scope | Query q/chatId/cursor/limit; fetches and decrypts up to 500 candidate messages, substring-filters in Node. | **server/api/messaging.js:132-144** |
| **GET /api/messaging/chats/:chatId/media** | Member | Query cursor/type/limit; returns message media view. | **server/api/messaging.js:146-150** |
| **GET /api/messaging/sync** | User | Query after sequence; returns up to 200 authorized replay events, cursor, hasMore. Production client polls every 15 seconds, stores a per-user cursor, follows up to ten pages per run, refreshes chat state and patches affected active messages. | **server/api/messaging.js:152-155** |
| **GET /api/messaging/devices** | User | Lists actor session-device labels/hashes, not raw tokens. | **server/api/messaging.js:157-158** |
| **DELETE /api/messaging/devices/:id** | User/self device scope | Revokes target actor session/device and can emit session_revoked. | **server/api/messaging.js:160-167** |
| **GET /api/messaging/chats/:chatId/scheduled** | Member/author | Lists actor’s scheduled messages in chat. | **server/api/messaging.js:168-170** |
| **POST /api/messaging/chats/:chatId/scheduled** | Member | Body text/dueAt/reply/topic; encrypts and creates durable pending schedule. | **server/api/messaging.js:172-186** |
| **DELETE /api/messaging/scheduled/:id** | User/author | Cancels/removes actor’s scheduled item. | **server/api/messaging.js:188-190** |
| **POST /api/messaging/chats/:chatId/polls** | Member | Body question/options; creates encrypted poll plus associated message. | **server/api/messaging.js:192-202** |
| **PUT /api/messaging/polls/:id/vote** | Member | Body option index; upserts one actor vote and emits tool change. | **server/api/messaging.js:204-213** |
| **POST /api/messaging/polls/:id/close** | Poll author/manager | Closes poll and emits. | **server/api/messaging.js:215-222** |
| **POST /api/messaging/chats/:chatId/topics** | Manager/member policy | Body title; creates topic and emits. | **server/api/messaging.js:224-231** |
| **PUT /api/messaging/chats/:chatId/topic** | Member | Body messageId/topicId; assigns a message to topic and emits. | **server/api/messaging.js:233-240** |
| **PUT /api/messaging/chats/:chatId/topics/:topicId** | Manager | Body closed; **PARTIALLY IMPLEMENTED:** invokes missing **setTopicClosed**, so current path returns 500. | **server/api/messaging.js:242-249** |
| **PUT /api/messaging/chats/:chatId/policy** | Owner/admin | Body slow-mode/send/upload permissions; upserts group policy and emits. | **server/api/messaging.js:251-258** |
| **PUT /api/messaging/chats/:chatId/role** | Owner/admin | Body userId/role; changes chat role with hierarchy checks and emits. | **server/api/messaging.js:260-267** |

### 5.7 One-to-one WebRTC call fallback — 12 endpoints

All endpoints require a Chat session. CallManager verifies a DM and membership. Active calls are stored in a process-local Map; signaling is delivered live. Call history is represented by special chat messages rather than a separate call collection.

| Endpoint | Contract and side effects | Source |
|---|---|---|
| **GET /api/calls/ice-servers** | Returns configured STUN/TURN. Cloudflare TURN mode may make an external request on every call. | **server/api/calls.js:43-47** |
| **GET /api/calls/incoming** | Returns actor’s currently ringing in-memory call or null. | **server/api/calls.js:50-55** |
| **POST /api/calls/start** | Body chatId/type; feature/DM/member checks, creates call, live incoming event, optional push. | **server/api/calls.js:65-80** |
| **POST /api/calls/accept** | Body chatId; accepts active call and emits accepted. | **server/api/calls.js:83-92** |
| **POST /api/calls/reject** | Body chatId/reason; terminates and emits rejected. | **server/api/calls.js:95-104** |
| **POST /api/calls/end** | Body chatId; terminates and emits ended/call-log effects. | **server/api/calls.js:107-116** |
| **POST /api/calls/offer** | Body chatId/sdp; relays offer to peer. | **server/api/calls.js:119-133** |
| **POST /api/calls/answer** | Body chatId/sdp; relays answer. | **server/api/calls.js:136-150** |
| **POST /api/calls/ice-candidate** | Body chatId/candidate; relays ICE candidate. | **server/api/calls.js:153-167** |
| **POST /api/calls/camera-state** | Body chatId/cameraOff; relays state. | **server/api/calls.js:170-184** |
| **GET /api/calls/history** | Lists actor’s special DM call-message history; 501 if dependency absent. | **server/api/calls.js:187-195** |
| **POST /api/calls/history/delete** | Body messageId UUID; verifies DM membership and call marker, then hides entry for actor. | **server/api/calls.js:198-227** |

### 5.8 Remote-channel, internal tick, and mirror handoff — 12 endpoints

Remote-channel configuration is Chat-owned and distinct from Web/Analytics integration. Telegram and public Ouj Chat channel sources write through a durable Mongo queue. The two internal authentication mechanisms are shared/per-job Chat secrets, not scoped platform service identities.

| Endpoint | Access | Contract and side effects | Source |
|---|---|---|---|
| **GET /api/chats/:chatId/remote-channel** | Member; queue detail stripped for non-owner | Returns source/configuration/status for chat. | **server/api/remoteChannels.js:171-220** |
| **GET /api/chats/:chatId/remote-channel/queue** | Chat owner | Returns queue/status diagnostics. Potentially sensitive external payload/error metadata. | **server/api/remoteChannels.js:222-246** |
| **PUT /api/chats/:chatId/remote-channel** | Chat owner | Body provider/source credentials/URL/options; validates and upserts source/version, schedules polling/test behavior. | **server/api/remoteChannels.js:248-361** |
| **POST /api/chats/:chatId/remote-channel/pause** | Chat owner | Pauses source processing. | **server/api/remoteChannels.js:363-382** |
| **POST /api/chats/:chatId/remote-channel/resume** | Chat owner | Resumes and makes work eligible. | **server/api/remoteChannels.js:384-403** |
| **POST /api/chats/:chatId/remote-channel/skip** | Chat owner | Body queue item/context; marks one failed/pending item skipped. | **server/api/remoteChannels.js:405-430** |
| **POST /api/chats/:chatId/remote-channel/skip-all** | Chat owner | Bulk-skips eligible queue items. | **server/api/remoteChannels.js:432-457** |
| **POST /api/chats/:chatId/remote-channel/test** | Chat owner | Performs external provider/source test and returns status/error. User-facing request can incur network latency. | **server/api/remoteChannels.js:459-488** |
| **POST /api/internal/remote-channel/tick** | Cron shared secret plus limiter | Runs bounded remote polling/queue iterations and returns a report. Fails closed if secret absent. | **server/api/remoteChannelTick.js:29-100** |
| **GET /api/internal/remote-channel/tick** | Cron shared secret | Lightweight internal tick-mode/status response. | **server/api/remoteChannelTick.js:102-125** |
| **GET /api/remote-channel/blob/:jobId** | Per-job high-entropy secret | Returns a registered local mirror file; synchronous full-file read. In-memory job expires/sweeps. | **server/api/remoteMirror.js:34-61** |
| **POST /api/remote-channel/webhook/mirror-done** | Shared webhook secret only when configured | Body job/result/storage metadata; completes mirror job. **Risk:** fails open if secret missing. | **server/api/remoteMirror.js:64-145** |

### 5.9 Uploads and downloads — 8 endpoints

| Endpoint | Access | Contract and side effects | Source |
|---|---|---|---|
| **POST /api/uploads/presign** | User; 30/minute route limiter | Body file metadata, purpose/messageId; creates S3 upload URL and pending/file metadata. **Critical:** accepts arbitrary messageId without membership/author check and records undefined session.userId. | **server/api/uploadsRemote.js:98-108,219-224,324-351** |
| **POST /api/uploads/complete** | User | Body storage key/upload/file/message metadata; finalizes record and dispatches processing. **Critical:** ownership comparison is skipped because it also uses undefined session.userId. | **server/api/uploadsRemote.js:381-507** |
| **GET /api/uploads/thumbs/:fileId** | Public | Sequential numeric file ID; fetches/decrypts/buffers local or remote thumbnail. **Critical:** no session or chat membership; private media can be enumerated. | **server/api/uploadsRemote.js:509-580** |
| **POST /api/uploads/webhook/processed** | Shared webhook secret only when configured | Body processing result/file metadata; updates file and emits video-ready/message events. **Risk:** fails open without secret. | **server/api/uploadsRemote.js:583-775** |
| **POST /api/uploads** | User | **PARTIALLY IMPLEMENTED/BROKEN:** route has no multipart middleware, does not persist bytes, calls async createMessageFiles with numeric message 0 without await, and constructs synthetic IDs. | **server/api/uploadsRemote.js:776-868** |
| **GET /api/uploads/file/:id** | Public | Sequential numeric file ID; remote path redirects/decrypts, local-driver path returns literal OK rather than bytes. **Critical:** no membership authorization. | **server/api/uploadsRemote.js:871-947** |
| **GET /api/uploads/messages/:storedName** | Public bearer URL | Streams/decrypts local message bytes, supports range behavior, applies public immutable caching. **Critical:** no session/chat membership; stored names become access tokens. | **server/lib/uploads.js:395-489** |
| **GET /api/uploads/avatars/:storedName** | Public | Serves avatar bytes by stored name. Public access is expected for profile avatars, but caching/metadata should still be controlled. | **server/lib/uploads.js:491 onward** |

The upload contract has an additional internal mismatch: **createMessageFiles** returns numeric IDs, while remote upload callers treat return values as objects with an **id** field. Evidence: **server/db/mongoRepository.js:242-249**, **server/api/uploadsRemote.js:324-343**.

### 5.10 Administration and operations — 59 endpoints

Unless a row says otherwise, the browser-facing route requires a valid session and a current global **admin** or **owner** role. The middleware reloads the role from MongoDB. Admin responses use route-specific JSON. Many operations access users/chats/settings/audit records, storage, logs, Docker, Nginx, or database maintenance. Source family: **server/api/adminPanel.js:271-2140**.

| Endpoint | Additional authorization and contract |
|---|---|
| **POST /api/admin/db-tools** | Current Mongo route requires loopback socket origin plus constant-time **ADMIN_API_TOKEN**. Body action/arguments invokes privileged user/chat/file/database operations. Alternative legacy declaration exists, but current registration selects **server/api/adminMongo.js:4-12** and **server/lib/services/mongoAdminService.js:19-114**. |
| **POST /api/admin/claim** | Session plus HTTPS or loopback plus admin token; creates first owner or promotes eligible actor according to claim rules. **server/api/adminPanel.js:285-331**. |
| **GET /api/admin/stats** | Returns aggregate account/chat/message/file/system counts; may issue multiple counts. **:420-425**. |
| **GET /api/admin/system** | Returns runtime/host/process information. **:427-503**. |
| **GET /api/admin/services** | Inspects service/container state through host/Docker helpers. **:505-640**. |
| **GET /api/admin/secrets** | **Platform owner only.** Returns configured secret values/status for administration; debug response logging can expose them. **:642-658**. |
| **GET /api/admin/users** | Query search/limit/offset; lists users. Limit is not consistently clamped; sensitive admin view. **:663-684**. |
| **POST /api/admin/users** | Creates Chat-local user/password/role. Emits an object with **id** while auto-add expects **userId**. **:686-756**. |
| **PATCH /api/admin/users/:id** | Updates identity/profile/status/verification fields with role rules. **:758-818**. |
| **POST /api/admin/users/:id/ban** | Bans/unbans, revokes/affects access and emits session/list events. **:820-842**. |
| **POST /api/admin/users/:id/role** | Changes global role with owner hierarchy checks. **:844-878**. |
| **POST /api/admin/users/:id/reset-password** | Replaces bcrypt hash; returns success. **:880-902**. |
| **POST /api/admin/users/:id/avatar** | Multipart/remote avatar administration. **:904-974**. |
| **DELETE /api/admin/users/:id/avatar** | Removes avatar metadata/binary. **:976-988**. |
| **DELETE /api/admin/users/:id** | Cascades user deletion with role/self protections. **:990-1012**. |
| **GET /api/admin/chats** | Query search/limit/offset; enriches all matches before in-memory pagination/N+1 counts. **:1014-1034**. |
| **POST /api/admin/chats** | Creates group/channel and memberships/options. **:1036-1133**. |
| **PATCH /api/admin/chats/:id** | Updates chat metadata/policy/member-affecting fields. **:1135-1232**. |
| **GET /api/admin/chats/:id/remote-channel** | Returns full remote source/queue config. **:1234-1253**. |
| **PUT /api/admin/chats/:id/remote-channel** | Privileged remote source configuration. **:1255-1303**. |
| **POST /api/admin/chats/:id/remote-channel/pause** | Pauses remote source. **:1305-1311**. |
| **POST /api/admin/chats/:id/remote-channel/resume** | Resumes source. **:1313-1319**. |
| **POST /api/admin/chats/:id/remote-channel/skip** | Skips one queue item. **:1321-1329**. |
| **POST /api/admin/chats/:id/remote-channel/skip-all** | Bulk-skips source queue. **:1331-1339**. |
| **POST /api/admin/chats/:id/remote-channel/test** | Makes provider/source test request. **:1341-1356**. |
| **POST /api/admin/chats/:id/avatar** | Uploads/replaces group avatar. **:1358-1436**. |
| **DELETE /api/admin/chats/:id/avatar** | Removes group avatar. **:1438-1462**. |
| **GET /api/admin/chats/:id/members** | Lists members/roles. **:1464-1471**. |
| **POST /api/admin/chats/:id/members** | Adds member/role. **:1473-1523**. |
| **DELETE /api/admin/chats/:id/members/:userId** | Removes membership and records effects. **:1525-1542**. |
| **PATCH /api/admin/chats/:id/members/:userId** | Changes per-chat role. **:1544-1561**. |
| **DELETE /api/admin/chats/:id** | Cascades chat deletion and file cleanup. **:1563-1579**. |
| **GET /api/admin/logs** | Query source/tail/filter; reads system/application logs. Log contents can contain sensitive data. **:1582-1589**. |
| **DELETE /api/admin/logs** | Clears selected logs. Destructive host-side action. **:1591-1601**. |
| **GET /api/admin/logs/sources** | Lists available log sources. **:1603-1607**. |
| **GET /api/admin/logs/installer** | Reads installer log view. **:1609-1612**. |
| **GET /api/admin/logs/nginx** | Reads Nginx logs. **:1614-1618**. |
| **GET /api/admin/logs/service** | Reads application service logs. **:1620-1624**. |
| **GET /api/admin/logs/worker** | Reads media-worker logs. **:1626-1629**. |
| **GET /api/admin/maintenance/info** | Returns maintenance/backup/storage information. **:1634-1646**. |
| **POST /api/admin/maintenance/vacuum** | Invokes maintenance compatibility behavior; MongoDB does not have SQL VACUUM semantics. **:1648-1667**. |
| **POST /api/admin/maintenance/clear-messages** | Destructively clears messages/files. **High risk:** ordinary admin, not owner-only. **:1669-1689**. |
| **POST /api/admin/maintenance/reset** | Destructive database reset. **High risk:** ordinary admin, not owner-only. **:1691-1709**. |
| **POST /api/admin/maintenance/delete** | Destructive database delete/maintenance action. **:1711 onward**. |
| **GET /api/admin/service/available** | Reports whether service control is available. **:1807-1810**. |
| **POST /api/admin/service/restart** | Controls the app/container/service. **High risk:** admin plus mounted Docker socket/root process. **:1812-1819**. |
| **POST /api/admin/service/stop** | Stops service/container. **High risk:** admin can create outage. **:1821-1867**. |
| **POST /api/admin/nginx/reload** | Validates/writes or reloads Nginx through system/Docker helpers. **High risk:** admin, not owner-only. **:1869-1941**. |
| **GET /api/admin/maintenance/download-db** | Creates/downloads full Mongo application archive. Includes private messages, password hashes, sessions, push endpoints, and app_settings secret/key material. **High risk:** admin, not owner-only. **:1945-1998**. |
| **POST /api/admin/maintenance/restore** | Online Mongo restore is rejected with 409 and offline guidance in current Mongo path; body/archive handling remains a privileged surface. **:2000-2058**. |
| **GET /api/admin/settings** | Returns dynamic settings view with route-specific secret handling. **:2073-2078**. |
| **PUT /api/admin/settings** | Bulk updates allowed dynamic settings; some effects live, others restart-scoped. **:2080-2103**. |
| **PUT /api/admin/settings/:key** | Updates one allowed setting. **:2105-2125**. |
| **DELETE /api/admin/settings/:key** | Removes/resets one allowed setting. **:2127-2140**. |
| **GET /api/admin/remote-channel/status** | Returns Telegram configuration/session status. **server/api/adminRemoteChannel.js:158-181**. |
| **POST /api/admin/remote-channel/send-code** | Body phone/session setup data; contacts Telegram to send login code. Sensitive external action. **server/api/adminRemoteChannel.js:183-266**. |
| **POST /api/admin/remote-channel/sign-in** | Body code/password/session context; completes Telegram authentication and stores session secret. **:268-343**. |
| **POST /api/admin/remote-channel/test** | Tests Telegram credentials/session/proxy. **:345-398**. |
| **DELETE /api/admin/remote-channel/session** | Deletes stored Telegram session/configuration. **:400-421**. |

### 5.11 Media worker — 4 endpoints

The worker is a separate Node HTTP process. Mutation endpoints return 202 before an in-memory queue performs work. Its body limit is 1 MiB; default concurrency is two, with no maximum or queue bound.

| Endpoint | Access and contract | Source |
|---|---|---|
| **GET /health** | Public process/queue liveness JSON; does not prove provider/ffmpeg/callback readiness. | **worker/index.js:628-637** |
| **GET /** | Public service/queue information. | **worker/index.js:639-645** |
| **POST /transcode** | Shared webhook secret only when nonempty; body download/storage/callback/media configuration; returns 202 then enqueues. Accepted work is lost on restart and URLs can cause SSRF if endpoint is exposed. | **worker/index.js:608-623,648-710** |
| **POST /mirror-media** | Same conditional secret; downloads/mirrors caller-described media and callbacks after 202. In-memory, unbounded queue. | **worker/index.js:714-785** |

### 5.12 Surface classification and discrepancies

| Classification | Endpoints |
|---|---|
| Public API | App info, health, login/register, public-channel metadata/messages under their gate, unauthenticated message media/thumbnail/file/avatar paths, and worker health/root. The message-media paths are vulnerabilities, not intended public contracts. |
| Authenticated user API | Profile/presence/push, chat/message/call/messaging-tool routes, SSE. |
| Administrator API | 59 admin/internal administration surfaces; claim, owner secrets, and DB tools have special gates. |
| Internal service-like API | Remote tick, mirror blob/callback, worker mutation endpoints, upload processing callback. They use Chat-local shared/per-job secrets, not scoped service identities. |
| Legacy/partial | **POST /api/chats**, **POST /api/uploads**, local branch of **GET /api/uploads/file/:id**, alternative admin db-tools registration, historical SQL admin/import paths. |
| Cross-repository suitable today | **None.** Public channel feeds are federation feeds, not authenticated business commands. Admin tokens and webhook secrets are too broad to serve as Web/Analytics service identities. |

Three client wrappers reference server routes that do not exist:

- **POST /api/chats/delete**
- **GET /api/messages/:chatId**
- **DELETE /api/messages/pending/:clientId**

Evidence: **client/src/api/chatApi.js:145-150,321-326,378-381**. These appear to be unused/legacy contracts and should not be treated as implemented APIs.

One client session helper calls **/api/me** with native fetch instead of the repository-mandated **apiFetch** wrapper, although it still supplies credentials. Evidence: **client/src/utils/sessionStorage.js:69-73**.

## 6. Services and Business Logic

### 6.1 Significant service/module inventory

This inventory counts **31 significant service domains**. A domain can span closely related modules; trivial formatting helpers are excluded. Background execution mechanisms are counted separately in Section 9 and may depend on these services.

| # | Service domain | Responsibility, dependencies, execution, and idempotency |
|---:|---|---|
| 1 | Mongo connection/schema/store/facade | **IMPLEMENTED.** Opens one native client, requires transactional topology, creates collections/indexes, supplies generic CRUD/transactions/sequences, and exports repository operations. Startup-blocking. **server/db.js**, **server/db/mongoConnection.js**, **mongoSchema.js**, **mongoStore.js**. |
| 2 | Core Mongo repository | **IMPLEMENTED/PARTIAL.** Users, chats, messages, files, reads, memberships, sessions and cascades. Core message mutations are transactional/idempotent where clientRequestId exists; several list/delete paths materialize large sets. **server/db/mongoRepository.js**. |
| 3 | Messaging-tools repository | **IMPLEMENTED/PARTIAL.** Preferences, reactions, pins, search, schedules, polls, topics, policy, devices, group calls and replay sync. Tool writes are not consistently atomic with replay; topic-close method is missing. **server/db/mongoMessaging.js**. |
| 4 | Remote-channel repository | **IMPLEMENTED.** Source/checkpoint/queue CRUD, unique provider IDs, leases, attempts and dedupe. Durable/retryable. **server/db/mongoRemote.js**. |
| 5 | Admin/maintenance/import persistence | **IMPLEMENTED/PARTIAL.** Admin views, backup/restore/checks and resumable SQL import. Backup/restore can allocate very large buffers. SQL is read-only legacy input. **server/db/mongoAdmin.js**, **mongoMaintenance.js**, **mongoImport.js**, **legacyReader.js**. |
| 6 | Session service | **IMPLEMENTED/PARTIAL.** Parses/sets opaque cookie, resolves actor, touches last_seen and enforces username match. Mongo sessions never expire server-side; Redis cache path is effectively bypassed by Promise handling. **server/lib/sessions.js:20-119**, **server/index.js:663-698**. |
| 7 | App settings and secret lifecycle | **IMPLEMENTED/RISK.** Reads dynamic settings, generates/synchronizes admin, encryption, webhook, cron and VAPID secrets, and may attempt environment-file persistence. Secrets also reside in app_settings. **server/lib/appSettings.js**, **server/lib/secrets.js**, **server/lib/remoteChannelSecrets.js**. |
| 8 | Appearance service | **IMPLEMENTED.** Validates shared appearance schema/revision and transactionally writes private replay event; optimistic and safe to retry with revision semantics. **server/lib/services/appearanceService.js**. |
| 9 | Membership service | **PARTIALLY IMPLEMENTED.** Invite join and membership orchestration; several dormant helpers assume synchronous dependencies and are unsafe with async Mongo functions. **server/lib/services/membershipService.js**. |
| 10 | Message publication service | **PARTIALLY IMPLEMENTED.** Validates/persists/idempotently reuses text and emits/pushes. Some upload/edit helpers fail to await Mongo promises and are not the principal active path. **server/lib/services/messagePublicationService.js**. |
| 11 | Deletion service | **IMPLEMENTED.** Coordinates transaction-backed user/chat deletion, then exposes post-commit file deletion and notification effects. Repeated external file cleanup must tolerate missing objects. **server/lib/services/deletionService.js**. |
| 12 | Messaging and schedule service | **IMPLEMENTED/PARTIAL.** Checks group publication policy and polls/leases scheduled messages every five seconds. Scheduled client IDs make publication idempotent; failed items remain failed. **server/lib/services/messagingService.js**. |
| 13 | Mongo admin service | **IMPLEMENTED.** Privileged action dispatcher for users/chats/files/reset/demo/remote configuration. Inputs come through CLI or loopback+token route. **server/lib/services/mongoAdminService.js**. |
| 14 | SSE hub | **IMPLEMENTED/PARTIAL.** Tracks local username connections, eight-second member cache and keepalive delivery; optionally records replay asynchronously. Membership cache is briefly stale and journal duplication is possible. **server/lib/sse.js**. |
| 15 | Raw WebSocket gateway | **IMPLEMENTED/PARTIAL.** Upgrade/session parsing, heartbeat, user connection maps, Redis WS fan-out and call signaling. It admits unauthenticated sockets and lacks Origin/connection/payload admission controls. **server/lib/websocketGateway.js**. |
| 16 | Redis adapter | **CONFIGURED/OPTIONAL.** Pub/sub and cache adapter with in-process fallback. It does not make SSE, presence, or calls cluster-safe. **server/lib/redis.js**. |
| 17 | Presence tracker | **IMPLEMENTED.** Derives online state from local live connections, updates last_seen/status, loads related chats/co-members and broadcasts transitions. Fan-out can be query-heavy. **server/lib/presenceTracker.js**. |
| 18 | DM call manager and TURN resolution | **IMPLEMENTED/PARTIAL.** In-memory DM call state, membership checks, HTTP/WS signal relay, push and special call-log messages; static/Cloudflare TURN. Not restart- or replica-safe. **server/lib/callManager.js**, **turnHealth.js**. |
| 19 | Web Push/VAPID | **IMPLEMENTED/PARTIAL.** Subscription lifecycle and provider fan-out; removes expired subscriptions. Promise.all has no concurrency bound and logs can expose endpoint/provider detail. **server/lib/push.js**, **vapid.js**. |
| 20 | Local upload/download service | **IMPLEMENTED/RISK.** Multer validation, local storage, range/decryption and avatar/message serving. Message download authorization is absent. **server/lib/uploads.js**. |
| 21 | Remote/presigned upload service | **PARTIALLY IMPLEMENTED/CRITICAL.** S3 presign/complete/callback/proxy routes, pending ownership and processing dispatch. Session field mismatch and message authz defects bypass ownership; fallback contract is broken. **server/api/uploadsRemote.js**. |
| 22 | Storage providers | **IMPLEMENTED.** Local and S3-compatible get/put/delete/list/presign abstraction. External object operations have provider/network latency; object listing can be large. **server/lib/storage/**. |
| 23 | Storage encryption | **IMPLEMENTED/PARTIAL.** AES-256-GCM envelopes for message/file data and backfill support. This is server-side encryption, not end-to-end encryption. Some system/call markers remain plaintext; file transforms can read whole objects. **server/lib/storageEncryption.js**. |
| 24 | Media dispatch/queue/transcode client | **PARTIALLY IMPLEMENTED.** Selects external/local processing, optional BullMQ, in-memory fallback, callback handling, ffmpeg invocation. Fallback queue leaks completed entries and accepted external jobs are not durable. **server/lib/mediaQueue.js**, **mediaWorker.js**, **videoTranscode.js**. |
| 25 | Remote mirror job/dispatch | **IMPLEMENTED/PARTIAL.** In-memory per-job secret registry, byte handoff, worker dispatch and result callback. Jobs disappear on restart; byte reads can be synchronous/full-file. **server/lib/remoteMirrorJobs.js**, **remoteMirrorDispatch.js**, **remoteMirrorJobs.js**. |
| 26 | Remote-channel engine | **IMPLEMENTED.** Telegram/Ouj Chat polling, SSRF filtering, durable queue, bounded attempts/backoff/leases, metadata/media mirroring and live queue events. Very large module; DNS rebinding remains a potential SSRF gap. **server/lib/remoteChannels.js**. |
| 27 | Retention and file cleanup | **IMPLEMENTED/PARTIAL.** Expiry backfill/deletion, orphan metadata/object pruning, file retention. Some scans/updates are unbounded or sequential. **server/lib/mongoRetention.js**, **mongoFileJobs.js**, **messageFileJobs.js**. |
| 28 | Auto-add worker | **PARTIALLY IMPLEMENTED.** In-process EventEmitter reacts to new users and bulk-adds to configured chats. The repository returns no chat IDs and admin creation emits the wrong field, so post-add messages/events are skipped. **server/lib/workers/autoAddWorker.js**. |
| 29 | Admin/system/log/DB tooling | **IMPLEMENTED/HIGH PRIVILEGE.** Docker/service/Nginx/log inspection/control, backup/download and CLI maintenance. Interacts with host socket/process/filesystem. **server/lib/systemLogs.js**, **dbToolHelpers.js**, **postgresMaintenance.js**, **server/scripts/**. |
| 30 | Validation/UUID/invite/request helpers | **IMPLEMENTED/PARTIAL.** Username/body/file checks, UUID middleware, invitation tokens and request utilities. Use is route-specific rather than universally enforced. **server/lib/validation.js**, **uuidMiddleware.js**, **inviteTokens.js**, **requestUtils.js**. |
| 31 | App metadata/static SPA composition | **IMPLEMENTED.** Reads version/changelog/repository metadata and serves Vite output with SPA fallback. Public app metadata is read per request for live settings. **server/lib/appMeta.js**, **server/index.js:1200-1244**. |

### 6.2 Major business workflows

#### Text message publication

~~~mermaid
sequenceDiagram
  participant C as React client
  participant A as POST /api/messages
  participant P as publication service
  participant M as Mongo transaction
  participant R as SSE/WS + Push
  C->>A: chatId, body, replyTo, clientRequestId
  A->>A: session, UUID, membership, policy, length validation
  A->>P: verified actor and command
  P->>M: create-or-reuse message + chat_event_log
  M-->>P: committed message
  P->>R: live chat_message and optional push
  R-->>C: event / HTTP success
  Note over R,M: emitChatEvent may append a duplicate journal row asynchronously
~~~

The unique **chat_id + user_id + client_request_id** index provides concurrency-safe message idempotency. Publication is successful after Mongo commit; live delivery is best-effort. Recipient delivery acknowledgement is not persisted.

#### Remote upload/publication

Client preprocessing → **/api/uploads/presign** → direct object-provider upload → **/api/uploads/complete** → file metadata → processing dispatch → worker ffmpeg/mirror → processing webhook → metadata update and event. This intended design avoids proxying large uploads through Express. The current ownership/session mismatch and public download paths make the workflow unsafe despite that architecture.

#### Read receipt

Member request → resolve visible messages → per-user **chat_message_reads** upsert/event → **chat_read** live event. Whole-chat read can materialize and transact once per message; there is no separate durable delivered state.

#### Scheduled message

User creates encrypted schedule → Mongo pending row → five-second poller claims a lease → revalidates current user/chat/policy → publishes with deterministic **scheduled:<id>** client request ID → marks sent or failed. Lease and idempotency make crash recovery materially better than the media worker.

#### Remote-channel import

Provider poll/checkpoint → sanitize/normalize external public channel record → deduplicated durable queue row → lease and bounded retry → Chat message publication → optional media mirror → queue completion and live status. This integration imports public Chat/Telegram channel content; it is not the prohibited Analytics contact-data ingestion path.

### 6.3 Verified service-contract defects

1. **Auto-add:** repository **bulkAddMemberToChats** returns nothing, while the worker expects added chat IDs; admin user creation emits **{id}** instead of **{userId}**. Membership inserts may occur while join system messages/events are skipped. Evidence: **server/db/mongoRepository.js:153-154**, **server/lib/workers/autoAddWorker.js:9-19**, **server/lib/services/mongoAdminService.js:24-30**.
2. **Topic close:** route calls nonexistent **messagingDb.setTopicClosed**, producing a 500. Evidence: **server/api/messaging.js:242-249** and no matching export in **server/db/mongoMessaging.js**.
3. **Remote uploads:** repository returns numeric file IDs; caller expects row objects. Fallback passes invalid numeric message ID 0 without awaiting persistence. Evidence: **server/db/mongoRepository.js:242-249**, **server/api/uploadsRemote.js:324-343,835-867**.
4. **Replay journal:** core repository mutations record atomically, then SSE emission records again without await. Tool mutations often do the inverse—write first, then rely on fire-and-forget recording. Evidence: **server/index.js:554-555**, **server/lib/sse.js:122-126**.

## 7. Authentication and Authorization

### 7.1 Current identity authority

**IMPLEMENTED / TARGET CONFLICT:** Chat is currently an independent identity provider:

- Registration creates a local **users** row and bcrypt password hash.
- Login verifies that hash.
- Chat issues a 24-byte random opaque session token.
- Global roles are **user**, **admin**, and **owner**.
- Chat supports password change/reset, ban, account deletion, role change, and owner claim.

Evidence: **server/api/auth.js:25-189**, **server/api/profile.js:324-383**, **server/api/adminPanel.js:285-357,663-1013**.

**NOT FOUND:** Web session validation, Web JWT/JWKS/OIDC validation, audience restriction, asymmetric token verification, a Web BFF identity call, service identity/scopes, delegated actor proof, or an account-link mapping. Chat cannot currently identify a user authenticated only by Owj Web or safely act on that user’s behalf.

### 7.2 Session architecture

- Cookie name is the Chat session cookie; it is **HttpOnly**, **SameSite=Lax**, path-wide, and has a 14-day browser Max-Age. **Secure** is used only when production code observes HTTPS. Evidence: **server/lib/sessions.js:20-61**.
- Mongo stores the raw token and actor reference. Every authenticated request can update last_seen, adding write load. Evidence: **server/lib/sessions.js:64-84**.
- Banned users are rejected at resolution.
- **PARTIALLY IMPLEMENTED:** no server-side created-at/last-seen expiration check and no TTL index exists. A copied token can remain valid after browser-cookie expiry until explicit deletion.
- **PARTIALLY IMPLEMENTED:** optional Redis session lookup returns a Promise, but the combination helper immediately falls back to Mongo for Promise-shaped values; the normal request path does not benefit from the intended cache. Evidence: **server/index.js:663-698**.
- WebSocket also accepts a session token in its URL query. Query tokens can leak into proxy/access logs and are not tagged for the same revocation bookkeeping as cookie sockets. Evidence: **server/lib/websocketGateway.js:281-327**.

### 7.3 Authorization layers

| Layer | Implemented checks | Gaps |
|---|---|---|
| Global account | Banned state, current DB role, owner uniqueness, session actor. | Independent of Web account/agency/consultant status. |
| Browser identity | Many legacy handlers compare body/query username against session username; newer APIs derive actor from session. | Some upload code trusts the wrong session field; no shared CSRF token or Origin validation. SameSite=Lax is partial mitigation. |
| Chat resource | Membership, owner/admin/member hierarchy, public visibility, message author checks. | Eight-second membership cache can briefly deliver events to a removed member; message media routes skip checks entirely. |
| Administrator | Middleware reloads admin/owner role. Claim and DB tools add stronger gates; secrets is owner-only. | Ordinary admin can download full DB, clear/reset data, stop/restart service, and reload Nginx. |
| Internal callbacks | Cron secret, webhook secret, per-job mirror secret, loopback+admin token. | Webhook/worker checks fail open if secret absent; credentials are broad Chat-local shared secrets, not least-privilege Owj service identities. |

### 7.4 Password and abuse controls

Passwords are bcrypt-hashed with cost 10, but register/login use synchronous bcrypt functions on the Node event loop. The only general production limiter permits 1,000 requests per 15 minutes; there is no dedicated login/register limiter, account backoff, or lockout. This creates credential-abuse and CPU-exhaustion risk on the four-vCPU host. Evidence: **server/api/auth.js:25-156**, **server/index.js:328-344**.

### 7.5 Encryption boundary

Messages/polls/schedules and configured file paths use server-side AES-256-GCM. This protects stored values from a storage-only disclosure but is **not end-to-end encryption**: the server holds the key and decrypts for search/API output. **app_settings** and the application backup can include the encryption key alongside ciphertext, sessions, push secrets, and remote credentials. System/call marker messages and metadata are not uniformly encrypted. Evidence: **server/lib/storageEncryption.js:66-143**, **server/lib/secrets.js:58-148,232-274**, **server/db/mongoMaintenance.js:13-20**.

## 8. Frontend and User Workflows

### 8.1 Routes and pages

Manual routing in **client/src/App.jsx:78-84,746-787** produces these effective routes:

| Browser route | Page/role | Main dependencies and behavior |
|---|---|---|
| **/**, **/login**, unknown fallback | Auth page / anonymous | Public app info then Chat-local login; route replacement on success. |
| **/signup** | Auth page / anonymous | Chat-local registration when runtime signup setting allows it. |
| **/invite/:token** | Invite page / user | Invite preview/join APIs, then navigation to chat. |
| **/chat** | Chat page / user | Chat/message/profile/push/call/upload APIs, WS/SSE, IndexedDB cache/outbox. |
| **/admin** | Admin page / admin/owner | Client role gate plus server authorization; dashboard, users, chats, actions, services, settings, logs. |

Pages are lazy-loaded. There is no React Router. The admin client exits after 15 minutes of inactivity, but this is a UI behavior and does not replace server authorization. Evidence: **client/src/App.jsx:29-36**, **client/src/components/admin/AdminPanel.jsx:29-37,197-214**.

### 8.2 Major user features

| Feature | Status and data flow | Performance/reliability notes |
|---|---|---|
| Login/registration/session restore | **IMPLEMENTED:** Chat-local auth; **/api/me** restores cached display state. | Violates target Web identity ownership. Local cache contains profile/role, not password/token. |
| Chat list/discovery | **IMPLEMENTED:** DMs, groups, channels, saved chat, filters and discovery. | Server/client process the full unpaginated chat list; IndexedDB and render cost grow with account history. |
| Message timeline | **IMPLEMENTED:** cursor loading, virtualized views, replies, edit/delete/forward, markdown sanitation. | In-memory cache bounded to eight chats and 480 messages/chat, 20-minute stale window. |
| Offline/pending sends | **PARTIAL:** IndexedDB outbox retains text/file metadata and retries. | Binary file blobs are not persisted; browser restart cannot always retry original file bytes. |
| Media | **IMPLEMENTED/PARTIAL:** local/direct upload, previews, voice/video, processing updates. | Server download authz is critical; some client media-ready events are ignored/dropped. |
| Read/typing/presence | **IMPLEMENTED:** live events plus read APIs. | Presence is process-local; removed-member delivery can lag cache invalidation. |
| DM and group calls | **IMPLEMENTED:** WebRTC UI and HTTP/WS signaling. | Active DM state process-local; group peers Mongo-backed but heartbeat-oriented. |
| Push/PWA | **IMPLEMENTED:** service worker static cache, network-first navigation, web push and notification-click validation. | Provider fan-out unbounded; push privacy/logging concerns. |
| Profile/settings/appearance | **IMPLEMENTED:** profile, avatar, password, notifications, chat appearance, cache/data controls. | Server remains the decrypting identity/content authority. |
| Remote channels | **IMPLEMENTED:** source configuration/status for authorized owners/admin. | External provider latency and background work share server resources. |
| Admin | **IMPLEMENTED:** broad account/chat/system/maintenance controls. | Some controls exceed least privilege and rely on Docker socket/host tooling. |
| “My listings” / “Daily work report” | **DOCUMENTED/PRESENTATION STUB:** buttons open sample sheet explicitly stating Web owns real data. | No Web/CRM/Analytics API call or persisted business action. |

Evidence: **client/src/pages/ChatPage.jsx:14-346,6216-6432**, **client/src/utils/cacheDb.js:1-15**, **client/src/utils/chatOutbox.js:8-35**, **client/public/sw.js:1-248**.

### 8.3 State, fetch, and realtime behavior

- **IMPLEMENTED:** Main Chat API calls use **apiFetch**, always with **credentials: include**. Evidence: **client/src/api/chatApi.js:3-10**.
- **IMPLEMENTED:** IndexedDB has eight stores: outbox, chats, messages, indexes, channel-seen state, thumbnails, posters, and voice waveforms. Cache counts/age are bounded. Evidence: **client/src/utils/cacheDb.js:1-15**, **chatCache.js:11-22**.
- **IMPLEMENTED:** WebSocket is preferred; SSE is fallback. Reconnect uses jittered exponential backoff capped at 30 seconds. Evidence: **client/src/hooks/chat/useChatEvents.js:125-179,519-548**.
- **IMPLEMENTED/PARTIAL:** The client polls **/api/messaging/sync** every 15 seconds while online/visible, keeps a per-user cursor in localStorage, follows up to ten 200-event pages per run, refreshes lists, invalidates other-chat history, and patches active-message changes in chunks of 200. Recovery is only as correct as the journal, which currently has duplicate and non-atomic recording paths. Evidence: **client/src/hooks/chat/useMessagingTools.js:63-117**.
- **IMPLEMENTED:** The PWA service worker versions static caches, uses network-first navigation, receives push, and enforces same-origin notification clicks. Evidence: **client/public/sw.js:97-248**, **client/src/main.jsx:18-39**.
- **NOT FOUND:** Production flows for Analytics search, saving an Analytics listing to Web, creating a Web CRM task, showing Analytics recommendations in CRM, or receiving Web business notifications.

## 9. Background Workers and Scheduled Jobs

The following **18 recurring/background mechanisms** were found. The count includes distinct retry/health mechanisms where they have their own schedule/recovery contract.

| # | Mechanism and trigger | Concurrency/persistence/retry/recovery | Resource and interference risk |
|---:|---|---|---|
| 1 | Scheduled-message poll every 5 seconds | Mongo rows, leases, deterministic client ID; bounded claim; failed state retained. Restart-recoverable and idempotent. | Shares API process/pool; each send performs policy/membership/publish work. **server/lib/services/messagingService.js:27-64**. |
| 2 | Standalone media worker AsyncQueue | Default concurrency 2, no maximum, unbounded in-memory array. 202 precedes work; no durable job ID/dedupe/recovery/drain. | ffmpeg CPU/tmp disk/full-buffer encryption; jobs lost on restart. **worker/index.js:28-85,608-812**. |
| 3 | Worker download retry | Six bounded attempts with exponential delay. In-memory job only. | Holds job/temp resources during network failure. **worker/index.js:168-203**. |
| 4 | Worker callback retry | Five bounded attempts; failure then has no durable requeue. | Server may never learn completion. **worker/index.js:205-250**. |
| 5 | Server media queue | BullMQ when Redis configured; otherwise timers/in-memory queue. | Fallback retains completed entries and can grow; processing may run in app process. **server/lib/mediaQueue.js:26-177**. |
| 6 | Local worker manager | Starts/checks child worker and performs health supervision. Process-local. | Child and API share container cgroup/resources. **server/lib/localWorkerManager.js:59-183**. |
| 7 | Docker entrypoint embedded worker | Default auto/local mode starts media worker beside server. Restart tied to main container. | Transcoding directly competes with Chat latency; not independently restartable. **scripts/docker-entrypoint.sh:4-41**. |
| 8 | Telegram/Ouj Chat poll loops | Per-source/provider polling, configured interval/limits and bounded source concurrency; checkpoints in Mongo. | External requests and DB writes in API process; large **remoteChannels.js**. **server/lib/remoteChannels.js:1618-1756**. |
| 9 | Remote-channel queue processor | Mongo durable queue, batch/concurrency controls, lease/stale-lock recovery, bounded attempts/backoff and dedupe. | Most robust background path; still shares pool/CPU and media dispatch. **server/lib/remoteChannels.js:2604-2707**. |
| 10 | Remote-channel tick mode | Cron HTTP trigger, bounded iterations, shared secret. | External scheduler dependency; protects long-running serverless mode. **server/lib/remoteChannels.js:2861-2935**. |
| 11 | Remote queue purge daily | Deletes completed/old queue state after seven days. | Bounded lifecycle but large delete can add DB I/O. **server/index.js:1336-1356**. |
| 12 | File expiry/orphan cleanup startup and hourly | Mongo/provider scans and deletes; no durable job ledger. Repeated runs should tolerate missing objects. | Some paths load all file/reference/object keys; DB/S3/disk I/O can contend. **server/index.js:1270-1298**, **mongoFileJobs.js**. |
| 13 | Text expiry backfill/cleanup startup and hourly | Application-driven expiry; sequential updates; no batch limit in backfill. | Full candidate scan and write amplification. **server/index.js:1300-1322**, **mongoRetention.js:14-22**. |
| 14 | Deferred encryption backfill | Batches message text (200) but file enumeration and sync file reads are broader; best-effort/repeated. | CPU/disk/event-loop impact in API process. **server/index.js:714-818,1324-1332**. |
| 15 | Mirror job registry sweep every 5 minutes | In-memory job map with expiring secrets; no durable recovery. | Restart loses callbacks/blob access; local file reads can block/buffer. **server/index.js:1137-1145**, **remoteMirrorJobs.js:9-150**. |
| 16 | Auto-add EventEmitter worker | In-process event, no queue/checkpoint/retry/reconciliation. Current return/payload contracts are broken. | Can leave silent partial state after process failure or code mismatch. **server/lib/workers/autoAddWorker.js:1-52**. |
| 17 | WebSocket heartbeat and Redis subscriber | Ping every 30s, 10s grace; optional Redis WS fan-out. | Connection count is not admission-bounded; Redis does not cover SSE/presence/calls. **server/lib/websocketGateway.js:19-159**. |
| 18 | SSE/member-cache sweep, request stats, browser health/fallback polling | Multiple process/client timers; browser refresh and live recovery loops. | Repeated full chat loads and per-tab work can amplify traffic. **server/lib/sse.js:45-60**, **server/index.js:245-259**, **client/src/hooks/useHealthCheck.js:7-35**, **ChatPage.jsx:7109-7122**. |

### 9.1 Shutdown and restart behavior

The server closes its HTTP listener and forces exit after ten seconds, but no single coordinated shutdown visibly drains all pollers, Redis/pubsub, external calls, local worker queues, and scheduled work. Evidence: **server/index.js:1390-1410**. Mongo-backed schedules and remote queues recover; in-memory media, mirror, presence, DM-call, SSE/WS connection, and auto-add state does not. Worker shutdown closes HTTP but does not drain queued work.

## 10. Real-Time Communication

### 10.1 Transport architecture

**NOT FOUND:** Socket.IO, namespaces, rooms, Socket.IO acknowledgements, or Socket.IO events. Required Socket.IO event count is therefore **0 / N/A**.

**IMPLEMENTED:** Realtime uses:

- SSE at **GET /api/events** after session plus matching username.
- Raw WebSocket upgrades at **/ws** and **/api/ws**.
- Optional Redis pub/sub to forward live events to WebSockets in other processes.
- HTTP for all normal chat mutations and a subset of call signaling.

SSE sends a **connected** event and 25-second comments. WS sends protocol ping frames every 30 seconds and terminates after a ten-second missed heartbeat. The browser prefers WS and only falls back to SSE if WS fails before opening. There are no SSE id fields, Last-Event-ID consumption, WS resume token, application sequence acknowledgement, or positive command ACK convention.

### 10.2 Client-to-server WebSocket inventory

| Message/action | Payload | Authentication/authorization | Side effect, acknowledgement, error |
|---|---|---|---|
| **type: ping** | JSON type only | Upgrade may be unauthenticated | Returns JSON **pong**. |
| **action: call_signal; signalType: start** | chatId, type | Valid session; CallManager DM/member/feature checks | Creates in-memory call, emits incoming/push. Failure returns **call:error**; no request ID/positive ACK. |
| **call_signal: accept** | chatId | Valid session and intended callee | Accepts active call. Failure returns **call:error**. |
| **call_signal: reject** | chatId, reason | Valid session/intended participant | Ends call; failures are generally swallowed, no ACK. |
| **call_signal: end** | chatId | Valid session/participant | Ends call/call log; no positive ACK. |
| **call_signal: offer** | chatId, sdp | Valid session/participant | Relays to peer; no durable write/ACK. |
| **call_signal: answer** | chatId, sdp | Valid session/participant | Relays to peer. |
| **call_signal: ice-candidate** | chatId, candidate | Valid session/participant | Relays candidate. |
| **call_signal: camera-state** | chatId, cameraOff | Valid session/participant | Relays state. |

Handler evidence: **server/lib/websocketGateway.js:218-275**. Malformed/unknown messages and most relay errors are silently ignored. Normal message creation is not accepted over WebSocket.

### 10.3 Server-to-client event inventory

There are **28 live SSE/WS payload types**, plus one journal-only type. Common routing is by username or chat membership. Durable status below means a replay record may exist; it does not guarantee exactly-once delivery.

| Event | Direction and representative payload | Authorization/routing, persistence, client behavior |
|---|---|---|
| **connected** | Server→SSE; connection confirmation | Session+matching username; ephemeral; consumed as connection state. |
| **pong** | Server→WS; pong object | Per socket; ephemeral. |
| **session_revoked** | Server→user; session/device/account context | User-directed after revocation/reset; closes/logs out client. |
| **chat_message** | Server→chat members; chatId + message view | Member fan-out; message normally transactionally journaled, then may be duplicated by emit. Client inserts/reconciles pending item. |
| **chat_message_updated** | Server→members; updated message | Member fan-out; transaction journal plus possible duplicate; client patches. |
| **chat_message_deleted** | Server→members/user; IDs/scope | Authorized affected users; transaction journal for covered mutation; client removes/hides. |
| **chat_read** | Server→members; chat/message/read actor | Receipt persisted; deliberately not re-journaled by SSE hub; client updates counts/read state. |
| **chat_typing** | Server→members; actor/typing | Ephemeral, no journal; client timeout-clears indicator. |
| **chat_list_changed** | Server→user(s); reason/chat context | User/list refresh hint; sometimes journaled; client refreshes. |
| **chat_updated** | Server→members; chat metadata | Live event exists; active client handler does not process it directly. |
| **chat_deleted** | Server→affected users; chatId | Live event exists; active client handler ignores it until another list refresh. |
| **presence_update** | Server→related users; userId, username, status, rawStatus, lastSeen | Process-local connection truth; ephemeral; client consumes. |
| **profile_updated** | Server→related users; profile fields | Emitted after profile mutation; client consumes. |
| **chat_appearance_updated** | Server→user; appearance/revision | Private, transactionally journaled; client consumes. |
| **remote_channel_queue** | Server→chat/owner; queue status | Queue persisted; client consumes status. |
| **chat_tools_updated** | Server→members; tool kind/context | Tool mutation hint; journaling often fire-and-forget; client refreshes tools. |
| **group_call_updated** | Server→members; room/peers | Peer state is Mongo-backed heartbeat state; client consumes. |
| **group_call_signal** | Server→target user; signal payload | Membership/peer checks; ephemeral; client consumes. |
| **video:ready** | Server→chat; file/message readiness | Client ignores this standalone type; one legacy emitter uses non-UUID chat ID and is dropped by UUID gate. |
| **call:incoming** | Server→callee; call metadata | In-memory DM call; client opens call UI; optional push. |
| **call:accepted** | Server→caller | Ephemeral call state; client consumes. |
| **call:rejected** | Server→caller | Ephemeral plus call-log effects; client consumes. |
| **call:ended** | Server→participants | Ephemeral plus call-log effects; client consumes. |
| **call:offer** | Server→peer; SDP | Ephemeral; client WebRTC consumes. |
| **call:answer** | Server→peer; SDP | Ephemeral. |
| **call:ice-candidate** | Server→peer; candidate | Ephemeral. |
| **call:camera-state** | Server→peer; flag | Ephemeral. |
| **call:error** | Server→requesting socket; error | Only selected start/accept failures reliably return it; no request correlation. |
| **chat_cleared** | Journal only; chatId | Recorded during destructive clear but not directly live-emitted. Not included in the 28 live types; client ignores it. |

Evidence: **server/lib/sse.js:3-146**, **server/lib/websocketGateway.js:123-327**, **server/lib/presenceTracker.js:31-68**, **server/lib/callManager.js**, **client/src/hooks/chat/useChatEvents.js:202-251**. **user_profile_updated** is accepted by the UUID validation allowlist but no emitter was found.

### 10.4 Connection security and room authorization

- **Verified risk:** invalid or missing sessions still complete the WS upgrade, although unauthenticated sockets cannot join a username map or execute call actions. They can consume connections and ping/pong. Evidence: **server/lib/websocketGateway.js:281-313**.
- **Not found:** Origin check, connection/IP admission limit, or explicit small WebSocket **maxPayload**.
- Membership fan-out uses an eight-second cache without mutation invalidation. A removed user can potentially continue receiving events until expiry. Evidence: **server/lib/sse.js:47-84,122-146**.
- There are no named rooms; username maps and membership lookup implement routing.

### 10.5 Reconnection, delivery, and scaling

- The browser uses jittered exponential reconnect capped at 30 seconds.
- **chat_event_log** and **GET /api/messaging/sync** return 200 events/page. The production client consumes up to ten pages per 15-second run and persists its cursor. Gap recovery is **IMPLEMENTED/PARTIAL** because the journal itself can contain duplicates and some source mutations are recorded only by a non-awaited post-commit call.
- Per-user read receipts are durable. A legacy/global first-read field also exists on messages.
- **NOT FOUND:** durable recipient delivered_at, delivery ACK, WS sequence ACK, or end-to-end acknowledgement.
- Redis forwards remote live events only to WS clients. Remote SSE clients, presence maps, and DM active-call state remain process-local. Multiple replicas are **not realtime-correct** without further design.
- Closing one socket for a username can end all that user’s calls even if another device/socket remains connected. Evidence: **server/lib/websocketGateway.js:191-205**, **server/lib/callManager.js:460-492**.

## 11. Database Operations and Data Flow

### 11.1 Startup and ownership flow

1. **server/index.js** loads environment/settings and imports the side-effecting **server/db.js** facade.
2. **server/db.js** rejects non-Mongo runtime selection, connects one Mongo client, verifies transactional topology, creates/verifies collections and indexes, detects incomplete legacy import state, and synchronizes secrets.
3. The composition root builds storage, encryption, Redis, SSE/WS, presence, calls, push, media, remote-channel, and API dependencies.
4. Startup maintenance runs storage-layout checks, cleanup/retention, deferred encryption, remote loops, and scheduled publication.
5. Express listens; the raw WS server attaches to the HTTP upgrade event; the entrypoint may also have launched a local worker.

This makes MongoDB availability and index initialization a hard startup dependency. **GET /api/health** only proves the process later answers HTTP; it does not continuously prove Mongo/storage/worker readiness.

### 11.2 Transaction boundary

The generic store uses AsyncLocalStorage to propagate a Mongo session and executes transactions with snapshot reads, majority writes, and primary read preference. Evidence: **server/db/mongoStore.js:5-10,48-55**.

Core operations confirmed to place source mutation and replay record in the same transaction include:

- message creation;
- message editing/hiding/deletion;
- message-file metadata attachment;
- per-user reads;
- appearance updates;
- selected destructive chat/message operations.

Evidence: **server/db/mongoRepository.js:170-193,242-278,351-365**, **server/db/mongoAppearance.js:5-15**.

The transaction guarantee is undermined at the application edge:

- **createSseHub** is configured with **messagingDb.recordEvent**.
- **emitChatEvent** calls that recorder asynchronously for most non-typing/read events.
- A route that already committed a transactionally journaled message then live-emits it, producing another record.
- Reactions, pins, topics, votes, and policy updates mutate first and depend on that fire-and-forget record, so their source state and event can diverge on failure.

Evidence: **server/index.js:554-555**, **server/lib/sse.js:122-126**, **server/db/mongoMessaging.js:201-349,473-479**.

### 11.3 Message and replay data flow

~~~mermaid
flowchart LR
  B[Browser command] --> H[Express session + validation]
  H --> S[Domain service]
  S --> T[Mongo transaction]
  T --> M[(chat_messages and related state)]
  T --> J[(chat_event_log)]
  T --> O[HTTP result]
  O --> L[SSE and WebSocket live emit]
  L -. asynchronous duplicate .-> J
  J --> Y[GET messaging sync]
  Y --> C[Browser cursor in localStorage]
  C --> R[Chat-list refresh and message patches]
~~~

The global journal sequence is allocated from **counters**. The sync query filters each event by current membership or private viewer, caps at 200, and returns **sequence/cursor/hasMore**. The browser polls every 15 seconds, skips while offline/hidden, follows ten pages, and stores the cursor. This is a sound recovery shape, but exactly-once semantics are not present and mutation/journal consistency varies.

### 11.4 File data flow

| Stage | Metadata | Bytes | Boundary |
|---|---|---|---|
| Client selection/preprocess | Browser filename/MIME/size/dimensions | Browser File/Blob | File count/size/type checks |
| Local upload | Express/Multer creates file/message metadata | **DATA_DIR** local provider | Main process and Nginx carry bytes |
| Remote direct upload | Pending/file metadata and object key in Mongo | Client uploads to S3-compatible provider | Presigned URL avoids app bandwidth |
| Processing | processing_status, duration/dimensions/thumb/waveform | Worker downloads, ffmpeg transforms, uploads | Shared secret/callback; often in-memory queue |
| Download | File record selects local/remote/decryption | Server stream/buffer or provider redirect | Current private-message authorization is missing |
| Retention/orphan cleanup | Mongo expiry/reference scans | Local/S3 delete/list | Application timers, no TTL/provider lifecycle proof |

File metadata and bytes require coordinated backups. Application backup archives Mongo records but not local volume or S3 object bytes. Remote/server-side encryption mode also requires preserving compatible key/provider configuration.

### 11.5 Remote-channel data flow

Telegram provider state or a public Ouj Chat channel cursor feeds normalized updates into **remote_channel_queue**. Unique indexes deduplicate Telegram update/message IDs. The queue worker claims due work with locks, attempts bounded retry/backoff, creates a normal Chat message, optionally mirrors media, and records created_message_id/status. Crashes can recover from stale locks and checkpoints. Lower-level mirror handoff is in-memory and is less durable than the queue itself.

The Ouj Chat federation source calls public **/api/channels/:username/meta** and **/messages**. Its SSRF guard blocks known literal private hosts/IP ranges but source inspection did not show DNS resolution pinning; DNS rebinding is a risk requiring a dedicated test, not a demonstrated exploit.

### 11.6 Deletion, retention, backup, and restore

- User/chat deletion explicitly discovers dependent messages/files/members and deletes them through Mongo transactions plus post-commit file cleanup. Large histories are materialized, which can increase memory and transaction duration.
- Message/file expiry uses indexed expiry fields but application timers, not Mongo TTL.
- Remote completed queue rows have a seven-day purge; many other high-growth collections have none.
- Mongo backup serializes all application collections to Extended JSON and gzip. It can include secrets/session tokens and buffers data in memory. File bytes are outside the archive.
- Online Mongo restore is rejected; CLI restore requires explicit offline/confirmation flags but cannot itself prove every writer is stopped.
- No automatic backup schedule, off-host transfer, retention, restore test, or point-in-time recovery is configured in the main Compose.

Evidence: **server/db/mongoRepository.js:338-395**, **server/db/mongoMaintenance.js:13-38**, **server/scripts/backup-db.js**, **restore-db.js**, **docker-compose.yaml**.

### 11.7 Database sharing and sibling access

**IMPLEMENTED:** Chat uses one environment-selected logical MongoDB database, default **ouj_chat**.  
**NOT FOUND:** reads/writes to Web business/CRM collections or Analytics ingestion/score collections.  
**UNKNOWN:** whether the production Mongo user is scoped only to **ouj_chat**; credentials and server roles were not inspected.  
**RECOMMENDATION:** retain one shared Mongo process on the constrained host if measurements support it, but give Chat a distinct least-privilege database user and never use shared infrastructure as authorization to cross logical database boundaries.

## 12. External Integrations

Nine external/infrastructure integration domains were confirmed.

| # | Integration | Protocol/configuration | Data and security boundary | Failure/retry/resource behavior |
|---:|---|---|---|---|
| 1 | MongoDB 8/Atlas-compatible | Native driver, **MONGODB_URI**, logical database, pool default 20 | All Chat records, local identity, messages, metadata, secrets. Must be replica set/sharded. | Hard startup dependency; driver behavior plus application transactions. Production host/role unknown. |
| 2 | Redis | ioredis/BullMQ, optional host/port/URL | WS pub/sub and media queue/cache intent. No private Owj business data contract. | In-process fallback is not cross-replica/durable; Redis outage behavior depends component. |
| 3 | S3-compatible object storage | AWS SDK/presigned HTTPS, endpoint/bucket/region/access keys | Attachment/avatar bytes; keys and metadata in Mongo. | Provider timeouts/errors, direct uploads, list/delete cleanup; must back up independently. |
| 4 | Media worker/ffmpeg | Private HTTP callback protocol; local child or standalone container | Worker receives object/download/callback URLs and optional storage config. | Download six attempts, callback five; job queue itself in-memory and unbounded. |
| 5 | Telegram | MTProto via GramJS, optional proxy, API ID/hash/session | Remote public channel content/configuration; Telegram session secret stored locally. | Poll/checkpoint and durable queue retry; sign-in admin operations are interactive/external. |
| 6 | Public Ouj Chat federation | HTTPS to another instance’s public channel meta/messages API, optional proxy | Public channel content only; no service identity. | Poll/retry/queue; literal-host SSRF controls, DNS rebinding risk requires testing. |
| 7 | Web Push | VAPID to browser push endpoints, optional proxy | Subscription endpoint/keys and optional message preview notification. | Invalid subscriptions pruned; Promise.all fan-out lacks concurrency bound; response/error logging can expose details. |
| 8 | WebRTC STUN/TURN | Default public STUN; static TURN or Cloudflare TURN API | ICE server credentials and peer media/signaling. Chat relays signaling, not media. | Cloudflare credentials may be fetched per request; DM call state is local process memory. |
| 9 | GitHub release metadata | Browser-side public HTTPS tag/release lookup | Public version information only. | Optional UI request; native fetch outside apiFetch is appropriate because it is not the Chat API. |

### 12.1 Environment-variable contract

The checked-in example contains 94 assignments representing 93 unique names; **WEBHOOK_SECRET** is duplicated. Actual values were not read.

| Group | Names and purpose | Evidence |
|---|---|---|
| Runtime/data | **OUJ_CHAT_ENV_FILE, SERVER_PORT, CLIENT_PORT, BIND_ADDRESS, DATA_DIR, APP_ENV, APP_DEBUG, SIGN_UP, ADMIN_PANEL** | **.env.example:3-46** |
| Mongo/legacy | **DB_CLIENT, MONGODB_URI, MONGODB_DATABASE, MONGODB_MAX_POOL_SIZE, MONGODB_CONNECT_TIMEOUT_MS, LEGACY_POSTGRES_URI, NODE_EXTRA_CA_CERTS** | **:19-28** |
| Redis | **REDIS_HOST, REDIS_PORT, REDIS_URL** | **:32-36** |
| Upload/storage | **FILE_UPLOAD, FILE_UPLOAD_MAX_SIZE_MB, FILE_UPLOAD_MAX_TOTAL_SIZE_MB, FILE_UPLOAD_MAX_FILES, FILE_UPLOAD_TRANSCODE_VIDEOS, STORAGE_DRIVER, STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_PUBLIC_URL, APP_PUBLIC_URL, STORAGE_AUTO_CORS, STORAGE_EXPIRES_IN, STORAGE_FORCE_PATH_STYLE, STORAGE_PROCESSING_MODE, STORAGE_PROCESSING_TIMEOUT_MS, STORAGE_ENCRYPTION_MODE, STORAGE_PROXY_URL** | **:50-99** |
| Worker/callback | **WORKER_PORT, WORKER_URL, WEBHOOK_URL, WEBHOOK_SECRET** | **:88-95** |
| Retention/limits | **MESSAGE_FILE_RETENTION, MESSAGE_TEXT_RETENTION, MESSAGE_MAX_CHARS, NICKNAME_MAX_CHARS, USERNAME_MAX_CHARS** | **:103-113** |
| Client cache/fetch/reconnect | **CHAT_CACHE_TTL, CHAT_MESSAGE_FETCH_LIMIT, CHAT_MESSAGE_PAGE_SIZE, CHAT_LIST_REFRESH_INTERVAL, CHAT_HEALTH_CHECK_INTERVAL, CHAT_SSE_RECONNECT_DELAY, CHAT_SEARCH_MAX_RESULTS, CHAT_VOICE_WAVEFORM_MAX_DECODE_MB, CHAT_VOICE_WAVEFORM_MAX_DECODE_SECONDS, CHAT_PENDING_TEXT_TIMEOUT, CHAT_PENDING_FILE_TIMEOUT, CHAT_PENDING_RETRY_INTERVAL, CHAT_PENDING_STATUS_CHECK_INTERVAL** | **:117-143** |
| Remote channels | **REMOTE_CHANNEL, REMOTE_CHANNEL_UI, REMOTE_CHANNEL_MEDIA_STREAM, REMOTE_CHANNEL_TELEGRAM_API_ID, REMOTE_CHANNEL_TELEGRAM_API_HASH, REMOTE_CHANNEL_TELEGRAM_SESSION_STRING, REMOTE_CHANNEL_TELEGRAM_PROXY_URL, REMOTE_CHANNEL_OUJ_CHAT_PROXY_URL, REMOTE_CHANNEL_TICK_MODE, REMOTE_CHANNEL_CRON_SECRET, REMOTE_CHANNEL_POLL_INTERVAL_MS, REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT, REMOTE_CHANNEL_QUEUE_INTERVAL_MS, REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS, REMOTE_CHANNEL_QUEUE_BATCH_SIZE, REMOTE_CHANNEL_QUEUE_CONCURRENCY, REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS** | **:147-180** |
| Secrets/push | **STORAGE_ENCRYPTION_KEY, WEBHOOK_SECRET, ADMIN_API_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_PROXY_URL** | **:184-198** |
| Calls | **CALL, CALL_VIDEO, CALL_MAX_DURATION, TURN_STUN_URL, TURN_URL, TURN_USERNAME, TURN_CREDENTIAL, TURN_TOKEN_ID, TURN_API_TOKEN** | **:202-218** |

**CONFIGURATION GAPS:** **WORKER_CONCURRENCY** is consumed by worker Compose/source but is absent from **.env.example**. The example describes **CLIENT_PORT=80**, while main Compose maps the default host port to 443. Several additional runtime aliases/settings are documented or referenced outside the concise example; configuration should be generated from one validated schema rather than duplicated lists.

## 13. Cross-Repository Integration

### 13.1 Actual dependency map

~~~mermaid
flowchart LR
  C[Owj Chat]
  DB[(ouj_chat Mongo database)]
  OBJ[S3 or local file store]
  TG[Telegram]
  FED[Public Ouj Chat instances]
  PUSH[Web Push]
  W[Media worker]
  WEB[Owj Web]
  ANA[Owj Market Analytics]

  C -->|implemented native driver| DB
  C -->|implemented bytes| OBJ
  C -->|implemented MTProto| TG
  C -->|implemented public channel HTTP| FED
  C -->|implemented provider calls| PUSH
  C -->|implemented Chat-local shared secret| W
  C -.->|missing identity and CRM command| WEB
  WEB -.->|missing scoped Chat command| C
  C -.->|no contract found| ANA
  WEB -.->|unknown from this repository| ANA
~~~

Solid arrows are executable source in this repository. Dashed arrows are missing or cannot be established here. Chat does not import sibling ORM models and no direct sibling database write was found.

### 13.2 Required platform workflows

| Workflow | Current status from Chat evidence | Ownership/auth/data/reliability analysis |
|---|---|---|
| A — Web searches Analytics | **UNKNOWN** | Chat has no Analytics URL, search client, contract, token, or UI. Whether Web and Analytics already implement this can only be established in those repositories. Chat should not proxy it without a product requirement. |
| B — Analytics listing saved to Web | **UNKNOWN** | Chat has no Analytics listing model or save action. Its **saved** chat is unrelated. The Web repository must own the user-to-listing association and authorization; Analytics should expose only sanitized public listing data. |
| C — Chat creates a Web CRM task | **BLOCKED / NOT FOUND** | No UI action, Web endpoint client, service identity, initiating-Web-user proof, CRM permission check, idempotency key, timeout/retry policy, activity record, or notification contract exists. Chat does not directly write Web collections, which is the correct current boundary. |
| D — Analytics recommendations in CRM | **UNKNOWN** | No CRM requirement serialization or Analytics client exists in Chat. Web/Analytics must show that only sanitized property criteria cross the boundary and customer identity/contact data does not. |
| Web → Chat notification/action | **REQUIRES CHANGES** | Chat has internal user realtime/push delivery but no private, least-privilege Web service endpoint or versioned command/event schema. |
| Shared platform identity | **BLOCKED** | Chat creates its own usernames/passwords/sessions/roles and cannot validate Web identity. |
| Cross-service durable events | **BLOCKED** | Redis pub/sub is Chat-internal and non-durable; chat_event_log is a private replay journal without event source/version/service auth. No outbox or consumer contract spans repositories. |

### 13.3 Safe future Chat-to-Web CRM command

The following is a **RECOMMENDATION**, not current behavior:

~~~mermaid
sequenceDiagram
  participant U as Consultant in Chat
  participant C as Chat API
  participant W as Web-owned internal API
  participant D as Web business database
  U->>C: Create CRM task intent
  C->>C: Verify Web-linked actor and Chat context
  C->>W: Versioned command + scoped service identity + actor proof + idempotency key
  W->>W: Re-check active account, role, agency, case and assignee permissions
  W->>D: Transactionally create task + CRM activity + idempotency record
  D-->>W: Canonical task
  W-->>C: Confirmed result or typed error
  C-->>U: Success/link or actionable failure
~~~

Minimum command fields should be a contract version, unique idempotency key, correlation ID, verified initiating Web user subject, target CRM resource/assignee IDs, minimal task title/due/priority fields, Chat conversation/message reference only if authorized, and timestamp. Private message text and customer contact information should not be copied by default. Chat’s service identity and the human actor must remain distinct.

Web must own authorization, state transition, task/activity mutation, duplicate suppression, and the canonical response. Chat should use a short timeout and bounded retry only with the same idempotency key. A correlation ID alone is not duplicate protection. No shared database write or imported Web model is acceptable.

### 13.4 Identity migration/integration constraints

Before cross-repository commands are safe, the platform must choose and test one Web-owned identity boundary:

- a Web BFF that authenticates the browser and calls Chat;
- or short-lived, audience-limited, asymmetrically verifiable Web tokens for Chat;
- plus a migration/link strategy for existing Chat users, memberships, messages, sessions, and global roles.

Distributing Web’s signing secret or trusting browser-supplied userId/role/agencyId is not acceptable. The repository gives no evidence that usernames are globally immutable/unique across Web and Chat, so username matching alone cannot link identities.

## 14. Docker, Deployment, and Infrastructure

### 14.1 Container and deployment topology

| Artifact | Configured services/topology | Ports, persistence, health, and status |
|---|---|---|
| **docker-compose.yaml** | Active **ouj-chat** and **nginx**; media-worker block commented; Mongo external. | App exposed internally at configured port; Nginx binds host 80/443; named **ouj-chat-data** volume; app health calls liveness endpoint; restart unless-stopped. |
| **docker-compose.mongo.yaml** | One MongoDB 8 single-member development replica set. | Host loopback 27017, named DB volume, auto-init health; no authentication, explicitly development-only. |
| **worker/docker-compose.yaml** | One standalone worker using published/local image. | Publishes host 8080 by default, bind/volume for data, restart unless-stopped; shared secret may be empty. |
| **render.yaml** | One web service from main Dockerfile, external Mongo and remote storage; embedded worker auto mode; remote tick mode. | Public app health path; no separate worker process. |
| **.railway/railway.ts** | Separate app and worker plus managed object bucket in one group. | Private worker hostname, external Mongo secret, distinct health paths; closest configured independent-worker topology. |
| **playbook.yaml** | Installs/configures Docker Compose and application environment, starts services and checks health. | Deployment automation; runtime values remain external. |
| **scripts/install.sh** | Alternate, very large interactive systemd/deployment path. | Contains historical PostgreSQL/SQLite-era logic and creates operational ambiguity against current Compose/Mongo target. |

There are **four active Compose service definitions across the inspected Compose files**: main app, main Nginx, development Mongo, and standalone worker. The commented main-file worker is not counted as active.

### 14.2 Images

**Main Dockerfile:**

- Multi-stage build compiles the React client and installs production server/worker dependencies.
- Runtime is **node:24-bookworm-slim** with ffmpeg and PostgreSQL client tooling.
- Copies both server and worker, client dist, shared files, version/changelog, and data directories.
- Healthcheck calls **/api/health**.
- **No USER declaration** exists, so the final process runs as root.
- PostgreSQL tooling remains in the runtime despite SQL being legacy import/maintenance only, increasing image size and attack surface.

Evidence: **Dockerfile:3-85**.

**Worker Dockerfile:** Node 24 Alpine plus ffmpeg, switches to the non-root **node** user, exposes 8080, and health-checks **/health**. Evidence: **worker/Dockerfile:1-22**.

### 14.3 Reverse proxy and networking

**CONFIGURED:** Nginx terminates TLS on 443, redirects 80, permits 75 MiB request bodies, disables buffering/cache for SSE, and forwards Upgrade headers for raw WebSocket. Evidence: **nginx/nginx.conf:1-35**.

Risks and constraints:

- Nginx proxies to fixed **ouj-chat:5174** even though Compose permits a different **SERVER_PORT**.
- The container is generically named **nginx** and binds shared host 80/443; that can conflict with the platform’s existing Nginx/container.
- No explicit Compose network is declared; the default project network is used. No policy isolates worker/DB/admin surfaces.
- No HSTS or CSP header is configured in this Nginx file. Express supplies basic security headers but not a complete browser policy.
- Main Compose expects certificates as local files and does not configure automated renewal.
- The worker’s own Compose publishes its internal HTTP port to the host rather than keeping it private.

### 14.4 Privilege and service control

**CRITICAL CONFIGURED RISK:** Main Compose mounts **/var/run/docker.sock** so the admin panel can control its own container, while the main process runs as root. Anyone who obtains server-code execution or sufficiently privileged admin behavior can potentially control the Docker host and sibling Owj containers. Evidence: **docker-compose.yaml:32-37**, **Dockerfile:42-85**, **server/api/adminPanel.js:1807-1941**.

This repository owns its own deployment definitions, but on the shared VPS it must integrate behind infrastructure-owned Nginx/private networks rather than assume it owns global port 80/443 or the Docker daemon.

### 14.5 Resource, logging, monitoring, backup, rollback

| Concern | Current state |
|---|---|
| CPU/memory limits | **NOT FOUND** in Compose. No reservation/limit reflects the platform’s provisional 0.4-GiB Chat ceiling or protects Web/Mongo. |
| Worker isolation | **PARTIAL:** separate image/Compose/Railway exists, but main default auto/local starts worker in the app container. |
| Restart | **CONFIGURED:** unless-stopped for Compose services. In-memory jobs/calls/presence are lost. |
| Log rotation | **NOT FOUND:** no Compose logging driver/size/file limits. Host json-file defaults can grow. |
| Structured logging | **PARTIAL:** mixed console/text/admin log capture; no consistent structured service/severity/event/correlation schema. |
| Metrics | **NOT FOUND:** no durable metrics exporter/dashboard for RSS, event-loop delay, pool, DB/API p95, queue lag, disk, OOMs, or backup success. |
| Readiness | **PARTIAL:** liveness health only; does not inspect Mongo/storage/worker. |
| Backups | **PARTIAL:** manual CLI/admin Mongo archive exists. No scheduled off-host job, file-object backup, retention policy, or automated restore test. |
| Rollback | **PARTIAL/UNKNOWN:** release images/workflows exist, but main Compose builds local source and no explicit known-good rollback/migration procedure is encoded. |
| Image immutability | **PARTIAL:** release workflow builds images; main Compose uses local build and worker defaults to mutable latest; Nginx uses unpinned alpine. |

### 14.6 CI/CD

**.github/workflows/build.yml** runs shell-script tests, server tests, worker tests, client unit/browser tests, and client build. Docker workflow builds/pushes release images; docs and semantic-release workflows exist. CodeQL is scheduled but configured to continue on error. Notable gaps:

- Active Mongo integration suite **test:mongo** is not in the main CI.
- Seven standalone client E2E **.mjs** scenarios are not visibly run by standard Vitest CI.
- No load/resource smoke test, database query-plan check, container security scan evidence, or deployment contract test is present.
- Main production Compose still builds on-host, contrary to the target preference for off-host immutable builds.

### 14.7 Suitability for the current VPS

The main process is leaner than the Web application in the supplied host snapshot, but source alone cannot prove peak fit. The default topology is risky for 4 shared vCPUs/~7.8 GiB because:

- ffmpeg can run in the same app container;
- remote polling, cleanup, encryption backfill, push, and schedules share the event loop/Mongo pool;
- no container ceilings or log rotation exist;
- Mongo, Web, Chat, Nginx, crawler/scorer workloads share host CPU/disk;
- Docker builds and caches can consume disk/CPU on the server;
- Docker socket exposure increases the blast radius across every sibling service.

The appropriate initial deployment is one Chat API process with a small measured Mongo pool, a separately limited private worker, shared infrastructure Nginx, bounded logs, and monitored limits introduced only after baseline/load measurements. This is a recommendation, not current configuration.

## 15. Resource Usage and Scalability

No runtime benchmark establishes that the following risks have occurred. Each row is grounded in executable code/configuration.

| ID | Severity | Problem and evidence | Potential impact | Recommended improvement; sibling impact |
|---|---|---|---|---|
| SC-01 | High | Chat-list path loads all membership/hidden/mute/read data, performs multiple queries per chat, sorts in Node. **server/db/mongoRepository.js:211-228** | Latency, DB round trips, heap and payload grow with chat count. | Build bounded aggregation/cursor/read model; verify explain. Protects shared Mongo/Web latency. |
| SC-02 | High | **GET /api/chats** and client normalization/cache are unpaginated. **server/api/chats.js:339-467**, **ChatPage.jsx:6216-6432** | Large JSON, browser memory/IndexedDB/render work. | Cursor paginate and incrementally sync list. |
| SC-03 | High | Message list limit can reach 10,000. **server/db/mongoRepository.js:195-204** | Large decrypt/serialization/response/heap spike. | Clamp to small page limits and enforce cursor use. |
| SC-04 | High | Whole-chat read loads visible messages and writes transactions/events per message. **server/db/mongoRepository.js:270-282** | Write amplification and long request latency. | Use bounded bulk receipt/update semantics and one event per logical action. |
| SC-05 | High | Message search fetches/decrypts up to 500 and does per-author lookup. **server/db/mongoMessaging.js:356-417** | CPU/N+1 latency; encrypted regex search cannot use normal index. | Define privacy-safe search index/read model or bounded client search; batch author lookup. |
| SC-06 | High | Admin chat list enriches all matches then paginates in memory; query limits can be unbounded. **server/db/mongoAdmin.js:13-29,48-49**, **adminPanel.js:663-681,1014-1031** | Admin request can monopolize DB/heap. | Clamp input and paginate/aggregate server-side. |
| SC-07 | High | Forward targets, read-count message IDs, and several group/hide arrays lack consistent bounds. **messages.js:628-681,1959-2105** | Large CPU/DB fan-out and abuse payloads under 1 MiB. | Explicit small cardinality limits and per-target result/idempotency. |
| SC-08 | High | Worker concurrency has no maximum and queue is unbounded/in-memory. **worker/index.js:28-85** | ffmpeg CPU/RAM/tmp-disk exhaustion; accepted jobs lost. | Durable bounded queue, hard concurrency/queue limits, backpressure/429, graceful drain. Affects host-wide latency. |
| SC-09 | High | Non-Redis server media queue retains completed entries. **server/lib/mediaQueue.js:131-145** | Long-lived memory growth. | Remove completed entries and cap/reject queue; prefer durable separate worker. |
| SC-10 | High | Push uses broad Promise.all over subscriptions. **server/lib/push.js:71-127** | Connection/memory burst and provider throttling. | Chunked bounded concurrency with timeout/reporting. |
| SC-11 | High | Local/remote download, mirror and encryption paths buffer or synchronously read whole files. **uploads.js:460-487**, **uploadsRemote.js:564-577**, **remoteMirror.js:52-60**, **worker/encryption.js:26-47** | Event-loop stalls and heap spikes per concurrent media request. | Stream authenticated bytes/encryption where feasible; enforce concurrency and file caps. |
| SC-12 | High | Backup loads collections and performs synchronous gzip; restore can buffer up to ~1 GiB decompressed. **mongoMaintenance.js:13-38** | OOM/event-loop pause on small host. | Stream archive/compression, offline job, hard measured bounds and off-host tooling. |
| SC-13 | High | Cleanup/backfill may scan all files/messages/objects and update sequentially. **mongoFileJobs.js:35-70**, **mongoRetention.js:14-22** | Mongo/S3/disk contention with interactive traffic. | Cursor/batch/checkpoint/throttle and pause on host/DB latency. |
| SC-14 | High | ffmpeg/remote/cleanup/encryption work can share app process/container. **docker-entrypoint.sh:4-41**, **server/index.js:714-818** | Interactive event-loop/CPU/IO starvation. | Isolate worker/process, independent ceilings/restarts and backpressure. |
| SC-15 | Medium | Presence transition loads chats/co-members and fans out. **presenceTracker.js:31-68** | Connect/disconnect storms amplify DB/events. | Cache/invalidate bounded adjacency or batch fan-out; measure. |
| SC-16 | Medium | Synchronous bcrypt registration/login/password paths. **server/api/auth.js:25-156** | Credential traffic blocks Node event loop. | Dedicated low limiter and asynchronous/worker-based hashing or measured cost. Identity should move to Web. |
| SC-17 | Medium | Event/audit/session/read/schedule collections lack TTL/retention; journal can duplicate. **mongoSchema.js:28-59**, **sse.js:122-126** | Continuous DB/index/disk growth and larger backups. | Define business retention/archive, eliminate duplicate journal writes, add safe TTL where semantics allow. |
| SC-18 | Medium | Default Mongo pool 20 per app instance; no utilization evidence. **mongoConnection.js:42-45** | Replicas/workers can multiply connections and contend with Web/Analytics. | Retain bounded pool, measure checkout/latency, do not increase blindly. |
| SC-19 | High | WS/SSE/presence/DM calls only partly share state; Redis forwards WS only. **websocketGateway.js:55-84**, **callManager.js:22-24** | Horizontal replicas lose/misroute state and calls. | Keep one replica until shared-routing/state contract and multi-instance tests exist. |
| SC-20 | High | No CPU/RAM limits/log rotation and root app mounts Docker socket. **docker-compose.yaml** | One workload or log can degrade/compromise all platform services. | Measure, then enforce tested ceilings; rotate logs; remove socket/root. Cross-repository host risk. |
| SC-21 | Medium | Health endpoint is liveness-only. **server/api/health.js:12-14** | Proxy may send traffic to DB/storage-unready process. | Separate liveness/readiness and degraded dependency reporting without secrets. |
| SC-22 | Medium | Debug middleware serializes/logs full bodies/responses. **server/index.js:283-317** | CPU/log/disk amplification in addition to privacy loss. | Structured allowlisted metadata and sampling; never bodies/secrets. |

### 15.1 Index and query posture

The schema has useful primary, message cursor, idempotency, queue, replay and schedule indexes. It does not prove query efficiency. New/changed high-cost queries should be accepted only with representative **executionStats** showing bounded documents examined/returned and no blocking sort. Missing candidate indexes include push recipient and enabled/provider remote-source access, but their write/storage cost must also be measured.

### 15.2 Caching and horizontal readiness

Client caches are bounded. Server member-cache TTL is short but not invalidated. Optional Redis provides partial WS/pubsub/BullMQ behavior; it is neither a required durable platform bus nor a fix for process-local calls/presence/SSE. The safest current scale model is vertical/single API process with bounded external worker throughput. Horizontal Chat API scaling is **PARTIALLY IMPLEMENTED / NOT READY**.

## 16. Security and Privacy

### 16.1 Verified findings and test-required risks

| ID | Severity/status | Finding and evidence | Existing control and required direction |
|---|---|---|---|
| SEC-01 | Critical, verified | Private attachments/thumbnails are downloadable without session or membership; numeric file IDs are sequential and stored-name URLs are bearer-public with immutable caching. **server/api/uploadsRemote.js:508-580,870-948**, **server/lib/uploads.js:395-489**, **mongoSchema.js:18**. | MIME/size/encryption controls do not authorize readers. Require session, resolve file→message→chat, enforce current membership/visibility on every byte/redirect/range/thumb path, and use private cache headers/signed short-lived access. |
| SEC-02 | Critical, verified | Presign/complete uses undefined **session.userId** while active session actor is **session.id**; arbitrary messageId can attach metadata without author/member proof and completion’s foreign-owner check is skipped. **uploadsRemote.js:219-224,324-351,408-423**, **mongoRepository.js:294-295**. | Session requirement exists but binding is broken. Fail closed; bind pending upload to actor, chat, purpose and message; verify membership/ownership at presign and completion; add regression tests before fixing. |
| SEC-03 | Critical, verified when enabled | **APP_DEBUG** logs full query/params/body/JSON response, exposing passwords, session/claim tokens, private messages, file metadata and owner secrets. **server/index.js:283-317**. | Disable in production is insufficient defense. Log only allowlisted structured metadata; redact secrets/PII/content in every mode. |
| SEC-04 | Critical, configured | Root main container plus Docker socket permits host/container control after server compromise. **Dockerfile:42-85**, **docker-compose.yaml:32-37**. | Admin role gate does not contain code execution. Run non-root; remove socket; move narrowly scoped operational control to infrastructure. |
| SEC-05 | Critical/high, verified conditional | Worker transcode/mirror and processing/mirror callbacks accept requests without authentication when WEBHOOK_SECRET is empty. Worker accepts caller-selected download/callback/upload URLs and storage config. **worker/index.js:608-785**, **uploadsRemote.js:583-594**, **remoteMirror.js:64-70**. | Require nonempty secret at startup, constant-time compare, private network and destination allowlists. Never publish worker port. |
| SEC-06 | High, verified | Chat creates a second password/session/role identity and cannot verify Web authority. | Bcrypt and role checks protect only Chat-local identities. Replace/link with audited Web-issued actor identity before business integration. |
| SEC-07 | High, verified | Sessions store raw bearer tokens and have no server-side expiry/TTL. URL query tokens are also accepted for WS. **sessions.js:20-84**, **mongoRepository.js:294-315**, **websocketGateway.js:283-327**. | HttpOnly/SameSite cookie helps browsers. Store token hashes, enforce idle/absolute expiry, rotate/revoke, remove query-token use where possible, avoid token logs. |
| SEC-08 | High, verified | WS upgrades unauthenticated clients; no Origin, per-IP/connection limit, or explicit small maxPayload. **websocketGateway.js:14,218-313**. | Call actions require session, but resource admission does not. Reject before upgrade, validate allowed Origin, cap payload/connections/rates. |
| SEC-09 | High, verified | Ordinary admins—not only owner—can download full DB, clear/reset data, stop/restart service and reload Nginx. Archive contains private messages, hashes, sessions, push credentials and app secrets. **adminPanel.js:1648-1709,1812-1958**. | Current role middleware is too broad. Split narrowly scoped roles, require owner/re-auth/step-up, audit and move host controls out of app. |
| SEC-10 | High, verified | Encryption/service credentials are stored in **app_settings** and included with encrypted data in application backups. **secrets.js:58-148,232-274**, **mongoMaintenance.js:13-20**. | AES-GCM is sound at primitive level but key co-location reduces backup protection. Use external secret management, separate backup/key custody and rotation/recovery plan. |
| SEC-11 | High, verified | Login/register use sync bcrypt and only a broad 1,000/15-minute API limit. | Add endpoint/account/IP abuse controls and move canonical login to Web. |
| SEC-12 | Medium/high, verified | Eight-second member cache lacks invalidation, so a removed member may briefly receive live events. **sse.js:47-84,122-146**. | Short TTL limits window. Invalidate membership cache on role/remove/leave/delete and test active connection eviction. |
| SEC-13 | Medium, verified | No explicit CSRF token or Origin validation for cookie mutations. | SameSite=Lax mitigates common cross-site POST but is not complete. Add Origin/CSRF design compatible with Web BFF/cross-service topology. |
| SEC-14 | Medium, verified | Push logging includes endpoint suffix/provider response bodies; webhook logs can include object keys. **push.js:105-123**, **uploadsRemote.js:768-771**. | Use structured redaction and stable non-reversible diagnostic IDs. |
| SEC-15 | Medium, potential requiring test | Remote federation SSRF checks block literal local/private targets but do not visibly pin/validate resolved addresses across redirects; DNS rebinding may bypass intent. | Add DNS resolution/redirect validation and egress policy; test without attacking external systems. |
| SEC-16 | Medium, configured gap | Nginx lacks HSTS/CSP; Express headers are basic and there is no reported CSP. **nginx/nginx.conf:1-35**, **server/index.js:275-280**. | Add tested browser security headers at one owned layer, accounting for WebSocket/media/PWA sources. |
| SEC-17 | Medium, unknown | Production MongoDB role scope and network exposure cannot be established. | Use Chat-only least-privilege database credentials and private network; verify no root credential in app. |
| SEC-18 | Medium, verified | Message/file encryption is server-side, not E2E; metadata, participants, timing and some marker messages remain plaintext to server. | Describe privacy accurately; do not market E2E. Minimize logs/backups/access and document key custody. |

### 16.2 Positive controls

- Passwords are bcrypt-hashed; no plaintext password persistence was found.
- Cookies are HttpOnly and SameSite=Lax.
- DB tools use raw socket loopback detection and timing-safe admin-token comparison.
- Message/file encryption uses authenticated AES-256-GCM where enabled.
- Mongo transactions and a unique client-request index support core message consistency/idempotency.
- JSON and upload sizes have configured limits; messaging-tool signal payloads are bounded.
- Public channel federation is gated to public channels; no contact/private-channel API is exposed there.
- Main database URI is required rather than silently falling back to an insecure/local SQL mode.

These controls do not offset the verified media/upload authorization defects.

### 16.3 Privacy boundary

Chat legitimately stores highly sensitive private messages, participant relationships, read/presence state, password hashes, session tokens, device labels, push credentials, avatars and attachments. Its logs, backups, admin tools and file-serving paths must therefore be treated as private-data systems.

**NOT FOUND:** Divar crawling, phone/contact extraction, advertiser/agency identity ingestion, Analytics listing observations, CRM customer records, or cross-service transfer of those data. The Analytics-specific public-data privacy rules do not apply to a crawler here, but future Chat→Web commands must not place full private message text/customer contact details on broad events.

## 17. Testing and Reliability

### 17.1 Static test inventory

No tests were executed for this audit, so no pass/fail or coverage claim is made.

| Area | Static inventory | Framework/configuration |
|---|---:|---|
| Client | 128 files under test areas; 119 test/spec files plus 7 standalone E2E **.mjs** scenarios (126 executable-style scenario files) | Vitest 5 unit project; Vitest browser/Playwright in Chromium and Firefox; fast-check; **client/vitest.config.js:55-111** |
| Server | 122 files under test areas; 118 test/spec files | Vitest + Supertest; isolated route app helper; separate real-Mongo config; **server/vitest.config.js**, **server/vitest.mongo.config.js**, **server/test/helpers/makeApp.js** |
| Worker | 7 test/benchmark-area files; 6 test/spec files | Vitest + Supertest; ffmpeg/storage/encryption/retry/server coverage |
| Shell/deployment scripts | 4 Bats files | install, certificate, entrypoint, data-command tests |
| Total | 261 files in test areas; 254 identified test/spec/E2E/Bats files | Coverage percentage was not measured |

The default server Vitest configuration sets **DB_CLIENT=sqlite3** and excludes **server/test/mongo/** even though active runtime rejects SQL. Isolated tests inject dependencies, and historical SQL behavior remains testable, but real runtime persistence is only covered by **npm --prefix server run test:mongo**. If no dedicated URI is provided, that suite may download/start mongodb-memory-server; it was deliberately not run during this static audit.

### 17.2 CI coverage

**IMPLEMENTED:** CI runs Bats, normal server tests, worker tests, client unit/browser projects, and client build.  
**GAPS:**

- real Mongo **test:mongo** is not run;
- standalone E2E **.mjs** scenarios are not visibly invoked;
- client lint is not in the cited build workflow;
- no cross-repository contract tests;
- no load/resource, event-loop, Mongo explain, backup/restore, or multi-instance realtime smoke test;
- CodeQL is allowed to continue on error.

Evidence: **.github/workflows/build.yml:27-133**, **.github/workflows/codeql.yml**.

### 17.3 Recovery behavior

| Failure | Current behavior | Reliability assessment |
|---|---|---|
| Main process restart | Mongo messages/sessions/schedules/remote queue survive; WS/SSE/presence/DM calls/mirror registry/auto-add events disappear; clients reconnect and journal-sync. | **PARTIAL.** Durable core, ephemeral live/call state expected; in-memory jobs can be lost. |
| Worker restart after 202 | In-memory queue/jobs disappear; no durable acknowledgement/reconciliation. | **NOT RELIABLE.** Accepted work can be silently lost. |
| Mongo unavailable at startup | Startup fails after safe redacted connection diagnostic. | **IMPLEMENTED fail-fast.** |
| Mongo disconnect after startup | Driver handles transient behavior; requests/pollers can error. Health still says OK. | **PARTIAL/UNKNOWN:** no demonstrated readiness/degraded-state contract. |
| Object storage/network failure | Route/provider errors; worker download/callback retries bounded; remote queue retries bounded. | **MIXED:** durable remote queue, non-durable media queue. |
| Duplicate message API request | Unique chat/user/clientRequestId and create-or-reuse behavior. | **IMPLEMENTED** for normal publication. |
| Duplicate CRM/business command | No such endpoint/idempotency contract. | **BLOCKED.** |
| Partial core message write | Mongo transaction rolls back mutation+journal in covered paths. | **IMPLEMENTED** for covered operations. |
| Partial tool mutation/event | Mutation may commit before fire-and-forget journal write. | **PARTIAL.** |
| Repeated live/journal event | Live emit can create duplicate journal row; client refresh/patch is mostly idempotent but exactly-once absent. | **PARTIAL.** |
| Remote channel retry | Durable dedupe, attempt/backoff/lease/checkpoint. | **IMPLEMENTED**, bounded. |
| Scheduled message crash | Mongo lease and deterministic request ID recover/reuse. | **IMPLEMENTED/PARTIAL**, subject to poller restart. |
| Backup/restore | Manual archive and offline restore controls; binaries separate. | **PARTIAL:** no automatic off-host schedule or tested restore evidence. |

### 17.4 Important missing/regression tests

1. Anonymous/non-member access to all private message-file, thumbnail, numeric-ID, stored-name, range and redirect paths.
2. Production **session.id** versus **session.userId** upload binding and attaching to another author’s message.
3. Missing webhook/worker secret must fail startup/closed.
4. Worker outbound URL/storage allowlist, queue cap, rejection/backpressure, restart reconciliation and graceful drain.
5. Unauthenticated/foreign-Origin/oversized/excessive WebSocket admission and query-token revocation.
6. Removed-member live delivery and membership-cache invalidation.
7. Duplicate/missing replay journal entries and browser recovery across more than one page/ten-page cycles.
8. Client handling or replay recovery for **chat_updated**, **chat_deleted**, **chat_cleared**, and **video:ready**.
9. Topic-close, remote/fallback upload return contracts, and both auto-add payload/return contracts.
10. Multi-device call disconnect and multi-instance WS/SSE/presence/call behavior.
11. Hard bounds for message pages, read IDs, forwarding targets, admin pagination, push fan-out and worker queue/concurrency.
12. Owner-only/step-up authorization for backup, reset, service and Nginx operations.
13. Active Mongo integration in CI with a dedicated safe test database.
14. Web identity, service authentication, CRM idempotency and authorization consumer/provider contract tests once defined.

## 18. Technical Debt and Legacy Code

| Area | Status/evidence | Consequence |
|---|---|---|
| Large coordinators | **ChatPage.jsx** ~8,717 lines, **server/index.js** ~1,410, **remoteChannels.js** ~2,993, admin Settings tab ~1,072. | High change coupling, review/test burden and hidden lifecycle interactions. |
| Local identity | Full registration/password/session/admin model remains despite Web canonical target. | Duplicate authority and migration/integration blocker. |
| SQL history | Knex/pg/sql.js/better-sqlite3 deps, historical migrations/import/query adapters, PostgreSQL client in runtime image, legacy installer paths. | Larger dependency/image/attack surface and operator confusion; active server is Mongo-only. |
| Alternate deployment paths | Compose, Render, Railway, playbook and a 5,480-line systemd installer diverge. | Configuration drift and unclear production source of truth. |
| Duplicate route | Two declarations for **POST /api/admin/db-tools** with runtime selection. | Static inventory/confusion risk; legacy path can drift. |
| Dead client contracts | Three API wrappers point to nonexistent routes. | False capability signals and future accidental use. |
| Broken async/contracts | Topic close missing; upload row/ID and await mismatches; auto-add payload/return mismatch; dormant membership helpers assume sync dependencies. | 500s, false success, missing events and partial behavior. |
| Replay duplication | Transactional repository journaling plus asynchronous SSE journaling. | Duplicate recovery work, storage growth and ambiguous delivery semantics. |
| Inconsistent validation/errors | UUID/body/bounds and response errors vary by route. | Security gaps and difficult consumer integration. |
| No versioned contracts | No OpenAPI, JSON Schema, TypeScript public types, event version/source/id, or cross-repo compatibility tests. | Web/Analytics integration cannot evolve safely. |
| Secret/config duplication | Environment example, docs, settings DB, generated env writes and deployment manifests overlap; WEBHOOK_SECRET duplicated and WORKER_CONCURRENCY omitted. | Misconfiguration and fail-open risk. |
| Process-local state | Calls, presence, SSE connections, mirror registry, fallback queues, auto-add events. | Restart loss and horizontal inconsistency. |
| Storage/download split | Local and remote/fallback handlers implement different response/auth behaviors; local numeric route is broken. | Security/correctness drift. |
| Mongo validation | Only 5 of 34 app collections have minimal validators. | Corrupt/incompatible shapes can persist; migrations/contracts rely on code discipline. |
| Timestamp conventions | Mostly ISO strings, but migration leases use BSON Date and external fields vary. | Query/TTL/migration complexity. |
| Documentation discrepancy | Current Mongo docs accurately warn that SQL is legacy, but executable installer/runtime packages still retain substantial SQL-era behavior. Product task terminology mentions Socket.IO while source uses raw WS/SSE. | Operators/architects can infer capabilities that do not exist. |
| Test/runtime divergence | Normal server tests set sqlite selector and exclude real Mongo suite. | Main CI can pass without exercising the active persistence topology. |

The appropriate response is incremental removal/encapsulation backed by regression tests, not a broad rewrite on the shared VPS.

## 19. Architecture Risk Register

| ID | Severity | Finding | Evidence | Affected component | Cross-repository impact | Recommended action |
|---|---|---|---|---|---|---|
| R-01 | Critical | Private message media is publicly retrievable/enumerable without membership. | **uploadsRemote.js:508-580,870-948**; **uploads.js:395-489** | Files/privacy | Exposure compromises platform trust and any Web-linked users. | Test first; enforce actor/chat/file authorization and private caching on every path. |
| R-02 | Critical | Presigned-upload ownership uses wrong session field and accepts arbitrary message attachment. | **uploadsRemote.js:219-224,324-351,408-423** | Uploads/messages | A linked Web actor model would inherit unsafe authorization. | Bind session.id, chat, purpose and message; verify at both phases; fail closed. |
| R-03 | Critical | Debug mode records credentials, private content, tokens and secret responses. | **server/index.js:283-317** | Logging/all APIs | Logs/backups/central collectors can leak identities and business data. | Replace with allowlisted structured metadata and redaction. |
| R-04 | Critical | Root app plus Docker daemon socket gives host-level blast radius. | **Dockerfile:42-85**; **docker-compose.yaml:32-37** | Deployment/admin | Compromise can affect Web, Analytics, Mongo, Nginx and host. | Non-root image; remove socket; infrastructure-owned scoped operations. |
| R-05 | Critical | Worker/callback authentication fails open; worker accepts powerful outbound work. | **worker/index.js:608-785**; callback routes | Media worker | Can exhaust shared host or access internal services if exposed. | Require secret at startup, private network, constant-time auth, URL/storage allowlists. |
| R-06 | Critical/High | Chat is a second identity/password/session authority. | **server/api/auth.js:25-189** | Identity | Blocks canonical Web permissions and safe delegated actions. | Design Web-owned identity contract and migration before integration. |
| R-07 | High | Sessions have no server-side expiry and raw tokens are stored/accepted in WS URLs. | **sessions.js:20-84**; **mongoRepository.js:294-315**; **websocketGateway.js:283-327** | Auth | Long-lived compromise can cross future linked workflows. | Hash tokens, enforce idle/absolute expiry, rotate/revoke, remove URL tokens. |
| R-08 | High | Admin can download/reset data and control service/Nginx; sensitive archive includes secrets. | **adminPanel.js:1648-1958** | Admin/operations | One Chat admin can impact shared infrastructure/data. | Split roles, owner/step-up gates, infrastructure isolation and audit. |
| R-09 | High | Replay is duplicated for core events and non-atomic for tool events. | **mongoRepository.js:170-278**; **sse.js:122-126** | Durability/reconnect | Consumers cannot assume exactly-once or complete cross-service events. | One transactional outbox/journal write per source mutation; idempotent consumers. |
| R-10 | High | Media jobs acknowledged before unbounded in-memory queue work; restart loses jobs. | **worker/index.js:49-85,648-785** | Worker/uploads | User media remains stuck; retries can duplicate cost. | Durable bounded queue, idempotent job key, reconciliation, backpressure and drain. |
| R-11 | High | Topic close, upload, and auto-add contracts are broken. | **messaging.js:242-249**; **uploadsRemote.js:324-343,835-867**; **autoAddWorker.js:9-19** | Business correctness | False success/missing events undermine integration confidence. | Reproduction tests, then repair return/await/payload contracts. |
| R-12 | High | SSE, presence and DM calls remain process-local; Redis only partially fans out WS. | **websocketGateway.js:55-84**; **callManager.js:22-24** | Realtime | Horizontal scaling causes lost/misrouted state. | Keep single replica or implement/test shared routing/state for every transport. |
| R-13 | High | Multiple unbounded/N+1/materializing reads and arrays exist. | Section 15; repository/admin/message paths | API/Mongo/browser | Can degrade shared Mongo and interactive Web/CRM. | Bound/paginate/batch, add proven indexes/read models and performance tests. |
| R-14 | High | Heavy background work shares app resources; no Compose ceilings/log rotation. | **docker-entrypoint.sh:4-41**; **docker-compose.yaml** | Host capacity | ffmpeg/cleanup/log growth can starve Web/Chat/Mongo. | Separate worker, measure, enforce ceilings, throttle and rotate logs. |
| R-15 | High | Encryption key and broad service secrets are stored/backed up beside ciphertext/data. | **secrets.js**; **mongoMaintenance.js:13-20** | Secrets/backups | One database/archive compromise decrypts messages and enables callbacks. | External secret custody, rotation, split backup access and restore procedure. |
| R-16 | High | Backups are manual, memory-heavy, exclude file bytes, and have no proven off-host restore. | **mongoMaintenance.js:13-38**; Compose | Recovery | Platform restore can be incomplete/inconsistent. | Stream/off-host schedule, coordinated DB+file backup and periodic restore test. |
| R-17 | High | Health is liveness-only; no operational metrics or structured correlation. | **health.js:12-14**; Compose | Operations | Failed dependencies can receive traffic; capacity regressions are invisible. | Separate readiness, bounded telemetry and host/service SLO measurements. |
| R-18 | High | No Web/Analytics service auth, versioned API/event schema or idempotent command contract. | Repository-wide search; Section 13 | Platform integration | CRM/listing/event workflows are blocked. | Define owner APIs and provider/consumer contract tests before implementation. |
| R-19 | High | Sync bcrypt login/register has weak route-specific abuse control. | **auth.js:25-156**; **index.js:328-344** | Auth/event loop | CPU attack affects all Chat users and shared host. | Dedicated limiter/backoff and Web-owned login. |
| R-20 | Medium/High | Event, session, audit, read and schedule metadata have no TTL/retention. | **mongoSchema.js:28-59** | Mongo/disk/backups | Shared disk and backup windows grow indefinitely. | Define legal/product retention; safe TTL/archive and growth monitoring. |
| R-21 | Medium/High | Deployment/configuration variants and legacy SQL paths drift. | Docker/Render/Railway/playbook/install/package deps | Operations | Wrong artifact/topology can break DB or consume host resources. | Establish one current Compose source of truth; retire/label legacy paths. |
| R-22 | Medium/High | WS admits unauthenticated/unbounded clients; membership cache can leak briefly after removal. | **websocketGateway.js:281-313**; **sse.js:47-84** | Realtime security | Resource abuse and temporary access after authorization change. | Reject pre-upgrade, validate Origin/limits, invalidate/close on membership change. |
| R-23 | Medium | Push/provider/webhook logs expose endpoint/object details. | **push.js:105-123**; **uploadsRemote.js:768-771** | Privacy/logging | Data may enter shared log systems. | Redact and use non-reversible diagnostic identifiers. |
| R-24 | Medium | Nginx fixed upstream/ports and generic container name conflict with shared host topology. | **nginx/nginx.conf:1-35**; **docker-compose.yaml:39-54** | Networking | Can collide with platform Nginx or fail after port override. | Integrate Chat route into infrastructure proxy/private network; parameterize upstream. |
| R-25 | High | Main CI does not run the active Mongo integration suite or cross-service tests. | **.github/workflows/build.yml** | Release reliability | SQL/stub tests can miss real transaction/index/auth defects. | Add safe dedicated Mongo CI and future provider/consumer contracts. |

## 20. Integration Readiness Assessment

Only the four required classifications are used here.

| Integration/capability | Classification | Evidence and exit criteria |
|---|---|---|
| Web → Analytics search | **UNKNOWN** | No Chat dependency. Must be assessed in Web/Analytics: sanitized query contract, auth, pagination, limits, timeout and ownership. |
| Analytics → Web saved-listing workflow | **UNKNOWN** | No Chat implementation. Web must demonstrate its own association model/unique index and Analytics sanitized listing contract; a Web Poster must not be fabricated. |
| Chat → Web CRM task creation | **BLOCKED** | No UI, client, Web endpoint, service identity, delegated actor verification, permission contract, idempotency, timeout/retry or canonical result. Exit requires Web-owned command API and contract tests. |
| Web → Chat notifications | **REQUIRES CHANGES** | User-directed Chat realtime/push exists, but no narrowly scoped Web service endpoint/event consumer. Exit requires verified user mapping, scoped service auth, minimal payload, dedupe and failure contract. |
| Shared identity and authorization | **BLOCKED** | Chat owns local users/passwords/sessions/roles and cannot validate Web. Exit requires chosen Web authority protocol plus existing-account/data migration and revocation tests. |
| Cross-service event processing | **BLOCKED** | Redis is nondurable Chat internals; journal has no cross-service source/version contract and inconsistent atomicity. Exit requires transactional outbox/journal semantics, versioned minimal events, service auth and idempotent consumers. |
| Chat conversation/message ownership | **REQUIRES CHANGES** | Correct logical ownership and no sibling DB writes, but local user identity duplication and media authorization defects violate boundary safety. |
| Single-process live Chat | **REQUIRES CHANGES** | Broadly implemented, but private media/upload P0s and replay duplication prevent production-readiness claim. |
| Multi-instance live Chat | **BLOCKED** | WS-only partial Redis fan-out; SSE, presence and calls local. |
| Media worker integration | **REQUIRES CHANGES** | HTTP protocol exists; needs fail-closed auth, private networking, bounded durable jobs and destination controls. |
| Public Ouj Chat channel federation | **REQUIRES CHANGES** | Executable public feed/queue exists; DNS/egress hardening, privacy/log review and resource validation remain. |

No integration is classified READY because the repository has unresolved verified P0 authorization/secret/host-control risks and no shared platform identity.

## 21. Recommended Improvement Backlog

Every item below is a **RECOMMENDATION**. None was implemented by this audit. Repository policy requires a failing regression test before each bug fix.

### P0 — Critical correctness, security, and operational risk

1. Add anonymous/cross-member tests for every message-file/thumbnail/range/redirect path, then enforce session plus current chat/file authorization and private caching.
2. Reproduce **session.userId** upload bypass, then bind presign/complete to **session.id**, chat membership, message author/purpose and immutable pending ownership.
3. Make webhook/worker secrets mandatory and fail startup closed; constant-time compare; private worker network; outbound destination/storage allowlists.
4. Remove full request/response debug logging and introduce centrally redacted structured logs.
5. Run the main image non-root and remove Docker socket access from Chat; move service/Nginx controls to infrastructure with scoped authorization.
6. Restrict backup/reset/clear/service/Nginx actions to owner/step-up or remove them from the app. Protect/export audits and backups separately.
7. Reproduce and fix topic close, remote/fallback upload await/return/message-ID behavior, and both auto-add contracts.
8. Cap worker concurrency/queue and reject with backpressure until a durable queue/reconciliation path exists.
9. Add absolute/idle session expiration and a migration toward hashed-at-rest session tokens; stop URL query token use.

### P1 — Required for reliable multi-repository integration

1. Select Web BFF or audience-limited asymmetric token verification; specify subject/role/account/agency status, revocation, clock skew and existing Chat user migration.
2. Define Web-owned CRM task command v1 with scoped service identity, verified actor context, authorization, idempotency, typed errors, timeout/bounded retry and provider/consumer tests.
3. Define a narrowly scoped Web→Chat notification/command contract; do not expose admin/webhook credentials as service auth.
4. Replace duplicate/non-atomic replay recording with one transactionally coupled outbox/journal operation per mutation and idempotent live delivery.
5. Version public API/realtime/event schemas and publish OpenAPI/JSON Schema or equivalent stable contracts.
6. Put media jobs in a durable bounded queue with idempotent job IDs, status/reconciliation, retry/dead-letter policy and graceful drain.
7. Add real Mongo replica-set integration to CI and cover all P0 regressions.
8. Add readiness checks for Mongo/storage/required worker and keep liveness separate.
9. Establish one platform Compose/private-network/Nginx topology with least-privilege per-service Mongo credentials and no globally conflicting container/ports.
10. Create coordinated off-host Mongo plus local/S3 metadata/bytes backup and a regularly tested restore/rollback procedure.

### P2 — Performance and scalability

1. Cursor-paginate chat lists and clamp message/admin/array cardinalities.
2. Replace N+1 chat/admin/presence paths with bounded aggregations/read models; batch author/member lookups.
3. Redesign encrypted message search with explicit privacy/product constraints; never decrypt large collections per request.
4. Batch whole-chat reads and high-cardinality mutations; preserve one logical replay event.
5. Add candidate indexes only after representative **executionStats** and write/storage review.
6. Stream backup/restore, file encryption/download/mirror operations; bound buffers and tmp-disk usage.
7. Batch/checkpoint/throttle cleanup, retention and encryption work; pause on RAM/CPU/Mongo latency pressure.
8. Bound push/provider concurrency and timeouts.
9. Define retention/TTL/archive for sessions, replay, audits, reads and completed schedules.
10. Measure baseline RSS/peak/event-loop/CPU/Mongo/API p95/disk/pool, then enforce tested app/worker limits and log rotation.
11. Keep one API replica until multi-instance SSE/presence/call/routing tests pass.

### P3 — Future maintainability and capability

1. Decompose ChatPage, server composition, remote-channel engine and admin settings by stable domain boundaries.
2. Retire unused client wrappers, duplicate admin route and SQL-era runtime dependencies/install paths after migration support is intentionally preserved elsewhere.
3. Generate validated environment/config documentation from one schema and eliminate duplicate/implicit aliases.
4. Add structured correlation IDs, queue lag/schedule age/replay lag, connection health and backup-success telemetry with lean retention.
5. Add compatibility/deprecation policy for public federation and future cross-service contracts.
6. Evaluate higher availability or a broker/search engine only after measured bottlenecks justify their VPS cost; do not introduce Redis/Kafka/Elasticsearch/Kubernetes by default.

## 22. Open Questions for the Other Repositories

### Owj Web

1. What is the canonical user subject, and how are consultant, agency, account-disabled and role changes represented?
2. Does Web currently provide a BFF/session introspection or audience-limited asymmetric token flow? What are token lifetime, audience, issuer, key rotation and revocation semantics?
3. How should existing Chat usernames/users be linked or migrated without losing conversation ownership? Are usernames unique and immutable platform-wide?
4. Which Web endpoint owns CRM task creation, and does it already authorize actor, agency, case/customer, assignee and state transition?
5. Does that endpoint support a durable idempotency key and return the prior canonical result on retry?
6. What minimal Chat reference is allowed in CRM activity? May message text ever be copied, and under what explicit permission/retention rule?
7. What Web-owned endpoint/model stores an external Analytics listing for a user? What unique compound index prevents duplicates?
8. How does Web distinguish “saved external public listing” from Poster publication/ownership/contact verification?
9. What scoped service identity could Web use to request a Chat notification without impersonating a browser/admin?
10. Does Web still expose legacy **/api/chatroom**, and how will it be separated/migrated relative to this service?

### Owj Market Analytics

1. Which authenticated, bounded search endpoint supports Web, and what sanitized request/response schemas, pagination, limits and freshness fields exist?
2. What stable non-personal **listingToken/source** identifier can Web store?
3. Which fields are safe to copy into a Web saved-listing snapshot, and how are deletion/freshness/model versions represented?
4. Can recommendations accept sanitized property requirements without customer identity, phone, free-form CRM notes or private transcripts?
5. What rate limits, timeout/retry and service-auth mechanism protect Analytics on the shared VPS?
6. Has Analytics migration from Atlas to local Mongo actually completed, and what logical database/user/network does it use?

### Infrastructure/platform owner

1. Which Compose project owns public Nginx, certificates, shared private networks, port 80/443 and deployment ordering?
2. What is the actual production Mongo topology, logical database name, Chat role grants, WiredTiger configuration, backup target and restore test history?
3. Are container memory/CPU/log limits already imposed outside these repository files?
4. Where are app/worker secrets held, and can they be removed from Mongo backups/environment-file mutation?
5. Which monitoring already captures host headroom, container RSS/OOM/restarts, event-loop delay, Mongo/API p95, connections, disk and backup success?
6. Is a private standalone media worker reachable only from Chat, and is its current secret guaranteed nonempty?
7. What rollback artifact and migration compatibility window exist for the deployed Chat version?

## 23. Source Reference Index

### 23.1 Repository/build/runtime

- **AGENTS.md**, **DESIGN.md** — repository/platform constraints.
- **package.json**, **package-lock.json**, **.nvmrc**, **VERSION** — identity, scripts, runtime and revisioned version.
- **client/package.json**, **server/package.json**, **worker/package.json** — package stack and test/build commands.
- **server/index.js** — composition root, middleware, timers, startup/shutdown.
- **server/api/index.js** — active route registration and scheduled-service startup.

### 23.2 Persistence

- **server/db.js** — side-effecting Mongo facade initialization.
- **server/db/mongoConnection.js** — client/pool/topology requirements.
- **server/db/mongoSchema.js** — all collection keys, validators, defaults and indexes.
- **server/db/mongoStore.js** — CRUD, sequences, AsyncLocalStorage transactions and event writes.
- **server/db/mongoRepository.js** — core identity/chat/message/file/read/session operations and cascades.
- **server/db/mongoMessaging.js** — tools, search, schedules, polls/topics/calls/replay.
- **server/db/mongoRemote.js** — remote source/queue/provider state.
- **server/db/mongoAdmin.js**, **mongoMaintenance.js**, **mongoImport.js** — admin, backup/restore and legacy import.
- **server/db/legacyReader.js**, **query.js**, **knex.js**, **server/migrations/** — legacy SQL read/import/history boundary.

### 23.3 HTTP, identity, and administration

- **server/api/auth.js**, **profile.js**, **appearance.js**, **presence.js**, **push.js**.
- **server/api/chats.js**, **messages.js**, **messaging.js**, **calls.js**.
- **server/api/uploadsRemote.js**, **server/lib/uploads.js**.
- **server/api/remoteChannels.js**, **remoteChannelTick.js**, **remoteMirror.js**.
- **server/api/adminPanel.js**, **adminRemoteChannel.js**, **adminMongo.js**.
- **server/lib/sessions.js**, **appSettings.js**, **secrets.js**, **validation.js**, **uuidMiddleware.js**.

### 23.4 Realtime, calls, notifications

- **server/lib/sse.js** — connection/member cache, emit and journal behavior.
- **server/lib/websocketGateway.js** — upgrade, heartbeat, Redis fan-out and call messages.
- **server/lib/presenceTracker.js**, **callManager.js**, **redis.js**, **push.js**, **vapid.js**.
- **client/src/hooks/chat/useChatEvents.js**, **useMessagingTools.js**, **useWebRTCCall.js**, **useGroupCall.js**.

### 23.5 Storage, media, remote work

- **server/lib/storage/**, **storageEncryption.js**, **mediaQueue.js**, **mediaWorker.js**, **localWorkerManager.js**.
- **server/lib/remoteChannels.js**, **remoteMirrorJobs.js**, **remoteMirrorDispatch.js**, **remoteChannelSecrets.js**.
- **server/lib/mongoFileJobs.js**, **mongoRetention.js**, **messageFileJobs.js**.
- **server/lib/services/** and **server/lib/workers/autoAddWorker.js**.
- **worker/index.js**, **worker/storage.js**, **worker/encryption.js**, **worker/ffmpeg.js**.

### 23.6 Client

- **client/src/App.jsx**, **pages/AuthPage.jsx**, **InvitePage.jsx**, **ChatPage.jsx**, **AdminPage.jsx**.
- **client/src/api/chatApi.js**, **messagingApi.js**, **appMetaApi.js**.
- **client/src/utils/cacheDb.js**, **chatCache.js**, **chatOutbox.js**, **sessionStorage.js**.
- **client/public/sw.js**.
- **client/src/components/chat/business/BusinessPreviewSheet.jsx**, **ComposerBusinessActions.jsx**.

### 23.7 Deployment, operations, tests

- **Dockerfile**, **docker-compose.yaml**, **docker-compose.mongo.yaml**.
- **worker/Dockerfile**, **worker/docker-compose.yaml**.
- **nginx/nginx.conf**, **nginx/proxy-settings.conf**.
- **render.yaml**, **.railway/railway.ts**, **playbook.yaml**, **scripts/docker-entrypoint.sh**, **scripts/install.sh**.
- **.env.example** — names only; no actual secret values inspected.
- **.github/workflows/build.yml**, **docker.yml**, **release.yml**, **docs.yml**, **codeql.yml**.
- **client/vitest.config.js**, **server/vitest.config.js**, **server/vitest.mongo.config.js**, test directories and **scripts/test/**.

### 23.8 Completeness verification

| Category | Discovered | Documented | Coverage |
|---|---:|---:|---|
| Database models/collections | 35 | 35 | 100% of declared active Mongo collections |
| Main Express HTTP endpoints | 173 unique | 173 | 100% of static method/path declarations |
| Media-worker HTTP endpoints | 4 | 4 | 100% |
| Total HTTP endpoints | 177 | 177 | 100% static surface coverage |
| Significant service domains | 31 | 31 | 100% under the explicit Section 6 counting rule |
| Background/recurring mechanisms | 18 | 18 | 100% of discovered active mechanisms |
| Socket.IO events | 0 | 0 | N/A — Socket.IO is not used |
| Live raw WS/SSE payload types | 28 | 28 | 100% of discovered emitted live types |
| Journal-only realtime-related types | 1 | 1 | 100% |
| External integration domains | 9 | 9 | 100% of discovered source integrations |
| Active Compose service definitions | 4 | 4 | 100% across the three Compose files; commented duplicate excluded |

Static declaration coverage is high enough to call the **source inventory complete**, but runtime verification is intentionally incomplete. The following could not be verified:

- production environment values, secrets, Mongo host/database/roles/index build state and actual data;
- runtime success of any endpoint, worker, test, migration, backup or external provider;
- measured CPU/RAM/event-loop/API/Mongo latency, queue depth, disk growth, network behavior or maximum user/chat/message scale;
- reverse-proxy/cloud controls not stored in this repository;
- actual backup schedule, off-host copies and restore success;
- capabilities/contracts in Owj Web and Owj Market Analytics;
- DNS/redirect behavior of real federation targets;
- generated graph query/update results because the **graphify** CLI was unavailable.

No directory was intentionally excluded except dependency/build output, actual environment/secret files, live data, and generated/binary assets not needed to establish architecture. Recommendations were not implemented.

## 24. Sprint 1 implementation addendum

### 24.1 Evidence boundary

This addendum records the source work performed after the read-only audit. It is a development log, not evidence that `web-chat-1` or any other production process runs this revision. Only the Owj Chat repository was modified; Owj Web and Owj Analytics were not modified. No production database, message, attachment, secret, migration, object bucket, container, commit, or push was changed.

Dependency installation was limited to local development packages needed to execute tests. No new runtime dependency was added to a `package.json`. The server lockfile was refreshed by the local install and is listed explicitly below. A first server install attempted an `mongodb-memory-server` binary download and was stopped; later installs used `--ignore-scripts`. The real-Mongo `test:mongo` suite was deliberately not run.

### 24.2 Task outcome

| Task | Source outcome | Important boundary |
|---|---|---|
| CHAT-001 | Implemented and regression-tested | Private file, stored-name, thumbnail, range and object-store paths authorize file → message → chat → current membership. Only an explicitly public channel permits anonymous message media. |
| CHAT-002 | Implemented and regression-tested | Actor/chat/purpose/message or `clientRequestId`/storage key are bound; completion is persisted, queue-aware and retry-safe. Client and server must roll together. |
| CHAT-003 | Implemented and regression-tested | Hardened paths emit structured allowlisted fields and stable error codes, without raw bodies, credentials, messages, provider URLs/bodies, object keys or raw exceptions. |
| CHAT-004 | Implemented in source; rollout required | Final image uses `node`; Chat drops all capabilities, uses `no-new-privileges`, has no Docker socket, and disables host service/Nginx control in-process. Existing volume ownership must be prepared for uid/gid 1000. |
| CHAT-005 | Partial | Worker/callback auth fails closed and work/URLs/queues are bounded, but the shared secret is static rather than an expiring replay-resistant service credential; DNS rebinding remains a deployment review item. |
| CHAT-006 | Partial | Sensitive operations require owner plus a separate operator token and host controls are disabled. The static operator token is an interim step-up mechanism, not a final operator identity/rotation design. |
| CHAT-007 | Implemented in source; cutover required | New session tokens are stored as SHA-256 digests; plaintext legacy rows dual-read/backfill. Stored digests are not accepted as bearer tokens. Logout/device revocation and account-wide admin invalidation close matching WebSocket and SSE streams. |
| CHAT-008 | Partial | Cookie-only upgrade auth, origin/payload/IP/rate/auth-timeout/heartbeat controls, membership invalidation and explicit WS/SSE revocation are implemented. Already-open streams are not periodically revalidated solely because idle/absolute expiry elapses. |
| CHAT-009 | Implemented and regression-tested | Topic close, async auto-add, upload persistence/save, webhook save, queue admission and pending-claim removal now honor their awaited contracts. |
| CHAT-010 | Partial by design | Server and worker queues have bounded depth/concurrency and overload backpressure. The in-memory fallback remains non-durable across restart; no new broker was introduced. |

The dormant M1 preparation is intentionally not live: `platformIdentitySchema.js`, `platformIdentityAdapter.js`, `supportAccessService.js`, and `crmTaskCommand.js` expose no production route, UI, startup wiring, external call or executed migration. Web still must approve issuer/audience/scope, verified link, guest-capability and CRM service contracts.

### 24.3 Exact repository file inventory

Repository/deployment files changed:

- `.env.example`
- `Dockerfile`
- `docker-compose.yaml`
- `playbook.yaml`
- `scripts/docker-entrypoint.sh`
- `scripts/test/docker-entrypoint.test.bats`
- `server/package-lock.json` — local lock refresh only; no runtime dependency declaration was added

Client files changed:

- `client/src/api/chatApi.js`
- `client/src/pages/ChatPage.jsx`
- `client/test/utils/chatApiAvatar.test.js`

Server API/runtime files changed:

- `server/index.js`
- `server/api/admin.js`
- `server/api/adminPanel.js`
- `server/api/adminRemoteChannel.js`
- `server/api/auth.js`
- `server/api/chats.js`
- `server/api/health.js`
- `server/api/index.js`
- `server/api/messages.js`
- `server/api/messaging.js`
- `server/api/profile.js`
- `server/api/remoteChannelTick.js`
- `server/api/remoteMirror.js`
- `server/api/uploadsRemote.js`

Database files changed or added:

- `server/db.js`
- `server/db/mongoMessaging.js`
- `server/db/mongoRepository.js`
- `server/db/mongoSchema.js`
- `server/db/platformIdentitySchema.js` — dormant additive helper; not executed

Server library files changed or added:

- `server/lib/crmTaskCommand.js`
- `server/lib/localWorkerManager.js`
- `server/lib/mediaQueue.js`
- `server/lib/mediaWorker.js`
- `server/lib/messageMediaAccess.js`
- `server/lib/platformIdentityAdapter.js`
- `server/lib/postgresMaintenance.js`
- `server/lib/push.js`
- `server/lib/redis.js`
- `server/lib/requestLogging.js`
- `server/lib/secrets.js`
- `server/lib/services/mongoAdminService.js`
- `server/lib/sessionTokens.js`
- `server/lib/sessions.js`
- `server/lib/sse.js`
- `server/lib/storageEncryption.js`
- `server/lib/storageLayoutMigration.js`
- `server/lib/supportAccessService.js`
- `server/lib/thumbUrl.js`
- `server/lib/uploads.js`
- `server/lib/vapid.js`
- `server/lib/websocketGateway.js`
- `server/lib/workers/autoAddWorker.js`

Worker files changed:

- `worker/index.js`
- `worker/storage.js`
- `worker/test/mirror.test.js`
- `worker/test/server.test.js`
- `worker/test/storage.test.js`

Server test/support files changed or added:

- `server/test/api/adminAuditLogs.test.js`
- `server/test/api/adminDbTools.test.js`
- `server/test/api/adminLogsWorker.test.js`
- `server/test/api/adminPanel.test.js`
- `server/test/api/adminSecrets.test.js`
- `server/test/api/auth.test.js`
- `server/test/api/avatar_dual_upload.test.js`
- `server/test/api/mediaAuthorization.test.js`
- `server/test/api/messages.test.js`
- `server/test/api/messagesUploadStorageKeys.test.js`
- `server/test/api/messaging.test.js`
- `server/test/api/postgresChatMute.test.js`
- `server/test/api/remoteChannelTick.test.js`
- `server/test/api/remoteMirror.test.js`
- `server/test/api/thumbs.test.js`
- `server/test/api/uploadsRemotePresignRateLimit.test.js`
- `server/test/api/uploadsRemoteCompletionSecurity.test.js`
- `server/test/api_uploads_remote.test.js`
- `server/test/db/mongoRepository.autoAdd.test.js`
- `server/test/db/platformIdentitySchema.test.js`
- `server/test/deploymentSecurity.test.js`
- `server/test/e2e_remote_storage_flow.test.js`
- `server/test/helpers/makeApp.js`
- `server/test/lib/appSettingsNullable.test.js`
- `server/test/lib/crmTaskCommand.test.js`
- `server/test/lib/platformIdentityAdapter.test.js`
- `server/test/lib/postgresMaintenance.test.js`
- `server/test/lib/push.test.js`
- `server/test/lib/redis.test.js`
- `server/test/lib/requestLogging.test.js`
- `server/test/lib/services/mongoAdminService.test.js`
- `server/test/lib/sessionTokens.test.js`
- `server/test/lib/sessions.test.js`
- `server/test/lib/sse.membership.test.js`
- `server/test/lib/sse.sessionRevocation.test.js`
- `server/test/lib/supportAccessService.test.js`
- `server/test/lib/websocketGateway.call.test.js`
- `server/test/lib/websocketGateway.test.js`
- `server/test/media_queue.test.js`
- `server/test/mongo/adminApi.test.js`
- `server/test/mongo/repository.test.js`
- `server/test/prune_orphan_r2_objects.test.js`
- `server/test/storage_layout_migration.test.js`

Documentation files changed or added:

- `chat.md`
- `docs/.vitepress/config.mjs`
- `docs/Admin-Panel.md`
- `docs/Installation-Docker.md`
- `docs/Media-Worker.md`
- `docs/fa/Admin-Panel.md`
- `docs/fa/Installation-Docker.md`
- `docs/fa/Media-Worker.md`
- `docs/platform/CHAT_REALTIME_PROTOCOL_V1.md`
- `docs/platform/CHAT_SPRINT_1_HANDOFF.md`
- `docs/platform/CHAT_SUPPORT_API_CONTRACT_V1.md`
- `docs/platform/CHAT_WEB_IDENTITY_MIGRATION.md`
- `docs/fa/platform/CHAT_REALTIME_PROTOCOL_V1.md`
- `docs/fa/platform/CHAT_SPRINT_1_HANDOFF.md`
- `docs/fa/platform/CHAT_SUPPORT_API_CONTRACT_V1.md`
- `docs/fa/platform/CHAT_WEB_IDENTITY_MIGRATION.md`

Generated dependency, VitePress, build, coverage and Vitest screenshot/cache output is not source work and is excluded from this inventory.

### 24.4 Verification log and gaps

The focused private-media/upload matrix passed 75/75 tests. The final server aggregate passed **1,092/1,092 tests in 125 files**. An earlier aggregate passed 1,061/1,083; its 22 failures were not hidden: 15 were stale security fixtures, six were test pollution from developer retention environment values, and one used an invalid username fixture. All were corrected without weakening production authorization before the final aggregate.

The media worker suite passed 43/43. Client unit tests passed 457/457, and client browser component tests passed 334/334 in Chromium. Client lint passed and the production client build completed. The VitePress documentation build passed. Changed JavaScript syntax checks, Docker Compose configuration validation, and entrypoint shell syntax validation passed without loading the repository's actual `.env`; the manual missing-secret entrypoint check started only the application command. Restricted-sandbox HTTP runs initially reported `listen EPERM` and passed when rerun with local loopback access. Bats was unavailable, so the Bats entrypoint file was not executed.

Real Mongo replica-set integration, live object storage, container image build, production load/resource benchmarking, deployment and migrations remain deliberately unexecuted. The `graphify` CLI was unavailable, so the required graph update could not be run.
