import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import SidebarHeader from "../../../src/components/sidebar/header/SidebarHeader.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(async () => { setLocale("en"); await page.viewport(1280, 720); });
describe("create-conversation menu positioning", () => {
  for (const locale of ["en", "fa"]) for (const width of [375, 1280]) {
    test(`keeps all actions visible outside a clipped glass header in ${locale} at ${width}px`, async () => {
      await page.viewport(width, 720); setLocale(locale);
      const onNewGroup = vi.fn();
      await render(<div data-testid="sidebar-bounds" style={{ position: "fixed", insetInlineStart: 8, top: 20, width: Math.min(320, width - 16), height: 174, overflow: "hidden", transform: "translateZ(0)" }}>
        <SidebarHeader mobileTab="chats" isConnected hasChats chatsSearchQuery="" onNewGroup={onNewGroup} />
      </div>);
      const trigger = page.getByRole("button", { name: t("Create"), exact: true });
      await trigger.click();
      const choices = ["New DM", "New group", "New channel"].map((label) => page.getByRole("menuitem", { name: t(label), exact: true }));
      for (const choice of choices) {
        await expect.element(choice).toBeVisible();
        const box = choice.element().getBoundingClientRect();
        const sidebar = page.getByTestId("sidebar-bounds").element().getBoundingClientRect();
        expect(box.left).toBeGreaterThanOrEqual(sidebar.left);
        expect(box.right).toBeLessThanOrEqual(sidebar.right);
        expect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button")).toBe(choice.element());
      }
      await choices[1].click(); expect(onNewGroup).toHaveBeenCalledOnce();
      await expect.element(trigger).toHaveFocus();
    });
  }
});
