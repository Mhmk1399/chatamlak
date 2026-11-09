import path from 'node:path';
import { describe, expect, test } from "vitest";
import {
  createPostgresMaintenance,
  resolvePostgresCliConfig,
} from "../../lib/postgresMaintenance.js";

const config = {
  client: "postgres",
  postgres: {
    host: "db.example.test",
    port: 5433,
    user: "ouj-chat",
    password: "super-secret",
    database: "ouj-chat_prod",
    url: null,
    ssl: true,
  },
};

describe("postgresMaintenance", () => {
  test("uses native PostgreSQL tools without exposing credentials in arguments", async () => {
    const calls = [];
    const maintenance = createPostgresMaintenance({
      config,
      execute: async (tool, args, options) => {
        calls.push({ tool, args, options });
      },
    });

    await maintenance.backup("/tmp/ouj-chat.dump");
    await maintenance.restore("/tmp/ouj-chat.dump");
    await maintenance.vacuum();
    await maintenance.dropDatabase();
    await maintenance.createDatabase();

    expect(calls.map((call) => call.tool)).toEqual([
      "pg_dump",
      "pg_restore",
      "pg_restore",
      "vacuumdb",
      "dropdb",
      "createdb",
    ]);
    expect(calls[0].args).toContain("--format=custom");
    expect(calls[0].args).toContain(`--file=${path.resolve("/tmp/ouj-chat.dump")}`);
    expect(calls[2].args).toContain("--single-transaction");
    expect(calls[4].args).toContain("--force");
    expect(calls[5].args).toContain("--owner=ouj-chat");
    expect(JSON.stringify(calls.map((call) => call.args))).not.toContain(
      "super-secret",
    );
    expect(calls[0].options.env).toMatchObject({
      PGHOST: "db.example.test",
      PGPORT: "5433",
      PGUSER: "ouj-chat",
      PGPASSWORD: "super-secret",
      PGSSLMODE: "require",
    });
  });

  test("derives native-tool connection details from POSTGRES_URL", () => {
    const resolved = resolvePostgresCliConfig({
      ...config,
      postgres: {
        ...config.postgres,
        url: "postgresql://url-user:url-password@url-db.test:5444/url_database?sslmode=require",
      },
    });

    expect(resolved).toMatchObject({
      host: "url-db.test",
      port: 5444,
      user: "url-user",
      password: "url-password",
      database: "url_database",
      ssl: true,
    });
  });

  test("rejects archives without the native PostgreSQL extension", async () => {
    const maintenance = createPostgresMaintenance({
      config,
      execute: async () => {},
    });
    await expect(maintenance.backup("/tmp/ouj-chat.db")).rejects.toThrow(
      ".dump",
    );
    await expect(maintenance.restore("/tmp/ouj-chat.db")).rejects.toThrow(
      ".dump",
    );
  });

  test("verifyArchive passes the archive path positionally, not via --file", async () => {
    // pg_restore's --file flag is the OUTPUT destination for the TOC listing, not the
    // input archive to read. The archive must be the trailing positional argument.
    // Passing it as --file=<path> means pg_restore reads no archive argument at all
    // and falls back to reading from stdin, which hangs indefinitely (the "stuck on
    // restoring..." symptom) instead of erroring out.
    const calls = [];
    const maintenance = createPostgresMaintenance({
      config,
      execute: async (tool, args) => {
        calls.push({ tool, args });
      },
    });

    await maintenance.verifyArchive("/tmp/ouj-chat.dump");

    const listCall = calls.find((call) => call.args.includes("--list"));
    expect(listCall.args).toContain(path.resolve("/tmp/ouj-chat.dump"));
    expect(listCall.args).not.toContain("--file=/tmp/ouj-chat.dump");
  });

  test("rejects unsafe system databases and redacts native tool failures", async () => {
    expect(() =>
      resolvePostgresCliConfig({
        ...config,
        postgres: { ...config.postgres, database: "postgres" },
      }),
    ).toThrow("system database");

    const maintenance = createPostgresMaintenance({
      config,
      execute: async () => {
        const error = new Error("password=super-secret");
        error.code = "ENOENT";
        throw error;
      },
    });
    await expect(maintenance.vacuum()).rejects.toThrow(
      "vacuumdb is not installed",
    );
    await expect(maintenance.vacuum()).rejects.not.toThrow("super-secret");

    const maintenanceWithStderr = createPostgresMaintenance({
      config,
      execute: async () => {
        const error = new Error("failed");
        error.stderr = "pg_dump: error: server version: 18.0; pg_dump version: 15.0 with super-secret";
        throw error;
      },
    });
    await expect(maintenanceWithStderr.backup("/tmp/test.dump")).rejects.toThrow(
      "pg_dump failed: pg_dump: error: server version: 18.0; pg_dump version: 15.0 with [REDACTED]",
    );
  });
});
