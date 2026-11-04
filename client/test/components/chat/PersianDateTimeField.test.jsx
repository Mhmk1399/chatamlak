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

for (const locale of ["fa", "en"]) for (const width of [390, 1280]) {
  test(`date and clock icons share the logical end edge in ${locale} at ${width}px`, async () => {
    setLocale(locale); await page.viewport(width, 800);
    if (locale === "fa") document.documentElement.classList.add("dark");
    await render(<Fields />);
    const calendar = page.getByRole("button", { name: `${t("Open calendar")} ${t("Date")}`, exact: true }).element();
    const clock = page.getByRole("button", { name: t("Open clock: {label}", { label: t("Time") }), exact: true }).element();
    const distance = (button) => {
      const field = button.closest(".ouj-date-control").getBoundingClientRect(), icon = button.getBoundingClientRect();
      return locale === "fa" ? icon.left - field.left : field.right - icon.right;
    };
    expect(distance(calendar)).toBeLessThan(12); expect(distance(clock)).toBeLessThan(12);
    expect(Math.abs(distance(calendar) - distance(clock))).toBeLessThanOrEqual(1);
    if (width === 390) {
      const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
      await page.screenshot({ path: `../../../.vitest/date-time-controls-${locale}-${browser}.png` });
    }
  });

  test(`clicking either field's empty area opens its picker in ${locale} at ${width}px`, async () => {
    setLocale(locale); await page.viewport(width, 800); await render(<Fields />);
    const calendarButton = page.getByRole("button", { name: `${t("Open calendar")} ${t("Date")}`, exact: true });
    const calendarField = calendarButton.element().closest(".ouj-date-control");
    await userEvent.click(calendarField, { position: { x: calendarField.clientWidth / 2, y: 3 } });
    const calendar = page.getByRole("dialog", { name: t("Persian calendar"), exact: true });
    await expect.element(calendar).toBeVisible();
    await userEvent.keyboard("{Escape}"); await expect.element(calendar).not.toBeInTheDocument();
    const clockButton = page.getByRole("button", { name: t("Open clock: {label}", { label: t("Time") }), exact: true });
    const clockField = clockButton.element().closest(".ouj-date-control");
    await userEvent.click(clockField, { position: { x: clockField.clientWidth / 2, y: 3 } });
    const clock = page.getByRole("dialog", { name: t("Choose time"), exact: true });
    await expect.element(clock).toBeVisible();
    await page.getByRole("button", { name: t("Done"), exact: true }).click();
    await expect.element(clock).not.toBeInTheDocument();
    await expect.element(page.getByTestId("date-value")).toHaveTextContent("2025-03-21");
    await expect.element(page.getByTestId("time-value")).toHaveTextContent("09:17");
  });
}

test("outside clock dismissal does not reopen it through portaled field events", async () => {
  setLocale("en"); await page.viewport(1280, 800);
  const close = vi.fn(); await render(<Fields onClose={close} />);
  const trigger = page.getByRole("button", { name: "Open clock: Time", exact: true });
  await trigger.click();
  const clock = page.getByRole("dialog", { name: "Choose time", exact: true }); await expect.element(clock).toBeVisible();
  await userEvent.click(document.body, { position: { x: 1, y: 1 } });
  await expect.element(clock).not.toBeInTheDocument(); expect(close).not.toHaveBeenCalled();
});

for (const locale of ["fa", "en"]) {
  test(`clicking editable segments opens both pickers, while Clear only clears in ${locale}`, async () => {
    setLocale(locale); await page.viewport(390, 800); await render(<Fields />);
    const calendarField = page.getByRole("button", { name: `${t("Open calendar")} ${t("Date")}`, exact: true }).element().closest(".ouj-date-control");
    await userEvent.click(calendarField.querySelector('[role="spinbutton"]'));
    const calendar = page.getByRole("dialog", { name: t("Persian calendar"), exact: true }); await expect.element(calendar).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await page.getByRole("button", { name: t("Clear {label}", { label: t("Date") }), exact: true }).click();
    await expect.element(calendar).not.toBeInTheDocument(); await expect.element(page.getByTestId("date-value")).toHaveTextContent("empty");
    const clockField = page.getByRole("button", { name: t("Open clock: {label}", { label: t("Time") }), exact: true }).element().closest(".ouj-date-control");
    await userEvent.click(clockField.querySelector('[role="spinbutton"]'));
    const clock = page.getByRole("dialog", { name: t("Choose time"), exact: true }); await expect.element(clock).toBeVisible();
    await page.getByRole("button", { name: t("Done"), exact: true }).click();
    await page.getByRole("button", { name: t("Clear {label}", { label: t("Time") }), exact: true }).click();
    await expect.element(clock).not.toBeInTheDocument(); await expect.element(page.getByTestId("time-value")).toHaveTextContent("empty");
  });
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
