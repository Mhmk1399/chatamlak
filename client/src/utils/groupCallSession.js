// Deterministic offer ownership prevents both sides creating an initial offer.
// ICE arriving before an offer is held until the remote description is ready.
export function createGroupCallSession({ peerId, stream, iceServers, sendSignal, onStream, onError,
  PeerConnection = globalThis.RTCPeerConnection, Stream = globalThis.MediaStream }) {
  const peers = new Map();
  let closed = false;
  const getPeer = (id) => {
    if (peers.has(id)) return peers.get(id);
    const connection = new PeerConnection({ iceServers });
    const peer = { connection, candidates: [], queue: Promise.resolve() };
    peers.set(id, peer);
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    connection.onicecandidate = (event) => { if (event.candidate && !closed) void sendSignal(id, "ice", event.candidate.toJSON()).catch(onError); };
    connection.ontrack = (event) => onStream(id, event.streams[0] || new Stream([event.track]));
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" && peerId < id) {
        peer.queue = peer.queue.then(async () => {
          if (closed) return;
          connection.restartIce();
          await connection.setLocalDescription(await connection.createOffer({ iceRestart: true }));
          await sendSignal(id, "offer", connection.localDescription.toJSON());
        }).catch(onError);
      }
    };
    return peer;
  };
  const drop = (id) => {
    const peer = peers.get(id);
    if (!peer) return;
    peer.connection.ontrack = null;
    peer.connection.onicecandidate = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    peers.delete(id);
    onStream(id, null);
  };
  return {
    async members(members) {
      if (closed) return;
      const ids = new Set(members.map((member) => member.id));
      [...peers.keys()].filter((id) => !ids.has(id)).forEach(drop);
      const offers = [];
      for (const member of members) {
        if (member.id === peerId || peers.has(member.id)) continue;
        const peer = getPeer(member.id);
        if (peerId < member.id) {
          peer.queue = peer.queue.then(async () => {
            if (closed) return;
            await peer.connection.setLocalDescription(await peer.connection.createOffer());
            await sendSignal(member.id, "offer", peer.connection.localDescription.toJSON());
          }).catch(onError);
          offers.push(peer.queue);
        }
      }
      await Promise.all(offers);
    },
    async signal({ fromPeerId, kind, data }) {
      if (closed || fromPeerId === peerId) return;
      const peer = getPeer(fromPeerId);
      peer.queue = peer.queue.then(async () => {
        if (closed) return;
        if (kind === "ice") {
          if (!peer.connection.remoteDescription) peer.candidates.push(data);
          else await peer.connection.addIceCandidate(data);
          return;
        }
        if (kind !== "offer" && kind !== "answer") return;
        await peer.connection.setRemoteDescription(data);
        for (const candidate of peer.candidates.splice(0)) await peer.connection.addIceCandidate(candidate);
        if (kind === "offer") {
          await peer.connection.setLocalDescription(await peer.connection.createAnswer());
          await sendSignal(fromPeerId, "answer", peer.connection.localDescription.toJSON());
        }
      }).catch(onError);
      await peer.queue;
    },
    close() { closed = true; [...peers.keys()].forEach(drop); stream.getTracks().forEach((track) => track.stop()); },
  };
}
