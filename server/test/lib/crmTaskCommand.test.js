import { describe, expect, test } from "vitest";
import { buildCrmTaskCommandV1, validateCrmTaskResultV1 } from "../../lib/crmTaskCommand.js";

describe("Chat CRM task command V1", () => {
  test("builds only the frozen Web envelope", () => {
    expect(buildCrmTaskCommandV1({
      conversationId: "conversation-1",
      task: {
        type: "call",
        title: "Follow up",
        priority: "normal",
        steps: [{ title: "Call", required: true }],
        dueAt: "2027-01-02T10:00:00.000Z",
        instructions: "Confirm availability",
      },
    })).toEqual({
      version: 1,
      source: { conversationId: "conversation-1" },
      task: {
        type: "call",
        title: "Follow up",
        priority: "normal",
        steps: [{ title: "Call", required: true }],
        dueAt: "2027-01-02T10:00:00.000Z",
        instructions: "Confirm availability",
      },
    });
  });

  test.each(["messageBody", "customerPhone", "transcript", "messages"])("rejects private field %s", (field) => {
    expect(() => buildCrmTaskCommandV1({
      conversationId: "conversation-1",
      task: { title: "Follow up", [field]: "private" },
    })).toThrow(expect.objectContaining({ code: "CRM_PRIVATE_DATA_FORBIDDEN" }));
  });

  test("requires the due date expected by the real Web CRM domain", () => {
    expect(() => buildCrmTaskCommandV1({
      conversationId: "conversation-1",
      task: { title: "Follow up" },
    })).toThrow(expect.objectContaining({ code: "CRM_TASK_INVALID" }));
  });

  test.each(["follow_up", "", "arbitrary"])('rejects non-canonical Web task type %j', (type) => {
    expect(() => buildCrmTaskCommandV1({
      conversationId: "conversation-1",
      task: {
        type,
        title: "Follow up",
        dueAt: "2027-01-02T10:00:00.000Z",
        steps: [{ title: "Call", required: true }],
      },
    })).toThrow(expect.objectContaining({ code: "CRM_TASK_INVALID" }));
  });

  test.each([undefined, []])("requires at least one canonical Web task step", (steps) => {
    expect(() => buildCrmTaskCommandV1({
      conversationId: "conversation-1",
      task: {
        type: "call",
        title: "Follow up",
        dueAt: "2027-01-02T10:00:00.000Z",
        ...(steps === undefined ? {} : { steps }),
      },
    })).toThrow(expect.objectContaining({ code: "CRM_TASK_INVALID" }));
  });

  test("validates the canonical task result", () => {
    expect(validateCrmTaskResultV1({
      version: 1,
      task: { id: "507f1f77bcf86cd799439011", status: "open", dueAt: null, createdAt: "2026-11-23T08:00:00.000Z" },
      deduped: false,
      correlationId: "correlation-1",
    })).toMatchObject({ task: { id: "507f1f77bcf86cd799439011" }, deduped: false });
  });
});
