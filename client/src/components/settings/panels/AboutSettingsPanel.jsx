import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { OujChatIcon } from "../../../icons/BrandIcons.jsx";
import { ABOUT_CONTENT } from "../../../settings/aboutContent.js";
import Tooltip from "../../common/Tooltip.jsx";

const SOCIAL_ICONS = {
  oujChat: OujChatIcon,
};

export function AboutSettingsPanel({
  appInfo,
  appInfoLoading,
  onDone,
  variant = "desktop",
}) {
  useAppLocale();
  const isMobile = variant === "mobile";
  const versionLabel =
    String(appInfo?.version || "Unknown").trim() || "Unknown";
  const ownerHref = ABOUT_CONTENT.copyright?.ownerHref || "";
  const ownerLabel = ABOUT_CONTENT.copyright?.ownerLabel || "Ouj Real Estate";
  const year = new Date().getFullYear();
  const rowBase =
    "flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-200/70 bg-white/90 px-4 py-3 text-start text-sm font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-brand-200";

  return (
    <div className="space-y-4 text-slate-600 dark:text-slate-300">
      <div
        className={
          isMobile
            ? "space-y-3"
            : "app-scroll max-h-[calc(100dvh-18rem)] space-y-3 overflow-y-auto pr-1"
        }
      >
        <div className={rowBase}>
          <p>{localize("Version")}</p>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {appInfoLoading ? localize("Loading...") : versionLabel}
          </span>
        </div>

        <div className="rounded-2xl border border-brand-200/70 bg-white/90 p-4 dark:border-brand-500/30 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">{localize("About Ouj Chat")}</p>
          <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {localize(ABOUT_CONTENT.description)}
          </p>
        </div>

        <div className="border-t border-brand-100/80 pt-4 dark:border-brand-500/20">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {ABOUT_CONTENT.socials.map((item) => {
              const Icon = SOCIAL_ICONS[item.icon];
              return (
                <Tooltip key={`${item.icon}-${item.href}`} label={item.icon}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={item.icon}
                    className="group inline-flex items-center justify-center p-1 text-slate-500 transition hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-200"
                  >
                    <span className="inline-flex items-center justify-center text-slate-600 transition group-hover:text-brand-700 dark:text-slate-300 dark:group-hover:text-brand-200">
                      {Icon ? <Icon size={24} /> : null}
                    </span>
                  </a>
                </Tooltip>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {"\u00A9"} {year}{" "}
            <a
              href={ownerHref}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-slate-600 underline-offset-4 transition hover:text-brand-700 hover:underline dark:text-slate-300 dark:hover:text-brand-200"
            >
              {ownerLabel}
            </a>
          </p>
          <p className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">{localize("All rights reserved. Ouj Chat is an Ouj Real Estate team platform.")}</p>
        </div>
      </div>

      {!isMobile ? (
        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={() => onDone?.()}
            className="rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-500"
          >{localize("Done")}</button>
        </div>
      ) : null}
    </div>
  );
}
