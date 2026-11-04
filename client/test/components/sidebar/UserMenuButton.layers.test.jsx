import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import SidebarHeader from "../../../src/components/sidebar/header/SidebarHeader.jsx";
import UserMenuButton from "../../../src/components/sidebar/header/UserMenuButton.jsx";
import ChatsListPanel from "../../../src/components/sidebar/list/ChatsListPanel.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

const user = { id: "menu-user", username: "hos", nickname: "Hos", color: "#66308d" };
const chat = { id: "team-chat", type: "group", group_nickname: "Ouj team", members: [], last_message: "Daily report", last_time: "2026-11-04T07:00:00Z", unread_count: 0 };
afterEach(async () => { setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });

async function setup(width = 390, height = 720) {
  await page.viewport(width, height);
  const navigate = vi.fn(), selectChat = vi.fn();
  await render(<aside className="fixed top-2 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:bg-slate-900"
    style={{ insetInlineStart: 8, width: Math.min(380, width - 16), height: height - 16, transform: "translateZ(0)" }}>
    {width >= 768
      ? <SidebarHeader user={user} displayName="Hos" isConnected hasChats chatsSearchQuery="" onNavigateCalls={navigate} />
      : <div className="ouj-glass border-b px-5 py-5"><UserMenuButton user={user} displayName="Hos" onNavigateCalls={navigate} /></div>}
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ChatsListPanel loadingChats={false} visibleChats={[chat]} user={user} activeChatId={chat.id} selectedChats={[]}
        formatChatTimestamp={() => "10:29"} setActiveChatId={selectChat} setActivePeer={vi.fn()} setMobileTab={vi.fn()}
        setUnreadInChat={vi.fn()} lastMessageIdRef={{ current: null }} chatsSearchQuery="" />
    </div>
  </aside>);
  const trigger = page.getByRole("button", { name: t("User menu"), exact: true });
  await trigger.click();
  return { trigger, navigate, selectChat, menu: page.getByRole("menu", { name: t("User menu options"), exact: true }) };
}

for (const locale of ["en", "fa"]) for (const width of [375, 1280]) {
  test(`account menu stays above active chat rows in ${locale} at ${width}px`, async () => {
    setLocale(locale); if (width === 375) document.documentElement.classList.add("dark");
    const { menu, navigate, selectChat } = await setup(width);
    await expect.element(menu).toBeVisible();
    expect(menu.element().scrollWidth, "Account menu content must fit without a horizontal scrollbar").toBeLessThanOrEqual(menu.element().clientWidth);
    for (const label of ["Settings", "Calls", "Edit", "Log out"]) {
      const action = page.getByRole("menuitem", { name: t(label), exact: true });
      await expect.element(action).toBeVisible();
      const rect = action.element().getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(8); expect(rect.right).toBeLessThanOrEqual(width - 8);
      expect(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('[role="menuitem"]'), `${label} must receive the pointer above chat cards`).toBe(action.element());
    }
    const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
    await page.screenshot({ path: `../../../.vitest/account-menu-${locale}-${width}-${browser}.png` });
    await page.getByRole("menuitem", { name: t("Calls"), exact: true }).click();
    expect(navigate).toHaveBeenCalledOnce(); expect(selectChat).not.toHaveBeenCalled();
    await expect.element(menu).not.toBeInTheDocument();
  });
}

test("account menu fits a short phone viewport and Escape restores trigger focus", async () => {
  const { trigger, menu } = await setup(375, 320);
  expect(menu.element().scrollHeight).toBeGreaterThan(menu.element().clientHeight);
  expect(menu.element().scrollWidth, "Vertical scrolling must not introduce horizontal overflow").toBeLessThanOrEqual(menu.element().clientWidth);
  const logout = page.getByRole("menuitem", { name: "Log out", exact: true });
  await logout.element().scrollIntoView();
  const rect = logout.element().getBoundingClientRect();
  expect(rect.top).toBeGreaterThanOrEqual(8); expect(rect.bottom).toBeLessThanOrEqual(312);
  expect(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('[role="menuitem"]')).toBe(logout.element());
  await userEvent.keyboard("{Escape}");
  await expect.element(menu).not.toBeInTheDocument(); await expect.element(trigger).toHaveFocus();
});

for (const locale of ["en", "fa"]) test(`long profile information fits a narrow account menu in ${locale}`, async () => {
  setLocale(locale); await page.viewport(280, 640);
  await render(<div className="fixed start-2 top-2"><UserMenuButton user={user} displayName={"Hos".repeat(80)} statusValue={"online".repeat(80)} /></div>);
  await page.getByRole("button", { name: t("User menu"), exact: true }).click();
  const menu = page.getByRole("menu", { name: t("User menu options"), exact: true });
  await expect.element(menu).toBeVisible();
  expect(menu.element().scrollWidth).toBeLessThanOrEqual(menu.element().clientWidth);
  const bounds = menu.element().getBoundingClientRect(); expect(bounds.left).toBeGreaterThanOrEqual(8); expect(bounds.right).toBeLessThanOrEqual(272);
  await expect.element(page.getByRole("menuitem", { name: t("Log out"), exact: true })).toBeVisible();
});
