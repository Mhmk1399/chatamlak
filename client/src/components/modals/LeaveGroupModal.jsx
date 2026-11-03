import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { useRef } from "react";

export default function LeaveGroupModal({
  open,
  onClose,
  onConfirm,
  isChannel = false,
}) {
  useAppLocale();
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-320 flex items-center justify-center bg-black/40 px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-modal-title"
        className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950"
      >
        <h3 id="leave-modal-title" className="text-lg font-semibold text-rose-600 dark:text-rose-300">
          {isChannel ? localize("Leave channel") : localize("Leave group")}
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {isChannel
            ? localize("Are you sure you want to leave this channel?")
            : localize("Are you sure you want to leave this group?")}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-brand-200 bg-white px-4 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:shadow-[0_0_14px_rgba(102,48,141,0.2)] dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200"
          >{localize("Cancel")}</button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
          >{localize("Leave")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
