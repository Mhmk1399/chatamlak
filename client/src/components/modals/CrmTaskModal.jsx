import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createCrmTask } from "../../api/chatApi.js";
import { t, tError, useLocale } from "../../i18n/locale.js";
import { CircleCheck, Close, LoaderCircle } from "../../icons/lucide.js";
import { clearCrmTaskIntent, getCrmTaskIntent } from "../../utils/crmTaskIdempotency.js";

export default function CrmTaskModal({ open, conversationId, onClose }) {
  useLocale();
  const titleId = useId();
  const titleRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setResult(null);
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [open, conversationId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => { if (event.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open || typeof document === "undefined") return null;

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    let intent = null;
    try {
      const dueValue = String(form.get("dueAt") || "").trim();
      const title = String(form.get("title") || "").trim();
      const task = {
        type: "call",
        title,
        priority: String(form.get("priority") || "normal"),
        ...(dueValue ? { dueAt: new Date(dueValue).toISOString() } : {}),
        ...(String(form.get("instructions") || "").trim()
          ? { instructions: String(form.get("instructions")).trim() }
          : {}),
        steps: [{ title, required: true }],
      };
      intent = await getCrmTaskIntent({ conversationId, task });
      const response = await createCrmTask({
        conversationId,
        idempotencyKey: intent.key,
        task,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const responseError = new Error(body?.error?.message || "Unable to create the CRM task.");
        responseError.status = response.status;
        throw responseError;
      }
      clearCrmTaskIntent(intent);
      setResult(body.task);
    } catch (submitError) {
      if (intent && Number(submitError?.status) >= 400 && Number(submitError?.status) < 500) {
        clearCrmTaskIntent(intent);
      }
      setError(submitError.message || "Unable to create the CRM task.");
    } finally { setSubmitting(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-1000 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="ouj-glass w-full max-w-lg rounded-3xl border p-5 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <h2 ref={titleRef} tabIndex={-1} id={titleId} className="text-lg font-bold text-slate-900 outline-none dark:text-slate-100">{t("Create CRM task")}</h2>
          <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:bg-slate-800" aria-label={t("Close")}><Close size={20} /></button>
        </div>
        {result ? (
          <div className="mt-6 space-y-4" role="status" aria-live="polite">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200"><CircleCheck size={22} /><span>{t("CRM task created")}</span></div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("Web task ID")}: <code dir="ltr" className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{result.id}</code></p>
            <button type="button" onClick={onClose} className="min-h-11 w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">{t("Done")}</button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t("Task title")}<input required maxLength={200} name="title" className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t("Priority")}<select name="priority" defaultValue="normal" className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950"><option value="low">{t("Low")}</option><option value="normal">{t("Normal")}</option><option value="high">{t("High")}</option><option value="urgent">{t("Urgent")}</option></select></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t("Due date")}<input required type="datetime-local" name="dueAt" className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950" /></label>
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t("Instructions")}<textarea maxLength={2000} rows={4} name="instructions" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950" /></label>
            {error ? <p role="alert" aria-live="assertive" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">{tError(error)}</p> : null}
            <button type="submit" disabled={submitting} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60">{submitting ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" /> : null}{t(submitting ? "Creating..." : "Create task")}</button>
          </form>
        )}
      </section>
    </div>, document.body,
  );
}
