# Chat ↔ Web identity migration

Status: **PROPOSED/DORMANT**, **BLOCKED ON WEB**, and **REQUIRES MIGRATION** after review. No migration or production write was executed.

## Current identity and session model

Today Chat owns a local `users` document with a stable UUID `id`, unique `username`, bcrypt `password_hash`, role, banned/verified/status fields, profile fields, and timestamps. Messages and memberships reference this Chat `users.id`; those references must never be rewritten merely to adopt Web login.

The `sessions` collection contains a unique session `token`, `user_id`, `created_at`, and `last_seen`. New tokens are stored as `sha256:<64 hex>`; a presented raw cookie is digested for lookup, while the stored digest itself is rejected as a browser credential. Legacy plaintext token rows remain dual-readable and are upgraded to a digest after successful use. The browser cookie is `sid`, `Path=/`, HttpOnly, SameSite=Lax, and Secure on production HTTPS. HTTP applies configurable idle and absolute expiry; session-device revocation deletes the record and closes the matching native WebSocket.

Local `/api/register` and `/api/login` remain active until the platform cutover is approved. This document does not authorize removing them.

## Target invariant

Web is the canonical human identity authority. Chat keeps its existing internal user UUID as the owner key for historical messages, membership, files, read state, and audit references. A verified mapping joins a Web subject to exactly one Chat user; login federation does not merge or rewrite Chat history.

Proposed additive collection:

```json
{
  "id": "uuid",
  "provider": "owj-web",
  "web_user_id": "stable-web-subject",
  "chat_user_id": "existing-chat-uuid",
  "status": "active | revoked | deactivated",
  "revision": 1,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "linked_by_web_user_id": null,
  "revoked_at": null,
  "revocation_reason": null
}
```

Required unique indexes are `id`, `(provider, web_user_id)`, and `chat_user_id`; `(status, updated_at)` supports bounded reconciliation. The one-to-one indexes prevent duplicate/conflicting links. Do not link by username, nickname, name, or phone.

`server/db/platformIdentitySchema.js` implements this schema helper, but it is deliberately absent from the active Mongo schema/startup path and no production collection exists because of this sprint.

## Credential adapter boundary

`createPlatformIdentityAdapter` accepts an injected `verifyCredential` supplied only after Web approves the protocol. The verifier returns normalized, already-verified claims; Chat then enforces:

- exact configured issuer and Chat audience;
- required scopes and expiry;
- active Web subject status;
- registered versus guest identity kind;
- explicit active link for registered users;
- active, non-banned historical Chat account;
- bounded guest conversation capabilities.

The adapter does not parse or mint a JWT, choose a signing algorithm, distribute Web's signing secret, or define token exchange. Recommended Web design is a short-lived, audience-restricted credential verified asymmetrically or a Web BFF exchange. The exact issuer, keys, transport, revocation signal, clock skew, and scope names remain **blocked on Web security review**.

## No-data-loss migration plan

1. **Contract first.** Approve versioned identity claims, audience, scopes, guest capability, service identity, status/revocation, errors, timeout, key rotation, and audit fields. Add producer/consumer contract tests.
2. **Inventory and backup.** Back up the `ouj_chat` database off-host and test restore. Count users, sessions, memberships, message authors, orphan references, duplicate candidate mappings, and banned/deactivated accounts. Do not read production message bodies for identity matching.
3. **Add schema only.** In a maintenance-reviewed release, invoke `ensurePlatformIdentityLinkSchema(db, { enabled: true })`. This creates one new collection and indexes; it does not alter `users`, `sessions`, messages, or membership. Record a reversible migration version.
4. **Verified linking.** Populate links only through an authenticated Web-controlled proof or an operator-reviewed import with immutable source evidence. Conflicts stop the row; never choose by similar username/phone. Keep unlinked Chat users local.
5. **Shadow validation.** With federation runtime still disabled, compare Web verification and link resolution in metrics/audit only. Log identifiers only in approved pseudonymous form; never log credentials.
6. **Cohort cutover.** Enable injected verification and linked login for a small cohort. After successful Web verification, create a normal Chat session for the mapped Chat UUID so existing authorization continues to use membership. Keep local login as a feature-flagged fallback during observation.
7. **Status synchronization.** A disabled/revoked Web user must stop receiving new Chat sessions; revoke relevant active sessions through an authenticated, idempotent Web→Chat command. Mapping revocation never deletes history.
8. **Expand, then retire.** Expand only after authentication, WebSocket, SSE, support, upload, and rollback tests pass. Retirement of local registration/password login is a separate change with user communication and recovery design.

## Guest identity

Guests are not stored as independent Chat password accounts. Web issues or exchanges a short-lived guest capability whose audience is Chat, scope includes `support:conversation`, and conversation list contains only the visitor's support conversation. Chat verifies it on each adapter request. Guest capability does not grant directory, public-channel, administration, CRM, or arbitrary conversation access.

Whether a support conversation uses an ephemeral Chat actor record or a dedicated guest-subject reference is still a schema decision. It must preserve message authorship, retention, moderation, and deletion semantics without creating a second Web identity store.

## Rollback

- Disable federation/support feature flags; keep local Chat login and existing sessions available.
- Stop creating mappings; do not delete Chat users, messages, memberships, or session history.
- Revoke only credentials/sessions proven affected by the failed rollout.
- The additive collection can remain dormant. Dropping it is optional and only after backup, reconciliation, and confirmation that no release consumes it.
- Roll back the application image independently from data. Never rename/drop `users`, rewrite author IDs, or bulk-merge accounts.

## Acceptance gates

- Unique-index and migration idempotence tests pass on a dedicated Mongo replica set.
- Link, conflict, revoked/deactivated, wrong issuer/audience/scope, expired, banned Chat account, and guest-capability tests pass.
- Old messages and membership resolve to the same Chat UUID before and after login cutover.
- Local-session rollback, WebSocket/SSE reconnect, session revocation, and multiple-device behavior pass.
- Web contract, key rotation, incident rollback, monitoring, and support ownership are signed off before production enablement.
