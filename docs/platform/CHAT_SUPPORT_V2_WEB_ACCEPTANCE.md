# Support v2 Web acceptance

Date: 2026-11-23

Status: **Chat backend unit/API acceptance passed; actual Web widget acceptance is blocked.**

Starting revisions: Chat `0397bd32da4d653bc237d47f33f3223e393683f4`; Web `825deb1dec989e390ac8048310db790c5f111e8f`.

## Verified in Chat

The complete server suite passed all **18 Support v1 tests** and all **5 Support v2 lifecycle tests**. Covered backend behavior includes scoped session exchange, current/history separation, new case, eligible reopen, case-specific message isolation, explicit guest-link intent, logout/revocation, and retained v1 compatibility.

This is unit/API evidence. It is not actual Web widget evidence.

## Actual Web blocker

The tested Web harness exposes only `/support/v1`, and its widget does not call the Support v2 exchange/current/history/new/reopen/message/unread/replay/logout surface. Chat cannot prove a Web flow that Web does not yet consume, and this repository is not authorized to edit Web.

## Cross-host guest-history blocker

The current `link-registered` operation expects both the guest v2 support cookie and the native federated Chat `sid` on one request. These cookies are deliberately host-only on different subdomains, so a browser cannot send both to one host. Sharing either cookie across origins or exposing a bearer token to frontend JavaScript would weaken the security model and was not implemented.

A reviewed additive handoff must be owned jointly with Web and provide:

1. server-side verification of the guest session and registered Web identity;
2. verification of the exact native Chat identity link;
3. a short-lived, audience- and purpose-bound one-time proof;
4. cross-origin CSRF binding, atomic consumption, expiry, and replay rejection;
5. exact intended-account binding with no username/email/phone merge;
6. conflict rules when guest and registered identities both have active cases;
7. preserved authorship/history and unchanged Support v1 behavior;
8. success and hostile browser/contract tests in both repositories.

Until that contract exists, the cross-host link and actual Support v2 Web acceptance remain **blocked**, not deferred-as-complete.

## Commands and evidence

```bash
npm --prefix server run test
```

The permitted complete run passed **147 files and 1,239 tests**, including `test/api/support.test.js` and `test/api/supportV2.test.js`. No Web or Analytics source was modified, and no external support or identity provider was contacted.
