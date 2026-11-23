import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import AuthPage from "../../../src/pages/AuthPage.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(() => setLocale("en"));

for (const locale of ["en", "fa"]) {
  test(`renders accessible Web federation states in ${locale}`, async () => {
    setLocale(locale);
    const signIn = vi.fn();
    const screen = await render(
      <AuthPage mode="login" isDark={false} onToggleTheme={vi.fn()} authMode="federated" onWebSignIn={signIn} webAuthState="ready" />,
    );
    const button = page.getByRole("button", { name: t("Sign in with Owj"), exact: true });
    await expect.element(button).toBeVisible();
    expect(button.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await button.click();
    expect(signIn).toHaveBeenCalledOnce();
    await screen.rerender(
      <AuthPage mode="login" isDark={false} onToggleTheme={vi.fn()} authMode="federated" onWebSignIn={signIn} webAuthState="linked" />,
    );
    await expect.element(page.getByRole("status")).toHaveTextContent(t("Account linked. Opening Chat..."));
    if (locale === "fa") expect(document.documentElement.dir).toBe("rtl");
  });
}

test("announces access errors and labels local compatibility mode", async () => {
  const screen = await render(
    <AuthPage mode="login" isDark={false} onToggleTheme={vi.fn()} authMode="federated" status="Your Owj Web account does not currently have access to Chat." />,
  );
  await expect.element(page.getByRole("alert")).toBeVisible();
  await screen.rerender(
    <AuthPage mode="login" isDark={false} onToggleTheme={vi.fn()} authMode="local_test" onSubmit={vi.fn()} onSwitchMode={vi.fn()} />,
  );
  await expect.element(page.getByText("Native test mode")).toBeVisible();
});
