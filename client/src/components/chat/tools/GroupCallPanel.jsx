import { useEffect, useRef, useState } from "react";
import { useMessagingContext } from "../../../hooks/chat/useMessagingTools.js";
import { t, useLocale } from "../../../i18n/locale.js";
import { toolButton } from "./ToolDialog.jsx";

function StreamMedia({ stream, audioOnly = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    element.srcObject = stream;
    void element.play().catch(() => {});
    return () => { element.srcObject = null; };
  }, [stream]);
  return audioOnly ? <audio ref={ref} autoPlay /> : <video ref={ref} autoPlay playsInline muted className="aspect-video w-full rounded-xl bg-slate-900 object-contain" />;
}

export function GroupCallMedia() {
  const context = useMessagingContext();
  if (!context?.groupCall?.room) return null;
  return <>{Object.entries(context.groupCall.streams).map(([id, stream]) => <StreamMedia key={id} stream={stream} audioOnly />)}</>;
}

export default function GroupCallPanel() {
  useLocale();
  const context = useMessagingContext();
  const call = context.groupCall;
  const [video, setVideo] = useState(false);
  return <div className="space-y-3">
    {call.error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{call.error}</p>}
    {!call.room ? <>
      <p className="text-sm text-slate-500">{t("Group calls support up to six participants.")}</p>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />{t("Camera")}</label>
      <button type="button" className={toolButton} disabled={call.joining || context.isInCall} onClick={() => call.join(context.chat, video)}>{t(call.joining ? t("Connecting") : t("Join call"))}</button>
    </> : <>
      <p className="text-sm font-semibold" dir="auto">{call.room.title} · {call.peers.length}/6</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={toolButton} aria-pressed={call.muted} onClick={call.toggleMute}>{t(call.muted ? t("Unmute") : t("Mute"))}</button>
        {call.room.stream.getVideoTracks().length > 0 && <button type="button" className={toolButton} aria-pressed={!call.cameraOff} onClick={call.toggleCamera}>{t("Camera")}</button>}
        <button type="button" className={`${toolButton} text-rose-600 dark:text-rose-300`} onClick={call.leave}>{t("Leave call")}</button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><StreamMedia stream={call.room.stream} /><p className="mt-1 text-xs">{context.user.nickname || context.user.username}</p></div>
        {call.peers.filter((peer) => peer.id !== call.room.peerId).map((peer) => <div key={peer.id}>{call.streams[peer.id] ? <StreamMedia stream={call.streams[peer.id]} /> : <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-100 text-xs dark:bg-slate-900">{t("Connecting")}</div>}<p className="mt-1 text-xs" dir="auto">{peer.nickname || peer.username}</p></div>)}
      </div>
    </>}
  </div>;
}
