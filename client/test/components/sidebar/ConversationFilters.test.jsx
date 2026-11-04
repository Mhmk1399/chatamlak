import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatSidebar from "../../../src/components/sidebar/layout/ChatSidebar.jsx";
import ChatLayout from "../../../src/components/chat/ChatLayout.jsx";
import ConversationFilters from "../../../src/components/sidebar/navigation/ConversationFilters.jsx";
import { MessagingContext } from "../../../src/hooks/chat/useMessagingTools.js";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(async () => { setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });
const user = { id: "me", username: "hos", nickname: "Hos" };
const chats = [{ id: "one", type: "group", group_nickname: "Ouj team", members: [], unread_count: 3 }, { id: "two", type: "channel", group_nickname: "Reports", members: [], unread_count: 2 }];
function Harness() {
  const [filter, setFilter] = useState("all");
  const preferences = [...Array.from({ length: 14 }, (_, index) => ({ chat_id: `folder-${index}`, folder: `Office ${index}` })), { chat_id: "one", folder: "All" }, { chat_id: "two", archived: 1 }];
  return <MessagingContext.Provider value={{ filter, setFilter, preferences, chats, setPanel: vi.fn() }}><ChatLayout>
    <ChatSidebar user={user} mobileTab="chats" visibleChats={chats} selectedChats={[]} calls={[]} selectedCalls={[]} isConnected loadingChats={false}
      formatChatTimestamp={() => "10:29"} lastMessageIdRef={{ current: null }} chatsSearchQuery="" displayName="Hos" />
    <section className="ouj-chat-window min-w-0 flex-1" />
  </ChatLayout></MessagingContext.Provider>;
}
for (const locale of ["fa", "en"]) for (const width of [375, 1280]) test(`folder navigation is a desktop rail or a single scrolling mobile row in ${locale} at ${width}px`, async () => {
  setLocale(locale); await page.viewport(width, 812); if (locale === "fa") document.documentElement.classList.add("dark");
  await render(<div className="fixed inset-0"><Harness /></div>);
  const navigation = page.getByRole("navigation", { name: t("Chat folders"), exact: true });
  await expect.element(navigation).toBeVisible();
  const node = navigation.element(), actions = [...node.querySelectorAll("button")];
  if (width < 768) {
    expect(node.closest("aside")).not.toBeNull(); expect(node.scrollWidth).toBeGreaterThan(node.clientWidth);
    const rows = new Set(actions.map(action => Math.round(action.getBoundingClientRect().y))); expect(rows.size).toBe(1);
    actions.at(-1).scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = actions.at(-1).getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  } else {
    expect(node.closest("aside")).toBeNull(); expect(node.getBoundingClientRect().width).toBeLessThan(80);
  }
  // Folder titles are user data, even when they match an English UI key.
  expect(actions.some(action => action.querySelector('.ouj-folder-label')?.textContent === "All")).toBe(true);
  const groups = navigation.getByRole("button", { name: new RegExp(`^${t("Groups")}`) });
  expect(groups.element().querySelector(".ouj-folder-count").textContent).toBe(locale === "fa" ? "۳" : "3");
  await groups.click(); await expect.element(groups).toHaveAttribute("aria-pressed", "true");
  const archive = navigation.getByRole("button", { name: new RegExp(`^${t("Archived")}`) }); await archive.click();
  await expect.element(archive).toHaveAttribute("aria-pressed", "true");
  const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
  await page.screenshot({ path: `../../../.vitest/chat-navigation-${locale}-${width}-${browser}.png` });
});
test("removing the selected custom folder returns to All instead of leaving an empty filter", async () => {
  const setFilter = vi.fn();
  await render(<MessagingContext.Provider value={{ filter: "folder:Sales", setFilter, preferences: [], chats }}><ConversationFilters /></MessagingContext.Provider>);
  expect(setFilter).toHaveBeenCalledWith("all");
});
