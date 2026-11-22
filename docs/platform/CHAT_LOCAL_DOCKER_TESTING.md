# Owj Chat local Docker testing

Status: `docker-compose.local.yaml` remains the Chat-owned disposable topology. On 2026-11-21 the separately Web-owned shared Compose harness passed synthetic Web+Chat/proxy acceptance after Web was rebuilt from its aligned source. Browser automation, production deployment, capacity, and a real previous-key rotation remain unproven.

## Sprint 2.5 evidence boundary — 2026-11-21

| Check | Current evidence |
|---|---|
| Focused status/session/API/fixture checkpoint | Passed 55/55; the fixture file contributed 7 tests already included in 55 |
| Full server suite | Passed 141 files / 1,215 tests after fixture exactness and two guest/registered live-`actorKind` regression cases were added |
| Real MongoDB suite | Passed 9 files / 58 tests, including media-job 2/2 and support assertion-metadata round trip 4/4 |
| Shared Web+Chat Compose | Web, Chat, MongoDB replica set and Nginx reached healthy state; named volumes retained |
| Actual registered/staff/revocation flows | Synthetic flows passed, including `401 SUPPORT_SESSION_REVOKED` after a temporary Web-owned revocation marker |
| Reverse proxy, browser WS/SSE, cookie forwarding | HTTP cookie, strict Origin, SSE and native WS passed through Nginx; browser automation remains pending |
| Production deployment/capacity | Not run and not authorized |

The Sprint 2 server/Mongo/worker/client/browser numbers in older handoffs remain useful history but are not Sprint 2.5 proof.

### Shared-harness acceptance — 2026-11-21

The Web-owned harness used one MongoDB replica set, separate `owj_web`/`owj_chat` credentials and logical databases, one Web container, one Chat container and one Nginx proxy. A stale Web image first returned the legacy status error; rebuilding only Web and recreating it resolved the mismatch. Nginx initially started before the recreated Web DNS name existed, then passed after a targeted proxy restart. No volume was deleted and `down --volumes` was never used.

Observed synthetic checks: guest HMAC/RS256 bootstrap and scoped cookie; message `201`, exact retry `200`/deduped, different-body `409`; Guest B isolation; WS resume and SSE replay with strict Origin; staff queue/assign/reply; registered resume/history; status response exactness; current-state revocation; logout invalidation; and independent Chat stop/start with Web remaining HTTP 200 and history surviving. This is local functional evidence, not production capacity or browser-run evidence.

## Recorded local validation — 2026-11-20

The final Sprint 2 local run produced this evidence:

| Check | Observed result |
|---|---|
| Compose render | `config --quiet` passed with synthetic credentials stored under `/tmp` |
| Image | Final Docker image rebuild passed |
| Startup | MongoDB, Chat, and the media worker were healthy |
| Application containers | Chat and worker non-root/read-only-root checks passed; the intended named data volume was writable |
| MongoDB topology | `ouj-rs` had a primary |
| Database authorization | The Chat user had exactly `readWrite` on `ouj_chat`; a read from `ouj_business_local` was denied with MongoDB code 13 |
| Integration case 20 | A repository message was written, only Chat was restarted, and the same message was read back: passed |
| Media-job restart persistence | Not run; message persistence does not prove media-job recovery |
| Integration case 21 | Separate Chat database authorization and cross-database denial: passed |
| Integration case 23 | Reverse-proxy cookie/SSE/native-WebSocket behavior: not run |
| Integration case 24 | Partial: Chat restart/readback passed, but no Web process was running to prove Web availability |
| Shutdown | Normal `down` completed and retained all three named volumes |

This validates CHAT-S2-10 only within the standalone Chat-owned local topology. It is not actual Web+Chat integration, a reverse-proxy result, a performance benchmark, production deployment evidence, or proof of media-job persistence.

## Topology and limits

```text
shared local Web/proxy harness (not in this repository)
                    │
          ouj-platform-internal
                    │
        ┌───────────┼─────────────┐
        │           │             │
   chat:5174   media-worker:8080  mongo:27017
        │                           │
        └──── chat-data       mongo-data/keyfile
```

No service in this file publishes a host port. A shared local Web/proxy container must join the named `ouj-platform-internal` network and route only the required Chat paths. Do not add a second Nginx on host ports 80/443.

| Service | Runtime limit | Security posture |
|---|---:|---|
| `chat` | 400 MiB, 0.75 CPU, 256 PIDs | uid 1000, read-only root, `/tmp` tmpfs, all capabilities dropped |
| `media-worker` | 600 MiB, 1 CPU, 256 PIDs | uid 1000, read-only root, `/tmp` tmpfs, all capabilities dropped |
| `mongo` | 1536 MiB, 1.25 CPU, 256 PIDs | authenticated single-node `ouj-rs`, internal port only |

These are provisional test ceilings. Measure RSS, CPU, event-loop delay, MongoDB latency, pool use, and API p95 before copying or tightening them for production.

Chat and the worker drop all Linux capabilities. The official MongoDB entrypoint retains only `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, and `SETUID` so it can initialize ownership on a fresh named volume; those capabilities are not granted to the application containers.

The topology uses MongoDB database `ouj_chat` and a dedicated application user with `readWrite` only on that database. Transactions work because the local MongoDB runs as a single-node replica set. It is still one MongoDB process and provides no CPU/I/O isolation from other logical databases.

The Chat multi-stage image uses Node 24 on Debian Bookworm slim; the standalone worker uses Node 24 Alpine with ffmpeg. The MongoDB server image defaults to `${MONGO_IMAGE:-mongo:8.2.7}`; the replica-set init helper uses the MongoDB 8.0 client image and the other init helpers use Alpine 3.22. The server default was selected because `mongo:8.0.34` refused the current Ubuntu host kernel 7.0.0 during local validation. Override `MONGO_IMAGE` only with another locally verified MongoDB 8 image. The repository requirement remains Node `>=24.18.0` and npm `>=11.18.0` for host-side commands.

## Prerequisites

- Ubuntu with Docker Engine and the Compose v2 plugin.
- Enough free disk for the Node 24 build layers, MongoDB 8 image, worker/ffmpeg image, and named volumes.
- No production `.env`, credentials, database URI, data volume, or object-store keys.
- Synthetic credentials generated specifically for this disposable environment.

Check tooling:

```bash
docker version
docker compose version
docker system df
```

Do not run `docker system prune --volumes`; unrelated developer data may share the Docker host.

## Create a local-only environment file

Create a file outside version control, for example `/tmp/ouj-chat-local.env`, with every placeholder replaced by a local synthetic value:

```dotenv
MONGO_REPLICA_SET_KEY=<at-least-32-random-base64-safe-characters>
MONGO_IMAGE=mongo:8.2.7
MONGO_INITDB_ROOT_USERNAME=local_root
MONGO_INITDB_ROOT_PASSWORD=<long-uri-safe-local-password>
MONGO_CHAT_USER=local_ouj_chat
MONGO_CHAT_PASSWORD=<different-long-uri-safe-local-password>
WEBHOOK_SECRET=<at-least-32-random-characters>

# Keep support disabled for the standalone smoke test.
OWJ_SUPPORT_ENABLED=false
```

Hex output is URI-safe for the embedded MongoDB password:

```bash
openssl rand -hex 48
```

Use a different generated value for every secret. Restrict the file:

```bash
chmod 600 /tmp/ouj-chat-local.env
```

Never copy real Web service tokens, signing keys, MongoDB credentials, or user data into this file.

## Validate configuration before starting containers

From the repository root:

```bash
export CHAT_LOCAL_ENV=/tmp/ouj-chat-local.env
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml config --quiet
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml config --services
```

Expected services are `mongo-keyfile-init`, `mongo`, `mongo-rs-init`, `volume-init`, `chat`, and `media-worker`. Review the rendered configuration locally, but do not paste it into tickets or logs because it contains substituted secrets.

Confirm that `chat`, `media-worker`, and `mongo` use `expose` rather than `ports`, that the application containers have `read_only: true`, and that no Docker socket is mounted.

## Build and start

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml build chat media-worker
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml up -d
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml ps
```

Wait until `mongo`, `chat`, and `media-worker` are healthy and both init jobs have exited successfully. If a service is unhealthy, inspect only a bounded tail and redact before sharing:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml logs --tail=150 mongo-rs-init chat media-worker
```

Expected startup properties:

- `mongo-keyfile-init` creates a mode-0400 key owned by MongoDB's container user;
- `mongo-rs-init` initializes `ouj-rs` idempotently and creates the dedicated `ouj_chat` user if absent;
- `volume-init` makes `/app/data` writable by uid/gid 1000;
- Chat connects with that dedicated user, verifies/creates its own schemas and indexes, and starts on internal port 5174. An exactly matching existing media-job validator skips `collMod`; a mismatched validator requires an explicit, reviewed, privileged one-time `collMod` migration before ordinary runtime startup. Do not grant database-administration privileges to the Chat runtime user;
- the worker starts separately on internal port 8080 with signed requests required and loopback job destinations denied.

## Health, replica set, and isolation checks

Probe from inside the private network:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "fetch('http://127.0.0.1:5174/api/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "fetch('http://media-worker:8080/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
```

Check replica-set state without printing passwords:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T mongo sh -lc \
  'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "const s=rs.status(); printjson({set:s.set, primary:s.members.find(m=>m.stateStr===\"PRIMARY\")?.name})"'
```

Expected set name is `ouj-rs` with `mongo:27017` as primary. Inspect only user names and roles in `ouj_chat`:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T mongo sh -lc \
  'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin ouj_chat --eval "printjson(db.getUsers().users.map(u=>({user:u.user,roles:u.roles})))"'
```

Verify the non-root/write boundary with a disposable probe:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat id
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T media-worker id
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "const f=require('fs');const p='/app/data/.permission-probe';f.writeFileSync(p,'ok',{mode:0o600});f.unlinkSync(p);console.log('data volume writable')"
```

Both application containers should report uid 1000. The data-volume write must pass; writing elsewhere on the read-only image should not be used as an acceptance step because it intentionally fails.

Confirm there is no host publication (an empty result is expected):

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml port chat 5174
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml port media-worker 8080
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml port mongo 27017
```

## Resource smoke test

Under a small synthetic workload, collect:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml stats --no-stream
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml top
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml exec -T chat \
  node -e "console.log(process.memoryUsage())"
```

Run bounded support/replay/media traffic, not a citywide or unbounded load generator. Record container restarts/OOMs, Chat API p95, event-loop delay, MongoDB p95/connections, replay latency, worker queue depth, and disk growth. A container staying below its memory limit during idle is not a production capacity result.

## Optional Web support integration

The Compose file does not provide a mock or actual Web service. To test support, the Web or strict-mock container must join `ouj-platform-internal` and provide:

```dotenv
OWJ_SUPPORT_ENABLED=true
OWJ_WEB_ISSUER=http://<web-service>:<port>
OWJ_WEB_JWKS_URL=http://<web-service>:<port>/.well-known/jwks.json
OWJ_WEB_STATUS_URL=http://<web-service>:<port>/api/internal/v1/identity/status
OWJ_WEB_TO_CHAT_SERVICE_SECRET=<matching-inbound-hmac-secret-at-least-32-characters>
OWJ_CHAT_TO_WEB_SERVICE_TOKEN=<matching-directional-token-at-least-32-characters>
OWJ_SUPPORT_ALLOWED_ORIGINS=http://<browser-visible-web-origin>
OWJ_WEB_ALLOW_INSECURE_HTTP=true
```

Plain HTTP is local development only. Production startup must require HTTPS URLs and must not enable `OWJ_WEB_ALLOW_INSECURE_HTTP`.

The Web BFF—not browser JavaScript—must sign bootstrap requests and receive the opaque credential. It must set `owj_support_sid` with `Path=/support/v1`, `HttpOnly`, `SameSite=Lax`, and `Secure` under HTTPS. Test strict Origin behavior, cookie forwarding, logout clearing, SSE no-buffering, and native WebSocket upgrade through the real local proxy.

Do not call this “actual Web integration” when the issuer/status service is only a strict mock.

The machine-readable Chat contract is `docs/platform/fixtures/support-v1/manifest.json`. The Web container must match the frozen status request `{subject,tokenIssuedAt,jti}` and the success response containing flat `subject`, `status`, `role`, `support.allowed`, `support.staff`, `authorizationCacheMaxAgeSeconds`, and `checkedAt`.

The first request to the stale Web image still returned the former legacy-schema error. Chat was not weakened. After Web was rebuilt, the live route accepted `{subject,tokenIssuedAt,jti}`, returned lowercase Web roles and the exact flat status/support/cache response, and enforced `authRevokedBefore` in the synthetic revocation flow.

## Restart and persistence acceptance

Use synthetic accounts/messages only:

1. Bootstrap a synthetic registered or guest support session through Web/the strict mock.
2. Send a message with a unique `clientRequestId`; record its returned `messageId` and replay cursor.
3. Restart only Chat:

   ```bash
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml restart chat
   ```

4. Wait for health, re-bootstrap if the cookie/session contract requires it, and retrieve the same message. Resume realtime from the saved cursor and verify no duplicate.
5. Queue a synthetic media job that is safe for the local worker, restart Chat while it is pending/processing, and verify MongoDB reclaims or completes it without duplicate publication.
6. Restart MongoDB, bring dependencies back to healthy, and repeat the message retrieval:

   ```bash
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml restart mongo
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml up -d
   docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml ps
   ```

7. Verify Web remains available while Chat restarts in the shared harness and that the widget shows a bounded reconnect state.

Health after restart proves process recovery, not message/media durability; record the retrieved message/job evidence separately.

In the recorded 2026-11-20 run, the repository message write → Chat-only restart → readback path passed. The media-job restart step was not run, realtime-cursor resumption was not separately claimed, and no Web process was present; therefore case 24 remains partial.

## Stop, retain, or destroy local data

Normal stop keeps named volumes:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml down
```

To resume later, run `up -d` with the same local env values; changing the MongoDB credentials does not rewrite the existing user in an already initialized volume.

Only after confirming the project and all data are disposable, destroy **this Compose project's** volumes:

```bash
docker compose --env-file "$CHAT_LOCAL_ENV" -f docker-compose.local.yaml down --volumes
```

That last command permanently removes local Chat/MongoDB/keyfile volumes and cannot be used as a routine reset. It has no production purpose.

## Acceptance record template

Record exact command, time, source revision (by the human operator), and output summary:

| Check | Required evidence |
|---|---|
| Compose render | `config --quiet` exits 0 |
| Build | both final images complete from current source |
| Startup | init jobs exit 0; Mongo/Chat/worker healthy |
| Replica/user | `ouj-rs` primary; dedicated `ouj_chat` role only |
| Isolation | no host ports/socket; non-root/read-only boundaries pass |
| Permissions | uid 1000 writes and removes data-volume probe |
| Support proxy | cookie, strict Origin, SSE, native WS upgrade pass |
| Restart | message and replay cursor survive Chat restart |
| Durable media | pending job recovers without duplicate/ loss |
| Resources | RSS/CPU/p95/connection/queue/disk observations recorded |

For a new source revision, do not carry these results forward: rerun the checklist. The shared Web/proxy functional gate passed on 2026-11-21; browser automation, full Docker worker/FFmpeg interruption, real previous-key rotation, resource observations, and production-capacity gates remain open.
