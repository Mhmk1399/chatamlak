import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ChatWindowPanel from "../../../src/components/chat/ChatWindowPanel.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(async () => { vi.restoreAllMocks(); setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });

async function renderChat(locale, width, height, extra = {}) {
  await page.viewport(width, height); setLocale(locale);
  await render(<div style={{ position: "fixed", left: width >= 1024 ? 320 : 0, top: 0, width: width >= 1024 ? width - 320 : width, height: "100%", overflow: "hidden", transform: "translateZ(0)" }}>
    <ChatWindowPanel mobileTab="chat" activeChatId="upload-chat" activeChat={{ id: "upload-chat", type: "group", members: [] }}
      activeFallbackTitle="Reports" messages={[]} user={{ id: "upload-user", username: "alice" }} activeUploadProgress={null} uploadError={null}
      pendingUploadFiles={[]} handleSend={vi.fn()} onUploadFilesSelected={vi.fn()} {...extra} />
  </div>);
}

describe("upload menu placement and native file selection", () => {
  for (const locale of ["fa", "en"]) for (const [width, height] of [[1280, 800], [375, 812], [320, 568], [844, 390]]) {
    test(`keeps both upload actions inside the chat in ${locale} at ${width}×${height}`, async () => {
      const picker = vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(() => {});
      await renderChat(locale, width, height);
      if (locale === "fa" && [375, 1280].includes(width)) document.documentElement.classList.add("dark");
      await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
      const bounds = document.querySelector("[data-testid='conversation-canvas']").closest("section").getBoundingClientRect();
      for (const label of ["Photo or Video", "Document"]) {
        const action = page.getByText(t(label), { exact: true });
        await expect.element(action).toBeVisible();
        const button = action.element().closest("button"), rect = button.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(Math.max(8, bounds.left));
        expect(rect.right).toBeLessThanOrEqual(Math.min(width - 8, bounds.right));
        expect(rect.top).toBeGreaterThanOrEqual(8); expect(rect.bottom).toBeLessThanOrEqual(height - 8);
        expect(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button")).toBe(button);
      }
      if (locale === "fa" && [375, 1280].includes(width)) {
        const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
        await page.screenshot({ path: `../../../.vitest/upload-${width}-${browser}.png` });
      }
      await page.getByText(t("Photo or Video"), { exact: true }).click();
      expect(picker).toHaveBeenCalledOnce();
      await expect.element(page.getByText(t("Document"), { exact: true })).not.toBeInTheDocument();
    });
  }
  test("keyboard actions choose the document picker without submitting existing attachments", async () => {
    let selected;
    const picker = vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(function () { selected = this; });
    const send = vi.fn();
    await renderChat("fa", 1280, 800, { handleSend: send, pendingUploadFiles: [{ id: "report", name: "report.pdf", mimeType: "application/pdf", sizeBytes: 20 }], pendingUploadType: "document" });
    const trigger = page.getByRole("button", { name: t("Attach file"), exact: true });
    trigger.element().focus(); await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menuitem", { name: t("Photo or Video"), exact: true })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(page.getByRole("menuitem", { name: t("Document"), exact: true })).toHaveFocus();
    await userEvent.keyboard("{Escape}"); await expect.element(trigger).toHaveFocus();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{Enter}"); await userEvent.keyboard("{End}"); await userEvent.keyboard("{Enter}");
    expect(picker).toHaveBeenCalledOnce(); expect(selected.accept).toBe(""); expect(send).not.toHaveBeenCalled();
  });
  test("keeps mobile composition focused, repositions after a height change and closes on an outside tap", async () => {
    await renderChat("fa", 375, 812);
    const input = page.getByRole("textbox"); await input.fill("گزارش بازدید"); input.element().focus();
    const trigger = page.getByRole("button", { name: t("Attach file"), exact: true }); await trigger.click();
    await expect.element(input).toHaveFocus();
    await page.viewport(375, 480);
    const action = page.getByRole("menuitem", { name: t("Document"), exact: true });
    await expect.poll(() => action.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(472);
    await expect.poll(() => action.element().getBoundingClientRect().bottom - trigger.element().getBoundingClientRect().top).toBeLessThanOrEqual(-8);
    await input.click(); await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await expect.element(input).toHaveValue("گزارش بازدید");
  });
});
