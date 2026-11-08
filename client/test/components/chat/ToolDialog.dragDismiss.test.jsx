import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ToolDialog from "../../../src/components/chat/tools/ToolDialog.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

function Fixture({ onClosed = () => {}, dragToDismiss = true, closeDisabled = false }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open sheet</button>
    {open && <ToolDialog title="Daily work report" variant="sheet" dragToDismiss={dragToDismiss} closeDisabled={closeDisabled}
      onClose={() => { onClosed(); setOpen(false); }}>
      <label>Memo<input className="text-base" defaultValue="Daily report" /></label>
      <div style={{ height: 1100 }}>Report content</div>
    </ToolDialog>}
  </>;
}

afterEach(async () => {
  vi.restoreAllMocks(); setLocale("en"); document.documentElement.classList.remove("dark");
  await page.viewport(1280, 800);
});

async function open(props = {}) {
  const screen = await render(<Fixture {...props} />);
  await page.getByRole("button", { name: "Open sheet", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: t("Daily work report"), exact: true });
  await expect.element(dialog).toBeVisible();
  const sheet = dialog.element().closest(".ouj-tool-sheet");
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await Promise.all(sheet.getAnimations().map((animation) => animation.finished.catch(() => {})));
  return { screen, dialog, sheet, header: sheet.querySelector('[data-sheet-drag-region]') };
}

function pointer(target, name, x, y, extra = {}) {
  target.dispatchEvent(new PointerEvent(name, { bubbles: true, composed: true, cancelable: true,
    pointerId: 11, pointerType: "touch", isPrimary: true, button: 0, buttons: name === "pointerup" ? 0 : 1, clientX: x, clientY: y, ...extra }));
}

async function drag(header, down, across = 0) {
  const rect = header.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + 8;
  pointer(header, "pointerdown", x, y);
  pointer(window, "pointermove", x + across, y + down);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return (name = "pointerup") => pointer(window, name, x + across, y + down);
}

const offset = (sheet) => parseFloat(getComputedStyle(sheet).translate.split(/\s+/)[1]) || 0;

for (const locale of ["fa", "en"]) for (const theme of ["light", "dark"]) {
  test(`short drags follow the pointer and return smoothly in ${locale}/${theme}`, async () => {
    setLocale(locale); document.documentElement.classList.toggle("dark", theme === "dark"); await page.viewport(390, 812);
    const closed = vi.fn(), { dialog, sheet, header } = await open({ onClosed: closed });
    const release = await drag(header, 32);
    expect(offset(sheet)).toBeCloseTo(32, 0); expect(sheet.dataset.dismissState).toBe("dragging");
    expect(closed).not.toHaveBeenCalled(); release();
    expect(sheet.dataset.dismissState).toBe("settling");
    await expect.poll(() => offset(sheet)).toBe(0);
    await expect.element(dialog).toBeVisible(); expect(closed).not.toHaveBeenCalled();
    await expect.element(page.getByRole("textbox", { name: "Memo", exact: true })).toHaveValue("Daily report");
  });
}

test("a sufficient pull closes only on release and finishes its downward animation first", async () => {
  await page.viewport(390, 812); const closed = vi.fn(), { dialog, sheet, header } = await open({ onClosed: closed });
  const release = await drag(header, 150);
  expect(offset(sheet)).toBeCloseTo(150, 0); expect(closed).not.toHaveBeenCalled();
  release(); expect(sheet.dataset.dismissState).toBe("closing"); expect(closed).not.toHaveBeenCalled();
  await expect.element(dialog).toBeInTheDocument();
  expect(sheet.getAnimations().some((animation) => animation.effect.getKeyframes().some((frame) => frame.translate))).toBe(true);
  await expect.element(dialog).not.toBeInTheDocument(); expect(closed).toHaveBeenCalledOnce();
  await expect.element(page.getByRole("button", { name: "Open sheet", exact: true })).toHaveFocus();
});

test("upward, horizontal, cancelled and multi-touch gestures never dismiss", async () => {
  const closed = vi.fn(), { dialog, sheet, header } = await open({ onClosed: closed });
  for (const [down, across, ending] of [[-100, 0, "pointerup"], [10, 130, "pointerup"], [150, 0, "pointercancel"]]) {
    const release = await drag(header, down, across); release(ending);
    await expect.poll(() => offset(sheet)).toBe(0); expect(closed).not.toHaveBeenCalled();
  }
  const release = await drag(header, 150);
  pointer(window, "pointerdown", 200, 200, { pointerId: 12, isPrimary: false }); release();
  await expect.poll(() => offset(sheet)).toBe(0); await expect.element(dialog).toBeVisible(); expect(closed).not.toHaveBeenCalled();
});

test("body scrolling stays independent and the Close button is an ordinary click target", async () => {
  const closed = vi.fn(), { dialog, sheet } = await open({ onClosed: closed });
  const body = sheet.querySelector(".ouj-tool-sheet-body");
  pointer(body, "pointerdown", 100, 300); pointer(window, "pointermove", 100, 500); pointer(window, "pointerup", 100, 500);
  body.scrollTop = 160; expect(body.scrollTop).toBe(160); expect(offset(sheet)).toBe(0); expect(closed).not.toHaveBeenCalled();
  await page.getByRole("button", { name: t("Close"), exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument(); expect(closed).toHaveBeenCalledOnce();
});

test("unmounting during dismissal cancels animation and never calls the old close callback", async () => {
  const closed = vi.fn(), { screen, sheet, header } = await open({ onClosed: closed });
  const release = await drag(header, 150); release(); expect(sheet.dataset.dismissState).toBe("closing");
  await screen.rerender(<div>Another conversation</div>);
  await new Promise((resolve) => setTimeout(resolve, 360)); expect(closed).not.toHaveBeenCalled();
});

test("reduced motion removes settling and closing animations", async () => {
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) => query === "(prefers-reduced-motion: reduce)"
    ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} } : original(query));
  const closed = vi.fn(), { dialog, sheet, header } = await open({ onClosed: closed });
  let release = await drag(header, 32); release(); expect(offset(sheet)).toBe(0);
  release = await drag(header, 150); release(); expect(closed).toHaveBeenCalledOnce();
  await expect.element(dialog).not.toBeInTheDocument();
});

test("drag-to-dismiss is opt-in and cannot bypass a disabled close action", async () => {
  const closed = vi.fn(); let result = await open({ onClosed: closed, dragToDismiss: false });
  expect(result.header).toBeNull();
  await result.screen.rerender(<Fixture onClosed={closed} closeDisabled />);
  expect(document.querySelector('[data-sheet-drag-region]')).toBeNull();
  await expect.element(page.getByRole("button", { name: t("Close"), exact: true })).toBeDisabled();
  expect(closed).not.toHaveBeenCalled();
});
