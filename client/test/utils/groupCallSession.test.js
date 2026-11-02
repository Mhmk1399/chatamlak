import { describe, expect, test, vi } from "vitest";
import { createGroupCallSession } from "../../src/utils/groupCallSession.js";

class Peer {
  constructor() { this.remoteDescription = null; this.events = []; }
  addTrack() {}
  async createOffer() { return { type: "offer" }; }
  async createAnswer() { return { type: "answer" }; }
  async setLocalDescription(value) { this.localDescription = { ...value, toJSON: () => value }; }
  async setRemoteDescription(value) { this.remoteDescription = value; this.events.push("description"); }
  async addIceCandidate() { this.events.push("candidate"); }
  close() { this.closed = true; }
}
describe("group call negotiation", () => {
  test("has one offer owner per pair and flushes early ICE after the offer", async () => {
    const connections = [];
    const sendSignal = vi.fn(async () => {});
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    class TrackedPeer extends Peer { constructor() { super(); connections.push(this); } }
    const session = createGroupCallSession({ peerId: "b", stream, iceServers: [], sendSignal, onStream: vi.fn(), onError: vi.fn(), PeerConnection: TrackedPeer });
    await session.members([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(sendSignal).toHaveBeenCalledTimes(1);
    expect(sendSignal).toHaveBeenCalledWith("c", "offer", { type: "offer" });
    await session.signal({ fromPeerId: "a", kind: "ice", data: { candidate: "early" } });
    expect(connections[0].events).toEqual([]);
    await session.signal({ fromPeerId: "a", kind: "offer", data: { type: "offer" } });
    expect(connections[0].events).toEqual(["description", "candidate"]);
    expect(sendSignal).toHaveBeenCalledWith("a", "answer", { type: "answer" });
    await session.members([{ id: "b" }, { id: "c" }]);
    expect(connections[0].closed).toBe(true);
    session.close();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(connections[1].closed).toBe(true);
  });
});
