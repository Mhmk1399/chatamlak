import { useRef, useState } from "react";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import EmojiPickerPopover from "../../../src/components/chat/messages/EmojiPickerPopover.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

function Fixture() {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  return <>
    <button type="button" ref={anchor} onClick={() => setOpen(true)}>Open emojis</button>
    {open && <EmojiPickerPopover id="emoji-sheet-test" owner="emoji-sheet-test" isDesktop={false}
      onClose={() => setOpen(false)} onSelect={() => { setOpen(false); return true; }} />}
  </>;
}

afterEach(async () => {
  setLocale("en"); document.documentElement.classList.remove("dark");
  localStorage.removeItem("ouj-emoji-preferences-v1:emoji-sheet-test");
  await page.viewport(1280, 800);
});

async function open() {
  await render(<Fixture />); await page.getByRole("button", { name: "Open emojis", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: t("Choose emoji"), exact: true });
  await expect.element(dialog).toBeVisible();
  const sheet = dialog.element().closest(".ouj-tool-sheet");
  await Promise.all(sheet.getAnimations().map((animation) => animation.finished.catch(() => {})));
  return { dialog, sheet };
}

async function size(sheet, value) {
  await expect.poll(() => sheet.dataset.sheetSize).toBe(value);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await Promise.all(sheet.getAnimations().map((animation) => animation.finished.catch(() => {})));
}

function wheel(sheet, deltaY, extra = {}) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, ...extra });
  sheet.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
}

function touch(sheet, name, points) {
  const event = new Event(name, { bubbles: true, cancelable: true });
  const touches = points.map(([x, y], index) => ({ identifier: index, target: sheet, clientX: x, clientY: y, pageX: x, pageY: y }));
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: touches });
  sheet.dispatchEvent(event);
}

for (const locale of ["fa", "en"]) for (const theme of ["light", "dark"]) {
  test(`half/full scrolling preserves emoji search in ${locale}/${theme}`, async () => {
    setLocale(locale); document.documentElement.classList.toggle("dark", theme === "dark");
    await page.viewport(390, 812); const { dialog, sheet } = await open();
    await size(sheet, "half"); expect(sheet.getBoundingClientRect().height).toBeCloseTo(406, 0);
    expect(sheet.getBoundingClientRect().bottom).toBeCloseTo(812, 0);
    const search = page.getByRole("combobox", { name: t("Search emojis"), exact: true }); await search.fill("heart");
    wheel(sheet, 80); await size(sheet, "full"); expect(sheet.getBoundingClientRect().height).toBeCloseTo(800, 0);
    await expect.element(search).toHaveValue("heart");
    wheel(sheet, -80); await size(sheet, "half"); expect(sheet.getBoundingClientRect().height).toBeCloseTo(406, 0);
    await expect.element(search).toHaveValue("heart");
    expect(dialog.element().querySelectorAll('[role="gridcell"]').length).toBeLessThan(500);
    expect(sheet.scrollWidth).toBeLessThanOrEqual(sheet.clientWidth);
    const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
    await page.screenshot({ path: `../../../.vitest/emoji-sheet-half-${locale}-${theme}-${browser}.png` });
    await page.getByRole("button", { name: t("Expand sheet"), exact: true }).click(); await size(sheet, "full");
    await page.screenshot({ path: `../../../.vitest/emoji-sheet-full-${locale}-${theme}-${browser}.png` });
    await userEvent.keyboard("{Escape}"); await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Open emojis", exact: true })).toHaveFocus();
  });
}

test("small or horizontal wheel movements and zoom do not resize; resize has keyboard alternatives", async () => {
  const { sheet } = await open();
  for (const [delta, extra] of [[120, { ctrlKey: true }], [40, { deltaX: 100 }], [8, {}], [-8, {}]]) wheel(sheet, delta, extra);
  await size(sheet, "half");
  const resize = page.getByRole("button", { name: "Expand sheet", exact: true }); resize.element().focus();
  await userEvent.keyboard("{ArrowDown}"); await size(sheet, "full");
  await expect.element(page.getByRole("button", { name: "Show half-height sheet", exact: true })).toHaveAttribute("aria-expanded", "true");
  await userEvent.keyboard("{ArrowUp}"); await size(sheet, "half");
  await userEvent.keyboard("{Enter}"); await size(sheet, "full");
});

test("resizing interpolates height and a reversed gesture continues without a jump", async () => {
  await page.viewport(390, 812); const { sheet } = await open();
  const compactHeight = sheet.getBoundingClientRect().height;
  const style = getComputedStyle(sheet);
  expect(style.transitionProperty).toBe("height"); expect(style.transitionDuration).toBe("0.42s");
  wheel(sheet, 80);
  await expect.poll(() => sheet.getBoundingClientRect().height).toBeGreaterThan(compactHeight + 20);
  const expandingHeight = sheet.getBoundingClientRect().height;
  expect(expandingHeight).toBeLessThan(800);
  wheel(sheet, -80);
  const reversedHeight = sheet.getBoundingClientRect().height;
  expect(Math.abs(reversedHeight - expandingHeight)).toBeLessThan(35);
  await size(sheet, "half"); expect(sheet.getBoundingClientRect().height).toBeCloseTo(compactHeight, 0);
});

test("touch content-scroll direction resizes while cancellation and multi-touch reset the gesture", async () => {
  await page.viewport(390, 812); const { sheet } = await open();
  touch(sheet, "touchstart", [[100, 500]]); touch(sheet, "touchmove", [[100, 420]]); touch(sheet, "touchend", []);
  await size(sheet, "full");
  touch(sheet, "touchstart", [[100, 420]]); touch(sheet, "touchmove", [[100, 500]]); touch(sheet, "touchend", []);
  await size(sheet, "half");
  touch(sheet, "touchstart", [[100, 500], [200, 500]]); touch(sheet, "touchmove", [[100, 400], [200, 400]]);
  touch(sheet, "touchcancel", []); await size(sheet, "half");
  touch(sheet, "touchstart", [[100, 500]]); touch(sheet, "touchmove", [[100, 480]]); touch(sheet, "touchcancel", []);
  touch(sheet, "touchmove", [[100, 400]]); await size(sheet, "half");
});

test("short landscape viewports keep the controls and internal emoji scroll reachable", async () => {
  await page.viewport(844, 390); const { dialog, sheet } = await open();
  await size(sheet, "half"); expect(sheet.getBoundingClientRect().height).toBeCloseTo(300, 0);
  await expect.element(page.getByRole("button", { name: "Close emoji picker", exact: true })).toBeVisible();
  await expect.element(page.getByRole("combobox", { name: "Search emojis", exact: true })).toBeVisible();
  wheel(sheet, 120); await size(sheet, "full");
  expect(sheet.getBoundingClientRect().top).toBeGreaterThanOrEqual(12);
  expect(sheet.getBoundingClientRect().bottom).toBeCloseTo(390, 0);
  expect(dialog.element().scrollHeight).toBeLessThanOrEqual(dialog.element().clientHeight + 1);
});

test("resizing keeps the mounted category viewport and its scroll position", async () => {
  await page.viewport(390, 812); const { dialog, sheet } = await open();
  const viewport = dialog.element().querySelector('[data-epr-part="viewport"]');
  expect(viewport).not.toBeNull();
  viewport.scrollTop = 320;
  await expect.poll(() => viewport.scrollTop).toBe(320);
  wheel(sheet, 80); await size(sheet, "full");
  expect(dialog.element().querySelector('[data-epr-part="viewport"]')).toBe(viewport);
  expect(viewport.scrollTop).toBe(320);
  wheel(sheet, -80); await size(sheet, "half"); expect(viewport.scrollTop).toBe(320);
});

test("Escape dismisses even while focus briefly rests on the body", async () => {
  const { dialog } = await open();
  document.activeElement.blur();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
});
