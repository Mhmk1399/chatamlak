import { apiFetch } from "./chatApi.js";
import { t } from "../i18n/locale.js";

export async function messagingRequest(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await apiFetch(`/api/messaging${path}`, {
      method, signal, ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(t("Connection failed. Check your internet connection and try again."));
  }
  if (response.ok && [204, 205].includes(response.status)) return {};
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(t(typeof data?.error === "string" ? data.error : "Unable to complete this operation.")), { status: response.status });
  if (!data || typeof data !== "object") throw Object.assign(new Error(t("The server returned an invalid response. Please try again.")), { status: response.status });
  return data;
}
