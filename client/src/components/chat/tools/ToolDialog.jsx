import { useId, useRef } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { t, useLocale } from "../../../i18n/locale.js";
import { ArrowUpDown } from "../../../icons/lucide.js";
import { useSheetResizeGestures } from "../../../hooks/useSheetResizeGestures.js";
import { useSheetDismissGesture } from "../../../hooks/useSheetDismissGesture.js";
import { toolButton } from "./toolStyles.js";
import "./tool-dialog.css";

export default function ToolDialog({ title, onClose, children, closeDisabled = false, variant = "dialog", id,
  label = title, closeLabel = "Close", sheetSize, onSheetSizeChange, bodyClassName = "", dragToDismiss = false }) {
  useLocale();
  const isSheet = variant === "sheet";
  const sheetRef = useRef(null);
  const headerRef = useRef(null);
  const overlayRef = useRef(null);
  const helpId = useId();
  const dragHelpId = useId();
  const resizable = isSheet && Boolean(onSheetSizeChange) && (sheetSize === "half" || sheetSize === "full");
  useSheetResizeGestures(sheetRef, resizable, onSheetSizeChange);
  const canDrag = isSheet && dragToDismiss && !closeDisabled;
  const requestClose = useSheetDismissGesture(sheetRef, headerRef, overlayRef, canDrag, onClose);
  const resizeLabel = sheetSize === "full" ? "Show half-height sheet" : "Expand sheet";
  return (
    <ModalOverlay ref={overlayRef} isOpen isDismissable={!closeDisabled} isKeyboardDismissDisabled={closeDisabled} onOpenChange={(open) => { if (!open && !closeDisabled) requestClose(); }}
      className={`fixed inset-0 z-320 flex justify-center bg-black/40 ${isSheet ? "ouj-tool-sheet-overlay" : "items-center p-3 sm:px-6"}`}>
      <Modal
        ref={sheetRef} data-sheet-size={resizable ? sheetSize : undefined}
        className={`ouj-glass flex w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 ${isSheet ? "ouj-tool-sheet" : "max-h-[85dvh] max-w-2xl rounded-2xl"}`}>
        <Dialog id={id} aria-label={t(label)} aria-describedby={canDrag ? dragHelpId : undefined} className="flex min-h-0 flex-1 flex-col text-slate-900 outline-none dark:text-slate-100">
          <div ref={headerRef} data-sheet-drag-region={canDrag ? "true" : undefined} className="shrink-0">
          {isSheet && <div className="ouj-tool-sheet-handle" aria-hidden="true" />}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t(title)}</h2>
            <div className="flex shrink-0 items-center gap-1">
              {resizable && <button type="button" className="ouj-tool-sheet-resize" aria-label={t(resizeLabel)} title={t(resizeLabel)}
                aria-expanded={sheetSize === "full"} aria-controls={id} aria-describedby={helpId}
                onClick={() => onSheetSizeChange(sheetSize === "full" ? "half" : "full")}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  event.preventDefault(); event.stopPropagation(); onSheetSizeChange(event.key === "ArrowDown" ? "full" : "half");
                }}><ArrowUpDown size={19} aria-hidden="true" /></button>}
              <button type="button" aria-label={t(closeLabel)} className={`${toolButton} ${isSheet ? "ouj-tool-sheet-close" : ""}`} onClick={requestClose} disabled={closeDisabled}>{t("Close")}</button>
            </div>
          </div>
          </div>
          {canDrag && <span id={dragHelpId} className="sr-only">{t("Drag the header down to close, or use Close.")}</span>}
          {resizable && <span id={helpId} className="sr-only">{t("Scroll down to expand; scroll up for half height. Use the resize button or its Down and Up arrow keys.")}</span>}
          <div className={`min-h-0 overflow-y-auto p-4 ${isSheet ? "ouj-tool-sheet-body" : ""} ${bodyClassName}`}>{children}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
