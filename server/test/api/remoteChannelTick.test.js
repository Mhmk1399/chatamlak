import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

import { makeApp } from "../helpers/makeApp.js";

const SECRET = "test-cron-secret";

function makeTickApp(
  managerImpl = { tickOnce: async () => ({ telegram: "polled" }) },
) {
  return makeApp({
    settings: { REMOTE_CHANNEL_CRON_SECRET: SECRET },
    deps: {
      getSetting: (key) =>
        key === "REMOTE_CHANNEL_CRON_SECRET" ? SECRET : null,
      remoteChannelManager: {
        getHealth: async () => ({ tickMode: true }),
        ...managerImpl,
      },
    },
  });
}

describe("POST /api/internal/remote-channel/tick", () => {
  let oldEnv;
  beforeEach(() => {
    oldEnv = process.env.REMOTE_CHANNEL_CRON_SECRET;
    delete process.env.REMOTE_CHANNEL_CRON_SECRET;
  });
  afterEach(() => {
    if (oldEnv === undefined) delete process.env.REMOTE_CHANNEL_CRON_SECRET;
    else process.env.REMOTE_CHANNEL_CRON_SECRET = oldEnv;
  });

  test("rejects missing secret with 401", async () => {
    const { app } = makeTickApp();
    const res = await request(app).post("/api/internal/remote-channel/tick");
    expect(res.status).toBe(401);
  });

  test("rejects wrong secret with 401", async () => {
    const { app } = makeTickApp();
    const res = await request(app)
      .post("/api/internal/remote-channel/tick")
      .set("x-ouj-chat-cron-secret", "wrong");
    expect(res.status).toBe(401);
  });

  test("runs a tick with the correct secret", async () => {
    const { app } = makeTickApp({
      tickOnce: async () => ({ telegram: "polled", oujChat: "polled" }),
    });
    const res = await request(app)
      .post("/api/internal/remote-channel/tick")
      .set("x-ouj-chat-cron-secret", SECRET);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.telegram).toBe("polled");
  });

  test("does not log or return raw upstream failure text", async () => {
    const privateError = "error: https://upstream.example/path?token=secret";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { app } = makeTickApp({
        tickOnce: async () => ({ telegram: privateError, oujChat: privateError }),
      });
      const res = await request(app)
        .post("/api/internal/remote-channel/tick")
        .set("x-ouj-chat-cron-secret", SECRET);

      expect(res.status).toBe(200);
      expect(res.body.telegram).toBe("error");
      expect(res.body.oujChat).toBe("error");
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateError);
    } finally {
      log.mockRestore();
    }
  });

  test("returns 409 when a tick is already running", async () => {
    const busy = new Error("Remote Channel tick already in progress.");
    busy.code = "TICK_BUSY";
    const { app } = makeTickApp({
      tickOnce: async () => {
        throw busy;
      },
    });
    const res = await request(app)
      .post("/api/internal/remote-channel/tick")
      .set("x-ouj-chat-cron-secret", SECRET);
    expect(res.status).toBe(409);
  });

  test("honors the auto-generated secret from process.env", async () => {
    process.env.REMOTE_CHANNEL_CRON_SECRET = "boot-generated-secret";
    const { app } = makeApp({
      deps: {
        getSetting: () => "",
        remoteChannelManager: {
          getHealth: async () => ({ tickMode: true }),
          tickOnce: async () => ({ telegram: "polled" }),
        },
      },
    });
    const res = await request(app)
      .post("/api/internal/remote-channel/tick")
      .set("x-ouj-chat-cron-secret", "boot-generated-secret");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("returns 403 when no secret is configured", async () => {
    const { app } = makeApp({
      deps: {
        getSetting: () => "",
        remoteChannelManager: { tickOnce: async () => ({}) },
      },
    });
    const res = await request(app)
      .post("/api/internal/remote-channel/tick")
      .set("x-ouj-chat-cron-secret", "anything");
    expect(res.status).toBe(403);
  });
});
