/**
 * TURN server card tests for the admin ServicesTab.
 *
 * The TURN server card displays health and latency when configured,
 * and stays disabled when only default STUN fallback is available.
 */
import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ServicesTab from "../../../src/components/admin/ServicesTab.jsx";

function makeData(turn) {
  return {
    mediaWorker: { configured: false, reachable: false, latencyMs: null },
    remoteChannel: { enabled: false },
    storage: { driver: "local", reachable: true, latencyMs: 3 },
    database: { client: "sqlite3", configured: false },
    turn,
  };
}

describe("ServicesTab TURN server card", () => {
  test("unconfigured renders a disabled TURN server card", async () => {
    render(
      <ServicesTab
        data={makeData({
          configured: false,
          managed: false,
          reachable: null,
          latencyMs: null,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /turn server/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).toBeDisabled();
    await expect
      .element(card.getByText("STUN only — no TURN relay configured."))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Disabled", { exact: true }))
      .toBeInTheDocument();
  });

  test("configured and reachable renders an enabled TURN server card with latency", async () => {
    render(
      <ServicesTab
        data={makeData({
          configured: true,
          managed: false,
          reachable: true,
          latencyMs: 18,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /turn server/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).not.toBeDisabled();
    await expect
      .element(card.getByText("TURN relay · 18ms"))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Active", { exact: true }))
      .toBeInTheDocument();
  });

  test("configured but unreachable renders Unreachable status", async () => {
    render(
      <ServicesTab
        data={makeData({
          configured: true,
          managed: true,
          reachable: false,
          latencyMs: null,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /turn server/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).not.toBeDisabled();
    await expect
      .element(card.getByText("Configured but unreachable."))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Unreachable", { exact: true }))
      .toBeInTheDocument();
  });
});
