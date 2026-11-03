# Cloud Deployment

Ouj Chat uses MongoDB for application records and the configured local or S3-compatible provider for file bytes. Plan database, files, encryption keys, realtime routing and media processing as separate deployment concerns. See [MongoDB](./MongoDB) before provisioning application containers.

## Architecture overview

| Component | Persistence / responsibility |
|---|---|
| Web/API server | React frontend, authenticated API and live WebSocket/SSE connections. |
| MongoDB 8 replica set / suitable Atlas deployment | Indexed application collections, encrypted message records and transactional event journal. |
| Local persistent volume or S3-compatible storage | Attachment and avatar binaries; MongoDB contains their metadata. |
| Media worker | HTTP-dispatched FFmpeg processing and callbacks; it does not need direct database access. |
| Redis, when configured | Shared realtime pub/sub, session cache and background queues. |

A plain standalone MongoDB server is insufficient for the application's transactions. Public IDs and API fields remain UUID-based; choosing MongoDB does not require a different client API.

## PaaS application settings

Install repository, client, server and worker dependencies as required by your build environment. Typical build and API start commands are:

```sh
npm run build
npm --prefix server run start
```

Use Node.js `>=24.18.0` and npm `>=11.18.0`. Configure the application port and health probe for your platform, using `/api/health` for the API probe. Do not send traffic before the configured MongoDB replica set has a writable primary and application initialization succeeds.

Set these values through the platform's private environment or secret settings:

```dotenv
DB_CLIENT=mongodb
MONGODB_URI=
MONGODB_DATABASE=ouj_chat
```

The blank line is an intentional placeholder: enter your own Atlas/replica-set connection URI in the deployment settings. An empty value is not a working deployment and does not select SQLite. Apply the provider's TLS, credentials and network-access settings; see [Atlas setup](./MongoDB#mongodb-atlas).

## File persistence

PaaS filesystems can be ephemeral. A MongoDB connection preserves records, not files left on an ephemeral application disk.

For one application instance with local storage, attach a durable volume, set `DATA_DIR` to that mount and include it in backups. For separate application/worker hosts, prefer a shared S3-compatible provider reachable by both:

```dotenv
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://your-object-storage-endpoint
STORAGE_BUCKET=ouj-uploads
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
```

Fill credentials privately. Configure CORS, worker upload/download reachability and the webhook callback according to [Object Storage](./Object-Storage) and [Media Worker](./Media-Worker). Metadata remains in MongoDB; binary files have not been moved to GridFS.

## Railway {#railway-infrastructure-as-code}

Use the repository's current deployment artifacts as a starting point and configure a reachable MongoDB replica set or Atlas URI. Historical Railway diagrams and PostgreSQL provisioning instructions describe the old SQL release and must not be used as the active database topology. Review the selected template and its environment variables before deployment; this guide does not certify a one-click import or automatic MongoDB provisioning.

Run the API and optional standalone media worker with shared file-provider settings and valid callback addresses. Keep database credentials in the application's secret environment rather than in shell arguments or checked-in infrastructure files.

## Render

Use the current Docker/source deployment definition with `MONGODB_URI` and `MONGODB_DATABASE`. The application needs external persistent MongoDB and durable file storage; a historical managed-PostgreSQL blueprint is not a runtime MongoDB database.

If the container manages a local worker, keep its port distinct from the platform's API port. If using an external worker, configure `WORKER_URL` and callback reachability. Account for platform sleeping/cold starts when evaluating scheduled messages, calls and continuous mirroring; see [Remote Channel Setup](./Remote-Channel-Setup).

## Containers and Kubernetes

Every application replica must share the same MongoDB database and compatible encryption configuration. Binary file storage must be reachable consistently from all application and worker instances. Use a MongoDB service hostname whose replica-set advertised members are reachable from the containers; `localhost` inside an application pod is not a different database pod.

The main `docker-compose.yaml` builds the local application source and requires an external MongoDB URI. The separate `docker-compose.mongo.yaml` starts a loopback-only single-member development replica set for Node.js on the host. Its advertised `localhost:27017` address is not a database endpoint for a different container or a PaaS deployment. Keep these topologies separate; see [Docker installation](./Installation-Docker) and [local MongoDB](./MongoDB#local-mongodb-with-docker).

For multi-instance realtime behavior, configure shared Redis rather than relying on process-local fallback. Sticky sessions alone do not replace shared database, file storage or event routing. Validate calls, presence, journal replay, scheduled publication and worker retries on your own topology before increasing replicas; no capacity or high-availability claim follows merely from enabling MongoDB.

## Backups, migration and upgrades

- Preserve MongoDB backups, file-storage backups and encryption configuration together.
- Import SQLite/PostgreSQL data through the explicit legacy importer into an empty MongoDB database; do not point the active server at a SQL URI.
- Stop all writers before the application's offline restore; the Admin Panel rejects online MongoDB restore with HTTP `409`.
- Run the application's database checks and dedicated replica-set integration tests against your chosen environment.

See [Database Commands](./Database-Commands), [Updating](./Updating) and [Environment Variables](./Environment-Variables) for the operational commands. A successful local test is not evidence that a particular cloud deployment, import or restore has already succeeded.
