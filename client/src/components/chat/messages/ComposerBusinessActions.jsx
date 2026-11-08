import { useEffect, useId, useRef, useState } from "react";
import { Building2, LoaderCircle, ScrollText } from "../../../icons/lucide.js";
import { t, useLocale } from "../../../i18n/locale.js";
import "./composer-business-actions.css";

let sheetPromise;
const loadSheet = () => sheetPromise ||= import("../business/BusinessPreviewSheet.jsx").catch((error) => {
  sheetPromise = null;
  throw error;
});

const actions = [
  { view: "listings", label: "My listings", Icon: Building2 },
  { view: "report", label: "Daily work report", Icon: ScrollText },
];

export default function ComposerBusinessActions({ contextKey, disabled, onOpen, returnFocusRef, children }) {
  useLocale();
  const [Sheet, setSheet] = useState(null);
  const [panel, setPanel] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const lifetimeRef = useRef(null);
  const focusRestoreRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    const lifetime = { active: true };
    lifetimeRef.current = lifetime;
    setPanel(null);
    setPending(null);
    setError(false);
    return () => { lifetime.active = false; };
  }, [contextKey, disabled]);
  const activePanel = !disabled && panel?.contextKey === contextKey ? panel.view : null;
  useEffect(() => {
    if (panel !== null || !focusRestoreRef.current) return;
    const { lifetime, trigger } = focusRestoreRef.current;
    focusRestoreRef.current = null;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (lifetime?.active && trigger?.isConnected && document.activeElement === document.body) {
          trigger.focus({ preventScroll: true });
        }
      });
    });
    return () => { cancelAnimationFrame(firstFrame); if (secondFrame !== undefined) cancelAnimationFrame(secondFrame); };
  }, [panel]);

  async function open(view) {
    const lifetime = lifetimeRef.current;
    if (disabled || !lifetime?.active) return;
    const id = ++requestId.current;
    const isCurrent = () => lifetime.active && id === requestId.current;
    onOpen?.();
    returnFocusRef.current?.focus({ preventScroll: true });
    setError(false);
    setPending({ view, contextKey });
    try {
      const module = await loadSheet();
      if (!isCurrent()) return;
      setSheet(() => module.default);
      setPanel({ view, contextKey });
    } catch {
      if (isCurrent()) setError(true);
    } finally {
      if (isCurrent()) setPending(null);
    }
  }

  function closePanel() {
    focusRestoreRef.current = { lifetime: lifetimeRef.current, trigger: returnFocusRef.current };
    // Restore only after the closed panel has committed and its focus scope unmounted.
    setPanel(null);
  }

  const menuItems = <>
    <div role="separator" className="ouj-composer-business-divider" />
    {actions.map(({ view, label, Icon }) => <button key={view} type="button" role="menuitem"
      className="ouj-composer-business-menu-item" disabled={disabled} aria-haspopup="dialog"
      onClick={() => open(view)}>
      <Icon size={18} aria-hidden="true" /><span>{t(label)}</span>
    </button>)}
  </>;

  return <div className="ouj-composer-business-actions"
    onKeyDown={(event) => { if (event.key === "Enter") event.stopPropagation(); }}
    onPaste={(event) => event.stopPropagation()}
    onDrop={(event) => event.stopPropagation()}>
    {children(menuItems)}
    {pending?.contextKey === contextKey && !disabled && <p role="status" className="ouj-composer-business-status">
      <LoaderCircle size={18} className="shrink-0 motion-safe:animate-spin" aria-hidden="true" />{t("Opening preview…")}
    </p>}
    {error && <p role="alert" className="ouj-composer-business-error">{t("Could not open the preview. Select the button to try again.")}</p>}
    {activePanel && Sheet && <Sheet key={`${contextKey}:${activePanel}`} id={panelId} view={activePanel} onClose={closePanel} />}
  </div>;
}
