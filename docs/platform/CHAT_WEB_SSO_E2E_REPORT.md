# Chat ↔ Web SSO end-to-end report

Date: 2026-11-23

Starting revisions: Chat `0397bd32da4d653bc237d47f33f3223e393683f4`; Web `825deb1dec989e390ac8048310db790c5f111e8f`. Chat had uncommitted Sprint 5 changes during acceptance.

## Result

**Passed: actual Web-integrated and actual Chrome browser-integrated in the isolated port-28088 harness.**

The guarded browser flow used three distinct synthetic Web identities. It opened Chat unauthenticated, initiated Web authorization, returned to the exact Chat callback, verified the host-only `HttpOnly` transaction cookie, exchanged the one-time code, and received an opaque federated Chat session—not a Web JWT session.

The authorized pair created a direct conversation and sent a real Chat message. The peer loaded that conversation, while the unrelated third identity could not see it. A second tab reused the same Chat session. After Chat-only restart both tabs and the peer session remained valid; logout revoked both tabs.

The flow did not auto-match or merge accounts by username, phone, or email. Exact existing links were reused; repository and disposable-Mongo coverage exercises isolated first-time provisioning and link conflicts.

## Current permission model

- `chat:access` permits native Chat federation.
- `chat:call` is checked by call endpoints and reflected in the UI.
- `chat:staff` and `chat:admin` remain Web authorization facts only; they do not overwrite the native Chat database role.
- Native Chat owner/admin permissions remain authoritative and default-deny.
- CRM UI appears only while a current delegated Web capability exists.
- Definitive Web revocation removes the Chat session. Status outage fails closed and never grants access.

## Negative and lifecycle evidence

Web's actual provider verifier passed SSO exchange/replay protection, revocation, delegated actor, CRM idempotency, and failed-assignment checks. Existing Chat tests cover wrong PKCE, state/redirect, expiry, conflicting links, demotion/deactivation, and unavailable status. The browser flow additionally proved unrelated-user isolation and session revocation across tabs.

## Commands

```bash
# Run from the Web repository; the script refuses any target other than the synthetic marker/port/databases.
zsh -a -c 'source integration/.env.synthetic; node ../chatamlak/client/test/e2e/web-sso-crm-platform-flow.mjs'

docker compose --project-name owj-sprint4-synthetic \
  --env-file integration/.env.synthetic \
  -f integration/compose.yaml \
  -f integration/synthetic.compose.yaml \
  -f /tmp/owj-sprint5-chat.override.yaml \
  exec -T web node /app/verify-web-sprint4.mjs
```

Browser output classified SSO as `actual-web-browser-integrated`; the Web verifier reported `PASS` for native SSO provider, revocation, delegated actor, CRM idempotency, and failed assignment.

## Limits

This proves the local synthetic deployment only. It does not prove production TLS, secret rotation, Internet latency, multi-node behavior, or production identity data. Web/Analytics source was not changed.
