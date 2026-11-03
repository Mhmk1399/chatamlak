const USER_COLORS = [
  "#66308d",
  "#007d71",
  "#25766e",
  "#4d5975",
  "#7c4d96",
  "#665478",
  "#4e6978",
  "#77634c",
];

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6 || /[^0-9a-f]/i.test(normalized)) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function toLinear(channel) {
  const value = channel / 255;
  if (value <= 0.03928) return value / 12.92;
  return ((value + 0.055) / 1.055) ** 2.4;
}

export function getAvatarTextColor(backgroundColor) {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return "#ffffff";
  const luminance =
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b);
  if (1.05 / (luminance + 0.05) >= 4.5) return "#ffffff";
  // Prefer the text neutral, falling back to black when a user-selected color
  // falls into the small range where neither white nor navy meets 4.5:1.
  return (luminance + 0.05) / 0.058815 >= 4.5 ? "#0f172a" : "#000000";
}

export function getAvatarStyle(backgroundColor, fallback = "#66308d") {
  const color = backgroundColor || fallback;
  return {
    backgroundColor: color,
    color: getAvatarTextColor(color),
  };
}

export function getRandomAvatarColor() {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index] || USER_COLORS[0];
}

export { USER_COLORS };
