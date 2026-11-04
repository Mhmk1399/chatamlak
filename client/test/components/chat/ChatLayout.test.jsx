import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ChatLayout from "../../../src/components/chat/ChatLayout.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(async () => { localStorage.removeItem("ouj-chat-sidebar-width-v1"); setLocale("en"); await page.viewport(1280, 800); });
const content = <><nav className="ouj-folder-rail hidden md:flex" /><aside data-testid="sidebar" className="ouj-chat-sidebar w-full" /><section className="ouj-chat-window min-w-0 flex-1" /></>;
for (const locale of ["fa", "en"]) test(`sidebar resizes with logical keyboard direction and retains its preferred width in ${locale}`, async () => {
  await page.viewport(1280, 800); setLocale(locale);
  const screen = await render(<ChatLayout>{content}</ChatLayout>);
  const divider = page.getByRole("separator", { name: t("Resize chat list"), exact: true });
  await divider.element().focus();
  await userEvent.keyboard(locale === "fa" ? "{ArrowLeft}" : "{ArrowRight}");
  await expect.element(divider).toHaveAttribute("aria-valuenow", "376");
  expect(localStorage.getItem("ouj-chat-sidebar-width-v1")).toBe("376");
  await screen.unmount(); await render(<ChatLayout>{content}</ChatLayout>);
  await expect.element(divider).toHaveAttribute("aria-valuenow", "376");
  await page.viewport(768, 800);
  await expect.element(divider).toHaveAttribute("aria-valuenow", "332");
  await page.viewport(1280, 800); await expect.element(divider).toHaveAttribute("aria-valuenow", "376");
  divider.element().focus(); await userEvent.keyboard("{End}"); await expect.element(divider).toHaveAttribute("aria-valuenow", "560");
  await userEvent.keyboard("{Home}"); await expect.element(divider).toHaveAttribute("aria-valuenow", "280");
  await userEvent.keyboard("{Enter}"); await expect.element(divider).toHaveAttribute("aria-valuenow", "360");
});
test("mobile uses the full width and has no reachable resize handle", async () => {
  await page.viewport(375, 812); await render(<ChatLayout>{content}</ChatLayout>);
  await expect.element(page.getByRole("separator")).not.toBeInTheDocument();
  expect(page.getByTestId("sidebar").element().getBoundingClientRect().width).toBe(375);
});
