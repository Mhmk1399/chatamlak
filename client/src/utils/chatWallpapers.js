import arches from "../assets/wallpapers/arches.svg?no-inline";
import contours from "../assets/wallpapers/contours.svg?no-inline";
import courtyard from "../assets/wallpapers/courtyard.svg?no-inline";
import blueprint from "../assets/wallpapers/blueprint.svg?no-inline";
import leaves from "../assets/wallpapers/leaves.svg?no-inline";
import ribbons from "../assets/wallpapers/ribbons.svg?no-inline";
import constellation from "../assets/wallpapers/constellation.svg?no-inline";
import brickwork from "../assets/wallpapers/brickwork.svg?no-inline";

export const CHAT_WALLPAPERS = Object.freeze([
  { id: "default", label: "Ouj arches", asset: arches, size: 240 },
  { id: "contours", label: "Quiet contours", asset: contours, size: 320 },
  { id: "courtyard", label: "Persian courtyard", asset: courtyard, size: 192 },
  { id: "blueprint", label: "City grid", asset: blueprint, size: 240 },
  { id: "leaves", label: "Olive leaves", asset: leaves, size: 240 },
  { id: "ribbons", label: "Silk ribbons", asset: ribbons, size: 320 },
  { id: "constellation", label: "Night sky", asset: constellation, size: 280 },
  { id: "brickwork", label: "Brick rhythm", asset: brickwork, size: 240 },
  { id: "plain", label: "Plain", asset: null, size: 240 },
]);
export function getChatWallpaper(id) {
  return CHAT_WALLPAPERS.find((wallpaper) => wallpaper.id === id) || CHAT_WALLPAPERS[0];
}
