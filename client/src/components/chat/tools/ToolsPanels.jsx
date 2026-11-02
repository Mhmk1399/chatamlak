import { useToolData } from "../../../hooks/chat/useToolData.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { messagingRequest } from "../../../api/messagingApi.js";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { formatLocalDate, t, useLocale } from "../../../i18n/locale.js";
import { toolButton, toolInput } from "./ToolDialog.jsx";
import { readOutboxMessages } from "../../../utils/chatOutbox.js";

export function OutboxPanel() {
  useLocale();
  const context = useMessagingContext();
  const [messages, setMessages] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const queued = await readOutboxMessages(
        context.user.id || context.user.username,
        null,
        { hydrate: false },
      );
      if (!cancelled) setMessages(queued);
    };
    void load();
    window.addEventListener("songbird:outbox-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("songbird:outbox-changed", load);
    };
  }, [context.user.id, context.user.username]);
  return (
    <div>
      <RemoteStatus loading={!messages} empty={messages && !messages.length} />
      <ul className="space-y-3">
        {messages?.map((message) => (
          <li
            key={message._clientId}
            className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <p className="whitespace-pre-wrap break-words text-sm" dir="auto">
              {message.body ||
                message._files.map((file) => file.name).join(", ")}
            </p>
            <p className="text-xs text-slate-500">
              {t(
                message._delivery === "failed"
                  ? t("Failed to send")
                  : t("Waiting to send"),
              )}
            </p>
            {message._lastError && (
              <p className="text-xs text-rose-600 dark:text-rose-300">
                {message._lastError}
              </p>
            )}
            <div className="flex gap-2">
              {message._delivery === "failed" && (
                <button
                  type="button"
                  className={toolButton}
                  onClick={() => context.retryQueued(message)}
                >
                  {t("Retry")}
                </button>
              )}
              <button
                type="button"
                className={toolButton}
                onClick={() => context.removeQueued(message)}
              >
                {t("Remove queued message")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block space-y-1 text-xs font-medium text-slate-700 dark:text-slate-200">
      <span>{t(label)}</span>
      {children}
    </label>
  );
}
export function RemoteStatus({ loading, error, empty }) {
  return (
    <>
      {loading && (
        <p role="status" className="py-3 text-sm text-slate-500">
          {t("Loading…")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="py-3 text-sm text-rose-600 dark:text-rose-300"
        >
          {t(error)}
        </p>
      )}
      {!loading && !error && empty && (
        <p className="py-3 text-sm text-slate-500">{t("No results")}</p>
      )}
    </>
  );
}

export function SearchPanel() {
  useLocale();
  const context = useMessagingContext();
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");
  const [composing, setComposing] = useState(false);
  const [scope, setScope] = useState(context.activeChatId ? "chat" : "all");
  const [sender, setSender] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [paging, setPaging] = useState(false);
  const [pagingError, setPagingError] = useState("");
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setCommitted(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, composing]);
  const params = new URLSearchParams({ q: committed, sender });
  if (scope === "chat" && context.activeChatId)
    params.set("chatId", context.activeChatId);
  if (after) params.set("after", `${after} 00:00:00`);
  if (before) params.set("before", `${before} 23:59:59`);
  const path = committed ? `/search?${params}` : null;
  const remote = useToolData(path);
  const currentPathRef = useRef(path);
  const searchInputRef = useRef(null);
  useLayoutEffect(() => {
    currentPathRef.current = path;
  }, [path]);
  return (
    <div className="space-y-3">
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!composing) setCommitted(query.trim());
        }}
      >
        <Field label={t("Search messages")}>
          <div className="flex gap-2">
            <input
              ref={searchInputRef}
              className={toolInput}
              value={query}
              maxLength={200}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!event.target.value) setCommitted("");
              }}
            />
            {query && (
              <button
                type="button"
                className={toolButton}
                onClick={() => {
                  setQuery("");
                  setCommitted("");
                  searchInputRef.current?.focus();
                }}
                aria-label={t("Clear search")}
              >
                ×
              </button>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("Search")}>
            <select
              className={toolInput}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="all">{t("All chats")}</option>
              {context.activeChatId && (
                <option value="chat">{t("This chat")}</option>
              )}
            </select>
          </Field>
          <Field label={t("Sender username")}>
            <input
              className={toolInput}
              value={sender}
              onChange={(event) => setSender(event.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label={t("From date")}>
            <input
              type="date"
              className={toolInput}
              value={after}
              onChange={(event) => setAfter(event.target.value)}
            />
          </Field>
          <Field label={t("To date")}>
            <input
              type="date"
              className={toolInput}
              value={before}
              onChange={(event) => setBefore(event.target.value)}
            />
          </Field>
        </div>
      </form>
      <RemoteStatus
        {...remote}
        error={remote.error || pagingError}
        empty={committed && remote.data && !remote.data.messages.length}
      />
      <ul className="space-y-2">
        {remote.data?.messages.map((message) => (
          <li key={message.id}>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 p-3 text-start transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-800 dark:hover:bg-emerald-500/10"
              onClick={() => context.openResult(message)}
            >
              <span className="flex justify-between gap-2 text-xs text-slate-500">
                <span>{message.nickname || message.username}</span>
                <time>{formatLocalDate(message.created_at)}</time>
              </span>
              <p
                className="mt-1 whitespace-pre-wrap break-words text-sm"
                dir="auto"
              >
                {message.body}
              </p>
            </button>
          </li>
        ))}
      </ul>
      {remote.data?.nextCursor && (
        <button
          type="button"
          className={toolButton}
          disabled={paging}
          onClick={async () => {
            setPaging(true);
            setPagingError("");
            try {
              const next = await messagingRequest(
                `${path}&cursor=${encodeURIComponent(remote.data.nextCursor)}`,
              );
              if (currentPathRef.current === path)
                remote.setData((previous) =>
                  previous
                    ? {
                        ...next,
                        messages: [...previous.messages, ...next.messages],
                      }
                    : previous,
                );
            } catch (failure) {
              if (currentPathRef.current === path)
                setPagingError(failure.message);
            } finally {
              setPaging(false);
            }
          }}
        >
          {t("Load more")}
        </button>
      )}
    </div>
  );
}

export function MediaPanel() {
  useLocale();
  const context = useMessagingContext();
  const [kind, setKind] = useState("all");
  const [offset, setOffset] = useState(0);
  const remote = useToolData(
    `/chats/${context.activeChatId}/media?kind=${kind}&offset=${offset}`,
  );
  return (
    <div className="space-y-3">
      <Field label={t("Media")}>
        <select
          className={toolInput}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setOffset(0);
          }}
        >
          {[
            ["all", "All"],
            ["image", "Images"],
            ["video", "Videos"],
            ["audio", "Voice and audio"],
            ["document", "Documents"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </Field>
      <RemoteStatus
        {...remote}
        empty={remote.data && !remote.data.files.length}
      />
      <ul className="space-y-2">
        {remote.data?.files.map((file) => (
          <li
            key={file.id}
            className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="block break-words text-sm text-emerald-700 underline dark:text-emerald-200"
              dir="auto"
            >
              {file.original_name}
            </a>
            <p className="mt-1 text-xs text-slate-500">
              {Math.ceil(file.size_bytes / 1024)} KB ·{" "}
              {formatLocalDate(file.created_at)}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex justify-between gap-2">
        {offset > 0 && (
          <button
            type="button"
            className={toolButton}
            onClick={() => setOffset(Math.max(0, offset - 40))}
          >
            {t("Previous")}
          </button>
        )}
        {remote.data?.hasMore && (
          <button
            type="button"
            className={toolButton}
            onClick={() => setOffset(offset + 40)}
          >
            {t("Load more")}
          </button>
        )}
      </div>
    </div>
  );
}

export function DevicesPanel() {
  useLocale();
  const context = useMessagingContext();
  const remote = useToolData("/devices");
  const [selected, setSelected] = useState(null);
  if (selected)
    return (
      <div
        role="alertdialog"
        aria-label={t("Sign out device")}
        className="space-y-3"
      >
        <p className="text-sm">{selected.label}</p>
        <p className="text-sm text-slate-500">
          {t("This session will be signed out.")}
        </p>
        <div className="flex gap-2">
          <button
            autoFocus
            type="button"
            className={toolButton}
            onClick={() => setSelected(null)}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={context.busy}
            className={`${toolButton} text-rose-600 dark:text-rose-300`}
            onClick={async () => {
              if (
                await context.act(`/devices/${selected.id}`, {
                  method: "DELETE",
                })
              ) {
                if (selected.current) window.location.reload();
                else {
                  setSelected(null);
                  remote.reload();
                }
              }
            }}
          >
            {t("Sign out")}
          </button>
        </div>
        {context.error && (
          <p role="alert" className="text-sm text-rose-600">
            {context.error}
          </p>
        )}
      </div>
    );
  return (
    <div>
      <RemoteStatus
        {...remote}
        empty={remote.data && !remote.data.devices.length}
      />
      <ul className="space-y-3">
        {remote.data?.devices.map((device) => (
          <li
            key={device.id}
            className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <p className="break-words text-sm">{device.label}</p>
            <p className="text-xs text-slate-500">
              {device.last_seen && formatLocalDate(device.last_seen)}{" "}
              {device.current && `· ${t("Current device")}`}
            </p>
            <button
              type="button"
              className={toolButton}
              onClick={() => setSelected(device)}
            >
              {t("Sign out device")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SchedulePanel() {
  useLocale();
  const context = useMessagingContext();
  const remote = useToolData(`/chats/${context.activeChatId}/scheduled`);
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  return (
    <div className="space-y-4">
      <form
        noValidate
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!dueAt || !body.trim()) {
            context.setError(t("Choose a message and a time."));
            return;
          }
          const due = new Date(dueAt);
          if (!Number.isFinite(due.getTime())) return;
          if (
            await context.act(`/chats/${context.activeChatId}/scheduled`, {
              method: "POST",
              body: { body, dueAt: due.toISOString() },
            })
          ) {
            setBody("");
            setDueAt("");
            remote.reload();
          }
        }}
      >
        <Field label={t("Message")}>
          <textarea
            className={`${toolInput} min-h-24 resize-none`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            dir="auto"
          />
        </Field>
        <Field label={t("Send at")}>
          <input
            type="datetime-local"
            className={toolInput}
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </Field>
        <button type="submit" disabled={context.busy} className={toolButton}>
          {t("Schedule message")}
        </button>
      </form>
      <RemoteStatus
        {...remote}
        empty={remote.data && !remote.data.messages.length}
      />
      <ul className="space-y-2">
        {remote.data?.messages.map((message) => (
          <li
            key={message.id}
            className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <p className="whitespace-pre-wrap break-words text-sm" dir="auto">
              {message.body}
            </p>
            <p className="text-xs text-slate-500">
              {formatLocalDate(message.due_at)}
            </p>
            {message.error && (
              <p className="text-xs text-rose-600">{message.error}</p>
            )}
            <button
              type="button"
              className={toolButton}
              disabled={context.busy}
              onClick={async () => {
                if (
                  await context.act(`/scheduled/${message.id}`, {
                    method: "DELETE",
                  })
                )
                  remote.reload();
              }}
            >
              {t("Cancel scheduled message")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PollsPanel() {
  useLocale();
  const context = useMessagingContext();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("");
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await context.act(`/chats/${context.activeChatId}/polls`, {
            method: "POST",
            body: {
              question,
              options: options
                .split("\n")
                .map((option) => option.trim())
                .filter(Boolean),
            },
          })
        ) {
          setQuestion("");
          setOptions("");
          context.setPanel(null);
        }
      }}
    >
      <Field label={t("Question")}>
        <input
          className={toolInput}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={300}
          dir="auto"
        />
      </Field>
      <Field label={t("Options (one per line)")}>
        <textarea
          className={`${toolInput} min-h-32 resize-none`}
          value={options}
          onChange={(event) => setOptions(event.target.value)}
          maxLength={1100}
          dir="auto"
        />
      </Field>
      <button type="submit" className={toolButton} disabled={context.busy}>
        {t("Create poll")}
      </button>
    </form>
  );
}

export function TopicsPanel() {
  useLocale();
  const context = useMessagingContext();
  const [title, setTitle] = useState("");
  const role = context.chat?.members?.find(
    (member) => member.id === context.user.id,
  )?.role;
  const manager = ["owner", "admin"].includes(role);
  return (
    <div className="space-y-3">
      {manager && (
        <form
          noValidate
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await context.act(`/chats/${context.activeChatId}/topics`, {
                method: "POST",
                body: { title },
              })
            )
              setTitle("");
          }}
        >
          <Field label={t("Topic name")}>
            <input
              className={toolInput}
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <button type="submit" className={toolButton} disabled={context.busy}>
            {t("Create topic")}
          </button>
        </form>
      )}
      <ul className="space-y-2">
        {context.extras.topics.map((topic) => (
          <li
            key={topic.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <button
              type="button"
              className={toolButton}
              onClick={() => {
                context.setTopic(topic.id);
                context.setPanel(null);
              }}
            >
              {topic.title}
            </button>
            {manager && (
              <button
                type="button"
                className={toolButton}
                disabled={context.busy}
                onClick={() =>
                  context.act(
                    `/chats/${context.activeChatId}/topics/${topic.id}`,
                    { method: "PUT", body: { closed: !Number(topic.closed) } },
                  )
                }
              >
                {t(Number(topic.closed) ? t("Reopen topic") : t("Close topic"))}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GroupSettingsPanel() {
  useLocale();
  const context = useMessagingContext();
  const policy = context.extras.policy;
  const [slowSeconds, setSlowSeconds] = useState(
    Number(policy.slow_seconds || 0),
  );
  const [membersCanSend, setMembersCanSend] = useState(
    policy.members_can_send === undefined ||
      Boolean(Number(policy.members_can_send)),
  );
  const [membersCanUpload, setMembersCanUpload] = useState(
    policy.members_can_upload === undefined ||
      Boolean(Number(policy.members_can_upload)),
  );
  const [roleChange, setRoleChange] = useState(null);
  const role = context.chat?.members?.find(
    (member) => member.id === context.user.id,
  )?.role;
  return (
    <div className="space-y-4">
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void context.act(`/chats/${context.activeChatId}/policy`, {
            method: "PUT",
            body: { slowSeconds, membersCanSend, membersCanUpload },
          });
        }}
      >
        <Field label={t("Slow mode (seconds)")}>
          <input
            type="number"
            className={toolInput}
            min={0}
            max={3600}
            value={slowSeconds}
            onChange={(event) => setSlowSeconds(Number(event.target.value))}
          />
        </Field>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={membersCanSend}
            onChange={(event) => setMembersCanSend(event.target.checked)}
          />
          {t("Members can send messages")}
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={membersCanUpload}
            onChange={(event) => setMembersCanUpload(event.target.checked)}
          />
          {t("Members can upload files")}
        </label>
        <button type="submit" className={toolButton} disabled={context.busy}>
          {t("Save")}
        </button>
      </form>
      {role === "owner" && (
        <ul className="space-y-2">
          {context.chat.members
            .filter((member) => member.role !== "owner")
            .map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{member.nickname || member.username}</span>
                <button
                  type="button"
                  className={toolButton}
                  onClick={() => setRoleChange(member)}
                >
                  {t(
                    member.role === "admin"
                      ? t("Remove administrator role")
                      : t("Promote to administrator"),
                  )}
                </button>
              </li>
            ))}
        </ul>
      )}
      {roleChange && (
        <div
          role="alertdialog"
          aria-label={t("Group settings")}
          className="space-y-2 rounded-xl border border-amber-300 p-3"
        >
          <p className="text-sm">
            {roleChange.nickname || roleChange.username} ·{" "}
            {t(roleChange.role === "admin" ? t("Member") : t("Administrator"))}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={toolButton}
              onClick={() => setRoleChange(null)}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className={toolButton}
              disabled={context.busy}
              onClick={async () => {
                if (
                  await context.act(`/chats/${context.activeChatId}/role`, {
                    method: "PUT",
                    body: {
                      userId: roleChange.id,
                      role: roleChange.role === "admin" ? "member" : "admin",
                    },
                  })
                ) {
                  setRoleChange(null);
                  context.reloadChats();
                }
              }}
            >
              {t("Save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
