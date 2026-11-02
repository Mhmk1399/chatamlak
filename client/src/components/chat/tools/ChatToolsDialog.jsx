import { useCallback } from "react";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { t, useLocale } from "../../../i18n/locale.js";
import ToolDialog, { toolButton } from "./ToolDialog.jsx";
import { DevicesPanel, GroupSettingsPanel, MediaPanel, OutboxPanel, PollsPanel, SchedulePanel, SearchPanel, TopicsPanel } from "./ToolsPanels.jsx";
import GroupCallPanel from "./GroupCallPanel.jsx";
import PerformancePanel from "./PerformancePanel.jsx";

export default function ChatToolsDialog() {
  useLocale();
  const context = useMessagingContext();
  const setPanel = context?.setPanel;
  const close = useCallback(() => setPanel?.(null), [setPanel]);
  if (!context?.panel) return null;
  const role = context.chat?.members?.find((member) => member.id === context.user.id)?.role;
  const panels = { Search: SearchPanel, Devices: DevicesPanel, Outbox: OutboxPanel, Performance: PerformancePanel };
  if (context.activeChatId) Object.assign(panels, { Media: MediaPanel, Schedule: SchedulePanel, Polls: PollsPanel });
  if (context.chat?.type === "group") {
    panels.Topics = TopicsPanel;
    panels["Group call"] = GroupCallPanel;
    if (["owner", "admin"].includes(role)) panels["Group settings"] = GroupSettingsPanel;
  }
  if (context.groupCall?.room) panels["Group call"] = GroupCallPanel;
  const Panel = panels[context.panel] || SearchPanel;
  return <ToolDialog title={t("Chat tools")} onClose={close}>
    <nav className="mb-4 flex flex-wrap gap-2" aria-label={t("Chat tools")}>{Object.keys(panels).map((name) => <button type="button" key={name} className={`${toolButton} ${context.panel === name ? "bg-emerald-100 dark:bg-emerald-500/20" : ""}`} aria-pressed={context.panel === name} onClick={() => context.setPanel(name)}>{t(name)}</button>)}</nav>
    {context.error && <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-300">{context.error}</p>}
    <Panel key={`${context.activeChatId}:${context.panel}`} />
  </ToolDialog>;
}
