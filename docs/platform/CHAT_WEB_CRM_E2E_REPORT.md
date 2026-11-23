# Chat → Web CRM end-to-end report

Date: 2026-11-23

Starting revisions: Chat `0397bd32da4d653bc237d47f33f3223e393683f4`; Web `825deb1dec989e390ac8048310db790c5f111e8f`. Chat contained uncommitted Sprint 5 compatibility corrections.

## Result

**Passed: actual Web-integrated and actual browser-integrated through Chat's protected endpoint and Web's owning CRM endpoint.**

The federated browser called `POST /api/integrations/crm/tasks`; Chat called Web's `POST /api/internal/v1/crm/tasks` with the current delegated actor proof and service identity. No Web database was accessed directly.

Verified behavior:

- source conversation membership checked by Chat;
- current Web actor/assignment policy checked by Web;
- required `dueAt`, bounded subject/instructions/steps, and canonical Web task link/ID returned;
- no transcript, message body, customer contact, phone, or broadly scoped identity data forwarded;
- first command returned success only after Web acknowledged the mutation;
- the same idempotency key and payload, retried after Chat-only restart, returned the same task with `deduped: true`;
- the same key with a changed payload returned `409`;
- Web's verifier passed revoked/delegated actor and failed-assignment behavior.

## Compatibility corrections

Chat now accepts Web's real delegated proof envelope `{ token, expiresInSeconds }` while retaining the legacy string shape. Flat Web errors such as `{ error: "TOKEN_REVOKED" }` are normalized alongside the older nested shape. A refresh with no new proof writes `null`, preventing reuse of stale authorization. The UI requires `crmTaskAllowed` and reconstructs a stable session-scoped key from a hash of the conversation/task intent without persisting task content.

## Evidence levels

| Level | Evidence |
|---|---|
| Unit/API | CRM command, client, route membership, error normalization, proof clearing, and UI request allowlist |
| Disposable MongoDB | Delegated proof persistence and clearing across native Web session refresh |
| Actual Web-integrated | Web provider verifier plus real internal CRM command |
| Actual browser-integrated | Chat UI session → Chat API → Web CRM, including restart retry and conflict |

## Command

```bash
zsh -a -c 'source integration/.env.synthetic; node ../chatamlak/client/test/e2e/web-sso-crm-platform-flow.mjs'
```

The guarded script ran only with project `owj-sprint4-synthetic`, port `28088`, the three `_e2e` databases, and marker `owj-sprint4-synthetic-only-v1`.

## Limits and rollback

The session-scoped key store is bounded and contains only key/fingerprint/time metadata. Web remains the durable idempotency and task owner. Rolling back the Chat UI helper removes cross-modal retry reconstruction but does not mutate Web tasks or schemas. Production timeouts, token rotation, and operational alerts remain deployment work.
