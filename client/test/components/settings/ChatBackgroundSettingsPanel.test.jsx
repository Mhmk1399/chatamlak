import { useCallback, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatBackgroundSettingsPanel from "../../../src/components/settings/panels/ChatBackgroundSettingsPanel.jsx";
import ChatWallpaper from "../../../src/components/common/ChatWallpaper.jsx";
import { MobileSettingsPanel } from "../../../src/components/settings/panels/MobileSettingsPanel.jsx";
import { DesktopSettingsModal } from "../../../src/components/settings/modals/DesktopSettingsModal.jsx";
import { ChatAppearanceContext, useChatAppearance } from "../../../src/hooks/chat/useChatAppearance.js";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

const alice = { id: "alice-id", username: "alice", chatAppearance: { wallpaperId: "default", revision: 0 } };
const result = (status, chatAppearance) => new Response(JSON.stringify({ chatAppearance, ...(status === 409 ? { error: "Your background changed on another device. Review your choice and apply again." } : {}) }), { status });
function Harness({ initial = alice }) {
  const [user, update] = useState(initial);
  const setUser = useCallback((value) => update(value), []);
  const appearance = useChatAppearance(user, setUser);
  return <ChatAppearanceContext.Provider value={appearance}>
    <div className="relative isolate h-20" data-testid="current-background"><ChatWallpaper wallpaperId={appearance.appearance.wallpaperId} /></div>
    <button onClick={() => update({ id: "bob-id", username: "bob", chatAppearance: { wallpaperId: "plain", revision: 0 } })}>Switch account</button>
    <ChatBackgroundSettingsPanel />
  </ChatAppearanceContext.Provider>;
}
function current() { return page.getByTestId("current-background").element().querySelector("[data-wallpaper]").dataset.wallpaper; }
function event(userId, wallpaperId, revision) { window.dispatchEvent(new CustomEvent("songbird:realtime-event", { detail: { type: "chat_appearance_updated", userId, chatAppearance: { wallpaperId, revision } } })); }
afterEach(async () => { vi.restoreAllMocks(); setLocale("en"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 720); });

describe("private chat background settings", () => {
  test("provides a named desktop dialog with focus placement and Escape dismissal", async () => {
    const close = vi.fn();
    await render(<DesktopSettingsModal settingsPanel="appearance" profileForm={{ username: "alice", nickname: "Alice" }} setSettingsPanel={close} />);
    await expect.element(page.getByRole("dialog", { name: "Chat background", exact: true })).toBeVisible();
    const button = page.getByRole("button", { name: "Close settings", exact: true });
    await expect.element(button).toHaveFocus();
    button.element().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledExactlyOnceWith(null);
  });
  test("localizes the background settings title in the actual settings shell", async () => {
    setLocale("fa");
    await render(<MobileSettingsPanel settingsPanel="appearance" user={alice} profileForm={{ username: "alice", nickname: "Alice" }} passwordForm={{}} setSettingsPanel={vi.fn()} displayName="Alice" />);
    await expect.element(page.getByRole("heading", { name: t("Chat background"), exact: true })).toBeVisible();
  }, 5000);
  test("shows nine choices and a cached background without a startup HTTP request", async () => {
    const fetch = vi.spyOn(window, "fetch");
    await render(<Harness initial={{ ...alice, chatAppearance: { wallpaperId: "leaves", revision: 4 } }} />);
    expect(current()).toBe("leaves"); expect(page.getByRole("button", { name: /^Preview / }).all()).toHaveLength(9);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("previews locally, commits once after confirmation and disables duplicate saves", async () => {
    let resolve;
    const fetch = vi.spyOn(window, "fetch").mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render(<Harness />);
    await page.getByRole("button", { name: "Preview Persian courtyard" }).click();
    expect(current()).toBe("default"); expect(fetch).not.toHaveBeenCalled();
    await page.getByRole("button", { name: "Apply background", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ wallpaperId: "courtyard", revision: 0, accountId: alice.id });
    resolve(result(200, { wallpaperId: "courtyard", revision: 1 }));
    await expect.poll(current).toBe("courtyard");
    await expect.element(page.getByRole("status")).toHaveTextContent("Background saved");
  });
  test("retains the preview after a failed save and allows retry", async () => {
    const fetch = vi.spyOn(window, "fetch").mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(result(200, { wallpaperId: "leaves", revision: 1 }));
    await render(<Harness />);
    await page.getByRole("button", { name: "Preview Olive leaves" }).click();
    await page.getByRole("button", { name: "Apply background" }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Could not save your background. Your preview is kept; try again.");
    await expect.element(page.getByRole("button", { name: "Preview Olive leaves" })).toHaveAttribute("aria-pressed", "true");
    expect(current()).toBe("default");
    await page.getByRole("button", { name: "Apply background" }).click();
    await expect.poll(current).toBe("leaves"); expect(fetch).toHaveBeenCalledTimes(2);
  });
  test("reconciles a stale edit without discarding the chosen preview", async () => {
    const fetch = vi.spyOn(window, "fetch").mockResolvedValueOnce(result(409, { wallpaperId: "plain", revision: 3 })).mockResolvedValueOnce(result(200, { wallpaperId: "leaves", revision: 4 }));
    await render(<Harness />); await page.getByRole("button", { name: "Preview Olive leaves" }).click();
    await page.getByRole("button", { name: "Apply background" }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Your background changed on another device. Review your choice and apply again."); expect(current()).toBe("plain");
    await expect.element(page.getByRole("button", { name: "Preview Olive leaves" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Apply background" }).click();
    await expect.poll(current).toBe("leaves"); expect(JSON.parse(fetch.mock.calls[1][1].body).revision).toBe(3);
  });
  test("shows a recoverable error for an invalid proxy response", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    await render(<Harness />); await page.getByRole("button", { name: "Preview Olive leaves" }).click();
    await page.getByRole("button", { name: "Apply background" }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Could not save your background. Your preview is kept; try again.");
    expect(current()).toBe("default");
  });
  test("accepts only newer own-account events without issuing HTTP requests", async () => {
    const fetch = vi.spyOn(window, "fetch"); await render(<Harness />);
    event("bob-id", "plain", 5); expect(current()).toBe("default");
    event("alice-id", "leaves", 3); await expect.poll(current).toBe("leaves");
    await expect.element(page.getByRole("button", { name: "Preview Olive leaves" })).toHaveAttribute("aria-pressed", "true");
    await expect.element(page.getByRole("button", { name: "Apply background" })).toBeDisabled();
    event("alice-id", "plain", 2); expect(current()).toBe("leaves"); expect(fetch).not.toHaveBeenCalled();
  });
  test("ignores an old account's late response after switching accounts", async () => {
    let resolve; vi.spyOn(window, "fetch").mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render(<Harness />); await page.getByRole("button", { name: "Preview Olive leaves" }).click();
    await page.getByRole("button", { name: "Apply background" }).click(); await page.getByRole("button", { name: "Switch account" }).click();
    resolve(result(200, { wallpaperId: "leaves", revision: 1 }));
    await expect.element(page.getByRole("button", { name: "Apply background" })).toBeDisabled(); expect(current()).toBe("plain");
  });
  test("supports cancel preview and Persian narrow dark layouts with stable pattern geometry", async () => {
    setLocale("fa"); await page.viewport(375, 812); document.documentElement.classList.add("dark");
    await render(<Harness />);
    await page.getByRole("button", { name: t("Preview {name}", { name: t("Olive leaves") }) }).click();
    await page.getByRole("button", { name: t("Cancel preview") }).click();
    await expect.element(page.getByRole("button", { name: t("Apply background") })).toBeDisabled();
    const bounds = page.getByTestId("wallpaper-preview").element().getBoundingClientRect(); expect(bounds.right).toBeLessThanOrEqual(375);
    expect(getComputedStyle(page.getByTestId("wallpaper-preview").element().querySelector(".ouj-wallpaper-pattern")).maskImage).not.toBe("none");
  });
});
