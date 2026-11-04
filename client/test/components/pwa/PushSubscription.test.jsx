import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { useChatNotifications } from "../../../src/hooks/chat/useChatNotifications.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const user = { id: "push-user", username: "alice" };
function fixture({ permission = "default", existing = false, subscribeResponse } = {}) {
  const notification = { permission, requestPermission: vi.fn(async () => { notification.permission = "granted"; return "granted"; }) };
  vi.stubGlobal("Notification", notification);
  const key = new Uint8Array(65); key[0] = 4;
  const subscription = { options: { applicationServerKey: key.buffer }, expirationTime: null, unsubscribe: vi.fn(async () => true), toJSON: () => ({ endpoint: "https://push.example.test/device", keys: { p256dh: "key", auth: "auth" } }) };
  const manager = { getSubscription: vi.fn(async () => existing ? subscription : null), subscribe: vi.fn(async () => subscription) };
  const registration = { pushManager: manager, active: { postMessage: vi.fn() } };
  const worker = new EventTarget(); worker.ready = Promise.resolve(registration); worker.getRegistration = async () => registration;
  vi.spyOn(navigator, "serviceWorker", "get").mockReturnValue(worker);
  const subscribe = vi.fn(subscribeResponse || (async () => new Response('{"ok":true}')));
  const props = { user, fetchPushPublicKey: vi.fn(async () => new Response(JSON.stringify({ publicKey: btoa(String.fromCharCode(...key)).replace(/=/g, "") }))), subscribePush: subscribe,
    unsubscribePush: vi.fn(async () => new Response('{"ok":true}')), sendPushTest: vi.fn(async () => new Response('{"ok":true}')) };
  return { notification, manager, subscription, props, subscribe };
}
function Harness({ props }) {
  const notifications = useChatNotifications(props), [result, setResult] = useState("");
  return <div><button onClick={async () => setResult(String(await notifications.enableNotifications()))}>Enable</button>
    <output data-testid="active">{String(notifications.notificationsActive)}</output><output data-testid="supported">{String(notifications.notificationsSupported)}</output>
    <output data-testid="result">{result}</output><output data-testid="status">{notifications.pushSubscribeStatus}</output></div>;
}
test("permission is requested only by a click and active status waits for a saved subscription", async () => {
  let release; const fixtureData = fixture({ subscribeResponse: () => new Promise(resolve => { release = resolve; }) });
  await render(<Harness props={fixtureData.props} />);
  expect(fixtureData.notification.requestPermission).not.toHaveBeenCalled(); expect(fixtureData.manager.subscribe).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect.poll(() => fixtureData.subscribe.mock.calls.length).toBe(1);
  await expect.element(page.getByTestId("active")).toHaveTextContent("false");
  release(new Response('{"ok":true}'));
  await expect.element(page.getByTestId("active")).toHaveTextContent("true");
  expect(fixtureData.notification.requestPermission).toHaveBeenCalledOnce(); expect(fixtureData.manager.subscribe).toHaveBeenCalledOnce();
});
test("Android browsers can enable push without mandatory Home Screen installation", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile");
  const data = fixture(); await render(<Harness props={data.props} />);
  await expect.element(page.getByTestId("supported")).toHaveTextContent("true");
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect.element(page.getByTestId("result")).toHaveTextContent("true");
});
test("keeps an existing valid subscription instead of recreating it every day", async () => {
  const data = fixture({ permission: "granted", existing: true });
  await render(<Harness props={data.props} />);
  await expect.element(page.getByTestId("active")).toHaveTextContent("true");
  expect(data.manager.subscribe).not.toHaveBeenCalled(); expect(data.subscription.unsubscribe).not.toHaveBeenCalled();
});
test("a denied browser permission is respected without another native prompt", async () => {
  const data = fixture({ permission: "denied" }); await render(<Harness props={data.props} />);
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect.element(page.getByTestId("result")).toHaveTextContent("false");
  expect(data.notification.requestPermission).not.toHaveBeenCalled(); expect(data.subscribe).not.toHaveBeenCalled();
});
