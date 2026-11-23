# Owj Chat Sprint 4 handoff

Date: 2026-11-23

Status: **implemented and locally verified in the Chat repository**. This handoff does not claim production reliability or a completed deployed Web ↔ Chat browser journey.

Owj Chat still owns conversations, messages, membership, delivery/read state, support cases, and realtime authorization. Owj Web remains the authority for canonical human identity and CRM. The integration uses authenticated HTTP contracts only; Chat does not read or write Web collections.

## Delivered scope

| Area | Implemented state | Contract |
|---|---|---|
| Native Chat authentication | Web authorization-code flow with PKCE, state, one-use server transaction, opaque Chat session, and current-state revalidation | [Native Web SSO v1](./CHAT_NATIVE_WEB_SSO_V1.md) |
| Local compatibility | `/api/login` and `/api/register` remain available only in non-production `OWJ_CHAT_NATIVE_AUTH_MODE=local_test`; production startup rejects that mode and the UI labels it as native test mode | [Native Web SSO v1](./CHAT_NATIVE_WEB_SSO_V1.md) |
| Identity linking | Existing exact links are reused; a previously unseen verified Web subject receives an isolated Chat account. There is no username/email auto-match or implicit merge | [Native Web SSO v1](./CHAT_NATIVE_WEB_SSO_V1.md) |
| Support lifecycle | Additive v2 scoped-session exchange/logout, current/history, new-case, reopen, message, replay, and explicit guest-history link routes | [Support lifecycle v2](./CHAT_SUPPORT_LIFECYCLE_V2.md) |
| Support compatibility | Support v1 routes, frozen `/support/v1` cookie scope, and existing SSE/WebSocket behavior remain unchanged | [Support API v1](./CHAT_SUPPORT_API_CONTRACT_V1.md) |
| CRM | A federated Chat member can ask Web to create a bounded task through a delegated actor proof; Chat stores no Web CRM mutation | [CRM task integration v1](./CHAT_CRM_TASK_INTEGRATION_V1.md) |
| Calls | Real Chromium two-user loopback WebRTC plus server and component coverage | [Call E2E report](./CHAT_CALL_E2E_REPORT.md) |

The source also adds schema version 3 support for `native_web_auth_transactions`, including expiry and unique state-digest indexes. Existing Chat UUIDs and historical authorship are not rewritten.

## Security boundary

- PKCE verifier, state digest, browser-token digest, Web service credentials, and delegated CRM proof remain server-side. Web JWTs/service tokens are never returned to the Chat browser.
- The authorization transaction expires after five minutes and is consumed once. Host-only `HttpOnly`, `SameSite=Lax` cookies bind the transaction and the resulting Chat session; production HTTPS cookies are `Secure`.
- Federated sessions are revalidated against Web with an authorization cache ceiling of 60 seconds. Definitive revocation deletes the local session; a transient upstream failure fails the request closed without pretending the identity was revoked.
- `chat:call` is required for a federated caller. Scope enforcement was regression-tested after correcting the call guard. Web `chat:admin` does not grant a native Chat admin/owner role.
- CRM accepts an explicit allowlist and rejects message, transcript, contact, customer, phone, and unknown fields. Message contents are not forwarded.
- Support v2 authorizes every case/message operation against the support identity and requires stable idempotency keys for case creation, reopen, guest linking, and message retry behavior where defined.

## Verification evidence

| Check | Recorded result |
|---|---|
| Full isolated server suite | **146 files, 1,234 tests passed** |
| Complete disposable MongoDB suite | **10 files, 64 tests passed**, including native-auth and guest-history conversion against a real replica set |
| Complete client unit suite | **48 files, 457 tests passed** |
| Focused Chromium Sprint 4 component runs | **6 files, 35 tests passed**, including the CRM no-message-content request regression |
| Earlier complete Chromium component attempt | **67 of 72 files and 812 of 818 tests passed**; six failures remained in five layout/focus suites outside the focused Sprint 4 set, while the overlapping Chat-header case passed on focused rerun |
| Real two-user browser call script | Verified offer, answer, peer connection, remote audio, remote video, mute, camera-off, and hangup |
| Client production build and lint | Passed |
| Focused call/media/security audit run | **10 files, 83 tests passed**, covering call/media authorization, private media, upload callback ownership/retry, queue, and deployment-security boundaries |
| Additional security coverage | Session/identity denial and support isolation/lifecycle passed within the complete suites above |

The audited identity, private-media, direct-container/object-store, upload-completion, and queue paths exposed no new P0 finding in this local review. That is bounded test evidence, not a production security certification.

Firefox was not rerun after its local browser executable was found missing; the reported browser result is Chromium only. `graphify` was unavailable in this environment, so no graph artifact was generated. That tooling gap did not replace contract review or test execution.

## Acceptance boundary and remaining deployment work

This evidence proves repository behavior in the tested environment, not production reliability. Before production acceptance:

1. Run the complete deployed cross-repository browser journey through the real proxy, cookies, Web authorization/exchange/status endpoints, support widget, and Web CRM endpoint.
2. Configure HTTPS/TLS and production TURN credentials, then validate calls across restrictive NAT/firewall and reconnect/failure conditions. The local call script intentionally uses no ICE server and cannot prove TURN or Internet traversal.
3. Validate service-token rotation, proxy/header policy, rate limits, monitoring, restore/rollback, and production resource behavior.
4. Keep the non-production local-test compatibility path and Support v1 until an explicit, separately reviewed retirement decision.

## Synthetic regression fixtures

The fixture set begins at [`fixtures/chat-sprint4-v1/manifest.json`](./fixtures/chat-sprint4-v1/manifest.json). It contains only synthetic identifiers and redacted credential markers; it is contract documentation, not a production secret bundle.

