import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ failure: null, constructorFailure: null, hello: { setName: "test-rs" }, close: vi.fn() }));
vi.mock("mongodb", () => ({
  MongoClient: class {
    constructor() { if (state.constructorFailure) throw state.constructorFailure; }
    async connect() { if (state.failure) throw state.failure; }
    async close() { state.close(); }
    db() { return { command: async () => state.hello }; }
  },
}));
import { connectMongo } from "../../db/mongoConnection.js";

const uri = "mongodb+srv://unit-user:unit-password@cluster.example.test/";
const config = { mongo: { uri, database: "ouj_connection_test" } };
beforeEach(() => { state.failure = null; state.constructorFailure = null; state.hello = { setName: "test-rs" }; state.close.mockClear(); });
const selectionError = (code) => Object.assign(new Error(`A connection failed for ${uri}`), {
  name: "MongoServerSelectionError",
  reason: { servers: new Map([["cluster.example.test:27017", { error: { name: "MongoNetworkError", cause: { code } } }]]) },
});

describe("safe MongoDB connection diagnostics", () => {
  test("explains an Atlas TLS handshake failure without leaking credentials", async () => {
    state.failure = selectionError("ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR");
    const error = await connectMongo(config).catch((value) => value);
    expect(error.message).toContain("TLS");
    expect(error.message).toContain("IP Access List");
    expect(error.message).not.toContain("unit-password");
    expect(error.message).not.toContain("unit-user");
    expect(error.message).not.toContain(uri);
    expect(state.close).toHaveBeenCalledOnce();
  });
  test("distinguishes DNS lookup failures from TLS failures", async () => {
    state.failure = Object.assign(new Error("querySrv ENOTFOUND " + uri), { code: "ENOTFOUND", name: "Error", syscall: "querySrv" });
    await expect(connectMongo(config)).rejects.toThrow("DNS");
  });
  test("identifies authentication failures separately from network access", async () => {
    state.failure = Object.assign(new Error("Authentication failed: " + uri), { name: "MongoServerError", code: 18, codeName: "AuthenticationFailed" });
    await expect(connectMongo(config)).rejects.toThrow("database username");
  });
  test("returns a targeted hint for a refused local MongoDB socket", async () => {
    state.failure = selectionError("ECONNREFUSED");
    await expect(connectMongo(config)).rejects.toThrow("listening");
  });
  test("does not expose constructor errors containing the URI", async () => {
    state.constructorFailure = Object.assign(new Error("Invalid URI: " + uri), { name: "MongoParseError" });
    const error = await connectMongo(config).catch((value) => value);
    expect(error.message).toContain("MongoDB connection failed");
    expect(error.message).not.toContain(uri);
    expect(error.message).not.toContain("unit-password");
  });
  test("closes the client when a standalone deployment cannot provide transactions", async () => {
    state.hello = {};
    await expect(connectMongo(config)).rejects.toThrow("replica set");
    expect(state.close).toHaveBeenCalledOnce();
  });
  test("accepts a working replica set without closing its returned client", async () => {
    const result = await connectMongo(config);
    expect(result.client).toBeDefined(); expect(result.db).toBeDefined();
    expect(state.close).not.toHaveBeenCalled();
  });
});
