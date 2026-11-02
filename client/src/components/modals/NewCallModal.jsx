import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Close, LoaderCircle, PhoneCall } from "../../icons/lucide.js";
import ForwardChatGridItem from "../forward/ForwardChatGridItem.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { getForwardChatDisplay } from "../forward/forwardChatUtils.js";

export default function NewCallModal({
  open,
  chats,
  currentUser,
  onClose,
  onSubmit,
}) {
  useAppLocale();
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) {
      setSelectedChatId(null);
      setSubmitting(false);
    }
  }, [open]);

  const dmChats = useMemo(
    () =>
      (Array.isArray(chats) ? chats : []).filter((chat) => {
        const type = String(chat?.type || "").toLowerCase();
        if (type !== "dm") return false;
        const peer = (chat.members || []).find(
          (member) =>
            String(member?.username || "").toLowerCase() !==
            String(currentUser?.username || "").toLowerCase(),
        );
        return Boolean(peer?.username);
      }),
    [chats, currentUser?.username],
  );

  if (!open) return null;

  const handleSubmit = async () => {
    if (!selectedChatId || submitting) return;
    setSubmitting(true);
    try {
      const chat = dmChats.find(
        (item) => String(item?.id || "") === String(selectedChatId || ""),
      );
      if (!chat) return;
      const peer = (chat.members || []).find(
        (member) =>
          String(member?.username || "").toLowerCase() !==
          String(currentUser?.username || "").toLowerCase(),
      );
      await onSubmit?.(chat.id, peer);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-call-modal-title"
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-emerald-100/70 bg-white px-6 py-5 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between pb-1">
          <h3
            id="new-call-modal-title"
            className="text-base font-semibold text-emerald-800 dark:text-emerald-200"
          >{localize("Start voice call")}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label={localize("Close")}
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>

        <div className="chat-scroll mt-4 grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto">
          {dmChats.map((chat) => {
            const display = getForwardChatDisplay(chat, currentUser?.username);
            const selected =
              String(selectedChatId || "") === String(chat.id || "");
            return (
              <ForwardChatGridItem
                key={chat.id}
                title={display.title}
                avatarUrl={display.avatarUrl}
                color={display.color}
                kind={display.kind}
                initialsSource={display.initials}
                showOnlineBadge={display.isOnline}
                verified={display.verified}
                role={display.role}
                selected={selected}
                onClick={() => {
                  if (submitting) return;
                  setSelectedChatId(chat.id);
                }}
              />
            );
          })}
          {!dmChats.length ? (
            <p className="col-span-4 px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">{localize("No chats to call yet.")}</p>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            disabled={!selectedChatId || submitting}
            onClick={handleSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <PhoneCall size={16} className="icon-anim-slide" />
            )}
            {submitting ? "Calling..." : localize("Call")}
          </button>
        </div>
      </div>
    </div>
  );
}
