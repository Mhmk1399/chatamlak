import { useState } from "react";
import { readPerfTelemetry } from "../../../hooks/chat/usePerfTelemetry.js";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { toolButton } from "./ToolDialog.jsx";

export default function PerformancePanel() {
  useLocale();
  const context = useMessagingContext();
  const [entries, setEntries] = useState(readPerfTelemetry);
  const [rendered, setRendered] = useState(() => document.querySelectorAll("[data-message-bubble]").length);
  const [detailed, setDetailed] = useState(() => { try { return localStorage.getItem("songbird-perf-enabled") === "1"; } catch { return false; } });
  return <div className="space-y-3">
    <p className="text-sm text-slate-500">{t("Measurements stay on this device.")}</p>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">{t("Loaded messages")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{context.loadedMessageCount}</p></div>
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">{t("Rendered message bubbles")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{rendered}</p></div>
    </div>
    <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={detailed} onChange={(event) => {
      const value = event.target.checked;
      setDetailed(value);
      try { localStorage.setItem("songbird-perf-enabled", value ? "1" : "0"); } catch { /* measurements remain usable */ }
      window.dispatchEvent(new Event("songbird:performance-config"));
    }} />{t("Record long tasks")}</label>
    <button type="button" className={toolButton} onClick={() => { setEntries(readPerfTelemetry()); setRendered(document.querySelectorAll("[data-message-bubble]").length); }}>{t("Refresh measurements")}</button>
    <div className="overflow-x-auto"><table className="w-full text-start text-xs"><caption className="py-2 text-start text-slate-500">{t("Latest 20 measurements")}</caption><thead><tr><th scope="col" className="p-2 text-start">{t("Type")}</th><th scope="col" className="p-2 text-end">{t("Duration (ms)")}</th></tr></thead><tbody>{entries.slice(-20).reverse().map((entry, index) => <tr key={`${entry.t}:${index}`} className="border-t border-slate-200 dark:border-slate-800"><td className="p-2">{t(entry.type === "chat_open" ? "Open chat" : "Long task")}</td><td className="p-2 text-end tabular-nums">{entry.durationMs}</td></tr>)}</tbody></table></div>
  </div>;
}
