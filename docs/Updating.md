# Updating

This branch uses MongoDB, not the previous SQLite/PostgreSQL runtime. Updating application files alone does not import SQL data or create a replica set. Review the [MongoDB guide](./MongoDB) before the first cutover.

## Before an upgrade

Record the application version and database/storage configuration. Back up application records and preserve encryption-key material plus the separate upload volume or S3 objects:

```sh
npm --prefix server run db:backup -- --file ./backups/ouj.before-update.json.gz
```

Use a new archive filename; the native command does not silently overwrite an existing file. The archive contains private key material, so protect it. For a coordinated database/files recovery point, stop writers or use your providers' documented backup procedure.

## First migration from SQL

1. Stop the old application and retain its SQL database, upload binaries and encryption keys.
2. Configure a MongoDB replica set or suitable Atlas deployment and a new empty target database.
3. Set private `MONGODB_URI`, keep `DB_CLIENT=mongodb` and `MONGODB_DATABASE=ouj_chat`.
4. Run the appropriate legacy-import dry run, review it, then explicitly apply and run `db:check`.
5. Verify accounts, memberships, public IDs, messages, media and encrypted-content access before directing traffic to the new server.

See [legacy import](./MongoDB#import-a-legacy-sql-installation) for SQLite and PostgreSQL commands. This procedure does not imply an import has already succeeded. Upload files are not copied by importing database metadata.

## Updating an existing MongoDB installation

After stopping application writers and updating the source or deployment image through your normal process, install the dependencies and rebuild from the repository root:

```sh
npm install
npm --prefix client install
npm --prefix server install
npm --prefix worker install
npm run build
npm --prefix server run db:migrate
npm --prefix server run db:check
```

`db:migrate` initializes/verifies MongoDB collections and indexes; it does not execute the old SQL migrations. Start with `npm start`, or restart your configured systemd/container service, then check `/api/health`, authentication, live events and media access. Keep MongoDB and the file provider available throughout recovery.

## Docker and cloud deployments

Use an image built from the intended MongoDB-compatible revision and provide the replica-set URI through private environment settings. A historical image or IaC template that provisions PostgreSQL is not automatically compatible with the new database path.

Keep MongoDB persistence separate from local upload volumes. For an external media worker, preserve matching storage, encryption and webhook configuration. See [Docker](./Installation-Docker) and [Cloud Deployment](./Cloud-Deployment).

## Restore and rollback

Stop every writer before restoring a MongoDB archive:

```sh
npm --prefix server run db:restore -- --file ./backups/ouj.before-update.json.gz --yes --offline
npm --prefix server run db:check
```

The online Admin Panel restore returns HTTP `409`; use the offline maintenance command. Restore the matching binary files and encryption configuration if they changed too.

A SQL-era release cannot run against MongoDB merely by checking out its code. Rolling back across that boundary requires the old release and its original SQL/file/key backup; there is no automatic MongoDB-to-SQL conversion. Do not assume that a newer database schema is compatible with an older application version without a documented compatibility path.

## Deployment script versions

Older `songbird-deploy` menus included SQL engine selection, SQL backups and SQL migrations. Treat those flows as legacy unless the exact script version has been updated for MongoDB. Use the native commands in [Database Commands](./Database-Commands) and verify the selected deployment artifact instead of assuming an automatic import or downgrade.
