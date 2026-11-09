# Database Commands

The active Ouj Chat database is MongoDB. These Node.js/npm maintenance commands run from the repository root without a Bash wrapper. Configure `MONGODB_URI` and `MONGODB_DATABASE` in private configuration first; see [MongoDB](./MongoDB).

## Quick reference

| Command | Purpose |
|---|---|
| `npm --prefix server run db:check` | Check connectivity and report database statistics, including index counts. |
| `npm --prefix server run db:migrate` | Create/verify MongoDB collections and indexes; this does not run legacy SQL migrations. |
| `npm --prefix server run db:inspect -- --limit 25` | Report counts and a bounded snapshot of user, chat and file metadata. |
| `npm --prefix server run db:user:inspect -- --limit 25` | Inspect user metadata with password hashes omitted. |
| `npm --prefix server run db:chat:inspect -- --limit 25` | Inspect chat and membership metadata. |
| `npm --prefix server run db:file:inspect -- --limit 25` | Inspect attachment/avatar metadata and recorded file sizes. |
| `npm --prefix server run db:help` | Show the current native maintenance command help. |
| `npm --prefix server run db:backup -- --file ./backups/ouj.backup.json.gz` | Write the application's gzip Extended JSON archive. |
| `npm --prefix server run db:restore -- --file ./backups/ouj.backup.json.gz --yes --offline` | Restore an archive with the application stopped. |
| `npm --prefix server run db:import-sql -- --source ./backups/ouj-chat.db --dry-run` | Inspect an old SQLite database before import. |
| `npm --prefix server run db:import-sql -- --postgres --dry-run` | Inspect an old PostgreSQL source configured through `LEGACY_POSTGRES_URI`. |

Paths are examples. Choose a writable backup directory outside ephemeral container storage. The selected database comes from the MongoDB environment configuration, not `DATA_DIR`, `DB_CLIENT` or a `.db` filename.

## Database checks

```sh
npm --prefix server run db:check
```

Run checks after initial setup, a legacy import or an offline restore. Review the command's actual results; a successful connection alone does not establish that all application behavior or production load has been verified.

## Backup

```sh
npm --prefix server run db:backup -- --file ./backups/ouj.backup.json.gz
```

The archive contains MongoDB records and encryption-key material as gzip-compressed Extended JSON. It is not a SQLite `.db`, PostgreSQL `.dump`, or MongoDB `mongodump` archive. Keep it private and retain the matching environment/encryption configuration.

File metadata is in MongoDB, but binary attachments and avatars remain in the configured local/S3 provider. Back up their volume or remote objects separately. For a coordinated recovery point, quiesce writers or use your database/provider's supported backup procedure; the application archive is not a promise of a cluster-wide point-in-time snapshot.

## Offline restore

Stop every application instance and worker that can write to the target before restoring:

```sh
npm --prefix server run db:restore -- --file ./backups/ouj.backup.json.gz --yes --offline
npm --prefix server run db:check
```

`--yes` confirms the operation, and `--offline` acknowledges that writers have been stopped. The CLI does not stop services for you. Online MongoDB restore from the Admin Panel returns HTTP `409` with an offline recovery instruction. Start the application only after checking the restored records and required files/keys.

The application `.json.gz` format is distinct from provider snapshots or `mongodump`/`mongorestore` BSON archives. Use the matching restore tool for the format you created.

## Import old SQL data

SQLite and PostgreSQL are read-only migration sources. They are not active runtime choices and do not provide a fallback when `MONGODB_URI` is blank.

1. Stop the old installation and preserve its database, uploaded files and encryption keys.
2. Configure a new, empty MongoDB database as the target.
3. Run the relevant dry run, review counts and validation findings, then explicitly apply:

```sh
npm --prefix server run db:import-sql -- --source ./backups/ouj-chat.db --dry-run
npm --prefix server run db:import-sql -- --source ./backups/ouj-chat.db --apply
```

For PostgreSQL, set `LEGACY_POSTGRES_URI` in your private environment and use a flag without a password-bearing argument:

```sh
npm --prefix server run db:import-sql -- --postgres --dry-run
npm --prefix server run db:import-sql -- --postgres --apply
```

4. Run `db:check` and verify accounts, permissions, message counts, UUIDs, encrypted content and file access before switching traffic.

Importing does not copy upload binaries, certify the source installation, or erase the need for a rollback backup. SQL schema migrations and `VACUUM` commands belong to old installations and are not MongoDB maintenance operations. See the [full MongoDB migration guide](./MongoDB#import-a-legacy-sql-installation).

## Other administration

Use the [Admin Panel](./Admin-Panel) or the native Node.js CLI for account, chat and file operations. The commands below use `server/scripts/mongo-cli.js`, without a Bash wrapper. Run a command's `--help` to check the current syntax; help does not require a working MongoDB URI.

| Commands | Arguments / behavior |
|---|---|
| `db:user:create`, `db:user:edit` | Creation uses `--username`, `--password` and optional `--nickname` / `--role`. Editing accepts a user ID or username followed by changed fields. |
| `db:user:ban`, `db:user:verify` | Select a user by ID or username; the corresponding state is toggled unless an explicit value is supplied. |
| `db:chat:create`, `db:chat:edit` | Create with `--name`, `--username`, `--owner` and optional `--type` (`group` or `channel`) / `--users alice,bob`; edit by chat ID or username. |
| `db:chat:add`, `db:chat:verify` | Add members with `CHAT --users alice,bob` or `CHAT --all`; verification accepts a chat selector. |
| `db:user:delete`, `db:chat:delete`, `db:file:delete` | Select users/chats by ID or username, and files by ID. Deletion requires `-y` or `--yes`. |
| `db:user:generate`, `db:message:generate` | Create demonstration users with `--count` / `--password`, or messages with `--chat`, `--user` and `--count`. |

From the repository root, inspect help or resume an existing remote-channel queue:

```sh
npm --prefix server run db:user:edit -- --help
npm --prefix server run db:chat:edit -- your_channel --resume-queue
```

When the local server is running, user/chat/file mutations use its `/api/admin/db-tools` endpoint and require `ADMIN_API_TOKEN` in private configuration. When it is stopped, stop all other writers and append `--offline` to allow direct MongoDB administration. Offline deletion needs both `--offline` and `--yes`; the flags do not stop services. Whole-database `db:reset`, `db:delete` and `db:restore` always require `--yes --offline`. `--force` is not a substitute for those confirmations.

Inspection output includes account and chat metadata: keep it private. It is not limited to counts, although password hashes are omitted from user snapshots. File deletion and database backup are separate operations; database archives do not contain the binary media provider's objects.

`remote:configure` remains an interactive environment/Telegram setup helper; see [Remote Channel Setup](./Remote-Channel-Setup). Storage maintenance commands have their own help and are not SQL-to-MongoDB import commands.

For missing dimensions/durations in existing **local** uploads, `npm --prefix server run db:backfill -- --limit=1000` reads the local media and updates metadata through the MongoDB facade. Video probing requires `ffprobe`. It is not a bucket download, SQL import or dry run; preserve backups and stop writers before maintenance.

For legacy S3 object-key layouts, stop the application and review `npm --prefix server run storage:migrate -- --dry-run`. An applying run uses `npm --prefix server run storage:migrate -- --yes`; it copies verified objects to `uploads/messages/*` / `uploads/avatars/*`, rewrites MongoDB metadata, then removes the corresponding legacy keys. This helper accepts `--dry-run`, `--yes` / `-y` and `--help`; it refuses a running local server and does not require the database CLI's `--offline` flag. Back up both records and objects first; review partial copy/deletion failures before restarting.

For Docker, run a supported maintenance command in a container that has the correct environment and access to the chosen archive path. An offline restore must use a separate maintenance container/process while application writers are stopped, rather than executing through a running API instance.
