import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog, I18nProvider, Modal, ModalOverlay } from "react-aria-components";
import { Pin, PinOff, Close } from "../../icons/lucide.js";
import { t, useLocale } from "../../i18n/locale.js";
import { QUICK_REACTIONS, useMessageActions } from "../../hooks/chat/useMessageActions.js";

export default function MessageContextMenu({ menu, onClose }) {
  const locale = useLocale();
  const actions = useMessageActions(menu.message);
  const surfaceRef = useRef(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const [position, setPosition] = useState(null);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const stale = Boolean(menu.targetChatId && menu.targetChatId !== actions.context?.activeChatId);
  const disabled = saving || actions.context?.busy || menu.isOffline || !online || stale;
  const dismiss = useCallback(() => setClosing(true), []);
  const positioned = position !== null;
  useLayoutEffect(() => {
    if (!positioned) return;
    // Modal also contains React Aria's hidden dismiss buttons. Initial focus
    // belongs to a visible action inside our dialog.
    const frame = requestAnimationFrame(() => surfaceRef.current?.querySelector('[role="dialog"] button:not(:disabled)')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [positioned]);
  useEffect(() => { if (stale) onClose?.(); }, [stale, onClose]);

  useEffect(() => {
    // Escape must remain usable during the brief focus handoff between two
    // overlays. Dialog keyboard handlers retain priority for normal input.
    const escape = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [dismiss]);

  useEffect(() => {
    alive.current = true;
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { alive.current = false; window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 140;
    const timer = setTimeout(() => {
      onClose?.();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (document.activeElement === document.body && menu.targetEl?.isConnected) menu.targetEl.focus({ preventScroll: true });
      }));
    }, delay);
    return () => clearTimeout(timer);
  }, [closing, menu.targetEl, onClose]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const place = () => {
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft || 0) + 12;
      const top = (viewport?.offsetTop || 0) + 12;
      const maxWidth = Math.max(1, (viewport?.width || innerWidth) - 24);
      const viewportHeight = Math.max(1, (viewport?.height || innerHeight) - 24);
      const right = left + maxWidth, bottom = top + viewportHeight;
      const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
      const anchor = menu.targetEl?.getBoundingClientRect();
      const anchorTop = clamp(anchor?.top ?? menu.point?.y ?? top, top, bottom);
      const anchorBottom = clamp(anchor?.bottom ?? anchorTop, anchorTop, bottom);
      const spaceAbove = Math.max(0, anchorTop - top - 10);
      const spaceBelow = Math.max(0, bottom - anchorBottom - 10);
      let placement = (anchorTop + anchorBottom) / 2 > (top + bottom) / 2 ? "above" : "below";
      const scroll = surface.querySelector(".ouj-message-action-scroll");
      // Include hidden actions when measuring, so a previously shortened menu
      // can grow again after resizing or closing the on-screen keyboard.
      const naturalHeight = surface.offsetHeight + Math.max(0, (scroll?.scrollHeight || 0) - (scroll?.clientHeight || 0));
      const minimumHeight = Math.min(naturalHeight, 176);
      let available = placement === "above" ? spaceAbove : spaceBelow;
      const oppositeSpace = placement === "above" ? spaceBelow : spaceAbove;
      if (available < minimumHeight && oppositeSpace > available) {
        placement = placement === "above" ? "below" : "above";
        available = oppositeSpace;
      }
      // On very short screens neither side can hold the reaction row, heading
      // and one action. Keep the whole panel in view and scroll its actions.
      const maxHeight = available >= minimumHeight ? available : viewportHeight;
      const height = Math.min(naturalHeight, maxHeight);
      const width = Math.min(surface.offsetWidth, maxWidth);
      const x = anchor ? (locale === "fa" ? anchor.right - width : anchor.left) : Number(menu.point?.x || left);
      const y = placement === "above" ? anchorTop - height - 10 : anchorBottom + 10;
      const next = { left: clamp(x, left, right - width), top: clamp(y, top, bottom - height), maxHeight, maxWidth, placement };
      setPosition((prev) => prev && Object.keys(next).every((key) => prev[key] === next[key]) ? prev : next);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(surface);
    if (menu.targetEl) observer.observe(menu.targetEl);
    const disconnected = new MutationObserver(() => { if (menu.targetEl && !menu.targetEl.isConnected) onClose?.(); });
    disconnected.observe(document.body, { childList: true, subtree: true });
    const scrollAnchor = (event) => { if (!surface.contains(event.target)) place(); };
    document.addEventListener("scroll", scrollAnchor, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    return () => { observer.disconnect(); disconnected.disconnect(); document.removeEventListener("scroll", scrollAnchor, true); window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [locale, menu, onClose]);

  const save = async (operation) => {
    if (disabled || inFlight.current || closing) return;
    inFlight.current = true; setSaving(true); setError("");
    try {
      const result = await operation();
      if (!alive.current) return;
      if (result) dismiss();
      else setError("Could not save this action. Try again.");
    } catch {
      if (alive.current) setError("Could not save this action. Try again.");
    } finally {
      inFlight.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const items = [...(menu.items || [])];
  if (actions.available && actions.canManage) items.splice(Math.max(0, items.findIndex((item) => item.danger)), 0, {
    id: "pin", label: actions.pinned ? "Unpin message" : "Pin message", icon: actions.pinned ? PinOff : Pin,
    disabled, asyncAction: actions.togglePin,
  });
  const navigate = (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    const group = event.target.closest('[role="menu"], [data-reaction-row]');
    if (!group) return;
    const reactionRow = group.hasAttribute("data-reaction-row");
    const keys = reactionRow ? ["ArrowRight", "ArrowLeft", "Home", "End"] : ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const buttons = [...group.querySelectorAll("button:not(:disabled)")];
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement);
    const forward = reactionRow ? event.key === (locale === "fa" ? "ArrowLeft" : "ArrowRight") : event.key === "ArrowDown";
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (forward ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus({ preventScroll: true }); buttons[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return <I18nProvider locale={locale === "fa" ? "fa-IR" : "en-US"}><ModalOverlay isOpen isDismissable onOpenChange={(open) => { if (!open) dismiss(); }}
    className="ouj-message-menu-overlay" data-closing={closing || undefined} onContextMenu={(event) => event.preventDefault()}>
    <Modal ref={surfaceRef} className="ouj-message-menu-position" data-placement={position?.placement}
      style={{ left: position?.left, top: position?.top, maxHeight: position?.maxHeight, maxWidth: position?.maxWidth, visibility: position ? "visible" : "hidden" }}>
      <Dialog aria-label={t("Message actions")} dir={locale === "fa" ? "rtl" : "ltr"} className="ouj-message-menu-dialog" data-closing={closing || undefined} onKeyDown={navigate}>
        {actions.available && <div role="group" aria-label={t("Reactions")} className="ouj-glass ouj-message-reactions" data-reaction-row>
          {QUICK_REACTIONS.map((emoji, index) => <button key={emoji} type="button" className="ouj-quick-reaction" disabled={disabled || closing}
            aria-label={`${t("React")} ${emoji}`} aria-pressed={actions.selected.has(emoji)} style={{ "--reaction-order": index }} onClick={() => save(() => actions.react(emoji))}>{emoji}</button>)}
        </div>}
        <div className="ouj-glass ouj-message-action-card">
          <header className="ouj-message-menu-heading"><h3>{t("Message actions")}</h3><button type="button" aria-label={t("Close context menu")} onClick={dismiss}><Close size={18} /></button></header>
          <div className="ouj-message-action-scroll">
            <div role="menu" aria-label={t("Context menu")}>
              {items.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" role="menuitem" disabled={item.disabled || saving || closing || (item.id === "edit" && !online)}
                  className={`ouj-message-action ${item.danger ? "ouj-message-action-danger" : ""}`}
                  onClick={() => {
                    if (item.asyncAction) { void save(item.asyncAction); return; }
                    item.onSelect?.(); onClose?.();
                  }}>{Icon && <Icon size={19} aria-hidden="true" />}<span>{t(item.label)}</span></button>;
              })}
            </div>
            {actions.canSetTopic && <label className="ouj-message-topic"><span>{t("Topics")}</span>
              <select className="text-base" value={actions.topicId} disabled={disabled || closing} onChange={(event) => { void save(() => actions.setTopic(event.target.value)); }}>
                <option value="">{t("All topics")}</option>{actions.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
              </select></label>}
            {(menu.isOffline || !online) && <p className="ouj-message-menu-notice">{t("Reconnect to react or pin messages.")}</p>}
            {saving && <p role="status" className="ouj-message-menu-notice">{t("Saving…")}</p>}
            {error && <p role="alert" className="ouj-message-menu-error">{t(error)}</p>}
          </div>
        </div>
      </Dialog>
    </Modal>
  </ModalOverlay></I18nProvider>;
}
