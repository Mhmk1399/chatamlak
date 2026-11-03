# Agent Guidance: Songbird Server

Node.js Express 5 backend (WebSocket/SSE realtime updates, native MongoDB driver, Vitest + Supertest).

## Developer Commands

```bash
npm --prefix server run dev        # Backend dev server with Node --watch
npm --prefix server run test       # Run unit and API integration tests
npm --prefix server run test:mongo # Real MongoDB replica-set integration tests
npm --prefix server run db:check   # Check MongoDB connectivity and database statistics
npm --prefix server run db:*       # Maintenance & inspection scripts (e.g., db:backup, db:inspect)
```

## Architecture & Code Guidelines

- **Database (`server/db.js`)**: MongoDB 8 with the native driver 7 is the active database. A replica set is required. Keep queries, collection definitions and index creation in `server/db/` (`mongoRepository.js`, `mongoSchema.js` and their modules), exposed by the stable `server/db.js` facade; routes receive injected operations rather than issuing collection queries directly. Preserve public UUIDs/API field names and keep messages in separate documents. Use MongoDB transactions for covered state changes and their event-journal records. SQLite/PostgreSQL are legacy import sources only; there is no silent SQL fallback. SQL is permitted only in the read-only importer `server/db/legacyReader.js` and historical import/migration material, never in active route/service logic. Keep `MONGODB_URI` empty in `.env.example` and configure it privately; the default database name is `ouj_chat`.
- **Thin API Routes**: Express route handlers (`server/api/`) only handle request parsing, auth verification, and response formatting. Business logic belongs in `server/lib/`.
- **Dependency Injection**: Route handlers receive dependencies via `apiDeps` passed into `registerApiRoutes(app, deps)`.
- **Realtime Updates**: Broadcast real-time updates through `server/lib/sse.js` (`emitChatEvent`).
- **Initialization & Import**: Maintain idempotent MongoDB collection/index initialization. Historical SQL schema migrations belong to legacy imports and are not the active startup schema. Import must be explicit and target an empty database; PostgreSQL credentials come only from `LEGACY_POSTGRES_URI`, selected with `--postgres`. Backups are gzip Extended JSON archives containing records/key material; restore requires stopped writers and `--yes --offline`. Keep binary storage backups separate.

## Server Testing Rules

- **Database Initialization Constraint**: Do not import live `server/db.js` or `server/index.js` from isolated tests; they initialize real database/application state. Test the database through its dedicated real-Mongo suite instead of mocking transactional persistence as proof of correctness.
- **API Integration Tests**: Must use `makeApp` from `server/test/helpers/makeApp.js` to create an Express instance with stubbed dependencies.
- **Unit Tests**: Place in `server/test/lib/` or `server/test/settings/` for pure helper functions.

- **Real MongoDB tests**: `test:mongo` uses a dedicated `MONGODB_TEST_URI` database whose pathname contains `test` or `e2e`, or starts a temporary real replica set with `mongodb-memory-server` when no URI is provided. `MONGOMS_SYSTEM_BINARY` can select an installed compatible executable when downloads are unavailable. Never reuse the production URI/database.
