import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import "../../../src/index.css";
import ChatPage from "../../../src/pages/ChatPage.jsx";
import { OPEN_CHAT_ID_KEY } from "../../../src/utils/chatPageConstants.js";

describe("ChatPage — Mobile Tab Menu Search Mode", () => {
  const user = { username: "testuser", role: "user" };

  beforeEach(async () => {
    await page.viewport(390, 844);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch (offline)")),
    );
  });

  afterEach(async () => {
    window.sessionStorage.removeItem(OPEN_CHAT_ID_KEY);
    vi.unstubAllGlobals();
  });

  test("hides mobile tab menu when in search mode on chats list tab", async () => {
    render(
      <ChatPage
        user={user}
        setUser={vi.fn()}
        isDark={false}
        setIsDark={vi.fn()}
        toggleTheme={vi.fn()}
      />,
    );

    // Tab menu should be present and visible initially
    const chatsTabButton = page.getByRole("button", { name: "Chats" });
    await expect.element(chatsTabButton).toBeInTheDocument();
    await expect.element(chatsTabButton).toBeVisible();

    // Focus search input to enter search mode
    const searchInput = page.getByPlaceholder("Search");
    await expect.element(searchInput).toBeInTheDocument();
    await userEvent.click(searchInput);

    // In search mode, tab menu should be hidden
    await expect
      .element(page.getByRole("button", { name: "Chats", includeHidden: true }))
      .not.toBeVisible();

    // Type query in search input
    await userEvent.type(searchInput, "alice");
    await expect
      .element(page.getByRole("button", { name: "Chats", includeHidden: true }))
      .not.toBeVisible();

    // Exit search mode by clicking the close search button
    const closeSearchBtn = page.getByRole("button", { name: "Close search" });
    await expect.element(closeSearchBtn).toBeInTheDocument();
    await closeSearchBtn.click();

    // Tab menu should be visible again
    await expect
      .element(page.getByRole("button", { name: "Chats" }))
      .toBeVisible();
  });
});
