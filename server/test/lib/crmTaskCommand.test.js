import { describe, expect, test } from "vitest";
import {
  PlatformContractError,
  buildCrmTaskCommandV1,
  validateCrmTaskResultV1,
} from "../../lib/crmTaskCommand.js";

const actor = {
  kind: "registered",
  provider: "owj-web",
  webUserId: "web-user-1",
  chatUserId: "chat-user-1",
};

function expectCode(callback, code) {
  let caught;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    name: "PlatformContractError",
    code,
  });
}

describe("Chat-side CRM task command contract", () => {
  test("builds a minimal versioned command owned by Web", () => {
    expect(
      buildCrmTaskCommandV1({
        actor,
        conversationId: "conversation-1",
        requestId: "request-1",
        idempotencyKey: "chat:conversation-1:request-1",
        task: {
          title: "Follow up with the customer",
          dueAt: "2026-11-21T08:00:00.000Z",
          priority: "normal",
          assigneeWebUserId: "web-agent-2",
        },
      }),
    ).toEqual({
      version: 1,
      source: {
        service: "ouj-chat",
        conversationId: "conversation-1",
        chatUserId: "chat-user-1",
      },
      actor: {
        provider: "owj-web",
        webUserId: "web-user-1",
      },
      requestId: "request-1",
      idempotencyKey: "chat:conversation-1:request-1",
      task: {
        title: "Follow up with the customer",
        dueAt: "2026-11-21T08:00:00.000Z",
        priority: "normal",
        assigneeWebUserId: "web-agent-2",
      },
    });
  });

  test("rejects unverified, guest, or Chat-local actors", () => {
    for (const invalidActor of [
      null,
      { ...actor, kind: "guest" },
      { kind: "registered", provider: "ouj-chat", webUserId: "web-user-1" },
      { kind: "registered", provider: "owj-web", chatUserId: "chat-user-1" },
    ]) {
      expectCode(
        () =>
          buildCrmTaskCommandV1({
            actor: invalidActor,
            conversationId: "conversation-1",
            requestId: "request-1",
            idempotencyKey: "idempotency-1",
            task: { title: "Follow up" },
          }),
        "CRM_ACTOR_NOT_VERIFIED",
      );
    }
  });

  test("requires stable request and idempotency identifiers", () => {
    expectCode(
      () =>
        buildCrmTaskCommandV1({
          actor,
          conversationId: "conversation-1",
          requestId: "",
          idempotencyKey: "",
          task: { title: "Follow up" },
        }),
      "CRM_IDEMPOTENCY_REQUIRED",
    );
  });

  test("refuses private message bodies and unknown contact payloads", () => {
    for (const forbidden of [
      { messageBody: "private text" },
      { privateMessage: "private text" },
      { customerPhone: "redacted" },
      { customer: { name: "redacted" } },
    ]) {
      expectCode(
        () =>
          buildCrmTaskCommandV1({
            actor,
            conversationId: "conversation-1",
            requestId: "request-1",
            idempotencyKey: "idempotency-1",
            task: { title: "Follow up", ...forbidden },
          }),
        "CRM_PRIVATE_DATA_FORBIDDEN",
      );
    }
  });

  test("validates the canonical task identifier returned by Web", () => {
    expect(
      validateCrmTaskResultV1({
        version: 1,
        taskId: "web-task-1",
        duplicate: false,
      }),
    ).toEqual({
      version: 1,
      taskId: "web-task-1",
      duplicate: false,
    });

    expectCode(
      () => validateCrmTaskResultV1({ version: 1, taskId: "" }),
      "CRM_RESULT_INVALID",
    );
  });

  test("exports a stable contract error type", () => {
    expect(
      new PlatformContractError("CRM_RESULT_INVALID", "Invalid result.", 502),
    ).toMatchObject({
      name: "PlatformContractError",
      code: "CRM_RESULT_INVALID",
      status: 502,
    });
  });
});
