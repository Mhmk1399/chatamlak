import {
  PersianCalendar, parseDate, parseDateTime, parseTime, toCalendar, toZoned, today,
} from "@internationalized/date";

export const CHAT_TIME_ZONE = "Asia/Tehran";
export const PERSIAN_DATE_LOCALE = "fa-IR-u-ca-persian";
const persian = new PersianCalendar();

// API values remain Gregorian ISO strings; only entry and presentation are Jalali.
export function calendarDate(value) {
  try { return value ? toCalendar(parseDate(value), persian) : null; }
  catch { return null; }
}

export function tehranToday() {
  return toCalendar(today(CHAT_TIME_ZONE), persian);
}

export function clockTime(value) {
  try {
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? parseTime(value) : null;
  } catch { return null; }
}

export function tehranDateTimeToIso(date, time) {
  if (!calendarDate(date) || !clockTime(time)) return null;
  try {
    return toZoned(parseDateTime(`${date}T${time}`), CHAT_TIME_ZONE, "reject").toDate().toISOString();
  } catch { return null; }
}

export function tehranDayBoundary(date, end = false) {
  if (!calendarDate(date)) return null;
  const day = parseDate(date).add({ days: end ? 1 : 0 });
  const midnight = toZoned(day, CHAT_TIME_ZONE).toDate().getTime();
  return new Date(midnight - (end ? 1 : 0)).toISOString();
}

const scheduledDateFormat = new Intl.DateTimeFormat(PERSIAN_DATE_LOCALE, {
  timeZone: CHAT_TIME_ZONE, year: "numeric", month: "long", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function formatTehranDateTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? scheduledDateFormat.format(date) : "";
}
