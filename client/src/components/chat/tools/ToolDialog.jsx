import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { t, useLocale } from "../../../i18n/locale.js";
import { toolButton } from "./toolStyles.js";

export default function ToolDialog({ title, onClose, children, closeDisabled = false }) {
  useLocale();
  return (
    <ModalOverlay isOpen isDismissable={!closeDisabled} isKeyboardDismissDisabled={closeDisabled} onOpenChange={(open) => { if (!open && !closeDisabled) onClose(); }}
      className="fixed inset-0 z-320 flex items-center justify-center bg-black/40 p-3 sm:px-6">
      <Modal
        className="ouj-glass flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <Dialog aria-label={t(title)} className="flex min-h-0 flex-1 flex-col text-slate-900 outline-none dark:text-slate-100">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t(title)}</h2>
            <button type="button" className={toolButton} onClick={onClose} disabled={closeDisabled}>{t("Close")}</button>
          </div>
          <div className="min-h-0 overflow-y-auto p-4">{children}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
