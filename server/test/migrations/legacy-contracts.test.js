import { describe, test, expect } from 'vitest';
import { migration040QueueMessageIdText } from '../../migrations/040-queue-message-id-text.js';
import { migration037AutoAddNewUsers } from '../../migrations/037-auto-add-new-users.js';
import { migrations } from '../../migrations/index.js';

describe("migration 040 queue created_message_id widening", () => {
  function makeCtx({ isPostgres, tables }) {
    const statements = [];
    const tableSet = new Set(Object.keys(tables));
    return {
      ctx: {
        isPostgres,
        tableExists: (t) => tableSet.has(String(t)),
        hasColumn: (t, c) =>
          Array.isArray(tables[t]) && tables[t].includes(String(c)),
        db: {
          run: (sql, params = []) => {
            statements.push({ sql, params });
            return Promise.resolve(1);
          },
        },
        getAll: () => Promise.resolve([]),
      },
      statements,
    };
  }

  test("is a no-op on SQLite", async () => {
    const { ctx, statements } = makeCtx({
      isPostgres: false,
      tables: { remote_channel_queue: ["created_message_id"] },
    });
    await migration040QueueMessageIdText.up(ctx);
    expect(statements).toHaveLength(0);
  });

  test("widens the column to TEXT on Postgres", async () => {
    const { ctx, statements } = makeCtx({
      isPostgres: true,
      tables: { remote_channel_queue: ["created_message_id"] },
    });
    await migration040QueueMessageIdText.up(ctx);
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain("ALTER TABLE remote_channel_queue");
    expect(statements[0].sql).toContain("created_message_id");
    expect(statements[0].sql).toMatch(/TYPE TEXT/i);
  });

  test("skips gracefully when the table/column is missing", async () => {
    const { ctx, statements } = makeCtx({ isPostgres: true, tables: {} });
    await migration040QueueMessageIdText.up(ctx);
    expect(statements).toHaveLength(0);
  });

  test("is registered with a unique version", async () => {
    const versions = migrations.map((m) => Number(m.version));
    expect(versions).toContain(40);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe("Migration 037 - auto_add_new_users", () => {
  test("defines migration 037 with version 37", () => {
    expect(migration037AutoAddNewUsers.version).toBe(37);
    expect(typeof migration037AutoAddNewUsers.up).toBe("function");
  });

  test("runs migration up callback to add column if missing", () => {
    const executed = [];
    const mockDb = {
      run: (sql) => executed.push(sql),
    };
    const hasColumn = (table, col) => false;
    migration037AutoAddNewUsers.up({ db: mockDb, hasColumn });
    expect(executed.some((sql) => sql.includes("auto_add_new_users"))).toBe(
      true,
    );
  });
});

