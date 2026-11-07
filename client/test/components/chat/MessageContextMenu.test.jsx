import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AppContextMenu from "../../../src/components/context-menu/AppContextMenu.jsx";
import ContextMenuSurface from "../../../src/components/context-menu/ContextMenuSurface.jsx";
import { useAppContextMenu } from "../../../src/components/context-menu/useAppContextMenu.js";
import { MessagingContext } from "../../../src/hooks/chat/useMessagingTools.js";
import MessageEngagement from "../../../src/components/chat/tools/MessageEngagement.jsx";
import { MessageItem } from "../../../src/components/chat/messages/MessageItem.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

const message = { id: "11111111-1111-4111-8111-111111111111", body: "گزارش روزانه آماده است", username: "fixture", user_id: "fixture-user" };
const user = { id: "fixture-user", username: "fixture", role: "admin" };
const empty = { reactions: [], pins: [], topics: [], messageTopics: [], polls: [] };
const dialog = () => page.getByRole("dialog", { name: t("Message actions"), exact: true });
const reaction = (emoji) => page.getByRole("button", { name: `${t("React")} ${emoji}`, exact: true });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });

function Harness({ act = vi.fn().mockResolvedValue({ ok: true }), role = "admin", extras = empty, offline = false, currentMessage = message, callbacks = {}, busy = false, realBubble = false, chatId = "fixture-chat", anchorStyle }) {
  const { contextMenu, closeContextMenu, openContextMenu } = useAppContextMenu({ activeChatId: chatId, chats: [], currentUsername: user.username, canReplyToMessage: true, canEditMessage: () => true, canDeleteMessageForEveryone: () => true, onReplyToMessage: callbacks.reply, onDeleteMessage: callbacks.delete, onForwardMessage: callbacks.forward, isOffline: offline });
  const [visible, setVisible] = useState(true);
  return <MessagingContext.Provider value={{ user, activeChatId: chatId, chat: { type: "group", members: [{ ...user, role }] }, extras, act, busy }}>
    <button type="button" onClick={() => setVisible(false)}>Remove fixture</button>
    {realBubble ? <MessageItem msg={currentMessage} user={user} formatTime={() => "09:15"} getMessageDayLabel={() => "Today"} isDesktop={false} isMobileTouchDevice onOpenContextMenu={openContextMenu} onReply={callbacks.reply} chatId={chatId} /> : visible && <ContextMenuSurface data-testid="message" data-message-bubble tabIndex={0} className="mx-4 mt-24 max-w-sm rounded-2xl bg-brand-100 p-4 dark:bg-slate-800" style={anchorStyle}
      contextMenu={{ isMobile: true, holdDelayMs: 60, pressClassName: "ouj-message-holding", onOpen: ({ event, targetEl }) => openContextMenu({ kind: "message", event, targetEl, data: { message: currentMessage, isOffline: offline } }) }}>
      {currentMessage.body}
    </ContextMenuSurface>}
    <MessageEngagement message={currentMessage} onOpenContextMenu={openContextMenu} isOffline={offline} />
    <AppContextMenu menu={contextMenu} onClose={closeContextMenu} />
  </MessagingContext.Provider>;
}
async function open() {
  // Let modal focus restoration and layout settle before beginning a gesture;
  // an actual scroll during a hold intentionally cancels it.
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  const node = page.getByTestId("message").element();
  const rect = node.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2, clientY = rect.top + rect.height / 2;
  node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 3, button: 0, isPrimary: true, clientX, clientY }));
  await expect.element(dialog()).toBeVisible();
  node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 3, button: 0, isPrimary: true }));
}

test("hold reveals quick reactions and existing actions; selection uses the existing mutation", async () => {
  const act = vi.fn().mockResolvedValue({ ok: true }), reply = vi.fn();
  await render(<Harness act={act} callbacks={{ reply }} />); await open();
  await expect.element(page.getByRole("group", { name: "Reactions" })).toBeVisible();
  await expect.element(reaction("👍")).toHaveFocus();
  expect(document.querySelectorAll(".ouj-quick-reaction").length).toBe(7);
  await expect.element(page.getByRole("menuitem", { name: "Pin message", exact: true })).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Reply", exact: true })).toBeVisible();
  expect(act).not.toHaveBeenCalled();
  await reaction("❤️").click();
  expect(act).toHaveBeenCalledWith("/chats/fixture-chat/reaction", { method: "PUT", body: { messageId: message.id, emoji: "❤️", active: true } });
  await expect.element(dialog()).not.toBeInTheDocument();
});

test("selected reaction toggles off and pin toggles to unpin", async () => {
  const act = vi.fn().mockResolvedValue({ ok: true });
  const extras = { ...empty, pins: [message.id], reactions: [{ message_id: message.id, user_id: user.id, emoji: "👍" }] };
  await render(<Harness act={act} extras={extras} />); await open();
  await expect.element(reaction("👍")).toHaveAttribute("aria-pressed", "true");
  await reaction("👍").click();
  expect(act.mock.calls[0][1].body).toEqual({ messageId: message.id, emoji: "👍", active: false });
  await expect.element(dialog()).not.toBeInTheDocument();
  await open(); await page.getByRole("menuitem", { name: "Unpin message", exact: true }).click();
  expect(act).toHaveBeenLastCalledWith("/chats/fixture-chat/pin", { method: "PUT", body: { messageId: message.id, active: false } });
});

test("server-wide admin status does not grant group pin permission", async () => {
  await render(<Harness role="member" />); await open();
  await expect.element(page.getByRole("menuitem", { name: "Pin message", exact: true })).not.toBeInTheDocument();
  await expect.element(reaction("👍")).toBeEnabled();
});

test("failure keeps the menu for retry and never sends a duplicate while pending", async () => {
  let resolve;
  const act = vi.fn().mockResolvedValueOnce(null).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await render(<Harness act={act} />); await open(); await reaction("😂").click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(t("Could not save this action. Try again."));
  await reaction("😂").click();
  await expect.element(reaction("😂")).toBeDisabled();
  await expect.element(page.getByRole("status")).toHaveTextContent(t("Saving…"));
  expect(act).toHaveBeenCalledTimes(2); resolve({ ok: true });
  await expect.element(dialog()).not.toBeInTheDocument();
});

test("offline disables server actions but reply stays available and uses its existing callback", async () => {
  const act = vi.fn(), reply = vi.fn(); await render(<Harness act={act} offline callbacks={{ reply }} />); await open();
  await expect.element(reaction("👍")).toBeDisabled();
  await expect.element(page.getByRole("menuitem", { name: "Pin message", exact: true })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Reply", exact: true }).click();
  expect(reply).toHaveBeenCalledWith(message); expect(act).not.toHaveBeenCalled();
});

test.each([
  ["queued", { ...message, _clientId: "queued", _delivery: "sending" }],
  ["system", { ...message, body: "[[system:fixture]]" }],
  ["call", { ...message, body: "[[call:fixture]]" }],
])("%s messages have no reaction or pin mutation", async (_kind, currentMessage) => {
  await render(<Harness currentMessage={currentMessage} />); await open();
  await expect.element(page.getByRole("group", { name: "Reactions" })).not.toBeInTheDocument();
  await expect.element(page.getByRole("menuitem", { name: "Pin message", exact: true })).not.toBeInTheDocument();
});

test("React button and keyboard open the same dialog; Escape restores keyboard focus", async () => {
  await render(<Harness />);
  await page.getByRole("button", { name: /React ···/ }).click();
  await expect.element(dialog()).toBeVisible(); await userEvent.keyboard("{Escape}");
  await expect.element(dialog()).not.toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: /React ···/ })).toHaveFocus();
  page.getByTestId("message").element().focus();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await expect.element(dialog()).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog()).not.toBeInTheDocument();
  await expect.element(page.getByTestId("message")).toHaveFocus();
});

test("outside click closes and removes the blur overlay", async () => {
  await render(<Harness />); await open();
  const underlay = document.querySelector(".ouj-message-menu-overlay");
  await userEvent.click(underlay, { position: { x: 2, y: 2 } });
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(document.querySelector(".ouj-message-menu-overlay")).toBeNull();
});

test("Escape also dismisses during a transient loss of modal focus", async () => {
  await render(<Harness />); await open();
  await expect.element(page.getByRole("group", { name: "Reactions" })).toBeVisible();
  document.activeElement.blur();
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await expect.poll(() => document.querySelector(".ouj-message-menu-overlay"), { timeout: 1200 }).toBeNull();
});

test("Persian action labels are fully translated", async () => {
  setLocale("fa"); await render(<Harness />); await open();
  await expect.element(page.getByRole("menuitem", { name: "کپی متن", exact: true })).toBeVisible();
});

test("right click on a touch-capable device opens the same menu", async () => {
  await render(<Harness />);
  await page.getByTestId("message").click({ button: "right" });
  await expect.element(dialog()).toBeVisible();
});

test("topic assignment keeps the existing authorized API and excludes closed topics", async () => {
  const act = vi.fn().mockResolvedValue({ ok: true });
  const extras = { ...empty, topics: [{ id: "topic-open", title: "گزارش‌ها", closed: 0 }, { id: "topic-closed", title: "Closed", closed: 1 }] };
  await render(<Harness act={act} extras={extras} />); await open();
  await expect.element(page.getByRole("option", { name: "Closed", exact: true })).not.toBeInTheDocument();
  await userEvent.selectOptions(page.getByRole("combobox", { name: "Topics" }), "topic-open");
  expect(act).toHaveBeenCalledWith("/chats/fixture-chat/topic", { method: "PUT", body: { messageId: message.id, topicId: "topic-open" } });
});

test("changing conversations closes the menu before it can mutate another chat", async () => {
  const act = vi.fn(); const view = await render(<Harness act={act} />); await open();
  await view.rerender(<Harness act={act} chatId="other-chat" />);
  await expect.element(dialog()).not.toBeInTheDocument(); expect(act).not.toHaveBeenCalled();
});

test("removing the selected message closes the menu without a mutation", async () => {
  const act = vi.fn();
  await render(<Harness act={act} />);
  const remove = page.getByRole("button", { name: "Remove fixture" }).element();
  await open();
  // Model a remote deletion through React while the background is inert.
  remove.click();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(act).not.toHaveBeenCalled();
});

test("holding the real message bubble opens the reaction dialog and clears press feedback", async () => {
  vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => {});
  await render(<Harness realBubble />);
  const bubble = document.querySelector("[data-message-bubble]");
  bubble.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 7, button: 0, isPrimary: true, clientX: 80, clientY: 80 }));
  expect(bubble.classList.contains("ouj-message-holding")).toBe(true);
  await expect.element(page.getByRole("group", { name: "Reactions" })).toBeVisible();
  expect(bubble.classList.contains("ouj-message-holding")).toBe(false);
  window.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", pointerId: 7, button: 0, isPrimary: true }));
});

test("the real message bubble cancels its hold when its swipe container captures pointer movement", async () => {
  // Synthetic touch cannot acquire an OS pointer capture; retarget the move to
  // its capturing ancestor explicitly below, as the browser does on a phone.
  vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => {});
  const reply = vi.fn(); await render(<Harness realBubble callbacks={{ reply }} />);
  const node = page.getByText(message.body, { exact: true }).element();
  const pointer = (target, type, x) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 9, isPrimary: true, button: 0, clientX: x, clientY: 100 }));
  pointer(node, "pointerdown", 150);
  pointer(node.closest("[data-message-bubble]").parentElement, "pointermove", 35);
  await new Promise((done) => setTimeout(done, 500));
  await expect.element(dialog()).not.toBeInTheDocument();
  pointer(document.body, "pointerup", 35);
});

for (const locale of ["fa", "en"]) for (const width of [320, 1280]) test(`glass message menu fits ${locale} at ${width}px`, async () => {
  setLocale(locale); await page.viewport(width, width === 320 ? 520 : 800);
  document.documentElement.classList.toggle("dark", locale === "fa");
  await render(<Harness />); await open();
  const surface = document.querySelector(".ouj-message-menu-position");
  await expect.poll(() => surface.getBoundingClientRect().bottom <= (width === 320 ? 508 : 788)).toBe(true);
  const rect = surface.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(11); expect(rect.right).toBeLessThanOrEqual(width - 11);
  expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth + 1);
  expect(getComputedStyle(document.querySelector(".ouj-message-menu-overlay")).backdropFilter).toContain("blur");
  await expect.element(dialog()).toHaveAttribute("dir", locale === "fa" ? "rtl" : "ltr");
  if (width === 320) {
    await expect.poll(() => surface.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running")).toBe(true);
    await page.screenshot({ path: `../../../.vitest/message-menu-${locale}-${navigator.userAgent.includes("Firefox") ? "firefox" : "chromium"}.png` });
  }
});

const placementCases = [
  { name: "top edge", height: 800, anchorTop: 24, side: "below" },
  { name: "upper message with a tall menu", height: 520, anchorTop: 160, side: "below" },
  { name: "lower message with room on both sides", height: 1200, anchorTop: 650, side: "above" },
  { name: "bottom edge", height: 800, anchorTop: 720, side: "above" },
];
for (const locale of ["fa", "en"]) for (const width of [320, 1280]) for (const scenario of placementCases) {
  test(`message menu placement: ${scenario.name}, ${locale}, ${width}px`, async () => {
    setLocale(locale); await page.viewport(width, scenario.height);
    await render(<Harness anchorStyle={{ position: "fixed", top: scenario.anchorTop, insetInlineStart: 12, margin: 0, width: 250, height: 56 }} />);
    await open();
    await expect.element(page.getByRole("group", { name: t("Reactions"), exact: true })).toBeVisible();
    const surface = dialog().element().closest(".ouj-message-menu-position");
    const anchor = page.getByTestId("message").element().getBoundingClientRect();
    await expect.poll(() => {
      const rect = surface.getBoundingClientRect();
      return scenario.side === "below" ? rect.top >= anchor.bottom + 9 : rect.bottom <= anchor.top - 9;
    }, { timeout: 1200 }).toBe(true);
    const rect = surface.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(11); expect(rect.bottom).toBeLessThanOrEqual(scenario.height - 11);
    expect(rect.left).toBeGreaterThanOrEqual(11); expect(rect.right).toBeLessThanOrEqual(width - 11);
    if (locale === "fa" && width === 320) {
      await expect.poll(() => surface.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running")).toBe(true);
      await page.screenshot({ path: `../../../.vitest/message-placement-${scenario.side}-${scenario.height}-${navigator.userAgent.includes("Firefox") ? "firefox" : "chromium"}.png` });
    }
  });
}

test("message menu placement expands again when more room becomes available", async () => {
  await page.viewport(320, 520);
  await render(<Harness anchorStyle={{ position: "fixed", top: 160, left: 12, margin: 0, width: 250, height: 56 }} />); await open();
  await expect.element(page.getByRole("group", { name: "Reactions", exact: true })).toBeVisible();
  const surface = dialog().element().closest(".ouj-message-menu-position");
  const initialHeight = surface.getBoundingClientRect().height;
  await page.viewport(320, 1000);
  await expect.poll(() => surface.getBoundingClientRect().height > initialHeight + 50, { timeout: 1200 }).toBe(true);
  expect(surface.getBoundingClientRect().top).toBeGreaterThanOrEqual(225);
});

test("message menu placement stays usable when neither side has enough space", async () => {
  await page.viewport(320, 260);
  await render(<Harness anchorStyle={{ position: "fixed", top: 96, left: 12, margin: 0, width: 250, height: 56 }} />); await open();
  await expect.element(page.getByRole("group", { name: "Reactions", exact: true })).toBeVisible();
  const surface = dialog().element().closest(".ouj-message-menu-position");
  const rect = surface.getBoundingClientRect();
  expect(rect.top).toBeGreaterThanOrEqual(11); expect(rect.bottom).toBeLessThanOrEqual(249);
  const scroll = surface.querySelector(".ouj-message-action-scroll");
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect.element(dialog()).not.toBeInTheDocument();
});

test("message menu placement respects a reduced visual viewport and recovers after it grows", async () => {
  setLocale("fa"); await page.viewport(320, 800);
  const viewport = Object.assign(new EventTarget(), { width: 270, height: 340, offsetTop: 80, offsetLeft: 40, pageTop: 80, pageLeft: 40, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  await render(<Harness anchorStyle={{ position: "fixed", top: 130, left: 60, margin: 0, width: 230, height: 56 }} />); await open();
  await expect.element(page.getByRole("group", { name: t("Reactions"), exact: true })).toBeVisible();
  const surface = dialog().element().closest(".ouj-message-menu-position");
  await expect.poll(() => {
    const rect = surface.getBoundingClientRect();
    return rect.top >= 196 && rect.bottom <= 409 && rect.left >= 51 && rect.right <= 299;
  }).toBe(true);
  const initialHeight = surface.getBoundingClientRect().height;
  Object.assign(viewport, { width: 320, height: 700, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0 });
  viewport.dispatchEvent(new Event("resize"));
  await expect.poll(() => surface.getBoundingClientRect().height > initialHeight + 50).toBe(true);
  expect(surface.getBoundingClientRect().bottom).toBeLessThanOrEqual(689);
});
