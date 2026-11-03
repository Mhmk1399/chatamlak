import { t as localize, useLocale as useAppLocale } from "../../i18n/locale.js";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Clapper,
  Database,
  KeyRound,
  LoaderCircle,
  PackageOpen,
  PhoneCall,
} from "../../icons/lucide.js";
import { TelegramIcon } from "../../icons/BrandIcons.jsx";
import Tooltip from "../common/Tooltip.jsx";
import { api } from "./adminShared.js";
import { SectionHeading } from "./AdminCommon.jsx";
import RemoteChannelSetupModal from "./RemoteChannelSetupModal.jsx";

// ─── Status badge — mirrors ActionsTab ───────────────────────────────────────

function StatusBadge({ status }) {
  useAppLocale();
  if (!status) return null;
  // "env" mirrors the Settings tab EnvLockBadge for env-managed values.
  if (status.type === "env") {
    return (
      <Tooltip label={localize("Managed via environment variables")}>
        <span
          tabIndex={0}
          className="inline-flex cursor-help items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400"
        >
          <KeyRound size={9} />{localize("environment")}</span>
      </Tooltip>
    );
  }
  const { type, label } = status;
  const cls =
    type === "error"
      ? "text-rose-600 dark:text-rose-300"
      : "text-brand-600 dark:text-brand-300";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${cls}`}>
      {type === "busy" ? (
        <LoaderCircle size={13} className="animate-spin" />
      ) : type === "error" ? (
        <AlertCircle size={13} />
      ) : (
        <Check size={13} />
      )}
      {localize(label)}
    </span>
  );
}

// ─── Service row — mirrors ActionsTab ActionRow ──────────────────────────────

function ServiceRow({
  icon: Icon,
  iconAnim = "icon-anim-sway",
  label,
  description,
  onClick,
  disabled = false,
  status = null,
}) {
  useAppLocale();
  const busy = status?.type === "busy";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex h-full w-full flex-col items-start gap-2 rounded-2xl border border-brand-200/70 bg-white/90 p-4 text-start transition hover:border-brand-300 hover:bg-brand-50/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-500/30 dark:bg-slate-950/50 dark:hover:bg-brand-500/5"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-brand-600 dark:text-brand-400">
          <Icon size={22} className={iconAnim} />
        </div>
        {status && <div className="shrink-0 pt-1"><StatusBadge status={status} /></div>}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {localize(label)}
        </p>
        {description && (
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            {localize(description)}
          </p>
        )}
      </div>
    </button>
  );
}

const ServicesTab = forwardRef(function ServicesTab(
  { data, onMutated },
  ref,
) {
  useAppLocale();
  const [rowStatus, setRowStatus] = useState({});
  const [setupOpen, setSetupOpen] = useState(false);
  const statusTimers = useRef({});

  const flashStatus = (key, type, label, ms = 3000) => {
    if (statusTimers.current[key]) clearTimeout(statusTimers.current[key]);
    setRowStatus((prev) => ({ ...prev, [key]: { type, label } }));
    if (type !== "busy") {
      statusTimers.current[key] = setTimeout(() => {
        setRowStatus((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, ms);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: () => api.get("/api/admin/services").then(() => {}).catch(() => {}),
  }), []);

  const mediaWorker = data?.mediaWorker || null;
  const remoteChannel = data?.remoteChannel || null;
  const storage = data?.storage || null;
  const database = data?.database || null;
  const turn = data?.turn || null;

  const workerDescription = mediaWorker?.configured
    ? mediaWorker.reachable
      ? `Reachable${mediaWorker.latencyMs != null ? ` · ${mediaWorker.latencyMs}ms` : ""}`
      : "Configured but unreachable."
    : "Local fallback mode — no external worker configured.";

  const remoteFeatureOn = Boolean(remoteChannel?.enabled);
  const remoteLinked = Boolean(remoteChannel?.telegramConfigured);
  const remoteEnvManaged = Boolean(remoteChannel?.telegramManagedByEnv);
  const remoteDescription = !remoteFeatureOn
    ? "Remote channel is disabled"
    : remoteEnvManaged
      ? "Telegram credentials are set in .env"
      : remoteLinked
        ? `Telegram linked${remoteChannel.telegramConnected ? " · connected" : ""}`
        : "Not linked — set up to link Telegram.";

  const handleWorkerCheck = async () => {
    flashStatus("worker", "busy", "Checking…");
    try {
      const payload = await api.get("/api/admin/services");
      const reachable = payload?.mediaWorker?.reachable;
      const configured = payload?.mediaWorker?.configured;
      if (reachable || !configured) flashStatus("worker", "success", "Active");
      else flashStatus("worker", "error", "Inactive");
    } catch {
      flashStatus("worker", "error", "Check failed");
    }
  };

  const storageReachable = storage?.reachable;
  const storageDescription =
    `Driver: ${storage?.driver || "local"}` +
    (storageReachable && storage?.latencyMs != null ? ` · ${storage.latencyMs}ms` : "");
  const handleStorageCheck = async () => {
    flashStatus("storage", "busy", "Checking…");
    try {
      const payload = await api.get("/api/admin/services");
      if (payload?.storage?.reachable === false) {
        flashStatus("storage", "error", "Unreachable");
      } else {
        flashStatus("storage", "success", "Active");
      }
    } catch {
      flashStatus("storage", "error", "Check failed");
    }
  };

  const isPostgres = database?.client === "postgres";
  const databaseReachable = database?.reachable;
  const isDatabaseConfigured = database?.configured !== false;
  const databaseDescription = !isDatabaseConfigured
    ? "Database disabled."
    : database?.client === "mongodb"
      ? databaseReachable === false ? "MongoDB configured but unreachable." : `MongoDB${databaseReachable && database?.latencyMs != null ? ` | ${database.latencyMs}ms` : ""}`
    : isPostgres
      ? databaseReachable === false
        ? "PostgreSQL configured but unreachable."
        : `PostgreSQL` +
          (databaseReachable && database?.latencyMs != null ? ` · ${database.latencyMs}ms` : "")
      : databaseReachable === false
        ? "SQLite unreachable."
        : `SQLite · local` +
          (databaseReachable && database?.latencyMs != null ? ` · ${database.latencyMs}ms` : "");
  const handleDatabaseCheck = async () => {
    flashStatus("database", "busy", "Checking…");
    try {
      const payload = await api.get("/api/admin/services");
      if (payload?.database?.reachable === false) {
        flashStatus("database", "error", "Unreachable");
      } else {
        flashStatus("database", "success", "Active");
      }
    } catch {
      flashStatus("database", "error", "Check failed");
    }
  };

  const isTurnConfigured = Boolean(turn?.configured);
  const turnReachable = turn?.reachable;
  const turnDescription = !isTurnConfigured
    ? "STUN only — no TURN relay configured."
    : turnReachable === false
      ? "Configured but unreachable."
      : (turn?.managed ? "Cloudflare TURN" : "TURN relay") +
        (turnReachable && turn?.latencyMs != null ? ` · ${turn.latencyMs}ms` : "");

  const handleTurnCheck = async () => {
    flashStatus("turn", "busy", "Checking…");
    try {
      const payload = await api.get("/api/admin/services");
      if (payload?.turn?.reachable === false) {
        flashStatus("turn", "error", "Unreachable");
      } else {
        flashStatus("turn", "success", "Active");
      }
    } catch {
      flashStatus("turn", "error", "Check failed");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{localize("Services")}</SectionHeading>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ServiceRow
            icon={Clapper}
            iconAnim="icon-anim-beat"
            label={localize("Media worker")}
            description={workerDescription}
            onClick={handleWorkerCheck}
            status={
              rowStatus.worker ||
              (mediaWorker
                ? mediaWorker.reachable || !mediaWorker.configured
                  ? { type: "success", label: "Active" }
                  : { type: "error", label: "Inactive" }
                : null)
            }
          />
          <ServiceRow
            icon={TelegramIcon}
            iconAnim="icon-anim-sway"
            label={localize("Telegram connection")}
            description={remoteDescription}
            onClick={() => setSetupOpen(true)}
            disabled={!remoteFeatureOn || remoteEnvManaged}
            status={
              !remoteFeatureOn
                ? { type: "error", label: "Disabled" }
                : remoteEnvManaged
                  ? { type: "env" }
                  : rowStatus.remote ||
                    (remoteChannel
                      ? remoteLinked
                        ? { type: "success", label: "Connected" }
                        : { type: "error", label: "Not configured" }
                      : null)
            }
          />
          <ServiceRow
            icon={PackageOpen}
            iconAnim="icon-anim-drop"
            label={localize("Storage")}
            description={storageDescription}
            onClick={handleStorageCheck}
            status={
              rowStatus.storage ||
              (storage
                ? storageReachable === false
                  ? { type: "error", label: "Unreachable" }
                  : { type: "success", label: "Active" }
                : null)
            }
          />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ServiceRow
            icon={Database}
            iconAnim="icon-anim-drop"
            label={localize("Database")}
            description={databaseDescription}
            onClick={handleDatabaseCheck}
            disabled={!isDatabaseConfigured}
            status={
              !isDatabaseConfigured
                ? { type: "error", label: "Disabled" }
                : rowStatus.database ||
                  (database
                    ? databaseReachable === false
                      ? { type: "error", label: "Unreachable" }
                      : { type: "success", label: "Active" }
                    : null)
            }
          />
          <ServiceRow
            icon={PhoneCall}
            iconAnim="icon-anim-sway"
            label={localize("TURN server")}
            description={turnDescription}
            onClick={handleTurnCheck}
            disabled={!isTurnConfigured}
            status={
              !isTurnConfigured
                ? { type: "error", label: "Disabled" }
                : rowStatus.turn ||
                  (turn
                    ? turnReachable === false
                      ? { type: "error", label: "Unreachable" }
                      : { type: "success", label: "Active" }
                    : null)
            }
          />
        </div>
      </div>
      <RemoteChannelSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onChanged={() => onMutated?.()}
      />
    </div>
  );
});

export default ServicesTab;
