# Chat call end-to-end report

Date: 2026-11-23

Status: **local functional WebRTC evidence, not a production reliability claim**.

## Real two-user browser check

`client/test/e2e/call-two-users.mjs` (`npm run test:e2e:call`) launches real Chromium with two isolated browser contexts/pages, Alice and Bob. Each side creates a real `RTCPeerConnection`; synthetic oscillator audio and canvas video provide deterministic media without a physical camera or microphone.

The recorded run verified:

- offer creation and delivery;
- answer creation and delivery;
- peer connection establishment;
- one remote audio and one remote video track;
- audio mute (`enabled=false`);
- camera off (`enabled=false`);
- hangup and peer closure.

The machine-readable synthetic result mirror is [`fixtures/chat-sprint4-v1/call-e2e-result.json`](./fixtures/chat-sprint4-v1/call-e2e-result.json).

## Supporting regression evidence

| Check | Result |
|---|---|
| Full server suite | 146 files, 1,234 tests passed |
| Complete disposable MongoDB suite | 10 files, 64 tests passed, including native-auth and guest-history conversion against a real replica set |
| Complete client unit suite | 48 files, 457 tests passed |
| Focused Chromium Sprint 4 component runs | 6 files, 35 tests passed, including the CRM no-message-content regression |
| Call/server coverage within server suite | Call API, call manager, and WebSocket signaling paths passed |
| Federated call scope regression | The corrected call guard denies a Web-federated session without `chat:call` and accepts one with that scope |
| Focused call/media/security audit | 10 files, 83 tests passed: call/media authorization, private media access, upload callback ownership/retry, queue, and deployment-security checks |
| Client build and lint | Passed |

The 35 focused browser tests covered the relevant authentication UI, auth alert, Chat header, CRM task modal, speaker/media integrity, and group-call components. Firefox was not rerun because its executable was not present in the local browser cache; this report claims Chromium evidence only.

## What this does not prove

The E2E script uses `iceServers: []` and two local loopback browser contexts. It does not prove TURN credential handling, TLS termination, restrictive NAT/firewall traversal, WAN loss/reconnect behavior, capacity, or production signaling availability. Production WebRTC still requires a secure HTTPS context and a correctly configured TURN service, preferably with TLS and appropriately rotated credentials.

Incoming/reject/busy/group UI paths have component and server regression coverage where listed, but the two-user script is limited to offer/answer/connect/media-controls/hangup. A full deployed Web ↔ Chat browser journey through the real proxy, identity system, signaling route, TURN, and production-like networks remains a deployment acceptance task.

