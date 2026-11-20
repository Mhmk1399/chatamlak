import { describe, expect, test, vi } from "vitest";
import {
  SupportAccessError,
  createSupportAccessService,
} from "../../lib/supportAccessService.js";

async function expectCode(promise, code) {
  await expect(promise).rejects.toMatchObject({
    name: "SupportAccessError",
    code,
  });
}

describe("support conversation access preparation", () => {
  test("allows a verified guest only for an explicitly granted conversation", async () => {
    const isMember = vi.fn();
    const service = createSupportAccessService({ isMember });
    const principal = {
      kind: "guest",
      provider: "owj-web",
      guestSubject: "guest-1",
      scopes: ["support:conversation"],
      conversationIds: ["support-conversation-1"],
    };

    await expect(
      service.authorizeConversation({
        principal,
        conversationId: "support-conversation-1",
        operation: "send",
      }),
    ).resolves.toEqual({
      actorKind: "guest",
      subject: "guest-1",
      conversationId: "support-conversation-1",
      operation: "send",
    });
    expect(isMember).not.toHaveBeenCalled();

    await expectCode(
      service.authorizeConversation({
        principal,
        conversationId: "support-conversation-2",
        operation: "read",
      }),
      "SUPPORT_CONVERSATION_DENIED",
    );
  });

  test("requires an explicitly linked registered Chat member", async () => {
    const isMember = vi.fn(async (_conversationId, chatUserId) => chatUserId === "chat-user-1");
    const service = createSupportAccessService({ isMember });
    const principal = {
      kind: "registered",
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      scopes: ["support:conversation"],
    };

    await expect(
      service.authorizeConversation({
        principal,
        conversationId: "support-conversation-1",
        operation: "read",
      }),
    ).resolves.toEqual({
      actorKind: "registered",
      subject: "web-user-1",
      chatUserId: "chat-user-1",
      conversationId: "support-conversation-1",
      operation: "read",
    });
    expect(isMember).toHaveBeenCalledWith(
      "support-conversation-1",
      "chat-user-1",
    );
  });

  test("fails closed for missing identity, scope, membership, or unsupported operations", async () => {
    const service = createSupportAccessService({
      isMember: async () => false,
    });
    await expectCode(
      service.authorizeConversation({
        principal: null,
        conversationId: "support-conversation-1",
        operation: "read",
      }),
      "SUPPORT_IDENTITY_REQUIRED",
    );
    await expectCode(
      service.authorizeConversation({
        principal: {
          kind: "registered",
          provider: "owj-web",
          webUserId: "web-user-1",
          chatUserId: "chat-user-1",
          scopes: ["chat:access"],
        },
        conversationId: "support-conversation-1",
        operation: "read",
      }),
      "SUPPORT_SCOPE_DENIED",
    );
    await expectCode(
      service.authorizeConversation({
        principal: {
          kind: "registered",
          provider: "owj-web",
          webUserId: "web-user-1",
          chatUserId: "chat-user-1",
          scopes: ["support:conversation"],
        },
        conversationId: "support-conversation-1",
        operation: "read",
      }),
      "SUPPORT_CONVERSATION_DENIED",
    );
    await expectCode(
      service.authorizeConversation({
        principal: {
          kind: "guest",
          provider: "owj-web",
          guestSubject: "guest-1",
          scopes: ["support:conversation"],
          conversationIds: ["support-conversation-1"],
        },
        conversationId: "support-conversation-1",
        operation: "admin",
      }),
      "SUPPORT_OPERATION_DENIED",
    );
  });

  test("exports a stable support access error type", () => {
    expect(
      new SupportAccessError("SUPPORT_SCOPE_DENIED", "Denied.", 403),
    ).toMatchObject({
      name: "SupportAccessError",
      code: "SUPPORT_SCOPE_DENIED",
      status: 403,
    });
  });
});
