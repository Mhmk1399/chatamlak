# OWJ Chat — Sprint 5 closure

Date: 2026-11-23  
Repository/service: `chatamlak` / Owj Chat  
Status: **closed in the protected synthetic environment**

No production data, production endpoint, commit, push, deployment, or volume removal was used. The only runtime changes were rebuild/recreate/restart operations inside the guarded synthetic Compose project. Host-only cookies were never copied between origins, and neither service credentials nor one-time proofs entered browser JavaScript.

## Protected acceptance boundary

- Compose project: `owj-sprint4-synthetic`
- Browser entry point: port `28088`
- Guard marker: `owj-sprint4-synthetic-only-v1`
- Databases: `owj_web_e2e`, `owj_chat_e2e`, `owj_analytics_e2e`
- Final healthy Chat image: `sha256:c5b710d11489b42bb79d1437a08b080556708e60075577db56a24821968f90da`
- Final healthy Web image: `sha256:74287d2805eac16aa0c426cbd46d3f8ad15aad9292ff2a47ef6d03254ea8e54f`

Production-clone data, port `18088`, Atlas, real SMS, live object storage, Divar, and paid providers were outside the acceptance boundary.

## Acceptance results

| Layer | Result |
|---|---|
| Complete server suite | **148 files, 1,250 tests passed** |
| Real MongoDB replica-set suite | **10 files, 67 tests passed** |
| Complete Chromium component suite | **73 files, 820 tests passed** |
| Focused drag/dismiss regression | **10/10 tests passed** |
| Real Chrome guest-history link | **Passed** against final rebuilt Web and Chat images |
| Real Chrome SSO/message/WebRTC/CRM regression | **Passed** against final rebuilt Web and Chat images |

The first sandboxed server rerun was invalid because localhost listeners and child processes received `EPERM`; it is not acceptance evidence. The permitted rerun passed 1,250/1,250.

## Authorization transaction lifecycle

`owj_chat_auth_tx` is now cleared after the federated session cookie is queued, preventing Express from overwriting the deletion header. Real Chrome observed the transaction cookie as host-only, path-scoped, `HttpOnly`, and absent after the successful callback.

Server tests cover wrong state/browser binding, unsuccessful callbacks, expiry, interruption after one-time transaction consumption, and replay. These cases fail closed without issuing or weakening a Chat session. The callback replay check also confirmed that rejection does not invalidate an already authenticated native Chat session.

## Frozen Web guest-link contract

The implemented contract matches Web's rebuilt v1 endpoints:

- Browser authorization: `POST /api/v1/support/guest-link/authorize`
- Server exchange: `POST /api/internal/v1/support/guest-link/exchange`
- Proof: RS256, audience `owj-chat-support-guest-link`, token use `support_guest_link`, scope `support:guest-history:link`
- Intent: `link_guest_history`
- Proof bindings: Web `sub`, `guest_subject`, `conversation_id`, expiry, and one-time JTI

Chat owns `POST /api/integrations/support/guest-link/start` and GET/POST `/api/integrations/support/guest-link/callback`. The five-minute transaction binds state, PKCE, browser token, exact verified Web subject, native Chat identity, redirect URI, and expiry. The exchange is server-to-server under the dedicated service identity; the browser sees neither the service token nor PKCE verifier/proof.

Completion atomically verifies the current Web subject, the one-to-one Web/native Chat link, the guest-subject digest, conversation identity, proof JTI, and transaction. It preserves the original guest actor on historical messages, preserves conversation/case history, converts the support identity, and revokes active guest sessions. Support V1 and existing V2 routes remain additive and unchanged.

Negative coverage rejects cross-user linking, subject/account/conversation mismatch, wrong state, missing scope, invalid signature, replay, expired transaction/proof, and conflicting active guest/registered cases. A guest identity already linked elsewhere is not merged.

### Real Chrome and MongoDB evidence

The guarded browser flow completed Chat start, host-only `HttpOnly` transaction handling, Web confirmation, PKCE/state exchange, one-time proof consumption, callback replay rejection, native-session preservation, and JavaScript proof isolation.

Synthetic conversation `4138e783-f13f-4d0e-915d-d094f814f607` produced these boolean-only MongoDB checks:

```json
{
  "registered": true,
  "webSubjectMatches": true,
  "nativeChatIdentity": true,
  "guestActorPreserved": true,
  "proofRecorded": true,
  "linkMatches": true,
  "activeGuestSessions": 0
}
```

No message text, contact data, credential, proof, or token was printed.

## CRM contract and cross-repository regression

The Chat client now requires a canonical Web task type, valid future `dueAt`, at least one bounded step, and a valid idempotency key. The browser regression sent type `call`, an ISO due date, and a required `Call` step. Unknown task types and missing steps fail before the cross-service request.

Web remains the CRM owner. Chat verifies the federated actor and conversation membership, then calls Web using the scoped service identity plus delegated actor proof. It never writes Web collections. Private message bodies, transcripts, phone/customer/contact fields, and unknown fields are rejected.

Real Chrome created canonical Web task `6b043efb4cde168daf9fc042`, restarted Chat, verified session/message durability, repeated the identical idempotency key and received the same task with `deduped: true`, then changed the payload under the same key and received `409`.

The same regression passed:

```json
{
  "status": "passed",
  "sso": "actual-web-browser-integrated",
  "message": "actual-chat-api",
  "crm": "actual-web-integrated",
  "call": "actual-federated-session-websocket-loopback-media"
}
```

The WebRTC check used real authenticated WebSockets and local synthetic audio/video tracks in Chrome. Both peers negotiated media, camera state was relayed, a non-member call was denied, end state was cleared, and no external TURN/media provider was used.

## UI closure

The four stale Chromium expectations were aligned with the intended current design: content-height call headers, compact desktop folder counts with accessible text, the mobile folder count class, and the account menu's separate rail placement. The complete Chromium run passed **820/820**.

## MongoDB migration and ownership

Chat owns `guest_link_transactions`, support conversions, conversations, messages, cases, sessions, and proof replay records. Web owns identity and CRM records.

Schema v4 extends the proof-token validator for `support_guest_link`. Application startup does not attempt privileged `collMod`; it fails with `MONGO_SCHEMA_MIGRATION_REQUIRED` when the schema is stale. The explicit `server/scripts/migrate-mongo-schema-v4.js` operation performs the validator/meta migration under an authorized operator identity. Only `owj_chat_e2e` was migrated for this acceptance.

Each start adds one small TTL-bound transaction document. Proof and transaction consumption are one-time and indexed. There are no new pools, brokers, unbounded arrays, or background workers. Runtime cost is one bounded Web authorization/exchange per explicit link and short indexed MongoDB operations/transactions.

## Verification commands

```bash
npm --prefix server run test
npm --prefix server run test:mongo
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run --maxWorkers=1
node client/test/e2e/guest-link-platform-flow.mjs
node client/test/e2e/web-sso-crm-platform-flow.mjs
npm run docs:build
```

The guarded browser scripts require the exact synthetic marker, port, and database names and refuse to run outside that boundary.

## Operational note and rollback

Recreating Chat changed its Docker IP while the synthetic Nginx proxy retained the prior upstream address. Two browser attempts received `502`; restarting only the synthetic proxy refreshed Docker DNS, after which the unchanged full regression passed. This was synthetic infrastructure state, not an authentication failure.

Rollback is additive: disable the guest-link route/runtime without deleting conversions or rewriting messages. Retain TTL/unique indexes and conversion evidence. CRM client changes can be rolled back without altering already-created Web tasks. No destructive data rollback is required.
