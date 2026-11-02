export const VOICE_SPEEDS = [1, 1.25, 1.5, 1.75, 2];
export const VOICE_SPEED_KEY = "songbird-voice-speed";
let sessionSpeed = null;
export function readVoiceSpeed() {
  if (sessionSpeed !== null) return sessionSpeed;
  try {
    const speed = Number(localStorage.getItem(VOICE_SPEED_KEY));
    return VOICE_SPEEDS.includes(speed) ? speed : 1;
  } catch { return 1; }
}

export function writeVoiceSpeed(speed) {
  if (!VOICE_SPEEDS.includes(speed)) return;
  sessionSpeed = speed;
  try {
    localStorage.setItem(VOICE_SPEED_KEY, String(speed));
    sessionSpeed = null;
  } catch { /* Keep the preference for this document when persistence fails. */ }
  window.dispatchEvent(new Event("songbird:voice-speed"));
}
