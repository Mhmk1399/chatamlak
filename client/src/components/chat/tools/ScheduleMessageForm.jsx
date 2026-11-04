import { useId, useRef, useState } from "react";
import {
  PersianDateField,
  PersianTimeField,
} from "../../common/PersianDateTimeField.jsx";
import {
  formatTehranDateTime,
  tehranDateTimeToIso,
  tehranToday,
} from "../../../utils/persianDateTime.js";
import { t, tError, useLocale } from "../../../i18n/locale.js";
import { toolButton, toolInput } from "./toolStyles.js";

// Both the composer dialog and Chat tools use this validation/entry owner.
export default function ScheduleMessageForm({
  fixedBody,
  onSchedule,
  onScheduled,
  busy = false,
  onBusyChange,
  maxLength = 4000,
}) {
  useLocale();
  const [body, setBody] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [validation, setValidation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const errorId = useId();
  const message = fixedBody ?? body;
  const dueAt = tehranDateTimeToIso(date, time);
  const currentDay = tehranToday();
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (inFlight.current || busy) return;
        if (!dueAt || !message.trim()) {
          setValidation("Choose a message, a date and a time.");
          const selector = !message.trim()
            ? "textarea"
            : !date
              ? '[data-schedule-date] [role="spinbutton"]'
              : '[data-schedule-time] [role="spinbutton"]';
          event.currentTarget.querySelector(selector)?.focus();
          return;
        }
        const due = Date.parse(dueAt);
        if (due < Date.now() + 10000 || due > Date.now() + 366 * 86400000) {
          setValidation(
            "Choose a time between 10 seconds and one year from now.",
          );
          return;
        }
        if (message.length > maxLength) {
          setValidation(
            t("Message must be {count} characters or less.", {
              count: maxLength,
            }),
          );
          return;
        }
        setValidation("");
        setError("");
        inFlight.current = true;
        setSaving(true);
        onBusyChange?.(true);
        try {
          const result = await onSchedule({ body: message, dueAt });
          if (!result) return;
          setBody("");
          setDate("");
          setTime("");
          onScheduled?.(result);
        } catch (failure) {
          setError(tError(failure));
        } finally {
          inFlight.current = false;
          setSaving(false);
          onBusyChange?.(false);
        }
      }}
    >
      <label className="block space-y-1 text-xs font-medium text-slate-700 dark:text-slate-200">
        <span>{t("Message")}</span>
        <textarea
          className={`${toolInput} min-h-24 mt-1 resize-none`}
          value={message}
          readOnly={fixedBody !== undefined || saving}
          onChange={(event) => setBody(event.target.value)}
          maxLength={maxLength}
          dir="auto"
        />
      </label>
      <fieldset
        className="min-w-0 space-y-2"
        disabled={saving || busy}
        aria-describedby={validation ? errorId : undefined}
      >
        <legend className="mb-2 text-sm font-semibold">{t("Send at")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-schedule-date>
            <PersianDateField
              label={t("Date")}
              value={date}
              onChange={(value) => {
                setDate(value);
                setValidation("");
              }}
              minValue={currentDay.toString()}
              maxValue={currentDay.add({ days: 366 }).toString()}
              isRequired
              isInvalid={!!validation && !date}
            />
          </div>
          <div data-schedule-time>
            <PersianTimeField
              label={t("Time")}
              value={time}
              onChange={(value) => {
                setTime(value);
                setValidation("");
              }}
              isRequired
              isInvalid={!!validation && !time}
            />
          </div>
        </div>
        {dueAt && (
          <p
            className="text-xs text-slate-600 dark:text-slate-300"
            role="status"
          >
            {t("Scheduled for")}{" "}
            <span lang="fa" dir="rtl">
              {formatTehranDateTime(dueAt)}
            </span>{" "}
            · {t("Tehran time")}
          </p>
        )}
        {validation && (
          <p
            id={errorId}
            role="alert"
            className="text-sm text-rose-600 dark:text-rose-300"
          >
            {t(validation)}
          </p>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      )}
      <button type="submit" disabled={saving || busy} className={toolButton}>
        {t(saving ? "Saving…" : "Schedule message")}
      </button>
    </form>
  );
}
