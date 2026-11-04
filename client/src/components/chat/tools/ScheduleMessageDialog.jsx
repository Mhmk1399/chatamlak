import { useState } from "react";
import ToolDialog from "./ToolDialog.jsx";
import ScheduleMessageForm from "./ScheduleMessageForm.jsx";
import { messagingRequest } from "../../../api/messagingApi.js";
import { t, useLocale } from "../../../i18n/locale.js";

export default function ScheduleMessageDialog({
  draft,
  onClose,
  onScheduled,
  maxLength,
}) {
  useLocale();
  const [busy, setBusy] = useState(false);
  return (
    <ToolDialog title="Schedule message" onClose={onClose} closeDisabled={busy}>
      
      <ScheduleMessageForm
        fixedBody={draft.body}
        maxLength={maxLength}
        onBusyChange={setBusy}
        onScheduled={onScheduled}
        onSchedule={({ body, dueAt }) =>
          messagingRequest(
            `/chats/${encodeURIComponent(draft.chatId)}/scheduled`,
            {
              method: "POST",
              body: {
                body,
                dueAt,
                ...(draft.replyToMessageId
                  ? { replyToMessageId: draft.replyToMessageId }
                  : {}),
                ...(draft.topicId ? { topicId: draft.topicId } : {}),
              },
            },
          )
        }
      />
    </ToolDialog>
  );
}
