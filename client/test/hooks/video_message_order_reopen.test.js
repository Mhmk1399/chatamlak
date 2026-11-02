import { describe, expect, test } from "vitest";
import { parseServerDate } from "../../src/utils/chatFormat.js";
import { isMessageFromOtherUser } from "../../src/utils/messageOwnership.js";
import { compareMessages } from "../../src/hooks/chat/useMessagesLoader.js";

describe("Video message ordering on chat reopen (Bug Reproduction)", () => {
  const currentUser = { id: "user-receiver", username: "bob" };
  const senderUser = { id: "user-sender", username: "alice" };

  const videoMessage = {
    id: "msg-video-1",
    _serverId: "msg-video-1",
    created_at: "2026-10-25T10:00:00.000Z",
    user_id: senderUser.id,
    username: senderUser.username,
    body: "Sent a video",
    files: [
      {
        id: 101,
        kind: "media",
        mimeType: "video/mp4",
        originalName: "clip.mp4",
        url: "/api/uploads/messages/clip.mp4",
      },
    ],
  };

  const textMessage = {
    id: "msg-text-2",
    _serverId: "msg-text-2",
    created_at: "2026-10-25T10:05:00.000Z",
    user_id: senderUser.id,
    username: senderUser.username,
    body: "Check out this video!",
    files: [],
  };

  test("BUG: old revealedLate logic incorrectly assigns _visibilityTime pushing video to end", () => {
    // 1. Initial cached messages in basePrev when reopening chat:
    const basePrev = [videoMessage, textMessage];

    // Compute prevLatestVisibleTime from basePrev (the buggy logic)
    const prevLatestVisibleTime = basePrev.reduce((max, msg) => {
      const t = Number(
        msg?._visibilityTime || parseServerDate(msg?.created_at).getTime(),
      );
      return Number.isFinite(t) ? Math.max(max, t) : max;
    }, 0);

    expect(prevLatestVisibleTime).toBe(
      parseServerDate(textMessage.created_at).getTime(),
    );

    // 2. Server returns both messages:
    const serverMessages = [videoMessage, textMessage];

    // 3. Old buggy revealedLate mapping:
    const buggyMessages = serverMessages.map((serverMsg) => {
      if (serverMsg?._visibilityTime) return serverMsg;
      const hasVideo = Array.isArray(serverMsg?.files)
        ? serverMsg.files.some((file) =>
            String(file?.mimeType || "")
              .toLowerCase()
              .startsWith("video/"),
          )
        : false;
      const isFromOther = isMessageFromOtherUser(serverMsg, currentUser);
      const createdAtMs = parseServerDate(serverMsg?.created_at).getTime();
      const revealedLate =
        isFromOther &&
        hasVideo &&
        Number.isFinite(createdAtMs) &&
        prevLatestVisibleTime > 0 &&
        createdAtMs < prevLatestVisibleTime;

      if (!revealedLate) return serverMsg;
      return {
        ...serverMsg,
        _visibilityTime: Date.now() + 10000,
      };
    });

    // Under buggy logic, the video message was assigned _visibilityTime in the future
    const buggyVideo = buggyMessages.find((m) => m.id === videoMessage.id);
    expect(buggyVideo._visibilityTime).toBeDefined();

    // Sorting with buggy _visibilityTime moves the video AFTER the text message!
    const buggySorted = [...buggyMessages].sort((a, b) => {
      const aTime =
        a._visibilityTime || parseServerDate(a.created_at).getTime();
      const bTime =
        b._visibilityTime || parseServerDate(b.created_at).getTime();
      return aTime - bTime;
    });

    expect(buggySorted[0].id).toBe(textMessage.id);
    expect(buggySorted[1].id).toBe(videoMessage.id); // Video wrongly became latest!
  });

  test("FIX: compareMessages preserves true chronological order for video messages on reopen", () => {
    // On reopen, both messages must stay in strictly chronological order (video at 10:00, text at 10:05)
    const messages = [textMessage, videoMessage];
    const sorted = [...messages].sort((a, b) =>
      compareMessages(a, b, parseServerDate),
    );

    expect(sorted[0].id).toBe(videoMessage.id);
    expect(sorted[1].id).toBe(textMessage.id);
  });
});
