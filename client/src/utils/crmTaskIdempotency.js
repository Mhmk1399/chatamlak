const STORAGE_KEY = "ouj:crm-task-intents:v1";
const MAX_INTENTS = 8;
const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

const storage = () => (typeof window === "undefined" ? null : window.sessionStorage);

function read(store, now) {
  if (!store) return [];
  try {
    const value = JSON.parse(store.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item) => (
      item && typeof item.fingerprint === "string" &&
      typeof item.key === "string" && Number(item.createdAt) + INTENT_TTL_MS > now
    )).slice(-MAX_INTENTS);
  } catch {
    return [];
  }
}

function write(store, intents) {
  if (!store) return;
  try { store.setItem(STORAGE_KEY, JSON.stringify(intents.slice(-MAX_INTENTS))); } catch {}
}

export async function fingerprintCrmTask(conversationId, task) {
  const input = new TextEncoder().encode(JSON.stringify({ conversationId, task }));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getCrmTaskIntent({ conversationId, task, store = storage(), now = Date.now() }) {
  const fingerprint = await fingerprintCrmTask(conversationId, task);
  const intents = read(store, now);
  const existing = intents.find((item) => item.fingerprint === fingerprint);
  if (existing) {
    write(store, intents);
    return existing;
  }
  const intent = {
    fingerprint,
    key: `chat:crm:${conversationId}:${crypto.randomUUID()}`,
    createdAt: now,
  };
  write(store, [...intents, intent]);
  return intent;
}

export function clearCrmTaskIntent(intent, store = storage()) {
  if (!intent?.fingerprint) return;
  write(store, read(store, Date.now()).filter((item) => item.fingerprint !== intent.fingerprint));
}

export { STORAGE_KEY as CRM_TASK_INTENT_STORAGE_KEY };
