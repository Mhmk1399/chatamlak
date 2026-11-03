import { apiFetch } from "../../api/chatApi.js";
import { getLocale, intlLocale, formatNumber } from "../../i18n/locale.js";

// ─── Style constants ─────────────────────────────────────────────────────────

export const cardCls    = "rounded-2xl border border-brand-200/70 bg-white/90 dark:border-brand-500/30 dark:bg-slate-950/50";
export const inputCls   = "w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm text-slate-700 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-slate-900 dark:text-slate-100";
export const inputSmCls = "h-9 w-full rounded-xl border border-brand-200/70 bg-white/90 px-3 text-sm text-slate-700 outline-hidden transition hover:border-brand-300 hover:shadow-[0_0_16px_rgba(102,48,141,0.18)] focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-500 dark:hover:border-brand-500/50 dark:hover:shadow-[0_0_18px_rgba(102,48,141,0.12)]";
export const searchIconCls = "text-brand-500 transition-colors group-hover:text-brand-600 dark:text-brand-400 dark:group-hover:text-brand-300 icon-anim-pop";
export const labelCls   = "block text-sm font-semibold text-slate-700 dark:text-slate-200";
export const btnPrimary = "inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-3 text-xs font-semibold text-white transition hover:bg-brand-400 hover:shadow-[0_0_14px_rgba(102,48,141,0.3)]";
export const btnSecondary = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-white/5";
export const btnDanger  = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10";

export const iconBtn = (color = "slate") => {
  const map = {
    slate:   "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5",
    emerald: "border-brand-200 text-brand-600 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10",
    orange:  "border-orange-200 text-orange-500 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10",
    rose:    "border-rose-200 text-rose-500 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10",
  };
  return `inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${map[color] || map.slate}`;
};

// ─── Pagination ───────────────────────────────────────────────────────────────

// `PAGE_LOCK_THRESHOLD` is the smallest option: when a list has this
// many items or fewer, everything fits on one page at any size, so the
// pagination controls render but stay locked.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_LOCK_THRESHOLD = Math.min(...PAGE_SIZE_OPTIONS);

// ─── API helper ───────────────────────────────────────────────────────────────

export const api = {
  get:    (url)       => apiFetch(url).then((r) => r.json()),
  post:   (url, body) => apiFetch(url, { method: "POST",   headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patch:  (url, body) => apiFetch(url, { method: "PATCH",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  put:    (url, body) => apiFetch(url, { method: "PUT",    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  delete: (url)       => apiFetch(url, { method: "DELETE" }),
};

// ─── Formatters ────────────────────────────────────────────────────────────────

export function fmtBytes(b) {
  if (b == null || b < 0) return "—";
  if (getLocale() === "fa") {
    const exponent = Math.min(3, Math.floor(Math.log(Math.max(1, b)) / Math.log(1024)));
    return `${formatNumber(b / 1024 ** exponent, { maximumFractionDigits: exponent ? 1 : 0 })} ${["بایت", "کیلوبایت", "مگابایت", "گیگابایت"][exponent]}`;
  }
  if (b < 1024)      return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtUptime(secs) {
  if (!secs) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (getLocale() === "fa") return [d && `${formatNumber(d)} روز`, h && `${formatNumber(h)} ساعت`, `${formatNumber(m)} دقیقه`].filter(Boolean).join(" ");
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(intlLocale(), { year: "numeric", month: "short", day: "numeric" }); }
  catch { return "—"; }
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = iso.includes("T") ? new Date(iso) : new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString(intlLocale(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
