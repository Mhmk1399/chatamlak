# MongoDB

Ouj Chat uses the native MongoDB Node.js driver 7 and a MongoDB 8 replica set for its active database. SQLite and PostgreSQL are legacy import sources, not alternative runtime engines. A standalone `mongod` without replica-set support is insufficient because message changes and their event journal use transactions.

## What MongoDB stores

Accounts, memberships, sessions, chats, messages, reactions, polls, schedules, settings, file metadata and event records are stored in indexed collections. Messages are separate documents rather than an ever-growing array inside a chat. Existing public UUIDs and API field names remain stable, and message bodies keep the application's encrypted storage format.

Attachment and avatar **metadata** is in MongoDB. The binary files still use the configured local or S3-compatible storage provider; this change does not move them to GridFS. Back up local upload volumes or remote objects separately from the database, and retain the encryption keys needed to read them.

## Requirements

- Node.js `>=24.18.0` and npm `>=11.18.0`.
- MongoDB 8 configured as a replica set, or a suitable Atlas deployment.
- A reachable primary, transaction support, and a database user allowed to read/write the application collections and create their indexes.
- FFmpeg for local media processing; see [Media Worker](./Media-Worker).

A single-node replica set is useful for development and provides transaction support; it does not provide multi-node redundancy. Follow MongoDB's [development replica-set guide](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-for-testing/) when adapting the examples to your environment.

## Configure the environment

Copy `.env.example` to `.env` at the repository root using your editor or shell. The template deliberately leaves the URI empty:

```dotenv
DB_CLIENT=mongodb
MONGODB_URI=
MONGODB_DATABASE=ouj_chat
```

Enter your own reachable connection URI in **`.env`**, not in committed source. For the local replica set below:

```dotenv
DB_CLIENT=mongodb
MONGODB_URI=mongodb://localhost:27017/ouj_chat?replicaSet=ouj-rs
MONGODB_DATABASE=ouj_chat
```

Keep `DB_CLIENT=mongodb` (or remove an old SQL selector so the current default applies); values such as `postgres` or `sqlite3` are rejected by this branch. An empty URI does not choose a hidden local database or a SQLite fallback. Configure it before starting the server. Keep the selected database name consistent across application instances. See MongoDB's [connection-target guide](https://www.mongodb.com/docs/drivers/node/current/connect/connection-targets/) for replica-set connection details.

## Local MongoDB with Docker

For host-based development, use the dedicated Compose file from the repository root:

```sh
docker compose -f docker-compose.mongo.yaml up -d
```

It runs a single-member MongoDB 8 replica set named `ouj-rs`, publishes only `127.0.0.1:27017`, and advertises `localhost:27017`. Wait for its primary to be ready. Set this non-secret local example in your private `.env`, then run the application with `npm run dev` on the host:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/ouj_chat?replicaSet=ouj-rs
MONGODB_DATABASE=ouj_chat
```

This development file is separate from the main application Compose file. Do not combine them: an application container cannot use the database's advertised `localhost` to reach a different container. The main application stack requires an externally reachable replica set or Atlas URI. The checked-in `.env.example` still leaves `MONGODB_URI` empty.

Alternatively, initialize a development set manually. Do not start this second container on port `27017` while the Compose database already uses it:

This example runs MongoDB in a container while Node.js runs on the host:

```sh
docker run -d --name ouj-mongo -p 127.0.0.1:27017:27017 -v ouj-mongo-data:/data/db mongo:8 --replSet ouj-rs --bind_ip_all
docker exec -it ouj-mongo mongosh
```

In the interactive MongoDB shell, initialize the new set once:

```javascript
rs.initiate({ _id: "ouj-rs", members: [{ _id: 0, host: "localhost:27017" }] })
rs.status()
```

Wait until the member is `PRIMARY`, then leave `mongosh` and set the local URI above. The named volume preserves database files across container restarts. This loopback-only, unauthenticated example is for local development; production needs an authenticated, appropriately network-restricted deployment.

If the application also runs inside Docker, `localhost` means the application container itself. Use the database service's network hostname and a replica-set configuration whose advertised hostnames are reachable from all clients. See [Docker installation](./Installation-Docker) and the official [Docker guide](https://www.mongodb.com/docs/manual/administration/install-community-docker/).

## Local MongoDB without Docker

Install MongoDB 8 and `mongosh` using MongoDB's [platform-specific installation instructions](https://www.mongodb.com/docs/manual/installation/). Create an empty data directory and start a local member:

```sh
mongod --dbpath ./mongo-data --replSet ouj-rs --bind_ip localhost --port 27017
```

In another terminal run `mongosh`, then use the same `rs.initiate(...)` and `rs.status()` commands shown above. Keep the `mongod` terminal or service running while using the application.

## MongoDB Atlas

1. Create or select a deployment compatible with the required MongoDB version.
2. Create a **database user** for the application; an Atlas dashboard login is a separate account.
3. Add the application server's address to the Atlas network access list.
4. Choose **Connect → Drivers → Node.js** and copy the connection string into `MONGODB_URI` in your private `.env` or deployment secret settings. Replace its credential placeholders and keep TLS enabled.
5. Set `MONGODB_DATABASE=ouj_chat` and start the application only after the connection is ready.

Use Atlas's [driver connection instructions](https://www.mongodb.com/docs/atlas/driver-connection/) for the current dashboard flow and access prerequisites. Do not place credentials in documentation, command arguments, screenshots or committed files.

## Install and start the application

Run from the repository root after setting the URI:

```sh
npm install
npm --prefix client install
npm --prefix server install
npm --prefix worker install
npm run dev
```

For a production frontend build and API startup:

```sh
npm run build
npm start
```

Keep MongoDB available. Configure the media worker/storage as described in their guides; database setup does not replace file storage or FFmpeg configuration.

## Import a legacy SQL installation

Stop the old application and take database, file-storage and encryption-key backups first. Use a new, empty MongoDB target, then inspect a dry run:

```sh
npm --prefix server run db:import-sql -- --source ./backups/songbird.db --dry-run
npm --prefix server run db:import-sql -- --source ./backups/songbird.db --apply
```

For PostgreSQL, put the old connection URI in the private `LEGACY_POSTGRES_URI` environment variable; do not pass a password-bearing URI as an argument:

```sh
npm --prefix server run db:import-sql -- --postgres --dry-run
npm --prefix server run db:import-sql -- --postgres --apply
```

Review the import report, then run `npm --prefix server run db:check`. Import reads the legacy source and writes the selected empty MongoDB database; it does not copy uploaded files or establish that a production cutover has succeeded. Keep the source backup until you have verified accounts, memberships, message counts, file links, encrypted content and event recovery on your own deployment.

## Backup and restore

The application archive is gzip-compressed Extended JSON (`.json.gz`) containing database records and encryption-key material:

```sh
npm --prefix server run db:backup -- --file ./backups/ouj.backup.json.gz
```

Keep the archive private. Also preserve the local uploads volume or remote object-storage backup and the environment needed by the installation. A database-only archive is not a complete binary-file backup.

To restore, stop every application/worker process that can mutate this database, then use the offline CLI:

```sh
npm --prefix server run db:restore -- --file ./backups/ouj.backup.json.gz --yes --offline
npm --prefix server run db:check
```

`--yes --offline` explicitly acknowledges an offline restore; these flags do not stop running services for you. Online restore through the Admin Panel is rejected with HTTP `409` so active connections are not silently replaced. Provider-managed snapshots or MongoDB's `mongodump`/`mongorestore` are additional operator options; their BSON archives are not the application's `.json.gz` format.

## Tests

```sh
npm --prefix client run test:unit
npm --prefix server run test
npm --prefix server run test:mongo
```

The MongoDB integration suite uses a real temporary replica set through `mongodb-memory-server` if `MONGODB_TEST_URI` is absent. Its first run may need to download a MongoDB executable. Set `MONGOMS_SYSTEM_BINARY` to an installed compatible `mongod` executable if automatic download is unavailable.

To use an existing test replica set, set `MONGODB_TEST_URI` privately to a URI containing an **explicit dedicated database** such as `ouj_chat_test` or `ouj_chat_e2e`. The database name must contain `test` or `e2e`; test data may be cleared. Never point it at `ouj_chat` or another live database. For example, a local non-secret test URI is `mongodb://localhost:27017/ouj_chat_test?replicaSet=ouj-rs`.

These commands describe how to run checks; their presence does not claim that an import, restore, Atlas environment or production load test has already been completed.

## Troubleshooting

| Symptom | Check |
|---|---|
| Missing connection URI | Fill `MONGODB_URI` in private configuration; the sample remains intentionally empty. |
| Transactions require a replica set | Initialize the set and wait for a writable primary; a standalone server is insufficient. |
| Server selection timeout | Check DNS, ports, credentials, Atlas network access and reachability of every advertised replica-set hostname. |
| Application container cannot connect to localhost | Use the database's reachable service hostname, rather than the application container's loopback address. |
| Restored messages or files cannot be decrypted | Restore the matching encryption keys and binary-file storage alongside the database records. |
| MongoDB test executable download fails | Provide a compatible local executable through `MONGOMS_SYSTEM_BINARY`, or configure a dedicated replica set through `MONGODB_TEST_URI`. |

See [Database Commands](./Database-Commands), [Environment Variables](./Environment-Variables) and [Troubleshooting](./Troubleshooting) for related operations.
