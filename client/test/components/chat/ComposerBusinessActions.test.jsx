import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MessageComposer } from "../../../src/components/chat/messages/MessageComposer.jsx";
import { clearChatDraft } from "../../../src/utils/chatDrafts.js";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

const owner = "business-preview-user";
const chat = "business-preview-chat";
const defaults = { activeChatId: chat, draftAccountId: owner, currentUsername: "consultant", isDesktop: false,
  handleSend: vi.fn(), pendingUploadFiles: [], activeUploadProgress: null, fileUploadEnabled: true, setShowUploadMenu: vi.fn() };

afterEach(async () => {
  vi.restoreAllMocks();
  clearChatDraft(owner, chat); clearChatDraft(owner, "other-business-chat");
  clearChatDraft("other-business-user", chat);
  setLocale("en"); document.documentElement.classList.remove("dark");
  await page.viewport(1280, 800);
});

function Fixture(props) {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  return <div className="fixed inset-x-0 bottom-0"><MessageComposer {...defaults} {...props} showUploadMenu={showUploadMenu} setShowUploadMenu={setShowUploadMenu} /></div>;
}

async function openPreview(label, keyboard = false) {
  const trigger = page.getByRole("button", { name: t("Attach file"), exact: true });
  if (keyboard) { trigger.element().focus(); await userEvent.keyboard("{Enter}"); }
  else await trigger.click();
  const item = page.getByRole("menuitem", { name: t(label), exact: true });
  await expect.element(item).toBeVisible();
  if (keyboard) { await userEvent.keyboard("{End}"); if (label === "My listings") await userEvent.keyboard("{ArrowUp}"); await expect.element(item).toHaveFocus(); await userEvent.keyboard("{Enter}"); }
  else await item.click();
  await expect.element(page.getByRole("dialog", { name: t(label), exact: true })).toBeVisible();
  expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  return trigger;
}

async function finishAnimations(dialog) {
  await Promise.all(dialog.element().closest(".ouj-tool-sheet").getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
}

for (const locale of ["fa", "en"]) for (const theme of ["light", "dark"]) for (const width of [320, 1280]) {
  test(`listings sheet and composer fit ${locale}/${theme} at ${width}px`, async () => {
    setLocale(locale); document.documentElement.classList.toggle("dark", theme === "dark");
    await page.viewport(width, 800); await render(<Fixture isDesktop={width >= 768} />);
    const attachment = page.getByRole("button", { name: t("Attach file"), exact: true });
    await expect.element(page.getByRole("button", { name: t("My listings"), exact: true })).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: t("Daily work report"), exact: true })).not.toBeInTheDocument();
    const recording = page.getByRole("button", { name: t("Record voice message"), exact: true });
    const input = page.getByRole("textbox", { name: t("Type a message"), exact: true });
    for (const action of [attachment, recording]) {
      const rect = action.element().getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
    }
    const fieldRect = input.element().getBoundingClientRect();
    if (width === 320) expect(fieldRect.width).toBeGreaterThan(150);
    const attachmentRect = attachment.element().getBoundingClientRect();
    expect(Math.abs(attachmentRect.top + attachmentRect.height / 2 - fieldRect.top - fieldRect.height / 2)).toBeLessThanOrEqual(1);
    await attachment.click();
    const menu = page.getByRole("menu", { name: t("Attach file"), exact: true });
    await expect.element(menu).toBeVisible();
    expect(menu.element().querySelectorAll('[role="menuitem"]').length).toBe(6);
    for (const label of ["My listings", "Daily work report"]) {
      const action = page.getByRole("menuitem", { name: t(label), exact: true }); await expect.element(action).toBeVisible();
      expect(action.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
    if (width === 320) await page.screenshot({ path: `../../../.vitest/business-attachment-menu-${locale}-${theme}-${browser}.png` });
    await page.getByRole("menuitem", { name: t("My listings"), exact: true }).click();
    const dialog = page.getByRole("dialog", { name: t("My listings"), exact: true });
    await expect.element(dialog).toBeVisible(); await finishAnimations(dialog);
    await expect.element(page.getByText(t("These examples show the layout, not information from your account."), { exact: true })).toBeVisible();
    expect(document.querySelectorAll(".ouj-business-listing").length).toBe(3);
    const sheet = dialog.element().closest(".ouj-tool-sheet"), rect = sheet.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
    expect(rect.top).toBeGreaterThanOrEqual(12); expect(Math.abs(rect.bottom - 800)).toBeLessThanOrEqual(1);
    expect(sheet.scrollWidth).toBeLessThanOrEqual(sheet.clientWidth);
    expect(getComputedStyle(page.getByRole("searchbox", { name: t("Search listings"), exact: true }).element()).fontSize).toBe("16px");
    if ((width === 320 && theme === "dark") || (width === 1280 && theme === "light")) {
      await page.screenshot({ path: `../../../.vitest/business-listings-${locale}-${theme}-${width}-${browser}.png` });
    }
    await userEvent.keyboard("{Escape}"); await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(attachment).toHaveFocus();
  });
}

for (const locale of ["fa", "en"]) {
  test(`local search/filter/clear and keyboard navigation preserve the ${locale} draft and attachments`, async () => {
    setLocale(locale); await page.viewport(390, 812);
    const send = vi.fn(), api = vi.spyOn(window, "fetch").mockRejectedValue(new Error("Preview must stay local"));
    await render(<Fixture isDesktop handleSend={send} pendingUploadFiles={[{ id: "file", name: "report.pdf", mimeType: "application/pdf", sizeBytes: 20 }]} pendingUploadType="document" />);
    const input = page.getByRole("textbox", { name: t("Type a message"), exact: true }); await input.fill("Unsent report");
    const trigger = await openPreview("My listings", true);
    const dialog = page.getByRole("dialog", { name: t("My listings"), exact: true }); await expect.element(dialog).toBeVisible();
    await page.getByRole("button", { name: t("For rent"), exact: true }).click(); expect(document.querySelectorAll(".ouj-business-listing").length).toBe(1);
    await expect.element(page.getByRole("button", { name: t("For rent"), exact: true })).toHaveAttribute("aria-pressed", "true");
    const search = page.getByRole("searchbox", { name: t("Search listings"), exact: true });
    await search.fill("nothing-matches"); await userEvent.keyboard("{Enter}");
    await expect.element(page.getByText(t("No sample listings match your search."), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: t("Clear search"), exact: true }).click();
    await expect.element(search).toHaveFocus(); expect(document.querySelectorAll(".ouj-business-listing").length).toBe(1);
    await search.fill("nothing-matches"); await page.getByRole("button", { name: t("Clear filters"), exact: true }).click();
    expect(document.querySelectorAll(".ouj-business-listing").length).toBe(3);
    await expect.element(search).toHaveFocus();
    for (let step = 0; step < 9; step++) { await userEvent.keyboard("{Tab}"); expect(dialog.element().contains(document.activeElement), document.activeElement?.outerHTML).toBe(true); }
    await page.getByRole("button", { name: t("Close"), exact: true }).click();
    await expect.element(dialog).not.toBeInTheDocument(); await expect.element(trigger).toHaveFocus();
    await expect.element(input).toHaveValue("Unsent report"); await expect.element(page.getByText("report.pdf", { exact: true })).toBeVisible();
    expect(send).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
  });

  test(`daily report is a read-only Jalali demo and dismisses outside in ${locale}`, async () => {
    setLocale(locale); await page.viewport(390, 812); document.documentElement.classList.toggle("dark", locale === "fa");
    const send = vi.fn(); await render(<Fixture handleSend={send} />);
    const trigger = await openPreview("Daily work report");
    const dialog = page.getByRole("dialog", { name: t("Daily work report"), exact: true }); await expect.element(dialog).toBeVisible(); await finishAnimations(dialog);
    await expect.element(page.getByRole("region", { name: t("Daily activity summary"), exact: true })).toBeVisible();
    expect(dialog.element().querySelector("time").textContent).toBe(new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric" }).format(new Date()));
    expect(dialog.element().querySelectorAll("input,textarea").length).toBe(0);
    const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
    await page.screenshot({ path: `../../../.vitest/business-report-${locale}-${browser}.png` });
    await userEvent.click(document.querySelector(".ouj-tool-sheet-overlay"), { position: { x: 2, y: 2 } });
    await expect.element(dialog).not.toBeInTheDocument(); await expect.element(trigger).toHaveFocus(); expect(send).not.toHaveBeenCalled();
  });
}

for (const changed of ["chat", "account"]) {
  test(`changing ${changed} closes the preview and returning does not reopen it`, async () => {
    const screen = await render(<Fixture />); await openPreview("My listings");
    await expect.element(page.getByRole("dialog", { name: "My listings", exact: true })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search listings", exact: true }).fill("nothing-matches");
    await screen.rerender(<Fixture {...(changed === "chat" ? { activeChatId: "other-business-chat" } : { draftAccountId: "other-business-user" })} />);
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await screen.rerender(<Fixture />); await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await openPreview("My listings");
    await expect.element(page.getByRole("searchbox", { name: "Search listings", exact: true })).toHaveValue("");
    expect(document.querySelectorAll(".ouj-business-listing").length).toBe(3);
  });
}

test("uploading disables previews without changing the recording-mode switch", async () => {
  const screen = await render(<Fixture uploadBusy />);
  await expect.element(page.getByRole("button", { name: "Attach file", exact: true })).toBeDisabled();
  await expect.element(page.getByRole("menuitem", { name: "My listings", exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByRole("menuitem", { name: "Daily work report", exact: true })).not.toBeInTheDocument();
  await screen.rerender(<Fixture />);
  await page.getByRole("button", { name: "Record voice message", exact: true }).click();
  await expect.element(page.getByRole("button", { name: t("Record video message"), exact: true })).toBeVisible();
});

for (const locale of ["fa", "en"]) for (const label of ["My listings", "Daily work report"]) {
  test(`pulling the ${label} header closes the preview and restores the paperclip in ${locale}`, async () => {
    setLocale(locale); await page.viewport(390, 812); const send = vi.fn(); await render(<Fixture handleSend={send} />);
    const trigger = await openPreview(label);
    const dialog = page.getByRole("dialog", { name: t(label), exact: true }); await finishAnimations(dialog);
    const header = dialog.element().querySelector('[data-sheet-drag-region]');
    expect(header).not.toBeNull(); const rect = header.getBoundingClientRect();
    const init = { bubbles: true, composed: true, cancelable: true, pointerId: 44, pointerType: "touch", isPrimary: true, button: 0, clientX: rect.x + rect.width / 2, clientY: rect.y + 8 };
    header.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    window.dispatchEvent(new PointerEvent("pointermove", { ...init, buttons: 1, clientY: init.clientY + 150 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0, clientY: init.clientY + 150 }));
    await expect.element(dialog).not.toBeInTheDocument(); await expect.element(trigger).toHaveFocus(); expect(send).not.toHaveBeenCalled();
  });
}
