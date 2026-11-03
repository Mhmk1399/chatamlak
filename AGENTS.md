# Repository Guidelines: Songbird

Songbird is a self-hosted real-time communication platform built as a Node.js/React monorepo.

## Workspace Architecture

- **`client/`**: React 19 SPA (Vite, Tailwind CSS 4, Vitest + Playwright).
- **`server/`**: Node.js Express 5 backend (WebSocket/SSE realtime updates, native MongoDB driver, Vitest + Supertest).
- **`docs/`**: Dual-language VitePress documentation (English & Persian/Farsi).

## Essential Commands

```bash
# Development & Build
npm run dev                  # Concurrent client + server dev servers
npm --prefix client run dev  # Frontend dev server (Vite)
npm --prefix server run dev  # Backend dev server (Node --watch)
npm run build                # Build client frontend

# Testing
npm test                     # Run client and server tests concurrently
npm --prefix client run test # Client Vitest (unit + browser)
npm --prefix client run test:unit    # Fast Node-only unit tests
npm --prefix client run test:browser # Playwright browser component tests (Chromium + Firefox)
npm --prefix server run test # Server Vitest (unit + Supertest API integration)
npm --prefix server run test:mongo # Real MongoDB replica-set integration tests

# Docs
npm run docs:dev             # VitePress dev server
npm run docs:build           # Build documentation site
```

## Critical Architecture Quirks & Pitfalls

- **Design & Styling (`DESIGN.md`)**: Respect and follow [`DESIGN.md`](./DESIGN.md) for all frontend styling, UI component design, typography, color system, accessibility, and UI patterns.
- **Node Requirement**: Requires Node `>=24.18.0` and npm `>=11.18.0`.
- **Database (`server/db.js`)**: The active database is MongoDB 8 through the native Node.js driver 7; a replica set is required for transactions. Keep MongoDB queries and collection/index definitions in `server/db/` (including `mongoRepository.js` and `mongoSchema.js`), exposed through the `server/db.js` facade, and inject its operations into routes/services. Preserve public UUIDs and existing API field names. Store messages separately rather than embedding unbounded message arrays. SQL engines are legacy read-only import sources, not runtime fallback modes. SQL access is restricted to `server/db/legacyReader.js` and historical import/migration material; do not add SQL to active routes or services. `MONGODB_URI` must be explicitly configured; keep its value empty in `.env.example` and use `MONGODB_DATABASE=ouj_chat`.
- **Server Test Isolation**: `server/db.js` and `server/index.js` initialize live database/application state and must not be imported by isolated unit/API tests. API integration tests use `makeApp` from `server/test/helpers/makeApp.js` with injected dependencies. Run `test:mongo` for real transactional database coverage: `MONGODB_TEST_URI`, if supplied, must explicitly name a dedicated database containing `test` or `e2e`; otherwise the suite starts a temporary real replica set with `mongodb-memory-server`. Never point tests at application data.
- **Realtime & Durability**: Dispatch live events through `server/lib/sse.js` (`emitChatEvent`) and the WebSocket gateway. Persist covered source mutations and their replay-journal records in the same MongoDB transaction; a successful live broadcast is not durable event recovery. Uploaded-file metadata lives in MongoDB, while file bytes remain in the configured local/S3 storage provider and require separate backups.
- **Client Routing & API**: No React Router library. SPA navigation is managed manually in `client/src/App.jsx` via `window.history`. All client HTTP calls **must** use `apiFetch` in `client/src/api/chatApi.js` (`credentials: "include"`).
- **Documentation Updates**: Any update to documentation under `docs/` must update both English (`docs/*.md`) and Persian (`docs/fa/*.md`) documents, matching the structure in `docs/.vitepress/config.mjs`. Call the `documentor` subagent to update docs when you implant a new feature.

## Development & Git Workflow

- **Git Execution**: **NEVER** run `git` commands automatically. Suggest a commit message in the format `type(scope): description` and let the user execute git operations.
- **Bug Fixing Workflow**: Do not guess or fix immediately upon a bug report. First write a test reproducing the issue under test scenarios, verify it catches the bug, then apply the fix.
- **Response Style**: Keep task completions concise. Do not generate unrequested markdown summary files.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output. Always prefer graphify query commands over raw text grepping on graphify-out/.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Superpowers

When using superpowers skills, create the plans or specs docs under `.superpowers/docs`.
