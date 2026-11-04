import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import DevicePermissionsSetup from "../../../src/components/pwa/DevicePermissionsSetup.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

beforeEach(() => { vi.spyOn(navigator.permissions, "query").mockResolvedValue({ state: "prompt", addEventListener() {}, removeEventListener() {} }); });
afterEach(async () => { vi.restoreAllMocks(); setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });
function setup(props = {}) {
  return render(<DevicePermissionsSetup onClose={vi.fn()} onInstall={vi.fn()} onEnableNotifications={vi.fn()} onTestNotification={vi.fn()}
    notificationsActive={false} notificationsDisabled={false} notificationStatusLabel="" {...props} />);
}
function luminance(color) {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  context.fillStyle = color; context.fillRect(0, 0, 1, 1);
  const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
    const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
for (const locale of ["fa", "en"]) test(`device setup is optional, localized and usable on mobile in ${locale}`, async () => {
  setLocale(locale); await page.viewport(390, 844); if (locale === "fa") document.documentElement.classList.add("dark");
  const enable = vi.fn(async () => false), close = vi.fn();
  const media = vi.spyOn(navigator.mediaDevices, "getUserMedia");
  await setup({ onEnableNotifications: enable, onClose: close });
  expect(enable).not.toHaveBeenCalled(); expect(media).not.toHaveBeenCalled();
  const dialog = page.getByRole("dialog", { name: t("Set up your device"), exact: true });
  await expect.element(dialog).toBeVisible(); expect(dialog.element().getBoundingClientRect().width).toBeLessThanOrEqual(366);
  const background = luminance(getComputedStyle(document.documentElement).getPropertyValue("--ouj-surface"));
  for (const heading of dialog.element().querySelectorAll("h3")) {
    const foreground = luminance(getComputedStyle(heading).color);
    expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05), heading.textContent).toBeGreaterThanOrEqual(4.5);
  }
  const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
  await page.screenshot({ path: `../../../.vitest/device-setup-${locale}-${browser}.png` });
  await page.getByRole("button", { name: t("Enable notifications"), exact: true }).click();
  expect(enable).toHaveBeenCalledOnce(); await expect.element(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: t("Continue to chat"), exact: true }).click(); expect(close).toHaveBeenCalledOnce();
});
test("camera and microphone are requested separately and all tracks stop immediately", async () => {
  const stop = vi.fn(); const media = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue({ getTracks: () => [{ stop }] });
  await setup(); expect(media).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Allow microphone", exact: true }).click();
  expect(media).toHaveBeenCalledWith({ audio: true }); expect(stop).toHaveBeenCalledTimes(1);
  await page.getByRole("button", { name: "Allow camera", exact: true }).click();
  expect(media).toHaveBeenCalledWith({ video: true, audio: false }); expect(stop).toHaveBeenCalledTimes(2);
});
test("denied camera permission is explained without repeated prompts", async () => {
  const media = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  await setup(); await page.getByRole("button", { name: "Allow camera", exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent("Permission is blocked. Change it in your browser or phone settings.");
  await expect.element(page.getByRole("button", { name: "Allow camera", exact: true })).toBeDisabled(); expect(media).toHaveBeenCalledOnce();
});
test("iPhone users receive installation instructions before enabling push", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
  const install = vi.fn(); await setup({ onInstall: install });
  await expect.element(page.getByRole("button", { name: "Enable notifications", exact: true })).toBeDisabled();
  await expect.element(page.getByText("On iPhone or iPad, add Ouj Chat to the Home Screen, open it there, then enable notifications. Requires iOS 16.4 or later.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Install app", exact: true }).click(); expect(install).toHaveBeenCalledOnce();
});
