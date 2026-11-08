import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ChatWindowPanel from "../../../src/components/chat/ChatWindowPanel.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(async () => { vi.restoreAllMocks(); setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });

async function renderChat(locale, width, height, extra = {}) {
  await page.viewport(width, height); setLocale(locale);
  return render(<ChatFixture width={width} {...extra} />);
}

function ChatFixture({ width, ...extra }) {
  return <div style={{ position: "fixed", left: width >= 1024 ? 320 : 0, top: 0, width: width >= 1024 ? width - 320 : width, height: "100%", overflow: "hidden", transform: "translateZ(0)" }}>
    <ChatWindowPanel mobileTab="chat" activeChatId="upload-chat" activeChat={{ id: "upload-chat", type: "group", members: [] }}
      activeFallbackTitle="Reports" messages={[]} user={{ id: "upload-user", username: "alice" }} activeUploadProgress={null} uploadError={null}
      pendingUploadFiles={[]} handleSend={vi.fn()} onUploadFilesSelected={vi.fn()} {...extra} />
  </div>;
}

describe("upload menu placement and native file selection", () => {
  for (const locale of ["fa", "en"]) for (const [width, height] of [[1280, 800], [375, 812], [320, 568], [844, 390]]) {
    test(`keeps all upload actions inside the chat in ${locale} at ${width}×${height}`, async () => {
      const picker = vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(() => {});
      await renderChat(locale, width, height);
      if (locale === "fa" && [375, 1280].includes(width)) document.documentElement.classList.add("dark");
      await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
      const bounds = document.querySelector("[data-testid='conversation-canvas']").closest("section").getBoundingClientRect();
      const menu = page.getByRole("menu", { name: t("Attach file"), exact: true });
      await expect.element(menu).toBeVisible();
      expect(menu.element().scrollWidth).toBeLessThanOrEqual(menu.element().clientWidth);
      for (const label of ["Photo or Video", "Take photo", "Record video", "Document", "My listings", "Daily work report"]) {
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
    await expect.element(page.getByRole("menuitem", { name: t("Take photo"), exact: true })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(page.getByRole("menuitem", { name: t("Record video"), exact: true })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(page.getByRole("menuitem", { name: t("Document"), exact: true })).toHaveFocus();
    await userEvent.keyboard("{Escape}"); await expect.element(trigger).toHaveFocus();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{Enter}"); await userEvent.keyboard("{End}");
    await expect.element(page.getByRole("menuitem", { name: t("Daily work report"), exact: true })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}"); await userEvent.keyboard("{ArrowUp}");
    await expect.element(page.getByRole("menuitem", { name: t("Document"), exact: true })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(picker).toHaveBeenCalledOnce(); expect(selected.accept).toBe(""); expect(send).not.toHaveBeenCalled();
  });

  for (const locale of ["fa", "en"]) for (const [label, accept, name, type] of [
    ["Take photo", "image/*", "inspection.jpg", "image/jpeg"],
    ["Record video", "video/*", "inspection.mp4", "video/mp4"],
  ]) {
    test(`reviews ${label} through the existing media pipeline in ${locale} and permits recapture`, async () => {
      let selected;
      vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(function () { selected = this; });
      const onUpload = vi.fn(), send = vi.fn();
      await renderChat(locale, 375, 812, { onUploadFilesSelected: onUpload, handleSend: send, pendingUploadType: "media" });
      const input = page.getByRole("textbox"); await input.fill("گزارش بازدید"); input.element().focus();
      const file = new File(["capture"], name, { type });
      for (let attempt = 1; attempt <= 2; attempt++) {
        await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
        expect(onUpload).toHaveBeenCalledTimes(attempt - 1);
        await page.getByRole("menuitem", { name: t(label), exact: true }).click();
        expect(selected.accept).toBe(accept); expect(selected.getAttribute("capture")).toBe("environment");
        expect(selected.multiple).toBe(false);
        await userEvent.upload(page.getByLabelText(t(label), { exact: true }), file);
        expect(onUpload).toHaveBeenCalledTimes(attempt);
        const [files, kind, append] = onUpload.mock.calls.at(-1);
        expect(Array.from(files).map((item) => [item.name, item.type])).toEqual([[name, type]]);
        expect(kind).toBe("media"); expect(append).toBe(true);
        expect(selected.value).toBe(""); expect(send).not.toHaveBeenCalled();
        await expect.element(input).toHaveValue("گزارش بازدید");
        await expect.element(input).toHaveFocus();
      }
    });
  }

  test("cancelling native capture preserves the draft and attachments and allows another attempt", async () => {
    let selected;
    vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(function () { selected = this; });
    const onUpload = vi.fn(), send = vi.fn();
    await renderChat("fa", 375, 812, { onUploadFilesSelected: onUpload, handleSend: send, pendingUploadType: "document", pendingUploadFiles: [{ id: "report", name: "report.pdf", mimeType: "application/pdf", sizeBytes: 20 }] });
    const input = page.getByRole("textbox"); await input.fill("متن گزارش"); input.element().focus();
    await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
    await page.getByRole("menuitem", { name: t("Take photo"), exact: true }).click();
    selected.dispatchEvent(new Event("cancel", { bubbles: true }));
    expect(onUpload).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    await expect.element(input).toHaveValue("متن گزارش"); await expect.element(input).toHaveFocus();
    await expect.element(page.getByText("report.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
    await page.getByRole("menuitem", { name: t("Take photo"), exact: true }).click();
    await userEvent.upload(page.getByLabelText(t("Take photo"), { exact: true }), new File(["capture"], "inspection.jpg", { type: "image/jpeg" }));
    expect(onUpload).toHaveBeenCalledOnce(); expect(onUpload.mock.calls[0][2]).toBe(false);
  });

  for (const changedContext of ["chat", "account"]) {
    test(`discards camera results after the ${changedContext} changes`, async () => {
      vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(() => {});
      const onUpload = vi.fn();
      const screen = await renderChat("en", 375, 812, { onUploadFilesSelected: onUpload });
      await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
      await page.getByRole("menuitem", { name: t("Take photo"), exact: true }).click();
      const next = changedContext === "chat" ? { activeChatId: "other-chat" } : { user: { id: "other-user", username: "bob" } };
      await screen.rerender(<ChatFixture width={375} onUploadFilesSelected={onUpload} {...next} />);
      await userEvent.upload(page.getByLabelText(t("Take photo"), { exact: true }), new File(["capture"], "inspection.jpg", { type: "image/jpeg" }));
      expect(onUpload).not.toHaveBeenCalled();
    });
  }

  test("native capture is disabled while an upload is in progress", async () => {
    await renderChat("fa", 375, 812, { fileUploadInProgress: true });
    await expect.element(page.getByRole("button", { name: t("Attach file"), exact: true })).toBeDisabled();
    for (const label of ["Take photo", "Record video"]) {
      await expect.element(page.getByLabelText(t(label), { exact: true })).toBeDisabled();
    }
  });

  test("falls back to input click when showPicker is unavailable without acquiring a camera stream", async () => {
    const picker = vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(() => { throw new DOMException("Unsupported", "NotSupportedError"); });
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const media = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValue(new Error("No stream should be requested"));
    await renderChat("en", 375, 812);
    await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
    expect(picker).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
    await page.getByRole("menuitem", { name: t("Record video"), exact: true }).click();
    expect(click).toHaveBeenCalledOnce(); expect(click.mock.contexts[0].accept).toBe("video/*");
    expect(media).not.toHaveBeenCalled();
  });

  test("ignores an empty camera selection and results returned while uploading", async () => {
    let selected;
    vi.spyOn(HTMLInputElement.prototype, "showPicker").mockImplementation(function () { selected = this; });
    const onUpload = vi.fn();
    const screen = await renderChat("en", 375, 812, { onUploadFilesSelected: onUpload });
    await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
    await page.getByRole("menuitem", { name: t("Take photo"), exact: true }).click();
    selected.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpload).not.toHaveBeenCalled();
    await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
    await page.getByRole("menuitem", { name: t("Take photo"), exact: true }).click();
    await screen.rerender(<ChatFixture width={375} onUploadFilesSelected={onUpload} fileUploadInProgress />);
    // Simulate a native picker returning after the upload state changed.
    const transfer = new DataTransfer(); transfer.items.add(new File(["capture"], "inspection.jpg", { type: "image/jpeg" }));
    selected.files = transfer.files; selected.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpload).not.toHaveBeenCalled(); expect(selected.value).toBe("");
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
