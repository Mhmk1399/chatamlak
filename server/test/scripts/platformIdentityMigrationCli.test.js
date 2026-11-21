import { describe, expect, test } from "vitest";
import { assertDisposableLocalTarget } from "../../scripts/platform-identity-migrate.js";

describe("platform identity migration target guard", () => {
  test.each([
    "mongodb://localhost:27017/?replicaSet=rs0",
    "mongodb://127.0.0.1:27017/?replicaSet=rs0",
    "mongodb://[::1]:27017/?replicaSet=rs0",
  ])("allows an explicitly disposable loopback target: %s", (uri) => {
    expect(() => assertDisposableLocalTarget(uri, "ouj_chat_test"))
      .not.toThrow();
  });

  test.each([
    "mongodb://mongo:27017/?replicaSet=rs0",
    "mongodb://db.production.example:27017/?replicaSet=rs0",
    "mongodb+srv://cluster.example/ouj_chat_test",
  ])("rejects a non-loopback target: %s", (uri) => {
    expect(() => assertDisposableLocalTarget(uri, "ouj_chat_test"))
      .toThrow(/local|loopback|mongodb:\/\//i);
  });

  test("rejects an application database name even on loopback", () => {
    expect(() => assertDisposableLocalTarget("mongodb://127.0.0.1:27017", "ouj_chat"))
      .toThrow(/database name/i);
  });
});
