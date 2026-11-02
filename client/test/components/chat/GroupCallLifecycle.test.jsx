import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useGroupCall } from "../../../src/hooks/chat/useGroupCall.js";

const mocks = vi.hoisted(() => ({ acquire: vi.fn(), request: vi.fn(), ice: vi.fn(async () => []) }));
vi.mock("../../../src/hooks/chat/useWebRTCCall.js", () => ({ acquireLocalMedia: mocks.acquire }));
vi.mock("../../../src/api/chatApi.js", () => ({ apiFetch: vi.fn(), fetchIceServers: mocks.ice }));
vi.mock("../../../src/api/messagingApi.js", () => ({ messagingRequest: mocks.request }));

describe("group call capture lifecycle", () => {
  test("stops delayed microphone capture after the calling page is unmounted", async () => {
    let resolveCapture;
    let call;
    const stop = vi.fn();
    mocks.acquire.mockImplementation(() => new Promise((resolve) => { resolveCapture = resolve; }));
    function Harness() { call = useGroupCall(); return null; }
    const screen = await render(<Harness />);
    const joining = call.join({ id: "group" }, false);
    await screen.unmount();
    resolveCapture({ stream: { getTracks: () => [{ stop }], getVideoTracks: () => [] } });
    await joining;
    expect(stop).toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
