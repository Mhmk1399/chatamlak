import { randomUUID } from "node:crypto";
import { PlatformContractError, validateCrmTaskResultV1 } from "./crmTaskCommand.js";

const fail = (code, message, status = 503) => { throw new PlatformContractError(code, message, status); };

export function createCrmTaskClient({ endpoint, serviceToken, fetchImpl = globalThis.fetch, allowHttp = false, timeoutMs = 6_000 } = {}) {
  let target = null;
  try { target = new URL(String(endpoint || "").trim()); } catch { target = null; }
  const configured = target && !target.username && !target.password && !target.hash &&
    (target.protocol === "https:" || (allowHttp && target.protocol === "http:")) &&
    typeof serviceToken === "string" && serviceToken.trim().length >= 32;

  async function createTask({ command, actorAuthorization, idempotencyKey, correlationId = randomUUID() } = {}) {
    if (!configured || typeof fetchImpl !== "function") fail("CRM_PROVIDER_UNAVAILABLE", "The Web CRM service is unavailable.");
    if (typeof actorAuthorization !== "string" || !actorAuthorization.trim()) fail("CRM_ACTOR_AUTHORIZATION_REQUIRED", "A current delegated Web actor proof is required.", 403);
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) fail("CRM_IDEMPOTENCY_REQUIRED", "A stable idempotency key is required.", 400);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();
    let response;
    try {
      response = await fetchImpl(target.toString(), {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: {
          accept: "application/json", authorization: `Bearer ${serviceToken.trim()}`,
          "content-type": "application/json", "x-owj-service": "owj-chat-crm",
          "x-owj-actor-authorization": actorAuthorization,
          "idempotency-key": idempotencyKey, "x-correlation-id": correlationId,
        },
        body: JSON.stringify(command),
      });
    } catch { fail("CRM_PROVIDER_UNAVAILABLE", "The Web CRM service is unavailable."); }
    finally { clearTimeout(timeout); }
    let body;
    try {
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > 32 * 1024) throw new Error();
      body = JSON.parse(raw);
    } catch { fail("CRM_RESULT_INVALID", "Web returned an invalid CRM task result.", 502); }
    if (!response.ok) {
      const rawCode = typeof body?.error === "string" ? body.error : body?.error?.code;
      const code = typeof rawCode === "string" ? rawCode.slice(0, 100) : "CRM_PROVIDER_UNAVAILABLE";
      const status = response.status >= 400 && response.status < 500 ? response.status : 503;
      fail(code, status === 503 ? "The Web CRM service is unavailable." : "The CRM task was denied.", status);
    }
    return validateCrmTaskResultV1(body);
  }
  return { createTask };
}
