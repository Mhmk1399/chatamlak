# Owj Chat Sprint 5 closure record

Date: 2026-11-23

Status: **closed in the protected synthetic environment.** The exact browser, server, MongoDB, and cross-repository evidence is recorded below and in the repository-root `CHAT_SPRINT_5_CLOSURE.md` handoff.

Starting revisions: Chat `0397bd32da4d653bc237d47f33f3223e393683f4`; Web `825deb1dec989e390ac8048310db790c5f111e8f`. The Chat working tree contains uncommitted Sprint 5 changes. Web and Analytics source were not edited.

## Acceptance snapshot

| Check | Result at this snapshot | Classification |
|---|---:|---|
| Complete server suite | **148 files, 1,250 tests passed** | Passed |
| Disposable MongoDB replica-set suite | **10 files, 67 tests passed** | Passed |
| Focused sheet drag/dismiss suite | **10/10 tests passed** | Passed |
| Complete Chromium component suite | **73 files, 820 tests passed** | Passed |
| Real Chrome cross-host guest-history link | Success + callback replay + Mongo evidence | Passed |
| Real Chrome SSO/message/WebRTC/CRM journey | Success + restart + retry/conflict | Passed |

The isolated integration target remains project `owj-sprint4-synthetic`, port `28088`, marker `owj-sprint4-synthetic-only-v1`, and databases `owj_web_e2e`, `owj_chat_e2e`, and `owj_analytics_e2e`. Port `18088`, production-clone data, Atlas, real SMS, live object storage, Divar, and paid providers are outside this acceptance boundary.

## Ownership and contract closure

Chat owns conversations, messages, support cases, guest conversion records, native sessions, realtime state, and calls. Web remains the canonical identity authority and owns CRM mutations. Neither shared MongoDB infrastructure nor a browser-provided identity authorizes Chat to write Web collections.

### Cross-host guest-history handoff

The Chat-side additive v1 handoff replaces the impossible requirement that guest and native host-only cookies arrive on the same origin:

1. A current `web_federated` Chat session explicitly starts `POST /api/integrations/support/guest-link/start` with `intent: "link_guest_history"`.
2. Chat creates a five-minute transaction containing digests of state and the browser token, a PKCE verifier, exact Web subject and Chat user, redirect URI, and expiry. The browser receives only a path-scoped, host-only, `HttpOnly`, `SameSite=Lax` transaction cookie plus the authorization form.
3. Chat exchanges the one-time code server-to-server with service identity `owj-chat-support-guest-link`; the service credential and PKCE verifier never enter frontend JavaScript.
4. Chat accepts only an RS256 proof with audience `owj-chat-support-guest-link`, token use `support_guest_link`, and exact scope `support:guest-history:link`. The assertion JTI and browser transaction are one-use.
5. Completion requires the same current Web subject, native Chat account, active one-to-one platform link, guest-subject digest, and conversation. It then records the conversion, preserves authorship/case history, and revokes the old guest sessions.

Conflict handling is explicit: a guest identity already linked elsewhere or two simultaneously active registered/guest cases returns a bounded conflict instead of merging accounts. Unit/API and real-Mongo tests cover intent, cookie clearing, proof/account/ownership checks, idempotency, preserved authorship, history numbering, and active-case conflict. Real Chrome completed the rebuilt Web authorization and Chat proof exchange, rejected callback replay, preserved the native session, and produced boolean-only Mongo evidence for subject/native/guest binding, preserved guest authorship, proof/link records, and zero active guest sessions.

### CRM command

The browser calls Chat's protected `POST /api/integrations/crm/tasks`. Chat force-refreshes the federated session, requires a current delegated actor proof, verifies source-conversation membership, and sends the allowlisted v1 command to Web with service identity `owj-chat-crm`, the delegated actor header, a stable idempotency key, and a bounded correlation ID.

The command requires an approved type, title, valid `dueAt`, and at least one bounded step. It may carry approved assignment/case references and bounded instructions. Message bodies, transcripts, customer/contact/phone fields, and unknown fields are rejected before the cross-service request. Web remains responsible for actor state, assignment authorization, idempotent mutation, and the canonical task ID/status. Chat caps the response at 32 KiB and applies a six-second request timeout. Real Chrome created canonical task `6b043efb4cde168daf9fc042`, survived a Chat restart, returned the same task as deduplicated for an identical retry, and returned `409` for a changed payload under the same key.

## Security and privacy

- Browser-supplied `userId`, role, consultant, agency, conversation, or case references are never identity authority; the server derives the actor from the opaque Chat session and rechecks membership/current Web state.
- Service tokens, PKCE verifiers, Web proofs, transaction tokens, private messages, contact data, and credentials must not appear in browser storage, logs, events, or documentation examples.
- Guest subjects are stored only as namespaced SHA-256 digests in conversion state. Original guest authors remain customer authors after conversion; no implicit username/email/phone merge exists.
- Guest-link responses are no-store and bounded. Production URLs require HTTPS; insecure HTTP is limited to an explicit non-production flag.
- Web `chat:admin` remains an authorization scope, not a native Chat owner/admin promotion. Elevated native permissions stay default-deny.

## Data and resource impact

The change adds Chat-owned `guest_link_transactions` documents with unique state-digest and TTL indexes, plus the existing guest-identity conversion record/index path. Each start creates one small transaction document with a five-minute lifetime; completion consumes it atomically and uses short MongoDB transactions where supported. There are no unbounded arrays, background crawlers, new brokers, Redis, or extra database pools.

The guest handoff adds one bounded Web authorization/exchange journey per explicit user action. CRM adds one internal request per attempt with a six-second timeout and 32 KiB response limit. These paths are user-facing and should be monitored for Web latency, MongoDB transaction latency, error rate, and connection-pool pressure before production resource ceilings are tightened.

## Verification commands

```bash
npm --prefix server run test
npm --prefix server run test:mongo
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run test/components/chat/ToolDialog.dragDismiss.test.jsx
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run --maxWorkers=1
node client/test/e2e/guest-link-platform-flow.mjs
node client/test/e2e/web-sso-crm-platform-flow.mjs
```

The initial sandbox-restricted server attempt is not acceptance evidence when local listeners or child processes receive `EPERM`; the reported **1,250/1,250** result is the permitted complete run. The guarded browser scripts refuse to run unless the exact synthetic marker, port, and database names are present.

## Deployment and rollback

No commit, push, deployment, destructive migration, or volume reset is part of this work. Before deployment, configure the exact guest-link authorize/exchange/redirect URLs and distinct least-privilege service token; verify HTTPS cookies, proxy callback routing, Web issuer/JWKS/audience, Web CRM endpoint, log redaction, backup, restore, and alerting.

Rollback is additive: disable or remove the guest-link route/runtime wiring and return the UI to unavailable without deleting conversion history or rewriting messages. Existing v1/v2 support sessions and native SSO continue independently. Do not drop `guest_link_transactions` or conversion collections during application rollback; their TTL/unique indexes are safe to retain, and removing data would make rollback destructive. CRM compatibility changes can be rolled back in Chat without touching Web tasks, but already-created Web tasks remain owned by Web.

## Finalization checklist

- [x] Complete Chromium result recorded: 73 files and 820 tests passed.
- [x] Actual Web + Chrome guest-link success and callback replay recorded; hostile state/account/expiry/conflict cases are covered by API/runtime/real-Mongo tests.
- [x] Actual Web + Chrome CRM creation, identical retry, and changed-payload conflict recorded; revoked actor/assignment rejection remain server contract coverage.
- [x] Chat-only restart rechecked for session/message durability and CRM idempotency.
- [x] Documentation numbers updated without overwriting historical Sprint 4/earlier Sprint 5 evidence.

