import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import SidebarHeader from "../../../src/components/sidebar/header/SidebarHeader.jsx";

const BASE_PROPS = {
  mobileTab: "calls",
  editMode: false,
  isConnected: true,
  isUpdating: false,
  hasChats: true,
  selectedChatsCount: 0,
  title: "Calls",
  onExitEdit: vi.fn(),
  onEnterEdit: vi.fn(),
  onEnterCallsEditMode: vi.fn(),
  onExitCallsEditMode: vi.fn(),
  onDeleteCalls: vi.fn(),
  onNewCall: vi.fn(),
  onDeleteChats: vi.fn(),
  onNewChat: vi.fn(),
  onNewGroup: vi.fn(),
  onNewChannel: vi.fn(),
  chatsSearchQuery: "",
  chatsSearchFocused: false,
  onChatsSearchChange: vi.fn(),
  onChatsSearchFocus: vi.fn(),
  onChatsSearchBlur: vi.fn(),
  onCloseSearch: vi.fn(),
};

describe("SidebarHeader in calls mode", () => {
  test("matches settings page header bar height (h-[72px] shrink-0)", async () => {
    render(<SidebarHeader {...BASE_PROPS} />);

    const title = page.getByRole("heading", { name: "Calls" });
    await expect.element(title).toBeVisible();

    const header = title.element().closest(".border-b");
    expect(header).not.toBeNull();
    expect(header.classList.contains("h-[72px]")).toBe(true);
    expect(header.classList.contains("shrink-0")).toBe(true);
    expect(header.classList.contains("flex")).toBe(true);
    expect(header.classList.contains("items-center")).toBe(true);
  });

  test("disables New call button when isInCall is true", async () => {
    const onNewCall = vi.fn();
    render(<SidebarHeader {...BASE_PROPS} isInCall={true} onNewCall={onNewCall} />);

    const newCallBtn = page.getByRole("button", { name: "New call" });
    await expect.element(newCallBtn).toBeVisible();
    await expect.element(newCallBtn).toBeDisabled();
    expect(newCallBtn.element().getAttribute("title")).toBe("Already in a call");
  });

  test("enables New call button when isInCall is false", async () => {
    const onNewCall = vi.fn();
    render(<SidebarHeader {...BASE_PROPS} isInCall={false} onNewCall={onNewCall} />);

    const newCallBtn = page.getByRole("button", { name: "New call" });
    await expect.element(newCallBtn).toBeVisible();
    await expect.element(newCallBtn).not.toBeDisabled();
  });
});
