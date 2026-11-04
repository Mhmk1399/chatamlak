import { memo } from "react";
import { getChatWallpaper } from "../../utils/chatWallpapers.js";

function ChatWallpaper({ wallpaperId = "default", thumbnail = false }) {
  const wallpaper = getChatWallpaper(wallpaperId);
  const size = wallpaper.size * (thumbnail ? 0.48 : 1);
  return <div aria-hidden="true" data-wallpaper={wallpaper.id} className="ouj-wallpaper pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    {wallpaper.asset && <div className="ouj-wallpaper-pattern absolute inset-0" style={{ maskImage: `url("${wallpaper.asset}")`, WebkitMaskImage: `url("${wallpaper.asset}")`, maskSize: `${size}px ${size}px`, WebkitMaskSize: `${size}px ${size}px` }} />}
  </div>;
}
export default memo(ChatWallpaper);
