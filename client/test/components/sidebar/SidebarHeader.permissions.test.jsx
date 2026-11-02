import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import SidebarHeader from "../../../src/components/sidebar/header/SidebarHeader.jsx";

const BASE_PROPS = {
  mobileTab: "chats",
  editMode: false,
  isConnected: true,
  isUpdating: false,
  hasChats: true,
  selectedChatsCount: 0,
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
};

describe("SidebarHeader permission prompt banner", () => {
  test("renders notification permission prompt card when mode is notification", async () => {
    const onRequest = vi.fn();
    const onDismiss = vi.fn();

    render(
      <SidebarHeader
        {...BASE_PROPS}
        permissionsPrompt={{
          show: true,
          mode: "notification",
          notification: {
            show: true,
            status: "default",
            onRequest,
          },
          microphone: {
            show: false,
            status: "unknown",
            onRequest: vi.fn(),
          },
          onDismiss,
        }}
      />,
    );

    const alertText = page.getByText("Enable notifications");
    await expect.element(alertText).toBeVisible();

    const allowBtn = page.getByRole("button", { name: "Allow" });
    await expect.element(allowBtn).not.toBeInTheDocument();

    const notNowBtn = page.getByRole("button", { name: "Not now" });
    await expect.element(notNowBtn).not.toBeInTheDocument();

    const dismissBtn = page.getByRole("button", { name: "Dismiss" });
    await expect.element(dismissBtn).toBeVisible();

    await dismissBtn.click();
    expect(onDismiss).toHaveBeenCalledWith("notification");
    expect(onRequest).not.toHaveBeenCalled();

    await alertText.click();
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  test("renders microphone permission prompt card when mode is microphone", async () => {
    const onRequest = vi.fn();
    const onDismiss = vi.fn();

    render(
      <SidebarHeader
        {...BASE_PROPS}
        permissionsPrompt={{
          show: true,
          mode: "microphone",
          notification: {
            show: false,
            status: "granted",
            onRequest: vi.fn(),
          },
          microphone: {
            show: true,
            status: "prompt",
            onRequest,
          },
          onDismiss,
        }}
      />,
    );

    const alertText = page.getByText("Enable microphone");
    await expect.element(alertText).toBeVisible();

    const allowBtn = page.getByRole("button", { name: "Allow" });
    await expect.element(allowBtn).not.toBeInTheDocument();

    const notNowBtn = page.getByRole("button", { name: "Not now" });
    await expect.element(notNowBtn).not.toBeInTheDocument();

    const dismissBtn = page.getByRole("button", { name: "Dismiss" });
    await expect.element(dismissBtn).toBeVisible();

    await dismissBtn.click();
    expect(onDismiss).toHaveBeenCalledWith("microphone");
    expect(onRequest).not.toHaveBeenCalled();

    await alertText.click();
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  test("does not render prompt banner when permissionsPrompt.show is false", async () => {
    render(
      <SidebarHeader
        {...BASE_PROPS}
        permissionsPrompt={{
          show: false,
          mode: "notification",
          notification: {
            show: true,
            status: "default",
            onRequest: vi.fn(),
          },
          onDismiss: vi.fn(),
        }}
      />,
    );

    const alertText = page.getByText("Enable notifications");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("does not render prompt banner when permissionsPrompt is null", async () => {
    render(<SidebarHeader {...BASE_PROPS} permissionsPrompt={null} />);

    const alertText = page.getByText("Enable notifications");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("does not render prompt banner when mobileTab is settings", async () => {
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="settings"
        permissionsPrompt={{
          show: true,
          mode: "notification",
          notification: {
            show: true,
            status: "default",
            onRequest: vi.fn(),
          },
          onDismiss: vi.fn(),
        }}
      />,
    );

    const alertText = page.getByText("Enable notifications");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("does not render prompt banner when mobileTab is calls", async () => {
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="calls"
        permissionsPrompt={{
          show: true,
          mode: "notification",
          notification: {
            show: true,
            status: "default",
            onRequest: vi.fn(),
          },
          onDismiss: vi.fn(),
        }}
      />,
    );

    const alertText = page.getByText("Enable notifications");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("does not render microphone prompt banner when mobileTab is calls", async () => {
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="calls"
        permissionsPrompt={{
          show: true,
          mode: "microphone",
          notification: {
            show: false,
            status: "default",
            onRequest: vi.fn(),
          },
          microphone: {
            show: true,
            status: "unknown",
            onRequest: vi.fn(),
          },
          onDismiss: vi.fn(),
        }}
      />,
    );

    const alertText = page.getByText("Enable microphone");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("does not render microphone prompt banner when mobileTab is settings", async () => {
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="settings"
        permissionsPrompt={{
          show: true,
          mode: "microphone",
          notification: {
            show: false,
            status: "default",
            onRequest: vi.fn(),
          },
          microphone: {
            show: true,
            status: "unknown",
            onRequest: vi.fn(),
          },
          onDismiss: vi.fn(),
        }}
      />,
    );

    const alertText = page.getByText("Enable microphone");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("renders insecure connection banner in chats tab", async () => {
    window.localStorage.removeItem("songbird-insecure-dismissed");
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="chats"
        insecureConnection={true}
        isLocalhost={false}
      />,
    );

    const bannerText = page.getByText("Connection is not secure");
    await expect.element(bannerText).toBeVisible();
  });

  test("does not render insecure connection banner when mobileTab is calls", async () => {
    window.localStorage.removeItem("songbird-insecure-dismissed");
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="calls"
        insecureConnection={true}
        isLocalhost={false}
      />,
    );

    const bannerText = page.getByText("Connection is not secure");
    await expect.element(bannerText).not.toBeInTheDocument();
  });

  test("does not render insecure connection banner when mobileTab is settings", async () => {
    window.localStorage.removeItem("songbird-insecure-dismissed");
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="settings"
        insecureConnection={true}
        isLocalhost={false}
      />,
    );

    const bannerText = page.getByText("Connection is not secure");
    await expect.element(bannerText).not.toBeInTheDocument();
  });
});
