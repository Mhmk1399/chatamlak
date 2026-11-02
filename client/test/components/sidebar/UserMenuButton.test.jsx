import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import UserMenuButton from "../../../src/components/sidebar/header/UserMenuButton.jsx";

const mockUser = {
  id: 1,
  username: "johndoe",
  nickname: "John Doe",
  avatarUrl: null,
  color: "#10b981",
  status: "online",
  role: "user",
  verified: true,
};

describe("UserMenuButton Component", () => {
  test("renders user avatar button with correct aria labels", async () => {
    render(
      <UserMenuButton
        user={mockUser}
        displayName="John Doe"
        displayInitials="JD"
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await expect.element(button).toBeVisible();
    await expect.element(button).toHaveAttribute("aria-expanded", "false");
  });

  test("clicking user button opens dropdown menu with user info, options, and logout", async () => {
    const onOpenOwnProfile = vi.fn();
    const onNavigateSettings = vi.fn();
    const onNavigateCalls = vi.fn();
    const onEnterEdit = vi.fn();
    const handleLogout = vi.fn();

    render(
      <UserMenuButton
        user={mockUser}
        displayName="John Doe"
        displayInitials="JD"
        statusValue="online"
        mobileTab="chats"
        onOpenOwnProfile={onOpenOwnProfile}
        onNavigateSettings={onNavigateSettings}
        onNavigateCalls={onNavigateCalls}
        onEnterEdit={onEnterEdit}
        handleLogout={handleLogout}
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await button.click();

    // Verify dropdown is open
    await expect.element(button).toHaveAttribute("aria-expanded", "true");

    // Profile header
    const profileItem = page.getByRole("button", { name: /John Doe/ });
    await expect.element(profileItem).toBeVisible();

    // In chats tab: Settings, Calls, Edit, Log out options
    const settingsOption = page.getByRole("menuitem", { name: "Settings" });
    const callsOption = page.getByRole("menuitem", { name: "Calls" });
    const editOption = page.getByRole("menuitem", { name: "Edit" });
    const logoutOption = page.getByRole("menuitem", { name: "Log out" });

    await expect.element(settingsOption).toBeVisible();
    await expect.element(callsOption).toBeVisible();
    await expect.element(editOption).toBeVisible();
    await expect.element(logoutOption).toBeVisible();

    // Click Settings
    await settingsOption.click();
    expect(onNavigateSettings).toHaveBeenCalledTimes(1);
  });

  test("in settings tab: Settings is replaced with Chats option, and Edit is omitted", async () => {
    const onNavigateChats = vi.fn();
    const onNavigateCalls = vi.fn();

    render(
      <UserMenuButton
        user={mockUser}
        displayName="John Doe"
        mobileTab="settings"
        onNavigateChats={onNavigateChats}
        onNavigateCalls={onNavigateCalls}
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await button.click();

    // Chats option replaces Settings option
    const chatsOption = page.getByRole("menuitem", { name: "Chats" });
    await expect.element(chatsOption).toBeVisible();

    const callsOption = page.getByRole("menuitem", { name: "Calls" });
    await expect.element(callsOption).toBeVisible();

    // Settings option and Edit option should not be present
    await expect
      .element(page.getByRole("menuitem", { name: "Settings" }))
      .not.toBeInTheDocument();

    await expect
      .element(page.getByRole("menuitem", { name: "Edit" }))
      .not.toBeInTheDocument();

    await chatsOption.click();
    expect(onNavigateChats).toHaveBeenCalledTimes(1);
  });

  test("in calls tab: Calls is replaced with Chats option, and Edit is present", async () => {
    const onNavigateChats = vi.fn();
    const onNavigateSettings = vi.fn();
    const onEnterEdit = vi.fn();

    render(
      <UserMenuButton
        user={mockUser}
        displayName="John Doe"
        mobileTab="calls"
        onNavigateChats={onNavigateChats}
        onNavigateSettings={onNavigateSettings}
        onEnterEdit={onEnterEdit}
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await button.click();

    // Settings option
    const settingsOption = page.getByRole("menuitem", { name: "Settings" });
    await expect.element(settingsOption).toBeVisible();

    // Chats option replaces Calls option
    const chatsOption = page.getByRole("menuitem", { name: "Chats" });
    await expect.element(chatsOption).toBeVisible();

    await expect
      .element(page.getByRole("menuitem", { name: "Calls" }))
      .not.toBeInTheDocument();

    // Edit option is present
    const editOption = page.getByRole("menuitem", { name: "Edit" });
    await expect.element(editOption).toBeVisible();

    await editOption.click();
    expect(onEnterEdit).toHaveBeenCalledTimes(1);
  });

  test("clicking log out calls handleLogout", async () => {
    const handleLogout = vi.fn();

    render(
      <UserMenuButton
        user={mockUser}
        displayName="John Doe"
        mobileTab="chats"
        handleLogout={handleLogout}
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await button.click();

    const logoutOption = page.getByRole("menuitem", { name: "Log out" });
    await logoutOption.click();

    expect(handleLogout).toHaveBeenCalledTimes(1);
  });

  test("shows verified badge when user.verified is true", async () => {
    render(
      <UserMenuButton
        user={{ ...mockUser, verified: true }}
        displayName="John Doe"
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await button.click();

    await expect
      .element(page.getByLabelText("Verified"))
      .toBeInTheDocument();
  });

  test("hides verified badge when user.verified is false", async () => {
    render(
      <UserMenuButton
        user={{ ...mockUser, verified: false }}
        displayName="John Doe"
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await button.click();

    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });

  test("hides verified badge when user.verified is 0", async () => {
    render(
      <UserMenuButton
        user={{ ...mockUser, verified: 0 }}
        displayName="John Doe"
      />,
    );

    const button = page.getByRole("button", { name: "User menu" });
    await button.click();

    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });
});
