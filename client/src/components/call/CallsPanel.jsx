import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { useMemo } from "react";
import { Check, Minus, Phone, Video } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import {
  getCallLogLabel,
  parseCallLogBody,
} from "../../utils/messageContent.js";
import { formatChatCardTimestamp } from "../../utils/chatFormat.js";
import Avatar from "../common/Avatar.jsx";
import UserRoleBadge from "../common/UserRoleBadge.jsx";
import VerifiedBadge from "../common/VerifiedBadge.jsx";
import Tooltip from "../common/Tooltip.jsx";

const MISSED_STATUSES = new Set(["failed", "cancelled"]);

function mapCallRow(row) {
  const callLog = parseCallLogBody(String(row?.body || ""));
  if (!callLog) return null;
  const peer = {
    id: row.peer_id || null,
    username: row.peer_username || "",
    nickname: row.peer_nickname || "",
    avatarUrl: row.peer_avatar_url || null,
    color: row.peer_color || "#94a3b8",
    verified: Boolean(row.peer_verified),
    role: row.peer_role || "user",
  };
  const own = String(row.user_id || "") === String(row?.viewerId || "");
  return {
    id: row.id,
    chatId: row.chat_id,
    messageId: row.id,
    createdAt: row.created_at,
    type: callLog.type,
    status: callLog.status,
    durationSeconds: callLog.durationSeconds,
    own,
    label: getCallLogLabel(callLog, own),
    peer,
  };
}

export default function CallsPanel({
  loadingCalls,
  calls,
  user,
  callsEditMode,
  selectedCalls,
  toggleSelectCall,
  onRequestDeleteCall,
  onStartCall,
  callsDisabled = false,
  isInCall = false,
}) {
  useAppLocale();
  const visibleCalls = useMemo(() => {
    if (!Array.isArray(calls)) return [];
    return calls
      .map((row) => mapCallRow({ ...row, viewerId: user?.id }))
      .filter(Boolean);
  }, [calls, user?.id]);

  const isEmptyState = !loadingCalls && !visibleCalls.length;

  const wiggleDurations = [640, 700, 760, 820, 880, 940];
  const wiggleDelays = [-80, -170, -260, -120, -220, -320];

  return (
    <div className={isEmptyState ? "min-h-full" : "w-full py-1"}>
      {loadingCalls && !visibleCalls.length ? (
        Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`call-skeleton-${index}`}
            className="relative flex w-full flex-col px-2"
          >
            <div className="flex min-h-[72px] w-full animate-pulse items-center gap-3 rounded-xl px-3 py-2.5">
              <div className="shrink-0">
                <div className="h-12 w-12 rounded-full bg-brand-100 dark:bg-brand-900/40" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 rounded-sm bg-brand-100 dark:bg-brand-900/40" />
                <div className="h-2 w-3/4 rounded-sm bg-brand-100/80 dark:bg-brand-900/30" />
              </div>
            </div>
            {index < 5 ? (
              <div className="my-1 ml-[72px] mr-2 border-b border-slate-200/50 dark:border-slate-800/50" />
            ) : null}
          </div>
        ))
      ) : visibleCalls.length ? (
        visibleCalls.map((call, index) => {
          const peer = call.peer || {
            username: "",
            nickname: "",
            avatarUrl: null,
            color: "#94a3b8",
            verified: false,
            role: "user",
          };
          const name = peer.nickname || peer.username || "Deleted account";
          const missed = MISSED_STATUSES.has(call.status);
          const wiggleStyle = callsEditMode
            ? {
                animationDuration: `${wiggleDurations[index % 6]}ms`,
                animationDelay: `${wiggleDelays[index % 6]}ms`,
              }
            : undefined;
          return (
            <div key={call.id} className="relative flex w-full flex-col px-2">
              <div
                className={`group flex min-h-[72px] w-full items-center rounded-xl border border-transparent text-slate-700 transition ${
                  isInCall || callsDisabled
                    ? ""
                    : "hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                } dark:text-slate-100 ${callsEditMode ? "animate-chat-wiggle-ios" : ""}`}
                style={wiggleStyle}
              >
                {callsEditMode ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDeleteCall(call);
                    }}
                    className="ml-2.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                    aria-label={localize("Remove call entry")}
                  >
                    <Minus size={16} />
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={callsEditMode || isInCall || callsDisabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (callsEditMode || isInCall || callsDisabled) return;
                    onStartCall(call);
                  }}
                  title={
                    callsDisabled
                      ? localize("Calls are disabled by the server")
                      : isInCall
                        ? localize("Already in a call")
                        : undefined
                  }
                  className={`flex min-h-[72px] min-w-0 flex-1 items-center gap-3 py-2.5 text-start ${
                    callsEditMode
                      ? "pointer-events-none pl-2 pr-3"
                      : isInCall || callsDisabled
                        ? "cursor-not-allowed opacity-50 px-3 focus-visible:outline-hidden"
                        : "cursor-pointer px-3 focus-visible:outline-hidden"
                  }`}
                >
                  {" "}
                  <div className="shrink-0">
                    <Avatar
                      src={peer.avatarUrl}
                      alt={name}
                      name={name}
                      color={peer.color || "#66308d"}
                      initials={getAvatarInitials(name)}
                      placeholderContent={null}
                      className="h-12 w-12 text-lg font-semibold"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Tooltip label={name} asChild>
                        <p
                          className="flex items-center gap-0.5 text-base font-semibold"
                          dir="ltr"
                        >
                          <span
                            className={`min-w-0 max-w-full truncate ${hasPersian(name) ? "font-fa" : ""}`}
                            dir="auto"
                          >
                            {name}
                          </span>
                          {Boolean(peer.verified) && (
                            <VerifiedBadge size={16} />
                          )}
                          <UserRoleBadge role={peer.role} size={16} />
                        </p>
                      </Tooltip>
                      <p
                        className={`mt-0.5 flex min-w-0 items-center gap-1 truncate text-sm ${missed ? "text-rose-500 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}
                      >
                        {call.type === "video" ? (
                          <Video
                            size={14}
                            className="translate-y-px shrink-0"
                          />
                        ) : (
                          <Phone
                            size={14}
                            className="translate-y-px shrink-0"
                          />
                        )}
                        <span
                          className={`truncate ${hasPersian(call.label) ? "font-fa" : ""}`}
                          dir="auto"
                        >
                          {localize(call.label)}
                        </span>
                      </p>
                    </div>
                    <p className="shrink-0 self-start text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {call.createdAt
                        ? formatChatCardTimestamp(call.createdAt)
                        : ""}
                    </p>
                  </div>
                </button>
                {callsEditMode ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelectCall(call.messageId);
                    }}
                    className={`mr-2.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      selectedCalls.includes(call.messageId)
                        ? "border-brand-500 bg-brand-600 text-white"
                        : "border-brand-200 text-brand-600 dark:border-brand-500/30 dark:text-brand-200"
                    }`}
                    aria-label={localize("Select call entry")}
                  >
                    {selectedCalls.includes(call.messageId) ? (
                      <Check size={16} />
                    ) : null}
                  </button>
                ) : null}
              </div>
              <div className="my-1 ml-[72px] mr-2 border-b border-slate-200/70 dark:border-slate-800/80" />
            </div>
          );
        })
      ) : (
        <div className="flex min-h-full items-center justify-center px-4 py-8">
          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            <p>{localize("No recent calls.")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
