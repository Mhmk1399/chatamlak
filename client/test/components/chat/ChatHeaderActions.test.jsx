import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ChatWindowPanel from "../../../src/components/chat/ChatWindowPanel.jsx";
import ChatHeaderActions from "../../../src/components/chat/ChatHeaderActions.jsx";
import { FolderPanel } from "../../../src/components/chat/tools/ToolsPanels.jsx";
import { MessagingContext } from "../../../src/hooks/chat/useMessagingTools.js";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(async () => { vi.restoreAllMocks(); setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });
function fixture() {
  const voice = vi.fn(), video = vi.fn(), profile = vi.fn();
  const context = { user: { id: "me", username: "hos" }, activeChatId: "team", chat: { id: "team", type: "dm" }, preferences: [],
    extras: { topics: [], pinnedMessages: [] }, error: "", setPanel: vi.fn(), act: vi.fn(async () => true),
    headerActions: { toggleMute: vi.fn(), deleteChat: vi.fn(), openAppearance: vi.fn() } };
  return { context, voice, video, profile };
}
for (const locale of ["fa", "en"]) for (const width of [320, 375, 1280]) test(`conversation has one compact header and an accessible overflow menu in ${locale} at ${width}px`, async () => {
  setLocale(locale); await page.viewport(width, 812); if (locale === "fa") document.documentElement.classList.add("dark");
  const { context, voice, video, profile } = fixture();
  await render(<MessagingContext.Provider value={context}><ChatWindowPanel mobileTab="chat" activeChatId="team" activeChat={context.chat} activeHeaderPeer={{ username: "peer", nickname: "Ouj consultant" }}
    activeFallbackTitle="Ouj consultant with a long name" peerStatusLabel="online" isConnected isDmChat messages={[]} user={context.user}
    onStartVoiceCall={voice} onStartVideoCall={video} onOpenHeaderProfile={profile} showComposer={false} /></MessagingContext.Provider>);
  const search = page.getByRole("button", { name: t("Search"), exact: true });
  const call = page.getByRole("button", { name: t("Voice call"), exact: true });
  const more = page.getByRole("button", { name: t("More chat actions"), exact: true });
  for (const control of [search, call, more]) { await expect.element(control).toBeVisible(); expect(control.element().getBoundingClientRect().top).toBeLessThan(72); }
  if (locale === "fa") {
    const title = page.getByRole("button", { name: "Ouj consultant with a long name", exact: true });
    const canvas = document.createElement("canvas"), painter = canvas.getContext("2d");
    painter.fillStyle = getComputedStyle(title.element()).color; painter.fillRect(0, 0, 1, 1);
    expect([...painter.getImageData(0, 0, 1, 1).data].slice(0, 3).every(channel => channel > 150), "The title must stay readable on the dark header").toBe(true);
  }
  expect(Math.round(search.element().getBoundingClientRect().top)).toBe(Math.round(call.element().getBoundingClientRect().top));
  await expect.element(page.getByRole("button", { name: t("Pin chat"), exact: true })).not.toBeInTheDocument();
  await search.click(); expect(context.setPanel).toHaveBeenLastCalledWith("Search"); await call.click(); expect(voice).toHaveBeenCalledOnce();
  await more.click(); const menu = page.getByRole("menu", { name: t("Chat actions"), exact: true });
  await expect.element(menu).toBeVisible();
  const rect = menu.element().getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(8); expect(rect.right).toBeLessThanOrEqual(width - 8);
  const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
  await page.screenshot({ path: `../../../.vitest/conversation-header-${locale}-${width}-${browser}.png` });
  await page.getByRole("menuitem", { name: t("Video call"), exact: true }).click(); expect(video).toHaveBeenCalledOnce();
  await more.click(); await page.getByRole("menuitem", { name: t("Pin chat"), exact: true }).click();
  expect(context.act).toHaveBeenCalledWith("/chats/team/preference", { method: "PUT", body: { pinned: true } });
  await more.click(); await page.getByRole("menuitem", { name: t("Folder"), exact: true }).click(); expect(context.setPanel).toHaveBeenLastCalledWith("Folder");
  await more.click(); await userEvent.keyboard("{Escape}"); await expect.element(more).toHaveFocus(); await expect.element(menu).not.toBeInTheDocument();
});
test("conversation actions honor server call limits and change with the selected chat", async () => {
  const { context } = fixture();
  const screen = await render(<MessagingContext.Provider value={context}><ChatHeaderActions onVoiceCall={vi.fn()} onVideoCall={vi.fn()} voiceDisabled videoDisabled /></MessagingContext.Provider>);
  await expect.element(page.getByRole("button", { name: "Voice call", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "More chat actions", exact: true }).click();
  await expect.element(page.getByRole("menuitem", { name: "Video call", exact: true })).toBeDisabled();
  await screen.rerender(<MessagingContext.Provider value={{ ...context, activeChatId: "other", chat: { id: "other", type: "group" } }}><ChatHeaderActions groupCallDisabled /></MessagingContext.Provider>);
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Group call", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "More chat actions", exact: true }).click();
  await expect.element(page.getByRole("menuitem", { name: "Group call", exact: true })).toBeDisabled();
  await screen.rerender(<MessagingContext.Provider value={{ ...context, activeChatId: "third", chat: { id: "third", type: "group" }, isInCall: true, groupCall: { room: { id: "existing-room" } } }}><ChatHeaderActions groupCallDisabled /></MessagingContext.Provider>);
  await expect.element(page.getByRole("button", { name: "Group call", exact: true })).not.toBeDisabled();
});
test("folder assignment preserves the name on failure and can be cleared after retry", async () => {
  const { context } = fixture(); context.preferences = [{ chat_id: "team", folder: "Office" }]; context.act.mockResolvedValueOnce(null).mockResolvedValueOnce(true);
  await render(<MessagingContext.Provider value={context}><FolderPanel /></MessagingContext.Provider>);
  const input = page.getByRole("textbox", { name: "Folder", exact: true });
  await input.fill("Sales"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.element(input).toHaveValue("Sales");
  await input.fill(""); await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(context.act).toHaveBeenLastCalledWith("/chats/team/preference", { method: "PUT", body: { folder: "" } });
  await expect.element(page.getByRole("status")).toHaveTextContent("Saved");
});
