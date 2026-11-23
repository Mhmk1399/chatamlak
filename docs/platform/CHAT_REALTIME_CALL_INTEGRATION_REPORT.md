# Realtime call integration report

Date: 2026-11-23

Starting revisions: Chat `0397bd32da4d653bc237d47f33f3223e393683f4`; Web `825deb1dec989e390ac8048310db790c5f111e8f`.

## Result

**Passed: actual federated application sessions, actual Chat WebSocket/reverse-proxy signaling, and local browser WebRTC loopback media.** This is explicitly local-only calling, not production NAT/TURN acceptance.

Two synthetic Web identities signed in through the real SSO callback, opened an authorized direct conversation, and used authenticated WebSockets through `chat.owj.localhost:28088`. The run verified:

- voice invitation, incoming event, and acceptance;
- SDP offer/answer relayed by the real Chat call manager;
- connected peer sessions with synthetic oscillator audio and canvas video;
- mute then unmute;
- camera enable and disable state relay;
- hangup and no remaining incoming-call server state;
- a third, nonmember federated user received a call authorization error;
- Chat-only restart retained the opaque sessions and durable message; CRM retry also remained safe.

## Defect found and corrected

The native client sends WebSocket start type `voice`, while the gateway accepted only `audio` or `video`. A regression test first reproduced the rejected voice signal. The gateway now accepts `voice`, `video`, and legacy `audio`. The focused gateway test passes 4/4, and the actual federated browser call passes afterward.

## Evidence

```bash
npm --prefix server exec vitest run test/lib/websocketGateway.call.test.js
zsh -a -c 'source integration/.env.synthetic; node ../chatamlak/client/test/e2e/web-sso-crm-platform-flow.mjs'
```

The guarded browser output classified the call as `actual-federated-session-websocket-loopback-media`. The full server suite also passed 33 call API tests and 45 call-manager tests as part of **1,239/1,239** tests.

## Production requirements

Before production acceptance:

- serve Web and Chat over HTTPS and use `wss`;
- configure authenticated TURN with bounded credentials and verify UDP/TCP/TLS paths;
- test restrictive NAT, firewall, mobile network changes, reconnect, denied media permissions, and peer disappearance;
- monitor signaling errors, call setup latency, ICE outcomes, and TURN health without logging SDP, credentials, or message content;
- preserve `chat:call` current-state checks and native conversation membership on every call action.

No live TURN infrastructure was contacted. Local loopback success does not establish Internet traversal or production media reliability.
