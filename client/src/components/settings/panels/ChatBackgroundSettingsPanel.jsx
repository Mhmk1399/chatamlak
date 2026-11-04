import { useState } from "react";
import { Check, ShieldCheck } from "../../../icons/lucide.js";
import { t, tError, useLocale } from "../../../i18n/locale.js";
import { useChatAppearanceContext } from "../../../hooks/chat/useChatAppearance.js";
import { CHAT_WALLPAPERS } from "../../../utils/chatWallpapers.js";
import ChatWallpaper from "../../common/ChatWallpaper.jsx";

export default function ChatBackgroundSettingsPanel() {
  useLocale();
  const context = useChatAppearanceContext();
  const savedId = context?.appearance.wallpaperId || "default";
  const [preview, setPreview] = useState(null);
  const selected = preview?.accountId === context?.accountId && preview ? preview.wallpaperId : savedId;
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = context?.saving;
  const changed = selected !== savedId;
  async function apply(event) {
    event.preventDefault();
    if (!changed || busy || !context) return;
    setError(""); setSaved(false);
    try { if (await context.save(selected)) { setPreview(null); setSaved(true); } }
    catch (failure) { setError(failure.message); }
  }
  return <form noValidate onSubmit={apply} className="space-y-5 pb-2">
    <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{t("Choose a background for all your conversations. Only you will see it.")}</p>
    <div className="relative isolate overflow-hidden rounded-3xl border border-brand-100/70 p-4 dark:border-brand-500/20" data-testid="wallpaper-preview">
      <ChatWallpaper wallpaperId={selected} />
      <div className="mb-6 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span>{t("Chat preview")}</span><span className="inline-flex items-center gap-1"><ShieldCheck size={14} />{t("Only you")}</span>
      </div>
      <div className="space-y-3 text-sm">
        <div className="w-fit max-w-[88%] rounded-2xl rounded-ss-md border border-slate-200/70 bg-white px-4 py-3 text-slate-700 shadow-sm dark:border-white/5 dark:bg-slate-900 dark:text-slate-100">{t("Today's report is ready.")}</div>
        <div className="ms-auto w-fit max-w-[88%] rounded-2xl rounded-ee-md border border-brand-200/70 bg-brand-100 px-4 py-3 text-brand-950 shadow-sm dark:border-brand-400/15 dark:bg-brand-950 dark:text-brand-100">{t("Thanks! Send the files here.")}</div>
      </div>
      <div className="mt-5 text-xs text-slate-500 dark:text-slate-400">{t("Adapts to light and dark mode")}</div>
    </div>
    <fieldset disabled={busy}>
      <legend className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{t("Background patterns")}</legend>
      <div className="grid grid-cols-3 gap-3">
        {CHAT_WALLPAPERS.map((wallpaper) => <button key={wallpaper.id} type="button" aria-pressed={selected === wallpaper.id}
          aria-label={t("Preview {name}", { name: t(wallpaper.label) })}
          onClick={() => { setPreview({ accountId: context?.accountId, wallpaperId: wallpaper.id }); setError(""); setSaved(false); }}
          className={`relative overflow-hidden rounded-2xl border text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60 ${selected === wallpaper.id ? "border-brand-500 ring-1 ring-brand-500 dark:border-brand-400 dark:ring-brand-400" : "border-slate-200 hover:border-brand-300 dark:border-white/10 dark:hover:border-brand-400/50"}`}>
          <div className="relative isolate h-20 overflow-hidden"><ChatWallpaper wallpaperId={wallpaper.id} thumbnail />
            <span aria-hidden="true" className="absolute bottom-3 start-3 h-4 w-10 rounded-full border border-white/60 bg-white/90 dark:border-white/10 dark:bg-slate-800/90" />
            {selected === wallpaper.id && <span className="absolute end-2 top-2 rounded-full bg-brand-600 p-1 text-white"><Check size={12} /></span>}
          </div>
          <span className="block min-h-10 bg-white px-2 py-2 text-xs font-medium text-slate-700 dark:bg-slate-950 dark:text-slate-200">{t(wallpaper.label)}</span>
        </button>)}
      </div>
    </fieldset>
    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t("Preview a pattern, then apply it. Closing settings cancels the preview.")}</p>
    {error && <p role="alert" className="text-sm leading-6 text-rose-600 dark:text-rose-300">{tError(error)}</p>}
    <div className="flex items-center justify-end gap-2">
      {changed && <button type="button" disabled={busy} onClick={() => { setPreview(null); setError(""); setSaved(false); }} className="min-h-11 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">{t("Cancel preview")}</button>}
      <button type="submit" disabled={!changed || busy || !context} aria-busy={busy || undefined} className="min-h-11 min-w-32 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50">{t(busy ? "Saving…" : "Apply background")}</button>
    </div>
    <p role="status" className="min-h-5 text-xs text-accent-700 dark:text-accent-300">{saved && !changed ? t("Background saved") : ""}</p>
  </form>;
}
