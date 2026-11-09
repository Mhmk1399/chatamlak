import { describe, test, expect } from "vitest";
import { resolveWebhookCallbackUrl } from "../../lib/webhookUrl.js";

const PATH = "/api/uploads/webhook/processed";

describe("resolveWebhookCallbackUrl", () => {
  test("prefers an explicitly configured WEBHOOK_URL", () => {
    expect(
      resolveWebhookCallbackUrl({
        WEBHOOK_URL: "https://hooks.example.com/done",
        RAILWAY_PRIVATE_DOMAIN: "ouj-chat.railway.internal",
        PORT: "8080",
      }),
    ).toBe("https://hooks.example.com/done");
  });

  test("ignores an explicit URL with an uninterpolated empty port", () => {
    expect(
      resolveWebhookCallbackUrl({
        WEBHOOK_URL: `http://ouj-chat.railway.internal:/${PATH.slice(1)}`,
        RAILWAY_PRIVATE_DOMAIN: "ouj-chat.railway.internal",
        PORT: "1234",
      }),
    ).toBe(`http://ouj-chat.railway.internal:1234${PATH}`);
  });

  test("builds a private-network URL from Railway runtime vars", () => {
    expect(
      resolveWebhookCallbackUrl({
        RAILWAY_PRIVATE_DOMAIN: "ouj-chat.railway.internal",
        PORT: "8080",
      }),
    ).toBe(`http://ouj-chat.railway.internal:8080${PATH}`);
  });

  test("falls back to the public domain when no port is known", () => {
    expect(
      resolveWebhookCallbackUrl({
        RAILWAY_PUBLIC_DOMAIN: "ouj-chat.up.railway.app",
      }),
    ).toBe(`https://ouj-chat.up.railway.app${PATH}`);
  });

  test("falls back to loopback with SERVER_PORT", () => {
    expect(resolveWebhookCallbackUrl({ SERVER_PORT: "5174" })).toBe(
      `http://127.0.0.1:5174${PATH}`,
    );
  });

  test("falls back to loopback with the default port", () => {
    expect(resolveWebhookCallbackUrl({})).toBe(`http://127.0.0.1:5174${PATH}`);
  });
});
