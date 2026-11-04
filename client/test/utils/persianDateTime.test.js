import { expect, test } from "vitest";
import { calendarDate, clockTime, formatTehranDateTime, tehranDateTimeToIso, tehranDayBoundary } from "../../src/utils/persianDateTime.js";

test("keeps Jalali leap day and Nowruz correct while retaining ISO API values", () => {
  const leap = calendarDate("2025-03-20");
  expect([leap.year, leap.month, leap.day]).toEqual([1403, 12, 30]);
  const nowruz = calendarDate("2025-03-21");
  expect([nowruz.year, nowruz.month, nowruz.day]).toEqual([1404, 1, 1]);
  expect(nowruz.toString()).toBe("2025-03-21");
});
test.each(["2026-01-10", "2026-07-10"])("converts %s Tehran time independently of the device zone", date => {
  expect(tehranDateTimeToIso(date, "09:15")).toBe(`${date}T05:45:00.000Z`);
});
test("search includes the entire selected Tehran day, including its final millisecond", () => {
  expect(tehranDayBoundary("2026-11-03")).toBe("2026-11-02T20:30:00.000Z");
  expect(tehranDayBoundary("2026-11-03", true)).toBe("2026-11-03T20:29:59.999Z");
});
test("rejects invalid or incomplete dates and times", () => {
  for (const value of ["", "2026-02-30", "bad"]) expect(calendarDate(value)).toBeNull();
  for (const value of ["", "24:00", "12:60", "9:10", "bad"]) expect(clockTime(value)).toBeNull();
  expect(tehranDateTimeToIso("2026-02-30", "12:00")).toBeNull();
  expect(tehranDateTimeToIso("2026-03-21", "25:00")).toBeNull();
});
test("formats scheduled instants as Jalali dates in Tehran even for English clients", () => {
  expect(formatTehranDateTime("2025-03-21T05:45:00.000Z")).toContain("فروردین");
  expect(formatTehranDateTime("2025-03-21T05:45:00.000Z")).toContain("۱۴۰۴");
  expect(formatTehranDateTime("2025-03-21T05:45:00.000Z")).toContain("۰۹:۱۵");
});
