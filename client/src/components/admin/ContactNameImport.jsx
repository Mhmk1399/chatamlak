import { useEffect, useId, useRef, useState } from "react";
import { File, UserPlus } from "../../icons/lucide.js";
import { t, useLocale } from "../../i18n/locale.js";
import {
  contactPickerAvailability,
  pickContactName,
  readContactFile,
} from "../../utils/contactImport.js";

const actionClass =
  "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-brand-200 px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-500/30 dark:text-brand-200 dark:hover:bg-brand-500/10";

function errorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError")
    return t(
      "Contact access was not allowed. Try again or enter the name manually.",
    );
  switch (error?.code) {
    case "unsupported":
      return t(
        "Direct contact selection is unavailable. Choose a contact file or enter the name manually.",
      );
    case "file-too-large":
      return t("The contact file must be at most 256 KB.");
    case "invalid-file":
      return t("Choose a contact file with the .vcf extension.");
    case "one-contact":
      return t("Choose a vCard file containing exactly one contact.");
    case "no-name":
      return t("The selected contact has no name. Enter the name manually.");
    case "name-too-long":
      return t("The contact name is too long. Enter a shorter name manually.");
    case "unsupported-encoding":
      return t("Use a UTF-8 vCard file or enter the name manually.");
    default:
      return t(
        "Could not read the contact. Try again or enter the name manually.",
      );
  }
}

export default function ContactNameImport({
  onNameSelected,
  onBusyChange,
  disabled = false,
}) {
  useLocale();
  const hintId = useId();
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);
  const pendingRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filled, setFilled] = useState(false);
  const available = contactPickerAvailability();
  useEffect(
    () => () => {
      requestRef.current++;
    },
    [],
  );

  const runImport = async (read) => {
    if (pendingRef.current || disabled) return;
    pendingRef.current = true;
    const request = ++requestRef.current;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setFilled(false);
    try {
      const name = await read();
      if (request !== requestRef.current) return;
      if (name) {
        onNameSelected(name);
        setFilled(true);
      }
    } catch (failure) {
      if (request === requestRef.current && failure?.name !== "AbortError")
        setError(failure);
    } finally {
      if (request === requestRef.current) {
        pendingRef.current = false;
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  return (
    <section
      className="space-y-2 rounded-2xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5"
      aria-label={t("Fill from contacts")}
    >
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {t("Fill from contacts")}
      </p>
      <p
        id={hintId}
        className="text-xs leading-5 text-slate-500 dark:text-slate-400"
      >
        {t(
          "Only the selected contact's name fills the nickname. Set the username and password yourself, then choose Create user.",
        )}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-busy={busy}>
        <button
          type="button"
          className={actionClass}
          aria-describedby={hintId}
          disabled={disabled || busy || available !== "available"}
          onClick={() => runImport(pickContactName)}
        >
          <UserPlus size={16} className="shrink-0" />
          {t("Choose contact")}
        </button>
        <button
          type="button"
          className={actionClass}
          disabled={disabled || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <File size={16} className="shrink-0" />
          {t("Contact file (.vcf)")}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        aria-label={t("Contact file (.vcf)")}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void runImport(() => readContactFile(file));
        }}
      />
      {available !== "available" && (
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {available === "insecure"
            ? t(
                "Use HTTPS to choose a phone contact directly. You can still choose a contact file or enter the name manually.",
              )
            : t(
                "Direct contact selection is unavailable. Choose a contact file or enter the name manually.",
              )}
        </p>
      )}
      {busy && (
        <p role="status" className="text-xs text-brand-700 dark:text-brand-200">
          {t("Reading contact…")}
        </p>
      )}
      {filled && !busy && (
        <p
          role="status"
          className="text-xs text-accent-700 dark:text-accent-300"
        >
          {t("Contact name filled. Review it before creating the user.")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-xs leading-5 text-rose-600 dark:text-rose-300"
        >
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}
