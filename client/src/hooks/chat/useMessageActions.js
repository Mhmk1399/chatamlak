import { useMessagingContext } from "./useMessagingTools.js";
import { isValidUuid } from "../../utils/uuidUtils.js";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "👎"];

// Shared by inline reaction counts and the message action dialog. Keep the
// existing authenticated messaging API and group/channel membership policy.
export function useMessageActions(message) {
  const context = useMessagingContext();
  const id = message?._serverId || message?.id;
  const queued = Boolean(message?._clientId && ["sending", "failed"].includes(message._delivery));
  const available = Boolean(context && !queued && isValidUuid(String(id)) && !/^\[\[(system|call):/.test(String(message?.body || "")) && !message?._systemEvent);
  const extras = context?.extras;
  const reactions = (extras?.reactions || []).filter((reaction) => String(reaction.message_id) === String(id));
  const selected = new Set(reactions.filter((reaction) => reaction.user_id === context?.user?.id).map((reaction) => reaction.emoji));
  const role = (context?.chat?.members || []).find((member) => member.id === context?.user?.id)?.role;
  const canManage = ["owner", "admin"].includes(role);
  const pinned = (extras?.pins || []).includes(id);
  const topicId = (extras?.messageTopics || []).find((entry) => entry.message_id === id)?.topic_id || "";
  const topics = (extras?.topics || []).filter((topic) => !Number(topic.closed));
  const mutate = (operation, body) => context.act(`/chats/${context.activeChatId}/${operation}`, { method: "PUT", body: { messageId: id, ...body } });
  return {
    context, id, queued, available, reactions, selected, pinned, canManage, topics, topicId,
    canSetTopic: available && topics.length > 0 && (canManage || message?.username === context?.user?.username),
    react: (emoji) => mutate("reaction", { emoji, active: !selected.has(emoji) }),
    togglePin: () => mutate("pin", { active: !pinned }),
    setTopic: (topicId) => mutate("topic", { topicId: topicId || null }),
  };
}
