const ALLOWED_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const ALLOWED_TYPES = new Set([
  "property_inspection", "call", "meeting", "document_collection", "showing", "other",
]);
const ALLOWED_TASK_FIELDS = new Set([
  "type", "title", "priority", "steps", "assignedUserId", "assignedConsultantId",
  "sellerPropertyCaseId", "buyerCaseId", "dueAt", "instructions",
]);
const PRIVATE_TASK_FIELDS = new Set([
  "message", "messageBody", "privateMessage", "customer", "customerName",
  "customerPhone", "contact", "phone", "transcript", "messages",
]);

export class PlatformContractError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PlatformContractError";
    this.code = code;
    this.status = status;
  }
}

const fail = (code, message, status = 400) => {
  throw new PlatformContractError(code, message, status);
};

function stringField(value, { max = 200, optional = false } = {}) {
  if ((value == null || value === "") && optional) return undefined;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) fail("CRM_TASK_INVALID", "The CRM task input is invalid.");
  return normalized;
}

function normalizedSteps(value) {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length > 30) fail("CRM_TASK_INVALID", "The CRM task steps are invalid.");
  return value.map((step) => {
    if (typeof step === "string") return stringField(step, { max: 300 });
    if (!step || typeof step !== "object" || Array.isArray(step) || Object.keys(step).some((key) => !["title", "required"].includes(key))) {
      fail("CRM_TASK_INVALID", "The CRM task steps are invalid.");
    }
    return {
      title: stringField(step.title, { max: 300 }),
      ...(step.required == null ? {} : { required: Boolean(step.required) }),
    };
  });
}

/** Build the exact Web-owned Chat CRM task contract. */
export function buildCrmTaskCommandV1({ conversationId, task } = {}) {
  const sourceId = stringField(conversationId, { max: 128 });
  if (!/^[A-Za-z0-9_-]+$/.test(sourceId)) fail("CRM_CONVERSATION_REQUIRED", "A valid source conversation is required.");
  if (!task || typeof task !== "object" || Array.isArray(task)) fail("CRM_TASK_INVALID", "Task parameters are required.");
  const keys = Object.keys(task);
  if (keys.some((key) => PRIVATE_TASK_FIELDS.has(key))) {
    fail("CRM_PRIVATE_DATA_FORBIDDEN", "Private message and contact data are not accepted.");
  }
  if (keys.some((key) => !ALLOWED_TASK_FIELDS.has(key))) {
    fail("CRM_TASK_FIELD_UNAPPROVED", "The task contains an unapproved field.");
  }
  const title = stringField(task.title, { max: 200 });
  const type = stringField(task.type, { max: 64 });
  if (!ALLOWED_TYPES.has(type)) fail("CRM_TASK_INVALID", "The CRM task type is invalid.");
  const priority = stringField(task.priority, { max: 16, optional: true });
  if (priority && !ALLOWED_PRIORITIES.has(priority)) fail("CRM_TASK_INVALID", "The task priority is invalid.");
  const dueAt = stringField(task.dueAt, { max: 64 });
  if (!Number.isFinite(Date.parse(dueAt))) fail("CRM_TASK_INVALID", "The task due date is invalid.");
  const steps = normalizedSteps(task.steps);
  if (!steps?.length) fail("CRM_TASK_INVALID", "At least one CRM task step is required.");
  const optional = (name, max = 128) => stringField(task[name], { max, optional: true });
  const assignedUserId = optional("assignedUserId");
  const assignedConsultantId = optional("assignedConsultantId");
  const sellerPropertyCaseId = optional("sellerPropertyCaseId");
  const buyerCaseId = optional("buyerCaseId");
  const instructions = optional("instructions", 2_000);
  return {
    version: 1,
    source: { conversationId: sourceId },
    task: {
      type, title,
      ...(priority ? { priority } : {}), ...(steps ? { steps } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(assignedConsultantId ? { assignedConsultantId } : {}),
      ...(sellerPropertyCaseId ? { sellerPropertyCaseId } : {}),
      ...(buyerCaseId ? { buyerCaseId } : {}),
      dueAt, ...(instructions ? { instructions } : {}),
    },
  };
}

export function validateCrmTaskResultV1(result) {
  const task = result?.task;
  if (
    !result || typeof result !== "object" || Array.isArray(result) || result.version !== 1 ||
    !task || typeof task !== "object" || Array.isArray(task) ||
    typeof task.id !== "string" || !task.id.trim() || task.id.length > 128 ||
    typeof task.status !== "string" || !task.status.trim() || task.status.length > 64 ||
    typeof result.deduped !== "boolean" ||
    typeof result.correlationId !== "string" || !result.correlationId.trim()
  ) fail("CRM_RESULT_INVALID", "Web returned an invalid CRM task result.", 502);
  for (const field of ["dueAt", "createdAt"]) {
    if (task[field] != null && !Number.isFinite(Date.parse(task[field]))) {
      fail("CRM_RESULT_INVALID", "Web returned an invalid CRM task result.", 502);
    }
  }
  return {
    version: 1,
    task: { id: task.id.trim(), status: task.status.trim(), dueAt: task.dueAt || null, createdAt: task.createdAt || null },
    deduped: result.deduped,
    correlationId: result.correlationId.trim(),
  };
}
