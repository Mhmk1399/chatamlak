import { useSyncExternalStore } from "react";
import { fa } from "./fa.js";

const listeners = new Set();
let locale = (() => { try { return localStorage.getItem("songbird-locale") === "fa" ? "fa" : "en"; } catch { return "en"; } })();
export function setLocale(value) {
  locale = value === "fa" ? "fa" : "en";
  try { localStorage.setItem("songbird-locale", locale); } catch { /* session preference */ }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    // Message direction is content-dependent; application chrome follows locale.
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  }
  listeners.forEach((listener) => listener());
}
export const getLocale = () => locale;
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useLocale = () => useSyncExternalStore(subscribe, getLocale, () => "en");
export const t = (key, parameters) => {
  if (parameters) {
    const template = locale === "fa" ? fa[key] || key : key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) => {
      const value = parameters[name];
      return value === undefined ? match : typeof value === "number" && locale === "fa" ? value.toLocaleString("fa-IR") : String(value);
    });
  }
  if (locale !== "fa" || typeof key !== "string") return key;
  if (fa[key]) return fa[key];
  const slowMode = key.match(/^Slow mode: wait (\d+) seconds\.$/);
  if (slowMode) return `حالت آهسته: ${Number(slowMode[1]).toLocaleString("fa-IR")} ثانیه صبر کنید.`;
  const speed = key.match(/^Playback speed: ([\d.]+) times\. Change playback speed$/);
  if (speed) return `سرعت پخش: ${Number(speed[1]).toLocaleString("fa-IR")} برابر؛ تغییر سرعت پخش`;
  return key;
};
export const formatLocalDate = (value) => {
  const normalized = String(value || "").replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date) : "";
};
if (typeof document !== "undefined") {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
}
