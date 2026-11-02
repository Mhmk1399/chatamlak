import { useRef, useState } from "react";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageTimeline } from "../../../src/components/chat/messages/MessageTimeline.jsx";

const makeMessages = (start, count) => Array.from({ length: count }, (_, index) => ({ id: String(start + index), body: `Message ${start + index}` }));
function Harness() {
  const ref = useRef(null);
  const [messages, setMessages] = useState(() => makeMessages(100, 10000));
  const [expanded, setExpanded] = useState(false);
  return <div style={{ width: 360 }}>
    <button type="button" onClick={() => setMessages((previous) => [...makeMessages(0, 100), ...previous])}>Prepend older</button>
    <button type="button" onClick={() => setExpanded(true)}>Load media</button>
    <MessageTimeline activeChatId="virtual-test" initialMessageId="9000" messages={messages} groupedMessages={[{ dayKey: "today", dayLabel: "Today", items: messages }]}
      loadingMessages={false} loadingOlderMessages={false} chatScrollRef={ref}
      chatScrollStyle={{ height: 480, overflowY: "auto" }} timelineBottomSpacerPx={0}
      handlePanelScroll={() => {}} handleScrollIntent={() => {}} handleGroupChipClick={() => {}}
      renderMessageItem={(message) => <article id={`message-${message.id}`} data-message-bubble style={{ minHeight: expanded && message.id === "5000" ? 220 : 64 }}>{message.body}</article>} />
  </div>;
}
describe("virtual chat history", () => {
  test("bounds rendered rows and reaches messages outside the DOM", async () => {
    await render(<Harness />);
    await expect.poll(() => document.querySelectorAll("[data-message-bubble]").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-message-bubble]").length).toBeLessThan(100);
    window.dispatchEvent(new CustomEvent("songbird:jump-to-message", { detail: { id: "5001", align: "start" } }));
    await expect.element(page.getByText("Message 5001", { exact: true })).toBeInTheDocument();
    await expect.poll(() => {
      const row = document.getElementById("message-5001");
      const root = document.querySelector('[role="log"]');
      if (!row || !root) return false;
      const rect = row.getBoundingClientRect();
      return rect.top >= root.getBoundingClientRect().top && rect.bottom <= root.getBoundingClientRect().bottom;
    }).toBe(true);
    const before = document.getElementById("message-5001").getBoundingClientRect().top;
    await page.getByRole("button", { name: "Prepend older" }).click();
    await expect.poll(() => Math.abs(document.getElementById("message-5001").getBoundingClientRect().top - before)).toBeLessThan(5);
    await page.getByRole("button", { name: "Load media" }).click();
    await expect.poll(() => Math.abs(document.getElementById("message-5001").getBoundingClientRect().top - before)).toBeLessThan(5);
    expect(document.querySelectorAll("[data-message-bubble]").length).toBeLessThan(100);
  });
});
