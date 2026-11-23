# Native Chat ↔ Web SSO v1

Status: **implemented on the Chat side and locally tested**. Owj Web is the identity authority; Chat issues and owns its own opaque session.

## Modes and configuration

`OWJ_CHAT_NATIVE_AUTH_MODE` is `federated` or `local_test`. The runtime default is `local_test` under tests and `federated` otherwise. `.env.example` selects `federated`; `docker-compose.local.yaml` explicitly selects `local_test` with `APP_ENV=development`. Startup rejects `local_test` when `APP_ENV=production`.

Federated mode requires:

| Variable | Purpose |
|---|---|
| `OWJ_CHAT_NATIVE_WEB_AUTHORIZE_URL` | Browser form POST target, normally Web `/api/v1/chat/authorize` |
| `OWJ_CHAT_NATIVE_WEB_EXCHANGE_URL` | Server exchange endpoint, Web `/api/internal/v1/chat/exchange` |
| `OWJ_CHAT_NATIVE_WEB_STATUS_URL` | Server current-state endpoint, Web `/api/internal/v1/chat/identity/status` |
| `OWJ_CHAT_NATIVE_REDIRECT_URI` | Exact callback URI; optional when it can be derived as `/auth/web/callback` from `APP_PUBLIC_URL` |
| `OWJ_CHAT_NATIVE_TO_WEB_SERVICE_TOKEN` | Dedicated Chat-native → Web Bearer credential, at least 32 characters |

URLs must use HTTPS. HTTP is allowed only outside production with `OWJ_WEB_ALLOW_INSECURE_HTTP=true`.

## Browser and server flow

1. `POST /api/auth/web/start` creates a five-minute transaction. Chat generates state, a PKCE verifier/challenge (`S256`), and a separate browser token. It stores only the state/browser digests plus the verifier and exact redirect URI in `native_web_auth_transactions`.
2. Chat returns the Web authorization URL and form fields: `version=1`, exact `redirectUri`, `state`, `codeChallenge`, and `codeChallengeMethod=S256`. The SPA performs a cross-origin form POST; it does not use an API bearer token.
3. Chat sets host-only `owj_chat_auth_tx`, `HttpOnly`, `SameSite=Lax`, path `/api/auth/web`, and `Secure` under production HTTPS.
4. Web returns the browser to `/auth/web/callback`. The SPA posts only `code` and `state` to `POST /api/auth/web/callback`; the transaction cookie binds the browser. Chat atomically consumes the transaction once.
5. Chat exchanges the code server-to-server at Web using `Authorization: Bearer <server-only>`, `X-Owj-Service: owj-chat-native`, and `{version:1,code,redirectUri,codeVerifier,state}`.
6. After an active authorization response, Chat resolves/provisions the exact link and issues its own opaque `sid` cookie. The Web authorization code, Web service credential, and Web authorization response are never made into browser credentials.

The Web exchange/current-state success shape is version 1 and includes the exact `subject`, `accountStatus:"active"`, `scopes`, authorization/session timestamps, a cache instruction from 0 through 60 seconds, and an optional short-lived `crmActorAuthorization`. Accepted scopes are `chat:access`, `chat:call`, `chat:staff`, and `chat:admin`; `chat:access` is mandatory.

## Session revalidation and authorization

Federated Chat sessions record `auth_kind=web_federated`, Web subject/scopes, authorization establishment/check times, Web session expiry, cache bound, and optional CRM actor proof. Chat calls Web status with:

```json
{
  "version": 1,
  "subject": "507f1f77bcf86cd799439011",
  "authorizationEstablishedAt": "2026-11-23T08:00:00.000Z",
  "crmActorAuthorization": "<optional-server-only-proof>"
}
```

The local authorization cache never exceeds 60 seconds. Sensitive actions may force refresh. `401`, `403`, `404`, or `410` definitive denial removes the Chat session. Timeout, malformed response, and other transient upstream failures fail closed for the request but do not mislabel the session as definitively revoked.

Federated calls require `chat:call`. Web scopes describe Web authorization only: `chat:admin` does not promote the linked Chat user to native admin or owner.

## Explicit identity-link policy

- An active exact `platform_identity_links` record is reused.
- A verified Web subject with no link receives a new isolated Chat account and a one-to-one link. Its internal username is collision-resistant; it is not matched from profile data.
- Chat never auto-links or merges by username, email, nickname, phone, or message content.
- A historical independent native Chat account keeps its UUID and history. Linking it requires a separate explicit verified/approved workflow; ordinary SSO does not silently claim it.
- Conflicting, revoked, or disabled links fail closed. Web subject and Chat user mappings are one-to-one and audited.

## Local-test compatibility and UI

In `local_test`, existing `/api/login` and `/api/register` remain usable and Web SSO start returns `WEB_FEDERATION_DISABLED`. Application info exposes the auth mode and registration is disabled in federation. The UI distinguishes “Sign in with Owj” from “Native test mode” and provides loading, access-denied, expired, unavailable, linked, and account-link-required states with RTL/dark-mode support, alert/status semantics, and controls at least 44 px high.

See the synthetic start/exchange/status cases in [`fixtures/chat-sprint4-v1/native-web-sso.json`](./fixtures/chat-sprint4-v1/native-web-sso.json).

