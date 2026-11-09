import { useSyncExternalStore } from "react";
import { fa } from "./fa.js";

const listeners = new Set();
export const DEFAULT_LOCALE = "fa";
export const LOCALE_STORAGE_KEY = "ouj-chat-locale";
const readLocale = () => {
  try { return localStorage.getItem(LOCALE_STORAGE_KEY) === "en" ? "en" : DEFAULT_LOCALE; }
  catch { return DEFAULT_LOCALE; }
};
let locale = readLocale();
function applyDocumentLocale() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.setAttribute("href", locale === "fa" ? "/manifest.webmanifest" : "/manifest.en.webmanifest");
  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    navigator.serviceWorker.controller?.postMessage({ type: "OUJ_LOCALE", locale });
    navigator.serviceWorker.ready?.then((registration) => registration.active?.postMessage({ type: "OUJ_LOCALE", locale })).catch(() => {});
  }
}
export function setLocale(value) {
  locale = value === "fa" ? "fa" : "en";
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* session preference */ }
  applyDocumentLocale();
  listeners.forEach((listener) => listener());
}
export const getLocale = () => locale;
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useLocale = () => useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = Object.entries(fa).filter(([key]) => key.includes("{") && key.replace(/\{\w+\}/g, "").replace(/\W/g, "").length >= 4).sort(([first], [second]) => second.replace(/\{\w+\}/g, "").length - first.replace(/\{\w+\}/g, "").length).map(([key, value]) => {
  const names = [];
  const parts = key.split(/(\{\w+\})/g).map((part) => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return "(.+?)"; }
    return escapeRegex(part);
  });
  return { regex: new RegExp(`^${parts.join("")}$`), names, value };
});
const interpolate = (template, parameters) => String(template).replace(/\{(\w+)\}/g, (match, name) => {
  const value = parameters?.[name];
  return value === undefined ? match : typeof value === "number" && locale === "fa" ? value.toLocaleString("fa-IR") : String(value);
});
export const t = (key, parameters) => {
  if (typeof key !== "string") return key;
  const clean = key.trim().replace(/\s+/g, " ");
  if (parameters) return interpolate(locale === "fa" ? fa[clean] || key : key, parameters);
  if (locale !== "fa") return key;
  if (fa[clean]) return key.slice(0, key.length - key.trimStart().length) + fa[clean] + key.slice(key.trimEnd().length);
  const slowMode = clean.match(/^Slow mode: wait (\d+) seconds\.$/);
  if (slowMode) return `حالت آهسته: ${Number(slowMode[1]).toLocaleString("fa-IR")} ثانیه صبر کنید.`;
  const speed = clean.match(/^Playback speed: ([\d.]+) times\. Change playback speed$/);
  if (speed) return `سرعت پخش: ${Number(speed[1]).toLocaleString("fa-IR")} برابر؛ تغییر سرعت پخش`;
  if (clean.length < 2000) for (const template of templates) {
    const matched = clean.match(template.regex);
    if (matched) return interpolate(template.value, Object.fromEntries(template.names.map((name, index) => {
      const value = matched[index + 1];
      return [name, /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value];
    })));
  }
  return key;
};
export const tError = (error) => {
  if (!error) return "";
  const original = typeof error === "string" ? error : error.message || "Unable to complete this operation.";
  const translated = t(original);
  if (locale !== "fa" || translated !== original || /[\u0600-\u06ff]/.test(original)) return translated;
  return "انجام این کار ممکن نشد. دوباره تلاش کنید؛ اگر مشکل ادامه داشت با مدیر سامانه تماس بگیرید.";
};
export const intlLocale = () => locale === "fa" ? "fa-IR" : "en-US";
export const formatNumber = (value, options) => new Intl.NumberFormat(intlLocale(), options).format(Number(value) || 0);
export const formatLocalDate = (value) => {
  const normalized = String(value || "").replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date) : "";
};
applyDocumentLocale();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== LOCALE_STORAGE_KEY && event.key !== null) return;
    locale = event.newValue === "en" ? "en" : DEFAULT_LOCALE;
    applyDocumentLocale();
    listeners.forEach((listener) => listener());
  });
}
