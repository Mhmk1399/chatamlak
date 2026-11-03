import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
export default function CategoryButton({
  label,
  icon,
  sizeLabel,
  disabled,
  danger = false,
  onClick,
  buttonBase,
  buttonHover,
  buttonTheme,
  disabledTheme,
  sizeText,
}) {
  useAppLocale();
  const isInteractive = Boolean(onClick) && !disabled;
  return (
    <div
      className={`data-cache-item ${buttonBase} ${
        danger
          ? "border-rose-200/80 bg-rose-50/70 text-rose-600 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50"
          : `${buttonTheme} ${buttonHover}`
      } ${disabled ? disabledTheme : ""}`}
      role={isInteractive ? "button" : "presentation"}
      aria-disabled={disabled ? "true" : "false"}
      onClick={isInteractive ? onClick : undefined}
    >
      <span className="flex items-center gap-3">
        {icon}
        {localize(label)}
      </span>
      {typeof sizeLabel === "string" && sizeLabel.trim() ? (
        <span
          className={`flex items-center gap-2 ${sizeText} font-semibold text-slate-500 dark:text-slate-400`}
        >
          {sizeLabel}
        </span>
      ) : null}
    </div>
  );
}
