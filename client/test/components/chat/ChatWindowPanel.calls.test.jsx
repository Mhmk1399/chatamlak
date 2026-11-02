import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatWindowPanel from "../../../src/components/chat/ChatWindowPanel.jsx";

const BASE_PROPS = {
  activeChatId: "chat-1",
  activeChat: { id: "chat-1", type: "dm", members: [] },
  activeHeaderPeer: { username: "alice", nickname: "Alice", isDeleted: false },
  activeFallbackTitle: "Alice",
  isDmChat: true,
  messages: [],
  user: { id: "user-1", username: "bob" },
  onStartVoiceCall: vi.fn(),
  onStartVideoCall: vi.fn(),
};

describe("ChatWindowPanel call buttons", () => {
  test("enables call buttons when isInCall is false", async () => {
    render(<ChatWindowPanel {...BASE_PROPS} isInCall={false} />);

    const voiceBtn = page.getByRole("button", { name: "Voice call" });
    const videoBtn = page.getByRole("button", { name: "Video call" });
    await expect.element(voiceBtn).toBeInTheDocument();
    await expect.element(videoBtn).toBeInTheDocument();
    await expect.element(voiceBtn).not.toBeDisabled();
    await expect.element(videoBtn).not.toBeDisabled();
  });

  test("disables call buttons when isInCall is true", async () => {
    render(<ChatWindowPanel {...BASE_PROPS} isInCall={true} />);

    const voiceBtn = page.getByRole("button", { name: "Voice call" });
    const videoBtn = page.getByRole("button", { name: "Video call" });
    await expect.element(voiceBtn).toBeInTheDocument();
    await expect.element(videoBtn).toBeInTheDocument();
    await expect.element(voiceBtn).toBeDisabled();
    await expect.element(videoBtn).toBeDisabled();
  });
});
