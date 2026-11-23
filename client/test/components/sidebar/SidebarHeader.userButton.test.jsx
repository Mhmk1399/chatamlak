import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import SidebarHeader from "../../../src/components/sidebar/header/SidebarHeader.jsx";

const mockUser = {
  id: 1,
  username: "alice",
  nickname: "Alice",
  avatarUrl: null,
  color: "#10b981",
  status: "online",
  role: "user",
  verified: false,
};

const BASE_PROPS = {
  mobileTab: "chats",
  editMode: false,
  isConnected: true,
  isUpdating: false,
  hasChats: true,
  selectedChatsCount: 0,
  title: "Chats",
  editAriaLabel: "Edit chat list",
  deleteAriaLabel: "Delete chats",
  onExitEdit: vi.fn(),
  onEnterEdit: vi.fn(),
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
  user: mockUser,
  displayName: "Alice",
  displayInitials: "A",
  userColor: "#10b981",
  statusValue: "online",
  statusTextClass: "text-emerald-500",
  onNavigateChats: vi.fn(),
  onNavigateSettings: vi.fn(),
  onNavigateCalls: vi.fn(),
  handleLogout: vi.fn(),
  onOpenOwnProfile: vi.fn(),
};

describe("SidebarHeader desktop user button vs mobile edit button", () => {
  test("keeps mobile edit in the header while the separate desktop rail owns the account menu", async () => {
    render(<SidebarHeader {...BASE_PROPS} />);

    // Mobile edit button exists in DOM
    const editBtn = page.getByRole("button", { name: "Edit chat list" });
    await expect.element(editBtn).toBeInTheDocument();
    expect(editBtn.element().classList.contains("md:hidden")).toBe(true);

    // Desktop account navigation is rendered by ChatSidebar's 76px rail, not
    // duplicated inside this header.
    await expect.element(page.getByRole("button", { name: "User menu" })).not.toBeInTheDocument();
  });

  test("in editMode, Close button is displayed instead to exit edit mode", async () => {
    const onExitEdit = vi.fn();
    render(
      <SidebarHeader {...BASE_PROPS} editMode={true} onExitEdit={onExitEdit} />,
    );

    const closeBtn = page.getByRole("button", { name: "Exit edit mode" });
    await expect.element(closeBtn).toBeVisible();

    await closeBtn.click();
    expect(onExitEdit).toHaveBeenCalledTimes(1);
  });
});
