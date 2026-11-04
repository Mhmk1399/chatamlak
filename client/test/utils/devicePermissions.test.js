import { afterEach, expect, test, vi } from "vitest";
import { markSignupPermissionsPending, permissionSetupPending, completePermissionSetup, requestDeviceMediaPermission } from "../../src/utils/devicePermissions.js";
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; };
afterEach(() => vi.unstubAllGlobals());
test("post-signup onboarding is scoped to the account signing in", () => {
  vi.stubGlobal("localStorage", storage()); vi.stubGlobal("sessionStorage", storage()); vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) }); vi.stubGlobal("navigator", {});
  const alice = { id: "a", username: "alice" }, bob = { id: "b", username: "bob" };
  markSignupPermissionsPending("ALICE"); expect(permissionSetupPending(alice)).toBe(true); expect(permissionSetupPending(bob)).toBe(false);
  completePermissionSetup(alice); expect(permissionSetupPending(alice)).toBe(false);
});
test("installed apps show setup once for each account", () => {
  vi.stubGlobal("localStorage", storage()); vi.stubGlobal("sessionStorage", storage()); vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) }); vi.stubGlobal("navigator", {});
  const alice = { id: "a", username: "alice" }, bob = { id: "b", username: "bob" };
  expect(permissionSetupPending(alice)).toBe(true); completePermissionSetup(alice);
  expect(permissionSetupPending(alice)).toBe(false); expect(permissionSetupPending(bob)).toBe(true);
});
test("permission checks release every media track without retaining a recording", async () => {
  const stop = vi.fn(), getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }, { stop }] }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  await requestDeviceMediaPermission("camera"); expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false }); expect(stop).toHaveBeenCalledTimes(2);
});
