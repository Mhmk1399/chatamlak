import { useCallback, useEffect, useRef, useState } from "react";
import { messagingRequest } from "../../api/messagingApi.js";
import { apiFetch, fetchIceServers } from "../../api/chatApi.js";
import { createGroupCallSession } from "../../utils/groupCallSession.js";
import { acquireLocalMedia } from "./useWebRTCCall.js";

export function useGroupCall() {
  const [room, setRoom] = useState(null);
  const [streams, setStreams] = useState({});
  const [peers, setPeers] = useState([]);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const sessionRef = useRef(null);
  const joiningRef = useRef(false);
  const generationRef = useRef(0);
  const pendingSignals = useRef([]);
  const leave = useCallback(async () => {
    generationRef.current += 1;
    pendingSignals.current = [];
    const current = sessionRef.current;
    sessionRef.current = null;
    current?.session.close();
    setRoom(null); setPeers([]); setStreams({});
    if (current) await messagingRequest(`/chats/${current.chatId}/call/leave`, { method: "POST", body: { peerId: current.peerId } }).catch(() => {});
  }, []);
  const updatePeers = useCallback(async (next) => {
    setPeers(next);
    await sessionRef.current?.session.members(next);
  }, []);
  const join = useCallback(async (chat, video) => {
    if (joiningRef.current || sessionRef.current) return;
    joiningRef.current = true; setJoining(true); setError("");
    const generation = generationRef.current;
    const assertCurrent = () => { if (generation !== generationRef.current) throw new Error("Call cancelled."); };
    let stream = null;
    let peerId = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls require HTTPS and microphone access.");
      ({ stream } = await acquireLocalMedia(video));
      assertCurrent();
      const iceServers = await fetchIceServers();
      assertCurrent();
      const joined = await messagingRequest(`/chats/${chat.id}/call/join`, { method: "POST", body: { video: stream.getVideoTracks().length > 0 } });
      peerId = joined.peerId;
      assertCurrent();
      const session = createGroupCallSession({ peerId, stream, iceServers,
        sendSignal: (targetPeerId, kind, data) => messagingRequest(`/chats/${chat.id}/call/signal`, { method: "POST", body: { peerId, targetPeerId, kind, data } }),
        onStream: (id, remote) => { if (generation === generationRef.current) setStreams((previous) => { const next = { ...previous }; if (remote) next[id] = remote; else delete next[id]; return next; }); },
        onError: (failure) => { if (generation === generationRef.current) setError(failure.message || "A participant could not connect."); },
      });
      sessionRef.current = { chatId: chat.id, peerId, stream, session };
      setRoom({ chatId: chat.id, peerId, title: chat.name || "Group call", stream });
      setMuted(false); setCameraOff(!stream.getVideoTracks().length);
      await updatePeers(joined.peers);
      for (const signal of pendingSignals.current.splice(0)) if (signal.targetPeerId === peerId) await session.signal(signal);
    } catch (failure) {
      stream?.getTracks().forEach((track) => track.stop());
      if (peerId) await messagingRequest(`/chats/${chat.id}/call/leave`, { method: "POST", body: { peerId } }).catch(() => {});
      if (generation === generationRef.current) setError(failure.message || "Unable to join this call.");
    } finally { joiningRef.current = false; if (generation === generationRef.current) setJoining(false); }
  }, [updatePeers]);

  useEffect(() => {
    const event = async ({ detail }) => {
      if (detail?.type === "group_call_signal") {
        const current = sessionRef.current;
        if (current?.peerId === detail.targetPeerId && current.chatId === detail.chatId) await current.session.signal(detail);
        else if (joiningRef.current && pendingSignals.current.length < 50) pendingSignals.current.push(detail);
      }
      if (detail?.type === "group_call_updated" && sessionRef.current?.chatId === detail.chatId) {
        try { const data = await messagingRequest(`/chats/${detail.chatId}/call`); await updatePeers(data.peers); } catch { /* heartbeat recovers state */ }
      }
    };
    window.addEventListener("ouj-chat:realtime-event", event);
    return () => window.removeEventListener("ouj-chat:realtime-event", event);
  }, [updatePeers]);

  useEffect(() => {
    if (!room) return;
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      const current = sessionRef.current;
      if (!current) return;
      running = true;
      try { const data = await messagingRequest(`/chats/${current.chatId}/call/heartbeat`, { method: "POST", body: { peerId: current.peerId } }); await updatePeers(data.peers); }
      catch (failure) { setError(failure.message); if ([401, 403, 404].includes(failure.status)) await leave(); }
      finally { running = false; }
    }, 12000);
    return () => clearInterval(timer);
  }, [room, updatePeers, leave]);
  useEffect(() => {
    const cleanup = () => {
      generationRef.current += 1;
      pendingSignals.current = [];
      const current = sessionRef.current;
      if (!current) return;
      sessionRef.current = null;
      current.session.close();
      void apiFetch(`/api/messaging/chats/${current.chatId}/call/leave`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peerId: current.peerId }) }).catch(() => {});
    };
    window.addEventListener("pagehide", cleanup);
    return () => { window.removeEventListener("pagehide", cleanup); cleanup(); };
  }, []);
  const toggleMute = () => { const next = !muted; sessionRef.current?.stream.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; sessionRef.current?.stream.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); };
  return { room, streams, peers, joining, join, leave, error, muted, cameraOff, toggleMute, toggleCamera };
}
