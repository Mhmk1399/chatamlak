# Owj Chat Sprint 5 handoff

Date: 2026-11-23

Status: **native Web SSO, Chat-to-Web CRM, restart durability, and local realtime calling are actual Web/browser integrated. Support v2 Web acceptance and cross-host guest-history linking remain blocked.**

Starting revisions were Chat `0397bd32da4d653bc237d47f33f3223e393683f4` and Web `825deb1dec989e390ac8048310db790c5f111e8f`. The Chat working tree contains uncommitted Sprint 5 changes; Web and Analytics source were not edited.

## Ownership and environment

Chat remains the owner of conversations, messages, membership, calls, support cases, and realtime authorization. Web remains the identity and CRM mutation authority. Chat reaches Web only through authenticated API contracts and never reads Web collections.

All cross-repository checks used the retained, synthetic-only environment:

| Guard | Value |
|---|---|
| Compose project | `owj-sprint4-synthetic` |
| Proxy | `http://*.owj.localhost:28088` |
| Databases | `owj_web_e2e`, `owj_chat_e2e`, `owj_analytics_e2e` |
| Marker | `owj-sprint4-synthetic-only-v1` |
| Providers | SMS, object storage, Divar, Atlas, and paid/external providers disabled |

No port `18088` data, production clone, external provider, or persistent volume reset was used.

## Delivered corrections

- Reconciled Web's real CRM actor envelope and flat error shape with Chat's consumers.
- Cleared stale delegated CRM proofs on refresh and persisted that revocation.
- Exposed current Web scopes and CRM capability to the client; `chat:call` is enforced in server and UI, while `chat:admin` never promotes the native Chat role.
- Added session-scoped CRM idempotency reconstruction without storing task content; ambiguous retries survive modal recreation and a Chat restart.
- Matched Web's required CRM `dueAt` field and retained its canonical task ID/link.
- Corrected WebSocket voice signaling to accept the client's `voice` call type while preserving legacy `audio` compatibility.
- Fixed the split Chat view's `callsDisabledForUser` model propagation found by the complete Chromium run.

## Acceptance matrix

| Area | Classification | Result |
|---|---|---|
| Web SSO and native Chat session | Actual Web-integrated + actual browser-integrated | Passed with three synthetic Web identities, exact callback, private messaging, second tab, isolation, and logout revocation |
| Web provider negative contract | Actual Web-integrated | Passed code/identity/revocation/delegation checks in Web's verifier |
| CRM task command | Actual Web-integrated + actual browser-integrated | Create, stable ID, restart retry dedupe, payload conflict, and assignment failure contract passed |
| Calls | Actual browser-integrated, local-only | Real Chat WebSocket/reverse proxy plus loopback WebRTC audio/video passed |
| Support v1/v2 backend | Unit/API tested | v1: 18 tests; v2: 5 tests, all passed in the complete server suite |
| Support v2 Web widget | Blocked | The actual Web harness exposes `/support/v1`; its widget does not consume v2 |
| Cross-host guest-history link | Blocked | Current operation needs two host-only cookies in one request; no reviewed one-time handoff exists |
| Complete Chromium suite | Partial | 808/820 passed initially; the Sprint 5 crash was fixed, but four pre-existing expectation mismatches remain |
| Firefox | Deferred | Executable unavailable locally |

Detailed evidence is in the [SSO](./CHAT_WEB_SSO_E2E_REPORT.md), [CRM](./CHAT_WEB_CRM_E2E_REPORT.md), [Support](./CHAT_SUPPORT_V2_WEB_ACCEPTANCE.md), [browser](./CHAT_BROWSER_REGRESSION_REPORT.md), and [call](./CHAT_REALTIME_CALL_INTEGRATION_REPORT.md) reports.

## Verification

```bash
npm --prefix server run test
npm --prefix server run test:mongo
npm --prefix client run test:unit
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run
```

- Server: **147 files, 1,239 tests passed**. An initial sandboxed run was invalid because local listeners and child processes received `EPERM`; the permitted rerun above passed completely.
- Disposable MongoDB replica set: **10 files, 64 tests passed**.
- Client unit: **49 files, 459 tests passed**.
- Chromium broad run: **65/73 files and 808/820 tests passed** before focused triage. The confirmed Sprint 5 crash and its four affected tests pass after correction; four unrelated expectations remain in three files.

## Deployment boundary

This is local synthetic acceptance, not production approval. Production still needs HTTPS, restrictive-NAT/TURN validation, service-token rotation, proxy/header review, resource measurements, monitoring, backup/restore, and rollback verification. Support v2 and guest-history linking must remain blocked until Web owns and implements the reviewed consumer/handoff contract.
