import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import CallsPanel from "../../../src/components/call/CallsPanel.jsx";

const SAMPLE_CALLS = [
  {
    id: "call-1",
    chat_id: "chat-1",
    body: "[[call:voice:connected:60]]",
    peer_username: "alice",
    peer_nickname: "Alice",
    peer_avatar_url: null,
    peer_color: "#10b981",
    peer_verified: 0,
    peer_role: "user",
    user_id: "user-1",
    created_at: new Date().toISOString(),
  },
];

describe("CallsPanel", () => {
  test("enables call buttons when isInCall is false", async () => {
    const onStartCall = vi.fn();
    render(
      <CallsPanel
        loadingCalls={false}
        calls={SAMPLE_CALLS}
        user={{ id: "user-1", username: "bob" }}
        callsEditMode={false}
        selectedCalls={[]}
        toggleSelectCall={vi.fn()}
        onRequestDeleteCall={vi.fn()}
        onStartCall={onStartCall}
        isInCall={false}
      />,
    );

    const callBtn = page.getByRole("button", { name: /Alice/i });
    await expect.element(callBtn).toBeVisible();
    await expect.element(callBtn).not.toBeDisabled();
  });

  test("disables call buttons when isInCall is true", async () => {
    const onStartCall = vi.fn();
    render(
      <CallsPanel
        loadingCalls={false}
        calls={SAMPLE_CALLS}
        user={{ id: "user-1", username: "bob" }}
        callsEditMode={false}
        selectedCalls={[]}
        toggleSelectCall={vi.fn()}
        onRequestDeleteCall={vi.fn()}
        onStartCall={onStartCall}
        isInCall={true}
      />,
    );

    const callBtn = page.getByRole("button", { name: /Alice/i });
    await expect.element(callBtn).toBeVisible();
    await expect.element(callBtn).toBeDisabled();
    expect(callBtn.element().getAttribute("title")).toBe("Already in a call");
  });
});
