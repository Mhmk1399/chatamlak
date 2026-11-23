# Chat support lifecycle v2

Status: **implemented as an additive customer lifecycle API**. Support v1 remains registered and retains its existing bootstrap, staff, SSE, and native WebSocket contracts.

## V1-preserving session exchange

The frozen v1 cookie remains `owj_support_sid` scoped exactly to `/support/v1`; Sprint 4 does not widen its path. After Web has obtained the already-issued opaque `supportSessionCredential`, it calls `POST /support/v2/session` with that credential in the JSON body. Chat validates `read` authorization and returns `{version:2,ok:true,expiresAt}` while setting a separate host-only `owj_support_v2_sid` cookie with `HttpOnly`, `SameSite=Lax`, path `/support/v2`, and `Secure` under HTTPS. All routes below authenticate from that v2 cookie.

`POST /support/v2/logout` is locally idempotent: it revokes the support session when available, disconnects its realtime connections, and clears `owj_support_v2_sid` on the same `/support/v2` path. The endpoint remains usable when the session has already expired or upstream authorization is unavailable.

## Case model

Support v2 allows one owner to have history plus at most one active (`open` or `assigned`) case. `owner_identity_key` supports multiple cases; legacy v1 `identity_key` records remain visible during current/history selection. Case creation uses a unique partial `create_idempotency_digest`. Customer unread counts use bounded work over at most 100 cases and a customer-read timestamp.

`GET /support/v2/cases` returns:

```json
{
  "version": 2,
  "current": { "conversationId": "case_current_01", "caseNumber": 2, "status": "open", "unreadCount": 0, "current": true, "reopenedAt": null },
  "history": []
}
```

The exact normalized case fields may include status, case number, unread count, whether it is current, and reopen time. The support session remains the authorization boundary.

## Routes and lifecycle rules

| Route | Rule |
|---|---|
| `POST /support/v2/session` | Exchange the already-issued opaque support credential for the separate v2-scoped `HttpOnly` cookie; does not alter the v1 cookie contract |
| `POST /support/v2/logout` | Revoke when possible, disconnect the session, and clear the v2 cookie idempotently |
| `GET /support/v2/cases` | Return only the authenticated customer/guest's current case and history |
| `POST /support/v2/cases` | Requires support `send` authorization and `Idempotency-Key`; optional allowlisted locale/context; rejects while an active case exists; creates an independent case after resolution/closure |
| `POST /support/v2/cases/:conversationId/reopen` | Requires owner, resolved/closed target, no other active case, and `Idempotency-Key`; resets the case to open and unassigned |
| `GET /support/v2/cases/:conversationId/messages` | Owner-authorized, bounded pagination; marks the case read |
| `POST /support/v2/cases/:conversationId/messages` | Owner-authorized and lifecycle-checked; preserves existing message idempotency rules |
| `GET /support/v2/cases/:conversationId/events` | Bounded JSON replay with cursor, `gap`, and `hasMore`; it is not a new v2 SSE/WebSocket transport |
| `POST /support/v2/link-registered` | Explicit guest-history conversion described below |

Support v1 remains the compatibility realtime surface. Existing v1 SSE/WebSocket behavior was not replaced.

## Guest history linking

Guest conversion is deliberately explicit. The request must contain `{ "intent": "link_guest_history" }`, a stable `Idempotency-Key`, the guest-owned `owj_support_v2_sid` session cookie, and a current Web-federated native `sid`. Chat force-refreshes the native Web authorization and requires the exact active platform link.

On success Chat converts all cases owned by that guest identity to the registered owner and adds the registered Chat membership. If registered history already exists, converted guest cases receive unique following case numbers. Linking is rejected while both sides have an active case, so the one-active-case rule cannot be bypassed. If no registered v1 primary exists, the active or newest converted guest case becomes that resumable primary.

Original guest `actor_id` values remain unchanged and conversion records retain the guest digest, original guest actor, original case number, proof, and conversion time. Message normalization treats both the preserved guest actor and the registered Chat actor as customer authors, so pre-link messages do not become agent messages. Repeating the same completed conversion returns the existing converted count. Unique guest digest and proof/idempotency digests prevent conflicting conversion. The route does not infer identity from names, email, phone, or message text.

## Isolation, compatibility, and errors

Every case, message, replay, and link operation is scoped to the authenticated support identity. Cross-user identifiers do not grant access. Active-case conflicts, invalid reopen state, idempotency mismatch, or guest-link conflict return bounded errors without exposing another case.

This v2 contract is additive: do not remove `/support/v1/*`, alter its cookie/bootstrap contract, or route v2 browser traffic to native Chat login. Wiring the deployed Web widget to current/history/reopen and testing it through the real proxy remains deployment validation.

Synthetic lifecycle and conflict cases are in [`fixtures/chat-sprint4-v1/support-lifecycle-v2.json`](./fixtures/chat-sprint4-v1/support-lifecycle-v2.json).

