import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessagingContext } from "../../../src/hooks/chat/useMessagingTools.js";
import { messagingRequest } from "../../../src/api/messagingApi.js";
import { SchedulePanel, SearchPanel } from "../../../src/components/chat/tools/ToolsPanels.jsx";
import ToolDialog from "../../../src/components/chat/tools/ToolDialog.jsx";
import { setLocale } from "../../../src/i18n/locale.js";
import { tehranDateTimeToIso, tehranDayBoundary, tehranToday } from "../../../src/utils/persianDateTime.js";
import "../../../src/index.css";

vi.mock("../../../src/api/messagingApi.js", () => ({ messagingRequest: vi.fn() }));
beforeEach(async () => { await page.viewport(390, 844); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); setLocale("en"); });
const withTools = (panel, act = vi.fn()) => <MessagingContext.Provider value={{ activeChatId: "calendar-chat", act, busy: false }}>
  <ToolDialog title="Chat tools" onClose={() => {}}>{panel}</ToolDialog>
</MessagingContext.Provider>;

async function today(label, nextDay = false) {
  await page.getByRole("button", { name: `Open calendar ${label}`, exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  if (nextDay) {
    await page.getByRole("button", { name: `Open calendar ${label}`, exact: true }).click();
    const current = tehranToday(), target = current.add({ days: 1 });
    if (target.month !== current.month) await page.getByRole("button", { name: "Next month", exact: true }).click();
    const dayLabel = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long", year: "numeric",
    }).format(target.toDate("Asia/Tehran"));
    await page.getByRole("button", { name: dayLabel, exact: false }).click();
  }
}
async function time(hour, minute) {
  await page.getByRole("button", { name: "Open clock: Time", exact: true }).click();
  await page.getByRole("button", { name: `Hour ${hour}`, exact: true }).click();
  await page.getByRole("button", { name: `Minute ${minute}`, exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

test("scheduling submits Tehran UTC, preserves fields on save failure, and clears only on success", async () => {
  setLocale("en"); messagingRequest.mockResolvedValue({ messages: [] });
  const date = tehranToday().add({ days: 1 }).toString();
  const act = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "scheduled-id" });
  await render(withTools(<SchedulePanel />, act));
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("گزارش روزانه");
  await today("Date", true); await time(9, 15);
  await page.getByRole("button", { name: "Schedule message", exact: true }).click();
  expect(act).toHaveBeenCalledWith("/chats/calendar-chat/scheduled", { method: "POST", body: { body: "گزارش روزانه", dueAt: tehranDateTimeToIso(date, "09:15") } });
  await expect.element(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("گزارش روزانه");
  await expect.element(page.getByRole("button", { name: "Clear Date", exact: true })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Clear Time", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Schedule message", exact: true }).click();
  await expect.element(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  await expect.element(page.getByRole("button", { name: "Clear Date", exact: true })).not.toBeInTheDocument();
});

test("missing or past scheduling values show inline errors without sending", async () => {
  setLocale("en"); messagingRequest.mockResolvedValue({ messages: [] });
  const act = vi.fn(); await render(withTools(<SchedulePanel />, act));
  await page.getByRole("button", { name: "Schedule message", exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent("Choose a message, a date and a time.");
  await expect.element(page.getByRole("textbox", { name: "Message", exact: true })).toHaveFocus();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Keep this draft");
  await today("Date"); await time(0, 0);
  await page.getByRole("button", { name: "Schedule message", exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent("Choose a time between 10 seconds and one year from now.");
  expect(act).not.toHaveBeenCalled();
});

test("search applies inclusive Tehran day boundaries and clears a date independently", async () => {
  setLocale("en"); messagingRequest.mockResolvedValue({ messages: [] });
  await render(withTools(<SearchPanel />));
  await page.getByRole("textbox", { name: "Search messages", exact: true }).fill("گزارش");
  await today("From date"); await today("To date");
  const date = tehranToday().toString();
  const latestParams = () => new URL(`http://test${messagingRequest.mock.calls.at(-1)?.[0] || "/"}`).searchParams;
  await expect.poll(() => latestParams().get("after")).toBe(tehranDayBoundary(date));
  await expect.poll(() => latestParams().get("before")).toBe(tehranDayBoundary(date, true));
  await page.getByRole("button", { name: "Clear From date", exact: true }).click();
  await expect.poll(() => latestParams().has("after")).toBe(false);
  expect(latestParams().get("before")).toBe(tehranDayBoundary(date, true));
});
