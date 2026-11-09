# Environment Variables

:::tip

You can easily configure most of these variables via the admin panel without touching the `.env` file. Visit [Admin Panel](./Admin-Panel.md) for more information.

:::

You can configure environment variables to customize app behavior.

```bash
cd /opt/ouj-chat
cp .env.example .env
nano .env
```

## Configurable values

External channel mirroring is opt-in: `REMOTE_CHANNEL`, `REMOTE_CHANNEL_UI` and `REMOTE_CHANNEL_MEDIA_STREAM` default to `false`; internal Ouj groups and channels remain available.

| Variable | Type | Default | Description |
|---|---|---:|---|
| `OUJ_CHAT_ENV_FILE` | `string` | `.env` | Compose selector for the application's runtime `env_file`; set `.env.production` in the private production file and pass that file with `--env-file`. |
| `SERVER_PORT` | `integer` | `5174` | API server port. (`PORT` is supported as a legacy fallback.) |
| `CLIENT_PORT` | `integer` | `80` | Nginx listen port (what users connect to). |
| `BIND_ADDRESS` | `string` | `localhost` | Network interface to bind to. Use `localhost` for VPS/private networks to avoid exposing backend when firewall is disabled; use `0.0.0.0` for Docker containers. |
| `DATA_DIR` | `string` | `<project_root>/data` | Local upload, backup and runtime-file directory; the MongoDB service manages its own database files separately. |
| `DB_CLIENT` | `string` | `mongodb` | Keep `mongodb`; legacy SQL values are rejected by the active server. |
| `MONGODB_URI` | `string` | `""` | Required private MongoDB replica-set/Atlas connection URI. Intentionally empty in `.env.example`; there is no SQL fallback. See [MongoDB](./MongoDB.md). |
| `MONGODB_DATABASE` | `string` | `ouj_chat` | Active MongoDB application database. Keep it consistent across application instances. |
| `MONGODB_MAX_POOL_SIZE` | `integer` | `20` | Maximum MongoDB client connection-pool size per application process. |
| `MONGODB_CONNECT_TIMEOUT_MS` | `integer` | `10000` | MongoDB server-selection timeout in milliseconds. |
| `NODE_EXTRA_CA_CERTS` | `string` | `""` | Additional trusted CA certificate PEM path when required by the database/network provider. |
| `REDIS_HOST` | `string` | `""` | Optional Redis host. If set, Ouj Chat uses Redis for BullMQ background job queues (media processing), session storage, and pub/sub instead of in-process fallback. |
| `REDIS_PORT` | `integer` | `6379` | Optional Redis port. |
| `REDIS_URL` | `string` | `""` | Optional Redis connection URL (e.g. `redis://user:pass@host:port`). |
| `APP_ENV` | `string` | `production` | Server runtime mode (`production` recommended/default). |
| `APP_DEBUG` | `boolean` | `false` | Enable verbose server debug logs in terminal/stdout (`[app-debug]` lines for message send/upload/transcode/metadata events). |
| `SIGN_UP` | `boolean` | `true` | Allow new accounts to be created via the website (`/signup`). (`ACCOUNT_CREATION` is supported as a legacy fallback.) |
| `ADMIN_PANEL` | `boolean` | `true` | Enable the admin panel interface. When `false`, the admin panel is completely disabled and inaccessible. |
| `FILE_UPLOAD` | `boolean` | `true` | Enable/disable all uploads globally (chat files + avatars). |
| `FILE_UPLOAD_MAX_SIZE_MB` | `integer` | `25` | Per-file upload max size (MB). (`FILE_UPLOAD_MAX_SIZE` is supported as a legacy fallback in bytes.) |
| `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` | `integer` | `75` | Per-message total upload size cap (MB). (`FILE_UPLOAD_MAX_TOTAL_SIZE` is supported as a legacy fallback in bytes.) |
| `FILE_UPLOAD_MAX_FILES` | `integer` | `10` | Max uploaded files in one message. |
| `FILE_UPLOAD_TRANSCODE_VIDEOS` | `boolean` | `true` | Convert uploaded videos to H.264/AAC MP4 and keep only the converted file. Requires `ffmpeg`. |
| `STORAGE_DRIVER` | `string` | `local` | Pluggable storage driver (`local` for local disk, `remote` for remote object storage). See [Object Storage](./Object-Storage.md). |
| `STORAGE_ENDPOINT` | `string` | `""` | S3-compatible service URL (AWS S3, Cloudflare R2, MinIO, ArvanCloud, Wasabi, etc.). |
| `STORAGE_BUCKET` | `string` | `""` | Storage bucket name. |
| `STORAGE_REGION` | `string` | `auto` | Storage bucket region (e.g. `us-east-1`, `eu-central-1`). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | Storage Access Key ID. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | Storage Secret Access Key. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | Optional custom CDN domain URL prefix (e.g. `https://cdn.example.com`). |
| `APP_PUBLIC_URL` | `string` | `""` | Public origin(s) of the app UI (comma-separated) allowed to upload straight to the bucket. Auto-detected when empty. |
| `STORAGE_AUTO_CORS` | `boolean` | `false` | Configure bucket CORS for browser uploads automatically. |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | Expiration time in seconds for presigned URLs. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | Enable path-style URL syntax (`true` recommended for MinIO, R2, ArvanCloud, etc.). |
| `STORAGE_PROXY_URL` | `string` | `""` | Optional HTTP/HTTPS proxy URL for object storage requests. |
| `WORKER_URL` | `string` | `""` | External media processing worker base URL for HTTP push transcoding (e.g. `https://worker.example.com`). |
| `WORKER_PORT` | `integer` | `8080` | Port for the standalone Media Worker service (`worker/`). Ouj Chat uses this port to construct the default local Media Worker URL (`http://127.0.0.1:8080`) when `WORKER_URL` is omitted. |
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | Media processing workflow mode (`auto`, `local`, `remote`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `120000` | Total retry timeout in milliseconds when dispatching transcode jobs to the remote worker before falling back to the local worker (in `auto` mode) or failing the dispatch (in `remote` mode). |
| `WEBHOOK_SECRET` | `string` | *(Auto-generated)* | Secret token (`x-ouj-chat-webhook-secret`) to authenticate dispatch and callback requests between Ouj Chat and the Media Worker. |
| `WEBHOOK_URL` | `string` | `""` | Ouj Chat public webhook callback URL sent to external workers (e.g. `https://ouj-chat.example.com/api/uploads/webhook/processed`). |
| `STORAGE_ENCRYPTION_MODE` | `string` | `remote` | Storage encryption strategy (`remote` for provider-side SSE-S3, `local` for application-level encryption). |
| `MESSAGE_FILE_RETENTION` | `integer` | `7` | Auto-delete uploaded message files after N days (`0` disables). |
| `MESSAGE_TEXT_RETENTION` | `integer` | `0` | Auto-delete text-only messages after N days (`0` disables). |
| `MESSAGE_MAX_CHARS` | `integer` | `4000` | Max message length. |
| `REMOTE_CHANNEL` | `boolean` | `false` | Enable the server-side Remote Channel worker. |
| `REMOTE_CHANNEL_UI` | `boolean` | `false` | Show Remote Channel settings to channel owners in the UI. When `false`, the section is hidden from regular users (and user API calls are rejected) — only server admins can configure mirroring via the admin panel. |
| `REMOTE_CHANNEL_MEDIA_STREAM` | `boolean` | `false` | Allow channel owners to enable the "Stream Media Files" option in the UI. When `false`, the option is disabled and locked for all channels. |
| `REMOTE_CHANNEL_TELEGRAM_API_ID` | `integer` | `0` | Telegram API ID. |
| `REMOTE_CHANNEL_TELEGRAM_API_HASH` | `string` | `""` | Telegram API hash. |
| `REMOTE_CHANNEL_TELEGRAM_SESSION_STRING` | `string` | `""` | Telegram StringSession. Treat it like a password. |
| `REMOTE_CHANNEL_TELEGRAM_PROXY_URL` | `string` | `""` | Telegram MTProto proxy URL. (`REMOTE_CHANNEL_PROXY_URL` is supported as a legacy fallback.) |
| `REMOTE_CHANNEL_OUJ_CHAT_PROXY_URL` | `string` | `""` | HTTP/HTTPS proxy for outbound requests from this server to remote Ouj Chat servers. |
| `REMOTE_CHANNEL_TICK_MODE` | `boolean` | `false` | When `true`, background poll loops stay off so a serverless host can sleep. |
| `REMOTE_CHANNEL_CRON_SECRET` | `string` | *(Auto-generated)* | Shared secret for the tick endpoint. |
| `REMOTE_CHANNEL_POLL_INTERVAL_MS` | `integer` | `5000` | How often the poller checks enabled Remote Channel sources (`1000`-`900000`). |
| `REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT` | `integer` | `50` | Max Telegram posts fetched per poll for each source (`1`-`100`). |
| `REMOTE_CHANNEL_QUEUE_INTERVAL_MS` | `integer` | `1000` | How often the mirror queue worker processes pending remote posts. |
| `REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS` | `integer` | `10` | Max retry attempts before a queued remote post is marked failed. |
| `REMOTE_CHANNEL_QUEUE_BATCH_SIZE` | `integer` | `10` | Max queued remote posts processed per worker tick (`1`-`50`). |
| `REMOTE_CHANNEL_QUEUE_CONCURRENCY` | `integer` | `3` | How many queued items are processed concurrently per worker tick. Also controls how many sources are polled in parallel. |
| `REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS` | `integer` | `300000` | Age after which an in-progress queue lock is considered stale and can be retried. |
| `CHAT_PENDING_TEXT_TIMEOUT` | `integer` | `300000` | Mark pending text message as failed after this timeout (milliseconds). |
| `CHAT_PENDING_FILE_TIMEOUT` | `integer` | `1200000` | Mark pending file message as failed / XHR timeout for uploads (milliseconds). |
| `CHAT_PENDING_RETRY_INTERVAL` | `integer` | `4000` | Retry cadence for pending sends while connected (milliseconds). |
| `CHAT_PENDING_STATUS_CHECK_INTERVAL` | `integer` | `1000` | How often pending messages are checked for timeout (milliseconds). |
| `CHAT_CACHE_TTL` | `integer` | `24` | Local cache time-to-live for chat lists and message caches (hours). |
| `CHAT_MESSAGE_FETCH_LIMIT` | `integer` | `60` | Max messages requested per chat fetch (initial/latest window). |
| `CHAT_MESSAGE_PAGE_SIZE` | `integer` | `60` | Page size for loading older messages when scrolling to top. |
| `CHAT_LIST_REFRESH_INTERVAL` | `integer` | `20000` | Chats list background refresh interval (milliseconds). |
| `CHAT_HEALTH_CHECK_INTERVAL` | `integer` | `10000` | Connection health check interval (milliseconds). |
| `CHAT_SSE_RECONNECT_DELAY` | `integer` | `2000` | Delay before reconnecting SSE after error (milliseconds). |
| `WS_HEARTBEAT_INTERVAL_MS` | `integer` | `30000` | Frequency of WebSocket heartbeat ping frames sent to clients. |
| `WS_HEARTBEAT_TIMEOUT_MS` | `integer` | `10000` | Grace period before terminating un-responsive WebSocket clients. |
| `CHAT_SEARCH_MAX_RESULTS` | `integer` | `5` | Max users shown in search results. |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_MB` | `integer` | `5` | Max audio file size (MB) allowed for client-side waveform decode. (`CHAT_VOICE_WAVEFORM_MAX_DECODE_BYTES` is supported as a legacy fallback in bytes.) |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_SECONDS` | `integer` | `480` | Max audio duration (seconds) allowed for client-side waveform decode. |
| `NICKNAME_MAX_CHARS` | `integer` | `24` | Max nickname length for users and groups. (`NICKNAME_MAX` is supported as a legacy fallback.) |
| `USERNAME_MAX_CHARS` | `integer` | `16` | Max username length for users and groups. (`USERNAME_MAX` is supported as a legacy fallback.) |
| `STORAGE_ENCRYPTION_KEY` | `string` | *(Auto-generated)* | Persistent encryption-at-rest key. Once stored in the database, a different env value is a fatal startup error. Rotate only by re-encrypting old data first. |
| `ADMIN_API_TOKEN` | `string` | *(Auto-generated)* | Authentication token for local admin API endpoints. |
| `VAPID_PUBLIC_KEY` | `string` | *(Auto-generated)* | Web Push public key (required for push notifications). A different env value after the first run is a fatal startup error. |
| `VAPID_PRIVATE_KEY` | `string` | *(Auto-generated)* | Web Push private key (required for push notifications). A different env value after the first run is a fatal startup error. |
| `VAPID_SUBJECT` | `string` | *(Auto-generated)* | Contact for VAPID (email or URL). Used by push providers. |
| `PUSH_PROXY_URL` | `string` | `""` | Proxy URL for push notification delivery. Use when your server cannot directly reach push service endpoints. |
| `CALL` | `boolean` | `true` | Enable or disable calls entirely. When off, the API rejects call starts and call buttons render disabled. |
| `CALL_VIDEO` | `boolean` | `true` | Enable or disable video calls only. |
| `CALL_MAX_DURATION` | `integer` | `0` | Automatically end connected calls after this many minutes (1–1440). `0` disables the limit. |
| `TURN_STUN_URL` | `string` | `stun:stun.l.google.com:19302` | STUN server URL for WebRTC peer-to-peer connection discovery. |
| `TURN_URL` | `string` | `""` | Optional TURN relay server URL for environments behind symmetric NATs or restrictive firewalls. |
| `TURN_USERNAME` | `string` | `""` | TURN authentication username. |
| `TURN_CREDENTIAL` | `string` | `""` | TURN authentication password/credential. |
| `TURN_TOKEN_ID` | `string` | `""` | Cloudflare Calls TURN key ID. When set, ICE servers are minted per session from Cloudflare. |
| `TURN_API_TOKEN` | `string` | `""` | Cloudflare Calls TURN API token used to mint short-lived credentials (24h TTL). |

:::info

**Push notifications require HTTPS** (except `localhost` for development). iOS requires an installed PWA (iOS 16.4+).

:::

:::info

**Encryption at rest:** Keep `STORAGE_ENCRYPTION_KEY` consistent with the database. `ensureSystemSecrets` resolves keys from the runtime environment or database, generates missing keys and attempts to save them to the project's `.env`. This does not guarantee application-side encryption for every direct S3 upload. The production profile below uses provider-side encryption, which must be enabled and verified for the private Chat bucket.

:::

## Production Compose environment {#production-compose-environment}

The root `.env.production.example` is a sanitized starting point. The private `.env.production` is ignored by version control and excluded from Docker build input, so it must be transferred privately to the deployment host or prepared there. Do not overwrite an existing private file. For a new file on the Ubuntu host:

```sh
cp -n .env.production.example .env.production
chmod 600 .env.production
```

Edit that file privately and keep `OUJ_CHAT_ENV_FILE=.env.production`. Pass `--env-file .env.production` to every production Compose command. The flag supplies [Compose interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation); the repository's `env_file` selector `${OUJ_CHAT_ENV_FILE:-.env}` also injects the selected file's full runtime environment into the application container. The flag alone does not replace that [container environment configuration](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/). Without the selector override, the default remains `.env`.

| Area | Production profile |
|---|---|
| Runtime | `APP_ENV=production`; `NODE_ENV=production` is set by Compose and the final Dockerfile stage, not by the env templates. |
| Ports and files | `SERVER_PORT=5174`, `CLIENT_PORT=443`, `BIND_ADDRESS=0.0.0.0`, `DATA_DIR=/app/data`. Keep the runtime data volume persistent. |
| Database | `DB_CLIENT=mongodb`, `MONGODB_DATABASE=ouj_chat`, `MONGODB_MAX_POOL_SIZE=20`; fill the intentionally blank `MONGODB_URI` privately. |
| Storage | `STORAGE_DRIVER=remote`, `STORAGE_ENCRYPTION_MODE=remote`, `STORAGE_AUTO_CORS=false`; provide your endpoint, bucket, region and access credentials. |
| Local child worker | `START_LOCAL_WORKER=auto`, `WORKER_CONCURRENCY=1`, `WORKER_URL=http://127.0.0.1:8080`, `WEBHOOK_URL=http://127.0.0.1:5174/api/uploads/webhook/processed`. These loopback addresses apply to the all-in-one container. |
| Calls | `CALL=true`; optional TURN entries remain blank until configured for your relay. |
| Optional services | All three `REMOTE_CHANNEL` / `REMOTE_CHANNEL_UI` / `REMOTE_CHANNEL_MEDIA_STREAM` flags are `false`; Redis connection values remain blank. |

Before startup, fill `APP_PUBLIC_URL` with the exact HTTPS app origin, such as `https://chat.example.com`, and complete `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY`. Use a private Chat bucket and verify its provider-side encryption. Keep automatic CORS disabled and configure bucket CORS manually for the exact app origin; see [Object Storage](./Object-Storage.md).

When reusing an existing database, securely reuse its matching encryption, VAPID and other stable system keys. Do not replace them with fresh template values. For the all-in-one bootstrap, populate `WEBHOOK_SECRET` and `STORAGE_ENCRYPTION_KEY` consistently before either app or worker starts. Runtime key generation does not update the host's `.env.production` or a worker process that has already started. A fresh database may use newly provisioned keys; retain them securely for subsequent starts and recovery.

Prepare valid `certs/cert.pem` and `certs/key.pem`, configure the domain and Nginx `server_name`, and confirm that the secured MongoDB replica set is reachable from the application network with least-privilege Chat credentials. On the shared VPS, ports **80/443** may already belong to the existing Nginx: integrate Ouj Chat with the existing private Compose network and proxy. Reuse the secured MongoDB engine; do not blindly start a second Nginx or MongoDB instance.

Validate the completed configuration without printing the resolved secrets:

```sh
docker compose --env-file .env.production config --quiet
```

Only on a host with the required values, certificates, domain/proxy wiring, reachable replica set and available ports, start the complete stack:

```sh
docker compose --env-file .env.production up -d --build
```

On the shared host, after configuring the existing private network/proxy integration, start only the application service instead of another proxy:

```sh
docker compose --env-file .env.production up -d --build ouj-chat
```

Configuration validation is not a live database, bucket or container test. These settings do not migrate authentication or the database, connect Web identity, or turn the frontend business previews into live reports/listings.

## Apply Changes

:::tip

You can easily edit your .env file via the [Deployment Script](./Deployment-Script.md) and it would automatically apply and rebuild the app for you!

:::

**1. Docker deployment:**

The examples below use the default `.env`. For the production profile, also pass `--env-file .env.production` and retain its `OUJ_CHAT_ENV_FILE` selector.

```bash
cd /opt/ouj-chat
# Apply updated runtime env vars from .env
docker compose -f docker-compose.yaml up -d --force-recreate ouj-chat
```

If your change affects build-time client values, rebuild the image too:

```bash
cd /opt/ouj-chat
docker compose -f docker-compose.yaml up -d --build --force-recreate ouj-chat
```

**2. Manual (systemd) deployment:**

Rebuild client:

```bash
cd /opt/ouj-chat/client
npm run build
```

Restart systemd service:

```bash
sudo systemctl restart ouj-chat
```

**3. Reload Nginx:**

```bash
sudo systemctl reload nginx
```

## Database test and import variables

`MONGODB_TEST_URI` selects an explicit dedicated integration-test database containing `test` or `e2e`. Without it, `test:mongo` starts a temporary real replica set. `MONGOMS_SYSTEM_BINARY` can select a compatible local MongoDB executable for tests. `LEGACY_POSTGRES_URI` is private input only for the `db:import-sql -- --postgres` command. Keep `DB_CLIENT=mongodb` or use its current default; SQL selector values are rejected. Historical `POSTGRES_*` and SQL `DATABASE_URL` settings do not configure the active MongoDB connection. See [MongoDB](./MongoDB.md) for the complete setup and recovery procedures.
