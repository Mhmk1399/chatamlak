const ALLOWED_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const ALLOWED_TASK_FIELDS = new Set([
  "title",
  "dueAt",
  "priority",
  "assigneeWebUserId",
]);
const PRIVATE_TASK_FIELDS = new Set([
  "message",
  "messageBody",
  "privateMessage",
  "customer",
  "customerName",
  "customerPhone",
  "contact",
  "phone",
  "transcript",
]);

export class PlatformContractError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PlatformContractError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new PlatformContractError(code, message, status);
}

function stringField(value, { code, message, max = 200, optional = false }) {
  if (value == null && optional) return undefined;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) fail(code, message, 400);
  return normalized;
}

/**
 * Builds only the Chat-owned proposal for a future Web CRM command.
 * This module performs no network request and is intentionally not wired to UI
 * or routes until Web approves identity delegation and the provider contract.
 */
export function buildCrmTaskCommandV1({
  actor,
  conversationId,
  requestId,
  idempotencyKey,
  task,
} = {}) {
  if (
    !actor ||
    actor.kind !== "registered" ||
    actor.provider !== "owj-web" ||
    typeof actor.webUserId !== "string" ||
    !actor.webUserId.trim() ||
    typeof actor.chatUserId !== "string" ||
    !actor.chatUserId.trim()
  ) {
    fail(
      "CRM_ACTOR_NOT_VERIFIED",
      "A verified Web identity linked to Chat is required.",
      403,
    );
  }

  const normalizedConversationId = stringField(conversationId, {
    code: "CRM_CONVERSATION_REQUIRED",
    message: "A source conversation is required.",
    max: 128,
  });
  const normalizedRequestId =
    typeof requestId === "string" ? requestId.trim() : "";
  const normalizedIdempotencyKey =
    typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
  if (
    !normalizedRequestId ||
    normalizedRequestId.length > 128 ||
    !normalizedIdempotencyKey ||
    normalizedIdempotencyKey.length > 180
  ) {
    fail(
      "CRM_IDEMPOTENCY_REQUIRED",
      "Stable request and idempotency identifiers are required.",
      400,
    );
  }
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    fail("CRM_TASK_INVALID", "Task parameters are required.", 400);
  }

  const taskKeys = Object.keys(task);
  if (taskKeys.some((key) => PRIVATE_TASK_FIELDS.has(key))) {
    fail(
      "CRM_PRIVATE_DATA_FORBIDDEN",
      "Private message and customer contact data are not accepted.",
      400,
    );
  }
  if (taskKeys.some((key) => !ALLOWED_TASK_FIELDS.has(key))) {
    fail(
      "CRM_TASK_FIELD_UNAPPROVED",
      "The task contains a field that is not part of the proposed contract.",
      400,
    );
  }

  const title = stringField(task.title, {
    code: "CRM_TASK_INVALID",
    message: "A task title is required.",
    max: 200,
  });
  let dueAt;
  if (task.dueAt != null) {
    dueAt = stringField(task.dueAt, {
      code: "CRM_TASK_INVALID",
      message: "The task due date is invalid.",
      max: 64,
    });
    if (!Number.isFinite(Date.parse(dueAt))) {
      fail("CRM_TASK_INVALID", "The task due date is invalid.", 400);
    }
  }
  let priority;
  if (task.priority != null) {
    priority = stringField(task.priority, {
      code: "CRM_TASK_INVALID",
      message: "The task priority is invalid.",
      max: 16,
    });
    if (!ALLOWED_PRIORITIES.has(priority)) {
      fail("CRM_TASK_INVALID", "The task priority is invalid.", 400);
    }
  }
  const assigneeWebUserId = stringField(task.assigneeWebUserId, {
    code: "CRM_TASK_INVALID",
    message: "The task assignee is invalid.",
    max: 128,
    optional: true,
  });

  return {
    version: 1,
    source: {
      service: "ouj-chat",
      conversationId: normalizedConversationId,
      chatUserId: actor.chatUserId.trim(),
    },
    actor: {
      provider: "owj-web",
      webUserId: actor.webUserId.trim(),
    },
    requestId: normalizedRequestId,
    idempotencyKey: normalizedIdempotencyKey,
    task: {
      title,
      ...(dueAt ? { dueAt } : {}),
      ...(priority ? { priority } : {}),
      ...(assigneeWebUserId ? { assigneeWebUserId } : {}),
    },
  };
}

export function validateCrmTaskResultV1(result) {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    result.version !== 1 ||
    typeof result.taskId !== "string" ||
    !result.taskId.trim() ||
    result.taskId.trim().length > 128
  ) {
    fail(
      "CRM_RESULT_INVALID",
      "Web returned an invalid CRM task result.",
      502,
    );
  }
  return {
    version: 1,
    taskId: result.taskId.trim(),
    duplicate: result.duplicate === true,
  };
}
