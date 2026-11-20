import { describe, expect, test, vi } from "vitest";
import { addEligibleChatMemberships } from "../../db/mongoRepository.js";

describe("auto-add repository contract", () => {
  test("returns only newly added chats and respects leave/removal state", async () => {
    const repository = {
      hasChatMemberLeft: vi.fn(async (chatId) => chatId === "left"),
      isGroupMemberRemoved: vi.fn(async (chatId) => chatId === "removed"),
      isMember: vi.fn(async (chatId) => chatId === "existing"),
      addChatMember: vi.fn(async () => true),
    };

    await expect(
      addEligibleChatMemberships(repository, "user-1", [
        "new-chat",
        "left",
        "removed",
        "existing",
      ]),
    ).resolves.toEqual(["new-chat"]);
    expect(repository.addChatMember).toHaveBeenCalledTimes(1);
    expect(repository.addChatMember).toHaveBeenCalledWith("new-chat", "user-1");
  });
});
