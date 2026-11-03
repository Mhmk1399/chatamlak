import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { useState } from "react";
import { Check, Copy, Heart } from "../../../icons/lucide.js";
import {
  DockerIcon,
  GithubIcon,
  LinkedinIcon,
  RailwayIcon,
  SongbirdIcon,
  TelegramIcon,
} from "../../../icons/BrandIcons.jsx";
import { ABOUT_CONTENT } from "../../../settings/aboutContent.js";
import { copyTextToClipboard } from "../../../utils/clipboard.js";
import Tooltip from "../../common/Tooltip.jsx";

const SOCIAL_ICONS = {
  docker: DockerIcon,
  railway: RailwayIcon,
  github: GithubIcon,
  telegram: TelegramIcon,
  songbird: SongbirdIcon,
  linkedin: LinkedinIcon,
};

function WalletRow({ label, address }) {
  useAppLocale();
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-brand-200/70 bg-white/90 p-3 dark:border-brand-500/30 dark:bg-slate-900/50">
      <p className="text-xs font-semibold uppercase text-slate-600 dark:text-white">
        {localize(label)}
      </p>
      <button
        type="button"
        onClick={async () => {
          const didCopy = await copyTextToClipboard(address);
          if (!didCopy) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-2 flex w-full items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/70 p-3 text-start text-xs text-brand-800 transition hover:border-brand-300 hover:bg-brand-50 focus:outline-hidden focus:ring-2 focus:ring-brand-300/60 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/15"
        aria-label={localize("Copy {value0} wallet address", { value0: label })}
      >
        <code className="min-w-0 flex-1 break-all font-mono">{address}</code>
        <span className="ml-1 shrink-0 text-brand-600 dark:text-brand-400">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </span>
      </button>
    </div>
  );
}

function DonationLinkRow({ donationLink }) {
  useAppLocale();
  if (!donationLink?.href) return null;

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-sky-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,248,255,0.98)_56%,rgba(230,243,255,0.96))] p-4 shadow-[0_14px_34px_rgba(100,172,255,0.12)] dark:border-sky-400/25 dark:bg-[linear-gradient(135deg,#0f1419,#17212c_58%,#213449)] dark:shadow-[0_18px_40px_rgba(100,172,255,0.14)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(100,172,255,0.2),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.72),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(100,172,255,0.3),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.05),transparent_28%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#64ACFF]">
            {donationLink.eyebrow}
          </p>
          <p className="mt-2 text-base font-bold leading-6 text-slate-900 dark:text-white">
            {localize(donationLink.title)}
          </p>
          <p className="mt-1.5 max-w-[34ch] text-sm leading-6 text-slate-700 dark:text-slate-200/90">
            {localize(donationLink.description)}
          </p>
        </div>
        <a
          href={donationLink.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sky-300 bg-[#64ACFF] px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_14px_rgba(100,172,255,0.24)] transition hover:border-sky-200 hover:bg-[#7AB8FF] hover:shadow-[0_0_14px_rgba(100,172,255,0.32)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#13171c] dark:border-sky-300/60 dark:bg-[#64ACFF] dark:hover:bg-[#7AB8FF]"
          aria-label={localize(donationLink.buttonLabel)}
        >
          <Heart size={15} className="icon-anim-pop fill-current" />
          {localize(donationLink.buttonLabel)}
        </a>
      </div>
    </div>
  );
}

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
  const ownerLabel = ABOUT_CONTENT.copyright?.ownerLabel || "bllackbull";
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
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">{localize("Support the project")}</p>
          <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {localize(ABOUT_CONTENT.supportIntro)}
          </p>
          <div className="mt-3 space-y-2.5">
            <DonationLinkRow donationLink={ABOUT_CONTENT.donationLink} />
            {ABOUT_CONTENT.wallets.map((wallet) => (
              <WalletRow
                key={wallet.label}
                label={localize(wallet.label)}
                address={wallet.address}
              />
            ))}
          </div>
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
          <p className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">{localize("All rights reserved. Songbird is a free and open-source project, licensed under the MIT License.")}</p>
          <p className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">{localize("For Freedom ❤️")}</p>
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
