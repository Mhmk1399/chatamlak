import { describe, expect, it, vi } from "vitest";
import { createMessagingService } from "../../../lib/services/messagingService.js";

function fixture() {
  const deps = {
    messagingDb: { dueSchedules: vi.fn(() => [{ id: "scheduled-1", chat_id: "chat", user_id: "alice", body: "hello" }]), claimSchedule: vi.fn(() => true), finishSchedule: vi.fn() },
    findUserById: vi.fn(() => ({ id: "alice", username: "alice" })), isMember: vi.fn(() => true),
    findMessageIdByClientRequestId: vi.fn(() => null), findChatById: vi.fn(() => ({ type: "dm" })),
    getChatMemberRole: vi.fn(() => "member"), createOrReuseMessage: vi.fn(() => ({ id: "message-1", deduped: false })),
    listChatMembers: vi.fn(() => [{ id: "bob", username: "bob" }]), listMutedUserIdsForChat: vi.fn(() => []),
    emitChatEvent: vi.fn(), sendPushNotificationToUsers: vi.fn(),
  };
  return deps;
}

describe("scheduled publication", () => {
  it("publishes scheduled replies in their original topic", async () => {
    const deps = fixture();
    deps.messagingDb.dueSchedules.mockReturnValue([{ id: "scheduled-1", chat_id: "chat", user_id: "alice", body: "hello", reply_to_message_id: "reply", topic_id: "topic" }]);
    deps.messagingDb.topic = vi.fn(() => ({ id: "topic", chat_id: "chat", closed: 0 }));
    deps.findMessageById = vi.fn(() => ({ id: "reply", chat_id: "chat" }));
    await createMessagingService(deps).tick();
    expect(deps.createOrReuseMessage).toHaveBeenCalledWith("chat", "alice", "hello", "reply", null, "scheduled:scheduled-1", { topicId: "topic" });
  });
  it("keeps a persisted message sent when push delivery fails", async () => {
    const deps = fixture();
    deps.sendPushNotificationToUsers.mockRejectedValue(new Error("Push unavailable"));
    await createMessagingService(deps).tick();
    expect(deps.messagingDb.finishSchedule).toHaveBeenCalledWith("scheduled-1", "sent");
    expect(deps.messagingDb.finishSchedule).not.toHaveBeenCalledWith("scheduled-1", "failed", expect.anything());
    expect(deps.createOrReuseMessage).toHaveBeenCalledWith("chat", "alice", "hello", null, null, "scheduled:scheduled-1");
  });
  it("rejects a scheduled message after membership was removed", async () => {
    const deps = fixture();
    deps.isMember.mockReturnValue(false);
    await createMessagingService(deps).tick();
    expect(deps.createOrReuseMessage).not.toHaveBeenCalled();
    expect(deps.messagingDb.finishSchedule).toHaveBeenCalledWith("scheduled-1", "failed", "You are no longer a member of this chat.");
  });
});
