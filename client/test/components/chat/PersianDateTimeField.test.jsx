import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { PersianDateField, PersianTimeField } from "../../../src/components/common/PersianDateTimeField.jsx";
import ToolDialog from "../../../src/components/chat/tools/ToolDialog.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import { tehranToday } from "../../../src/utils/persianDateTime.js";
import "../../../src/index.css";

afterEach(async () => {
  vi.restoreAllMocks(); setLocale("en"); document.documentElement.classList.remove("dark");
  await page.viewport(1280, 800);
});

function Fields({ onClose = () => {}, initialDate = "2025-03-21" }) {
  const [date, setDate] = useState(initialDate), [time, setTime] = useState("09:17");
  return <ToolDialog title="Chat tools" onClose={onClose}>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <PersianDateField label={t("Date")} value={date} onChange={setDate} />
      <PersianTimeField label={t("Time")} value={time} onChange={setTime} />
    </div>
    <output data-testid="date-value">{date || "empty"}</output>
    <output data-testid="time-value">{time || "empty"}</output>
  </ToolDialog>;
}

for (const locale of ["fa", "en"]) for (const [width, height] of [[320, 740], [390, 740], [1280, 740], [844, 390]]) {
  test(`Jalali calendar is usable in ${locale} at ${width}px with nested focus and escape`, async () => {
    setLocale(locale); await page.viewport(width, height);
    if (width !== 390) document.documentElement.classList.add("dark");
    const close = vi.fn(); await render(<Fields onClose={close} />);
    const trigger = page.getByRole("button", { name: `${t("Open calendar")} ${t("Date")}`, exact: true });
    await trigger.click();
    const calendar = page.getByRole("dialog", { name: t("Persian calendar"), exact: true });
    await expect.element(calendar).toBeVisible();
    expect(calendar.element().textContent).toContain("فروردین");
    expect(calendar.element().textContent).toContain("۱۴۰۴");
    const rect = calendar.element().closest(".ouj-date-popover").getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(10); expect(rect.right).toBeLessThanOrEqual(width - 10);
    expect(rect.top).toBeGreaterThanOrEqual(10); expect(rect.bottom).toBeLessThanOrEqual(height - 10);
    // React Aria retains hidden native inputs for form integration, never as the visible control.
    for (const input of document.querySelectorAll("input[type='date'],input[type='datetime-local'],input[type='time']")) {
      expect(input.tabIndex).toBe(-1);
    }
    await page.getByRole("button", { name: t("Next month"), exact: true }).click();
    expect(calendar.element().textContent).toContain("اردیبهشت");
    await page.getByRole("button", { name: t("Previous month"), exact: true }).click();
    expect(calendar.element().textContent).toContain("فروردین");
    if (width === 390 || width === 320) {
      const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
      await page.screenshot({ path: `../../../.vitest/calendar-${locale}-${width}-${browser}.png` });
    }
    await userEvent.keyboard("{Escape}");
    await expect.element(calendar).not.toBeInTheDocument(); expect(close).not.toHaveBeenCalled();
    await expect.element(trigger).toHaveFocus();
    await userEvent.keyboard("{Escape}"); expect(close).toHaveBeenCalledOnce();
  });
}

test("selects a Persian day as an ISO date, supports today and clearing", async () => {
  setLocale("en"); await render(<Fields />);
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  // The second visible day is 2 Farvardin, regardless of the browser's calendar settings.
  const cells = document.querySelectorAll(".ouj-calendar-day:not([data-outside-month])");
  await userEvent.click(cells[1]);
  await expect.element(page.getByTestId("date-value")).toHaveTextContent("2025-03-22");
  await page.getByRole("button", { name: "Open calendar Date", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect.element(page.getByTestId("date-value")).toHaveTextContent(tehranToday().toString());
  await page.getByRole("button", { name: "Clear Date", exact: true }).click();
  await expect.element(page.getByTestId("date-value")).toHaveTextContent("empty");
});

test("custom clock preserves precise typed minutes and offers 24-hour choices", async () => {
  setLocale("en"); await page.viewport(320, 568); await render(<Fields />);
  const trigger = page.getByRole("button", { name: "Open clock: Time", exact: true });
  await trigger.click();
  const clock = page.getByRole("dialog", { name: "Choose time", exact: true });
  await expect.element(clock).toBeVisible();
  await page.getByRole("button", { name: "Hour 23", exact: true }).click();
  await expect.element(page.getByTestId("time-value")).toHaveTextContent("23:17");
  await page.getByRole("button", { name: "Minute 55", exact: true }).click();
  await expect.element(page.getByTestId("time-value")).toHaveTextContent("23:55");
  expect(clock.element().getBoundingClientRect().right).toBeLessThanOrEqual(310);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect.element(clock).not.toBeInTheDocument();
  const segments = document.querySelectorAll(".ouj-date-field:last-child [role='spinbutton']");
  segments[1].focus(); await userEvent.keyboard("{ArrowDown}");
  await expect.element(page.getByTestId("time-value")).toHaveTextContent("23:54");
  await page.getByRole("button", { name: "Clear Time", exact: true }).click();
  await expect.element(page.getByTestId("time-value")).toHaveTextContent("empty");
});
