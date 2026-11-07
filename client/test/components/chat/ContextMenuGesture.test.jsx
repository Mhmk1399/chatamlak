import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ContextMenuSurface from "../../../src/components/context-menu/ContextMenuSurface.jsx";

afterEach(() => vi.restoreAllMocks());
const pointer = (node, type, extra = {}) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: 2, isPrimary: true, button: 0, clientX: 80, clientY: 100, ...extra }));

test("a completed touch hold retains the original message anchor after the React event ends", async () => {
  const open = vi.fn();
  await render(<ContextMenuSurface data-testid="bubble" contextMenu={{ isMobile: true, holdDelayMs: 40, onOpen: open }}>Message</ContextMenuSurface>);
  const bubble = page.getByTestId("bubble").element();
  pointer(bubble, "pointerdown");
  await expect.poll(() => open.mock.calls.length).toBe(1);
  expect(open.mock.calls[0][0].targetEl).toBe(bubble);
  expect(open.mock.calls[0][0].isMobile).toBe(true);
  pointer(bubble, "pointerup");
});

test.each(["pointerup", "pointercancel", "move", "scroll", "outside-release"])("%s cancels the hold and removes press feedback", async (type) => {
  const open = vi.fn();
  await render(<ContextMenuSurface data-testid="bubble" contextMenu={{ isMobile: true, holdDelayMs: 60, pressClassName: "press-feedback", onOpen: open }}>Message</ContextMenuSurface>);
  const bubble = page.getByTestId("bubble").element();
  pointer(bubble, "pointerdown");
  await expect.element(page.getByTestId("bubble")).toHaveClass("press-feedback");
  if (type === "move") pointer(bubble, "pointermove", { clientY: 125 });
  else if (type === "scroll") document.dispatchEvent(new Event("scroll"));
  else if (type === "outside-release") pointer(document.body, "pointerup");
  else pointer(bubble, type);
  await expect.element(page.getByTestId("bubble")).not.toHaveClass("press-feedback");
  await new Promise((resolve) => setTimeout(resolve, 90));
  expect(open).not.toHaveBeenCalled();
});

test("nested controls retain their own interaction and keyboard context shortcuts work", async () => {
  const open = vi.fn();
  await render(<ContextMenuSurface data-testid="bubble" tabIndex={0} contextMenu={{ isMobile: true, holdDelayMs: 40, onOpen: open }}><button type="button">Play voice</button><a href="#fixture">Link</a></ContextMenuSurface>);
  pointer(page.getByRole("button", { name: "Play voice" }).element(), "pointerdown");
  pointer(page.getByRole("link").element(), "pointerdown");
  await new Promise((resolve) => setTimeout(resolve, 70));
  expect(open).not.toHaveBeenCalled();
  const bubble = page.getByTestId("bubble").element();
  bubble.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "F10", shiftKey: true }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[0][0].targetEl).toBe(bubble);
});
