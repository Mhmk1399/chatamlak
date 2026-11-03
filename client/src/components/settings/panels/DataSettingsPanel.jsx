import { t as localize, useLocale as useAppLocale } from "../../../i18n/locale.js";
import { memo, useState } from "react";
import {
  Chat,
  ImageIcon,
  Mic,
  Trash,
  User,
  Video,
} from "../../../icons/lucide.js";
import CategoryButton from "../common/CategoryButton.jsx";

export const DataSettingsPanel = memo(function DataSettingsPanel({
  dataCacheStats,
  onClearCache,
  onClose,
  user,
  variant = "desktop",
}) {
  useAppLocale();
  const isMobile = variant === "mobile";
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const listPadding = isMobile ? "px-3 py-3" : "px-4 py-3";
  const labelSize = isMobile ? "text-xs" : "text-sm";
  const sizeText = isMobile ? "text-[10px]" : "text-xs";
  const buttonBase = `flex w-full items-center justify-between rounded-2xl border ${listPadding} text-start ${labelSize} font-semibold transition-colors duration-150`;
  const buttonHover =
    "hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10";
  const buttonTheme =
    "border-brand-200/70 bg-white/90 text-brand-700 dark:border-brand-500/30 dark:bg-slate-900/50 dark:text-brand-200";
  const disabledTheme =
    "cursor-default opacity-70 hover:border-brand-200/70 hover:bg-white/90 dark:hover:bg-slate-900/50";

  const totalCacheBytes = dataCacheStats?.totalBytes || 0;

  const _unused = user;

  return (
    <div
      className={`${isMobile ? "space-y-3" : "space-y-4"} text-slate-600 dark:text-slate-300`}
    >
      <div className="rounded-2xl border border-brand-200/70 bg-white/90 px-6 py-5 text-center dark:border-brand-500/30 dark:bg-slate-900/50">
        <p className="text-[10px] uppercase tracking-[0.25em] text-brand-500/80">{localize("Cached Size")}</p>
        <p
          className={`${isMobile ? "text-2xl" : "text-3xl"} mt-2 font-bold text-brand-700 dark:text-brand-200`}
        >
          {dataCacheStats?.totalLabel || localize("0 B")}
        </p>
      </div>
      <div className="space-y-2">
        <CategoryButton
          label={localize("Chat entries")}
          icon={<User size={isMobile ? 16 : 18} className="icon-anim-sway" />}
          sizeLabel={dataCacheStats?.chatList?.sizeLabel}
          disabled={(dataCacheStats?.chatList?.count || 0) === 0}
          buttonBase={buttonBase}
          buttonHover={buttonHover}
          buttonTheme={buttonTheme}
          disabledTheme={disabledTheme}
          sizeText={sizeText}
        />
        <CategoryButton
          label={localize("Message cache")}
          icon={<Chat size={isMobile ? 16 : 18} className="icon-anim-sway" />}
          sizeLabel={dataCacheStats?.messageCaches?.sizeLabel}
          disabled={(dataCacheStats?.messageCaches?.count || 0) === 0}
          buttonBase={buttonBase}
          buttonHover={buttonHover}
          buttonTheme={buttonTheme}
          disabledTheme={disabledTheme}
          sizeText={sizeText}
        />
        <CategoryButton
          label={localize("Media thumbnails")}
          icon={
            <ImageIcon size={isMobile ? 16 : 18} className="icon-anim-sway" />
          }
          sizeLabel={dataCacheStats?.mediaThumbs?.sizeLabel}
          disabled={(dataCacheStats?.mediaThumbs?.count || 0) === 0}
          buttonBase={buttonBase}
          buttonHover={buttonHover}
          buttonTheme={buttonTheme}
          disabledTheme={disabledTheme}
          sizeText={sizeText}
        />
        <CategoryButton
          label={localize("Video posters")}
          icon={<Video size={isMobile ? 16 : 18} className="icon-anim-sway" />}
          sizeLabel={dataCacheStats?.mediaPosters?.sizeLabel}
          disabled={(dataCacheStats?.mediaPosters?.count || 0) === 0}
          buttonBase={buttonBase}
          buttonHover={buttonHover}
          buttonTheme={buttonTheme}
          disabledTheme={disabledTheme}
          sizeText={sizeText}
        />
        <CategoryButton
          label={localize("Voice waveforms")}
          icon={<Mic size={isMobile ? 16 : 18} className="icon-anim-sway" />}
          sizeLabel={dataCacheStats?.voiceWaveforms?.sizeLabel}
          disabled={(dataCacheStats?.voiceWaveforms?.count || 0) === 0}
          buttonBase={buttonBase}
          buttonHover={buttonHover}
          buttonTheme={buttonTheme}
          disabledTheme={disabledTheme}
          sizeText={sizeText}
        />
        <CategoryButton
          label={localize("Clear cache")}
          icon={<Trash size={isMobile ? 16 : 18} className="icon-anim-sway" />}
          sizeLabel=""
          disabled={totalCacheBytes <= 0}
          onClick={
            totalCacheBytes > 0 ? () => setConfirmClearOpen(true) : undefined
          }
          danger
          buttonBase={buttonBase}
          buttonHover={buttonHover}
          buttonTheme={buttonTheme}
          disabledTheme={disabledTheme}
          sizeText={sizeText}
        />
      </div>

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={() => {
            onClose?.();
          }}
          className="rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-500"
        >{localize("Done")}</button>
      </div>

      {confirmClearOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
            <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">{localize("Clear cached data")}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{localize("This only removes local cached data from this device. You'll need to reload to refresh the cache.")}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="rounded-full border border-brand-200 bg-white px-4 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:shadow-[0_0_14px_rgba(102,48,141,0.2)] dark:border-brand-500/30 dark:bg-slate-950 dark:text-brand-200"
              >{localize("Cancel")}</button>
              <button
                type="button"
                onClick={() => {
                  setConfirmClearOpen(false);
                  onClearCache?.();
                }}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
              >{localize("Clear")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
