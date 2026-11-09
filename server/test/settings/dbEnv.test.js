import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readDbConfig } from "../../settings/env.js";

describe("readDbConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("defaults to mongodb client when DB_CLIENT is not set", () => {
    delete process.env.DB_CLIENT;
    const config = readDbConfig();
    expect(config.client).toBe("mongodb");
  });

  test("parses postgres configuration when DB_CLIENT=postgres", () => {
    process.env.DB_CLIENT = "postgres";
    process.env.POSTGRES_HOST = "db.example.com";
    process.env.POSTGRES_PORT = "5433";
    process.env.POSTGRES_DB = "ouj-chat_prod";

    const config = readDbConfig();
    expect(config.client).toBe("postgres");
    expect(config.postgres.host).toBe("db.example.com");
    expect(config.postgres.port).toBe(5433);
    expect(config.postgres.database).toBe("ouj-chat_prod");
  });
});
