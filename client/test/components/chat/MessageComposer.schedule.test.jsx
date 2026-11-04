import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MessageComposer } from "../../../src/components/chat/messages/MessageComposer.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import { messagingRequest } from "../../../src/api/messagingApi.js";
import { readChatDraft, clearChatDraft } from "../../../src/utils/chatDrafts.js";
import { tehranToday, tehranDateTimeToIso } from "../../../src/utils/persianDateTime.js";
import "../../../src/index.css";

vi.mock("../../../src/api/messagingApi.js", () => ({ messagingRequest: vi.fn() }));
afterEach(async () => { vi.clearAllMocks(); clearChatDraft("schedule-user", "schedule-chat"); setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });
const base = { activeChatId: "schedule-chat", currentUsername: "scheduler", draftAccountId: "schedule-user", isDesktop: true,
  pendingUploadFiles: [], pendingUploadType: "media", fileUploadEnabled: true, setShowUploadMenu: vi.fn(),
  onComposerResize: vi.fn(), onMessageInput: vi.fn() };
const pointer = (button, type, pointerType = "mouse", extra = {}) => button.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 42, pointerType, button: 0, isPrimary: true, clientX: 100, clientY: 100, ...extra }));
async function setup(locale = "en", extra = {}) {
  setLocale(locale); const send = vi.fn().mockResolvedValue(true);
  await render(<MessageComposer {...base} handleSend={send} {...extra} />);
  await page.getByRole("textbox", { name: t("Type a message"), exact: true }).fill("گزارش امروز آماده است");
  return { send, button: page.getByRole("button", { name: t("Send message"), exact: true }) };
}

test("send icon points left in Persian", async () => {
  const { button } = await setup("fa");
  expect(getComputedStyle(button.element().querySelector(".lucide-send-horizontal")).scale).toBe("-1 1");
});
test("a short click still sends immediately and the English icon points right", async () => {
  const { button, send } = await setup();
  expect(getComputedStyle(button.element().querySelector(".lucide-send-horizontal")).scale).not.toBe("-1 1");
  await button.click(); expect(send).toHaveBeenCalledOnce();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});
test("keyboard access opens scheduling and cancel preserves the saved draft", async () => {
  const { button, send } = await setup(); button.element().focus();
  await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
  await expect.element(page.getByRole("dialog", { name: "Schedule message", exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}"); expect(send).not.toHaveBeenCalled();
  expect(readChatDraft("schedule-user", "schedule-chat").body).toBe("گزارش امروز آماده است");
  await expect.element(button).toHaveFocus();
});
test("a canceled pointer hold cannot schedule or accidentally send", async () => {
  const { button, send } = await setup();
  pointer(button.element(), "pointerdown"); pointer(button.element(), "pointercancel"); button.element().click();
  await new Promise(resolve => setTimeout(resolve, 500));
  expect(send).not.toHaveBeenCalled(); await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});
test("scheduling retries preserve the draft and successful save clears it without an immediate send", async () => {
  messagingRequest.mockRejectedValueOnce(new Error("Unable to complete this operation.")).mockResolvedValue({ id: "scheduled" });
  const { button, send } = await setup();
  button.element().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  const dialog = page.getByRole("dialog", { name: "Schedule message", exact: true });
  await expect.element(dialog).toBeVisible();
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  const current = tehranToday(), date = current.add({ days: 1 });
  if (current.month !== date.month) await page.getByRole("button", { name: "Next month", exact: true }).click();
  const label = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tehran" }).format(date.toDate("Asia/Tehran"));
  await page.getByRole("button", { name: label, exact: false }).click();
  await page.getByRole("button", { name: "Open clock: Time", exact: true }).click();
  await page.getByRole("button", { name: "Hour 9", exact: true }).click();
  await page.getByRole("button", { name: "Minute 15", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Schedule message", exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent("Unable to complete this operation.");
  expect(readChatDraft("schedule-user", "schedule-chat").body).toBe("گزارش امروز آماده است");
  await page.getByRole("button", { name: "Schedule message", exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument(); expect(send).not.toHaveBeenCalled();
  expect(messagingRequest).toHaveBeenLastCalledWith("/chats/schedule-chat/scheduled", { method: "POST", body: { body: "گزارش امروز آماده است", dueAt: tehranDateTimeToIso(date.toString(), "09:15") } });
  expect(readChatDraft("schedule-user", "schedule-chat")).toBeNull();
  await expect.element(page.getByRole("textbox", { name: "Type a message", exact: true })).toHaveValue("");
});
for (const pointerType of ["mouse", "touch"]) test(`${pointerType} hold opens scheduling without immediately sending`, async () => {
  const { button, send } = await setup("en", { isDesktop: pointerType !== "touch" });
  pointer(button.element(), "pointerdown", pointerType);
  await expect.poll(() => document.querySelector('[role="dialog"][aria-label="Schedule message"]'), { timeout: 5000 }).not.toBeNull();
  pointer(button.element(), "pointerup", pointerType); button.element().click();
  expect(send).not.toHaveBeenCalled();
  await expect.element(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("گزارش امروز آماده است");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect.element(page.getByRole("textbox", { name: "Type a message", exact: true })).toHaveValue("گزارش امروز آماده است");
});
