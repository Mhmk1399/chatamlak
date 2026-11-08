import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ChatWindowPanel from "../../../src/components/chat/ChatWindowPanel.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import { clearChatDraft, readChatDraft, saveChatDraft } from "../../../src/utils/chatDrafts.js";
import { readEmojiPreferences } from "../../../src/utils/emojiPreferences.js";
import "../../../src/index.css";

const owner = "emoji-test-user";
function ChatFixture({ width = 375, ...extra }) {
  return <div style={{ position: "fixed", inset: 0, width, overflow: "hidden", transform: "translateZ(0)" }}>
    <ChatWindowPanel mobileTab="chat" activeChatId="emoji-chat" activeChat={{ id: "emoji-chat", type: "group", members: [] }}
      activeFallbackTitle="Reports" messages={[]} user={{ id: owner, username: "alice" }} activeUploadProgress={null}
      pendingUploadFiles={[]} handleSend={vi.fn()} onUploadFilesSelected={vi.fn()} {...extra} />
  </div>;
}
afterEach(async () => {
  vi.restoreAllMocks(); clearChatDraft(owner, "emoji-chat");
  localStorage.removeItem(`ouj-emoji-preferences-v1:${owner}`); setLocale("en");
  document.documentElement.classList.remove("dark"); await page.viewport(1280, 800);
});
async function setup(locale = "fa", width = 375, height = 812, extra = {}) {
  setLocale(locale); await page.viewport(width, height);
  return render(<ChatFixture width={width} {...extra} />);
}
async function openPicker() {
  await page.getByRole("button", { name: t("Choose emoji"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: t("Choose emoji"), exact: true });
  await expect.element(dialog).toBeVisible();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await Promise.all(dialog.element().closest(".ouj-tool-sheet").getAnimations().map((animation) => animation.finished.catch(() => {})));
  return dialog;
}

async function dismissBackdrop() {
  await userEvent.click(document.querySelector(".ouj-tool-sheet-overlay"), { position: { x: 2, y: 2 } });
}

test("inserts a searched Persian emoji at the selected range without auto sending", async () => {
  const send = vi.fn(), typing = vi.fn();
  await setup("fa", 375, 812, { handleSend: send, onMessageInput: typing });
  const input = page.getByRole("textbox", { name: t("Type a message"), exact: true });
  await input.fill("Report HERE end"); input.element().focus(); input.element().setSelectionRange(7, 11);
  const dialog = await openPicker();
  await page.getByRole("combobox", { name: t("Search emojis"), exact: true }).fill("قلب قرمز");
  await expect.element(page.getByRole("gridcell", { name: "قلب قرمز", exact: true })).toBeVisible();
  const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
  await page.screenshot({ path: `../../../.vitest/emoji-fa-mobile-${browser}.png` });
  await page.getByRole("gridcell", { name: "قلب قرمز", exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(input).toHaveValue("Report ❤️ end"); await expect.element(input).toHaveFocus();
  expect(input.element().selectionStart).toBe(9); expect(typing).toHaveBeenLastCalledWith("Report ❤️ end");
  expect(readChatDraft(owner, "emoji-chat").body).toBe("Report ❤️ end");
  expect(readEmojiPreferences(owner).recent).toEqual(["2764-fe0f"]); expect(send).not.toHaveBeenCalled();
  await page.getByRole("button", { name: t("Send message"), exact: true }).click();
  expect(send).toHaveBeenCalledOnce();
});

for (const locale of ["fa", "en"]) for (const [width, height] of [[1280, 800], [375, 812], [320, 568], [844, 390]]) {
  test(`keeps the categorized emoji panel within ${locale} ${width}×${height}, with bounded rendering and keyboard dismissal`, async () => {
    await setup(locale, width, height);
    if (locale === "fa") document.documentElement.classList.add("dark");
    const dialog = await openPicker();
    for (const name of ["Smileys and people", "Animals and nature", "Food and drink", "Travel and places", "Activities", "Objects", "Symbols", "Flags"]) {
      await expect.element(page.getByRole("tab", { name: t(name), exact: true })).toBeVisible();
    }
    const bounds = dialog.element().getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width);
    expect(bounds.top).toBeGreaterThanOrEqual(12); expect(bounds.bottom).toBeLessThanOrEqual(height);
    expect(dialog.element().scrollWidth).toBeLessThanOrEqual(dialog.element().clientWidth);
    expect(dialog.element().querySelectorAll('[role="gridcell"]').length).toBeLessThan(500);
    if ([375, 1280].includes(width)) {
      const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
      await page.screenshot({ path: `../../../.vitest/emoji-${locale}-${width}-${browser}.png` });
    }
    await page.getByRole("tab", { name: t("Animals and nature"), exact: true }).click();
    const search = page.getByRole("combobox", { name: t("Search emojis"), exact: true });
    await search.fill("nothing-matches-this-query-56387");
    await expect.element(page.getByText(t("No emojis found"), { exact: true }).nth(1)).toBeVisible();
    await page.getByRole("button", { name: t("Clear search"), exact: true }).click();
    await expect.element(search).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: t("Choose emoji"), exact: true })).toHaveFocus();
  });
}

test("supports English aliases, keyboard selection, skin tones and recent choices after reopening", async () => {
  await setup("en", 1280, 800);
  const input = page.getByRole("textbox", { name: t("Type a message"), exact: true });
  await openPicker();
  await page.getByRole("button", { name: t("Default skin tone"), exact: true }).click();
  await page.getByRole("button", { name: t("Medium skin tone"), exact: true }).click();
  const search = page.getByRole("combobox", { name: t("Search emojis"), exact: true });
  await search.fill("thumbs up");
  await expect.element(page.getByRole("gridcell", { name: "thumbs up", exact: true })).toBeVisible();
  search.element().focus(); await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(input).toHaveValue("👍🏽");
  await openPicker(); await expect.element(page.getByRole("tab", { name: t("Recently used"), exact: true })).toBeVisible();
  expect(readEmojiPreferences(owner)).toEqual({ tone: "1f3fd", recent: ["1f44d-1f3fd"] });
  await page.getByRole("button", { name: t("Close emoji picker"), exact: true }).click();
});

test("resizing the emoji sheet with Enter never sends the pending chat attachments", async () => {
  const send = vi.fn();
  await setup("en", 1280, 800, { handleSend: send, pendingUploadType: "document",
    pendingUploadFiles: [{ id: "report-file", name: "report.pdf", mimeType: "application/pdf", sizeBytes: 20 }] });
  const input = page.getByRole("textbox", { name: "Type a message", exact: true }); await input.fill("Daily report");
  await openPicker();
  const resize = page.getByRole("button", { name: "Expand sheet", exact: true }); resize.element().focus();
  await userEvent.keyboard("{Enter}");
  expect(send).not.toHaveBeenCalled();
  await expect.element(page.getByRole("button", { name: "Show half-height sheet", exact: true })).toBeVisible();
  expect(send).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}"); await expect.element(input).toHaveValue("Daily report");
  await expect.element(page.getByText("report.pdf", { exact: true })).toBeVisible();
});

test("preserves the draft on outside dismissal and rejects a whole emoji beyond the message limit", async () => {
  await setup("en", 375, 812, { messageMaxChars: 3 });
  const input = page.getByRole("textbox", { name: t("Type a message"), exact: true }); await input.fill("hi");
  let dialog = await openPicker(); await dismissBackdrop(); await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(input).toHaveValue("hi"); input.element().setSelectionRange(2, 2);
  dialog = await openPicker();
  await page.getByRole("combobox", { name: t("Search emojis"), exact: true }).fill("red heart");
  await page.getByRole("gridcell", { name: "red heart", exact: true }).click();
  await expect.element(input).toHaveValue("hi");
  await expect.element(page.getByRole("alert")).toHaveTextContent(t("This emoji exceeds the message length limit."));
  expect(readEmojiPreferences(owner).recent).toEqual([]);
});

for (const locale of ["fa", "en"]) for (const width of [375, 1280]) {
  test(`dismisses on the chat backdrop in ${locale} at ${width}px without changing the draft`, async () => {
    await setup(locale, width, 812);
    const input = page.getByRole("textbox", { name: t("Type a message"), exact: true });
    await input.fill("گزارش بازدید");
    const dialog = await openPicker();
    await dismissBackdrop();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: t("Choose emoji"), exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect.element(input).toHaveValue("گزارش بازدید");
    expect(readChatDraft(owner, "emoji-chat").body).toBe("گزارش بازدید");
  });
}

for (const locale of ["fa", "en"]) {
  test(`dismisses on a mobile backdrop tap in ${locale}, while interactions inside stay open`, async () => {
    await setup(locale, 375, 812);
    const dialog = await openPicker();
    await page.getByRole("tab", { name: t("Animals and nature"), exact: true }).click();
    await expect.element(dialog).toBeVisible();
    await dismissBackdrop();
    await expect.element(dialog).not.toBeInTheDocument();
  });
}

test("backdrop dismissal does not activate background actions, and the emoji trigger reopens once", async () => {
  await setup("en", 375, 812);
  let dialog = await openPicker();
  await dismissBackdrop();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(page.getByRole("menuitem", { name: t("Take photo"), exact: true })).not.toBeInTheDocument();
  await page.getByRole("button", { name: t("Attach file"), exact: true }).click();
  await expect.element(page.getByRole("menuitem", { name: t("Take photo"), exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  dialog = await openPicker();
  await dismissBackdrop();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: t("Choose emoji"), exact: true })).toHaveAttribute("aria-expanded", "false");
});

test("emoji text remains available when file uploads are disabled, and context changes close the panel", async () => {
  const screen = await setup("fa", 375, 812, { fileUploadEnabled: false });
  await expect.element(page.getByRole("button", { name: t("Choose emoji"), exact: true })).toBeEnabled();
  const dialog = await openPicker();
  await screen.rerender(<ChatFixture activeChatId="other-chat" />);
  await expect.element(dialog).not.toBeInTheDocument();
  expect(readEmojiPreferences("another-account").recent).toEqual([]);
});

test("keeps the reply target with the emoji draft", async () => {
  await setup("en", 375, 812, { replyTarget: { id: "reply-1", username: "advisor", displayName: "Advisor", body: "Inspection" } });
  const input = page.getByRole("textbox"); await input.fill("Report "); input.element().setSelectionRange(7, 7);
  await openPicker(); await page.getByRole("combobox", { name: t("Search emojis"), exact: true }).fill("red heart");
  await page.getByRole("gridcell", { name: "red heart", exact: true }).click();
  expect(readChatDraft(owner, "emoji-chat")).toMatchObject({ body: "Report ❤️", replyTo: { id: "reply-1" } });
});

test("inserts into an edited message while preserving the unsent normal draft", async () => {
  saveChatDraft(owner, "emoji-chat", "Unsent report");
  const send = vi.fn();
  await setup("en", 375, 812, { editTarget: { id: "edit-1", body: "Edited ", files: [] }, handleSend: send });
  const input = page.getByRole("textbox"); await expect.element(input).toHaveValue("Edited ");
  input.element().setSelectionRange(7, 7); await openPicker();
  await page.getByRole("combobox", { name: t("Search emojis"), exact: true }).fill("red heart");
  await page.getByRole("gridcell", { name: "red heart", exact: true }).click();
  await expect.element(input).toHaveValue("Edited ❤️");
  expect(readChatDraft(owner, "emoji-chat").body).toBe("Unsent report"); expect(send).not.toHaveBeenCalled();
  await page.getByRole("button", { name: t("Save edit"), exact: true }).click(); expect(send).toHaveBeenCalledOnce();
});

test("switches language and theme with the picker open without losing search or draft", async () => {
  await setup("fa", 375, 812);
  const input = page.getByRole("textbox", { name: t("Type a message"), exact: true }); await input.fill("گزارش امروز");
  await openPicker(); await page.getByRole("combobox", { name: t("Search emojis"), exact: true }).fill("قلب قرمز");
  document.documentElement.classList.add("dark"); setLocale("en");
  const dialog = page.getByRole("dialog", { name: "Choose emoji", exact: true }); await expect.element(dialog).toBeVisible();
  await expect.element(page.getByRole("combobox", { name: "Search emojis", exact: true })).toHaveValue("قلب قرمز");
  await expect.element(page.getByRole("gridcell", { name: "red heart", exact: true })).toBeVisible();
  await expect.poll(() => getComputedStyle(dialog.element()).color).toBe("rgb(240, 239, 245)");
  await page.getByRole("button", { name: "Close emoji picker", exact: true }).click();
  await expect.element(page.getByRole("textbox", { name: t("Type a message"), exact: true })).toHaveValue("گزارش امروز");
});
