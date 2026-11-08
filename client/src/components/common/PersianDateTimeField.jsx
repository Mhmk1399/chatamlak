import { useState } from "react";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  DialogTrigger,
  Group,
  I18nProvider,
  Label,
  Popover,
  Text,
  TimeField,
} from "react-aria-components";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock12,
  Close,
} from "../../icons/lucide.js";
import { t, useLocale } from "../../i18n/locale.js";
import {
  calendarDate,
  clockTime,
  PERSIAN_DATE_LOCALE,
  tehranToday,
} from "../../utils/persianDateTime.js";
import "./PersianDateTimeField.css";

function Segments() {
  return (
    <DateInput className="text-base ouj-date-segments">
      {(segment) => (
        <DateSegment segment={segment} className="ouj-date-segment" />
      )}
    </DateInput>
  );
}

function openPickerFromField(event, open) {
  // Ignore Clear/trigger buttons and events bubbled from a portaled picker.
  if (!event.currentTarget.contains(event.target) || event.target.closest?.("button")) return;
  open();
}

export function PersianDateField({
  label,
  value,
  onChange,
  minValue,
  maxValue,
  isRequired = false,
  isInvalid = false,
}) {
  const locale = useLocale();
  const minimum = calendarDate(minValue),
    maximum = calendarDate(maxValue);
  const currentDay = tehranToday();
  const todayDisabled =
    (minimum && currentDay.compare(minimum) < 0) ||
    (maximum && currentDay.compare(maximum) > 0);
  return (
    <I18nProvider locale={PERSIAN_DATE_LOCALE}>
      <DatePicker
        className="ouj-date-field"
        value={calendarDate(value)}
        onChange={(date) => onChange(date?.toString() || "")}
        minValue={minimum}
        maxValue={maximum}
        placeholderValue={currentDay}
        isRequired={isRequired}
        isInvalid={isInvalid}
        validationBehavior="aria"
        granularity="day"
      >
        {({ state }) => (
          <>
            <Label className="ouj-date-label">{label}</Label>
            <Group className="ouj-date-control" dir={locale === "fa" ? "rtl" : "ltr"} lang="fa"
              onClickCapture={(event) => openPickerFromField(event, () => state.setOpen(true))}>
              <Segments />
              {value && (
                <AriaButton
                  slot={null}
                  className="ouj-date-icon ouj-date-clear"
                  aria-label={t("Clear {label}", { label })}
                  onPress={() => onChange("")}
                >
                  <Close size={15} />
                </AriaButton>
              )}
              <AriaButton
                className="ouj-date-icon"
                aria-label={t("Open calendar")}
              >
                <CalendarDays size={19} />
              </AriaButton>
            </Group>
            <Popover
              className="ouj-date-popover"
              placement="bottom end"
              offset={8}
              containerPadding={12}
            >
              <Dialog
                className="ouj-date-dialog"
                aria-label={t("Persian calendar")}
                dir="rtl"
                lang="fa"
              >
                <Calendar firstDayOfWeek="sat" className="ouj-calendar">
                  <header className="ouj-calendar-header">
                    <AriaButton
                      slot="previous"
                      className="ouj-date-icon"
                      aria-label={t("Previous month")}
                    >
                      <ChevronRight
                        size={18}
                        className="ouj-calendar-chevron"
                      />
                    </AriaButton>
                    <CalendarHeading className="ouj-calendar-heading" />
                    <AriaButton
                      slot="next"
                      className="ouj-date-icon"
                      aria-label={t("Next month")}
                    >
                      <ChevronLeft size={18} className="ouj-calendar-chevron" />
                    </AriaButton>
                  </header>
                  <CalendarGrid
                    weekdayStyle="narrow"
                    className="ouj-calendar-grid"
                  >
                    <CalendarGridHeader>
                      {(day) => (
                        <CalendarHeaderCell className="ouj-calendar-weekday">
                          {day}
                        </CalendarHeaderCell>
                      )}
                    </CalendarGridHeader>
                    <CalendarGridBody>
                      {(date) => (
                        <CalendarCell
                          date={date}
                          className="ouj-calendar-day"
                        />
                      )}
                    </CalendarGridBody>
                  </CalendarGrid>
                </Calendar>
                <footer className="ouj-calendar-footer">
                  <AriaButton
                    slot={null}
                    className="ouj-date-text-button"
                    isDisabled={todayDisabled}
                    onPress={() => {
                      state.setValue(currentDay);
                      state.setOpen(false);
                    }}
                  >
                    {t("Today")}
                  </AriaButton>
                  <span className="ouj-calendar-caption">
                    {t("Persian calendar")}
                  </span>
                  <AriaButton
                    slot={null}
                    className="ouj-date-text-button"
                    onPress={() => state.setOpen(false)}
                  >
                    {t("Close")}
                  </AriaButton>
                </footer>
              </Dialog>
            </Popover>
          </>
        )}
      </DatePicker>
    </I18nProvider>
  );
}

export function PersianTimeField({
  label,
  value,
  onChange,
  isRequired = false,
  isInvalid = false,
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const time = clockTime(value);
  const digits = new Intl.NumberFormat("fa-IR", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  const choose = (hour, minute) =>
    onChange(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
  return (
    <I18nProvider locale={PERSIAN_DATE_LOCALE}>
      <TimeField
        className="ouj-date-field"
        value={time}
        onChange={(next) => onChange(next?.toString().slice(0, 5) || "")}
        hourCycle={24}
        granularity="minute"
        shouldForceLeadingZeros
        isRequired={isRequired}
        isInvalid={isInvalid}
        validationBehavior="aria"
      >
        <Label className="ouj-date-label">{label}</Label>
        <Group className="ouj-date-control" dir={locale === "fa" ? "rtl" : "ltr"} lang="fa"
          onClickCapture={(event) => openPickerFromField(event, () => setOpen(true))}>
          <Segments />
          {value && (
            <AriaButton
              slot={null}
              className="ouj-date-icon ouj-date-clear"
              aria-label={t("Clear {label}", { label })}
              onPress={() => onChange("")}
            >
              <Close size={15} />
            </AriaButton>
          )}
          <DialogTrigger isOpen={open} onOpenChange={setOpen}>
            <AriaButton
              slot={null}
              className="ouj-date-icon"
              aria-label={t("Open clock: {label}", { label })}
            >
              <Clock12 size={19} />
            </AriaButton>
            <Popover
              className="ouj-date-popover"
              placement="bottom end"
              offset={8}
              containerPadding={12}
            >
              <Dialog
                className="ouj-date-dialog"
                aria-label={t("Choose time")}
                dir="rtl"
                lang="fa"
              >
                <h3 className="ouj-clock-title">
                  {t("Choose time")}{" "}
                  <span dir="ltr">
                    {time
                      ? `${digits.format(time.hour)}:${digits.format(time.minute)}`
                      : "––:––"}
                  </span>
                </h3>
                <div role="group" aria-label={t("Hour")}>
                  <p className="ouj-clock-label">{t("Hour")}</p>
                  <div className="ouj-clock-grid">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <AriaButton
                        key={hour}
                        slot={null}
                        className="ouj-clock-option"
                        aria-label={t("Hour {value}", { value: hour })}
                        aria-pressed={time?.hour === hour}
                        onPress={() => choose(hour, time?.minute || 0)}
                      >
                        {digits.format(hour)}
                      </AriaButton>
                    ))}
                  </div>
                </div>
                <div role="group" aria-label={t("Minute")}>
                  <p className="ouj-clock-label">{t("Minute")}</p>
                  <div className="ouj-clock-grid">
                    {Array.from({ length: 12 }, (_, step) => step * 5).map(
                      (minute) => (
                        <AriaButton
                          key={minute}
                          slot={null}
                          className="ouj-clock-option"
                          aria-label={t("Minute {value}", { value: minute })}
                          aria-pressed={time?.minute === minute}
                          onPress={() => choose(time?.hour || 0, minute)}
                        >
                          {digits.format(minute)}
                        </AriaButton>
                      ),
                    )}
                  </div>
                </div>
                <footer className="ouj-calendar-footer">
                  <span className="ouj-calendar-caption">
                    {t("24-hour time · Tehran")}
                  </span>
                  <AriaButton
                    slot={null}
                    className="ouj-date-text-button ouj-date-primary-button"
                    onPress={() => setOpen(false)}
                  >
                    {t("Done")}
                  </AriaButton>
                </footer>
              </Dialog>
            </Popover>
          </DialogTrigger>
        </Group>
        <Text slot="description" className="ouj-date-description">
          {t("24-hour time · Tehran")}
        </Text>
      </TimeField>
    </I18nProvider>
  );
}
