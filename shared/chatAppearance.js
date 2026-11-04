// Asset URLs belong to the client build, never to untrusted saved CSS/URLs.
export const CHAT_WALLPAPER_IDS = Object.freeze([
  "default", "contours", "courtyard", "blueprint", "leaves",
  "ribbons", "constellation", "brickwork", "plain",
]);

export function normalizeChatAppearance(value) {
  return {
    wallpaperId: CHAT_WALLPAPER_IDS.includes(value?.wallpaperId) ? value.wallpaperId : "default",
    revision: Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}
