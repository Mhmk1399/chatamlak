import { apiFetch } from "./chatApi.js";
import { t } from "../i18n/locale.js";

export async function messagingRequest(path, { method = "GET", body, signal } = {}) {
  const response = await apiFetch(`/api/messaging${path}`, {
    method, signal, ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(t(data.error || "Unable to complete this operation.")), { status: response.status });
  return data;
}
