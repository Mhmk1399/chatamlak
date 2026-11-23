import crypto from "node:crypto";
import { buildCrmTaskCommandV1 } from "../lib/crmTaskCommand.js";

const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status }); };

export function registerCrmRoutes(app, deps = {}) {
  app.post("/api/integrations/crm/tasks", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const session = await deps.getSessionFromRequest?.(req, { forceRefresh: true });
    if (!session) return res.status(401).json({ error: { code: "NOT_AUTHENTICATED", message: "Sign in is required." } });
    if (session.auth_kind !== "web_federated" || !session.web_subject) {
      fail("CRM_WEB_IDENTITY_REQUIRED", "A federated Owj Web session is required.", 403);
    }
    if (!session.crm_actor_authorization) {
      fail("CRM_ACTOR_AUTHORIZATION_REQUIRED", "Sign in with Owj again before creating a CRM task.", 403);
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some((key) => !["conversationId", "task"].includes(key))) {
      fail("CRM_TASK_INVALID", "The CRM task input is invalid.", 400);
    }
    const conversationId = String(req.body.conversationId || "").trim();
    if (!await deps.isMember?.(conversationId, session.id)) {
      fail("CRM_CONVERSATION_DENIED", "The source conversation is not available to this account.", 403);
    }
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
    const command = buildCrmTaskCommandV1({ conversationId, task: req.body.task });
    if (!deps.crmTaskClient?.createTask) fail("CRM_PROVIDER_UNAVAILABLE", "The Web CRM service is unavailable.", 503);
    const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
    const result = await deps.crmTaskClient.createTask({
      command,
      actorAuthorization: session.crm_actor_authorization,
      idempotencyKey,
      correlationId,
    });
    res.set("X-Correlation-Id", result.correlationId);
    return res.status(result.deduped ? 200 : 201).json(result);
  });
}
