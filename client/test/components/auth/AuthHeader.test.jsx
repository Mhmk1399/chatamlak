import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AuthHeader from "../../../src/components/auth/AuthHeader.jsx";

describe("AuthHeader", () => {
  describe("title text", () => {
    test('shows Ouj workspace branding and the login heading', async () => {
      render(
        <AuthHeader
          isLogin
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={() => {}}
        />,
      );
      await expect.element(page.getByText("Ouj Real Estate team workspace")).toBeInTheDocument();
      await expect.element(page.getByRole("heading", { name: "Welcome to Ouj" })).toBeInTheDocument();
    });

    test('shows Ouj workspace branding and the registration heading', async () => {
      render(
        <AuthHeader
          isLogin={false}
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={() => {}}
        />,
      );
      await expect
        .element(page.getByText("Ouj Real Estate team workspace"))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("heading", { name: "Join the Ouj team" }))
        .toBeInTheDocument();
    });
  });

  describe("theme toggle button", () => {
    test("renders the toggle button with correct aria-label", async () => {
      render(
        <AuthHeader
          isLogin
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={() => {}}
        />,
      );
      await expect
        .element(page.getByRole("button", { name: "Toggle dark mode" }))
        .toBeInTheDocument();
    });

    test("calls onToggleTheme when the button is clicked", async () => {
      const onToggleTheme = vi.fn();
      render(
        <AuthHeader
          isLogin
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={onToggleTheme}
        />,
      );
      await userEvent.click(
        page.getByRole("button", { name: "Toggle dark mode" }),
      );
      expect(onToggleTheme).toHaveBeenCalledTimes(1);
    });
  });
});
