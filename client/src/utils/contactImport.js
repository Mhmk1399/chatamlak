export const MAX_CONTACT_FILE_BYTES = 256 * 1024;

export class ContactImportError extends Error {
  constructor(code) {
    super(code);
    this.name = "ContactImportError";
    this.code = code;
  }
}

export function contactPickerAvailability(browser = globalThis.window, nav = globalThis.navigator) {
  if (!browser?.isSecureContext) return "insecure";
  if (browser.top !== browser.self) return "embedded";
  return typeof nav?.contacts?.select === "function" ? "available" : "unsupported";
}

function contactName(value) {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new ContactImportError("no-name");
  if (name.length > 512) throw new ContactImportError("name-too-long");
  return name;
}

// Call directly from a user gesture; no permission prompt or contact access on mount.
export async function pickContactName(nav = globalThis.navigator) {
  if (typeof nav?.contacts?.select !== "function") throw new ContactImportError("unsupported");
  const contacts = await nav.contacts.select(["name"], { multiple: false });
  if (!Array.isArray(contacts)) throw new ContactImportError("invalid-contact");
  if (!contacts.length) return null;
  if (contacts.length !== 1) throw new ContactImportError("one-contact");
  const names = Array.isArray(contacts[0]?.name) ? contacts[0].name : [];
  return contactName(names.find((name) => typeof name === "string" && name.trim()));
}

const unescapeText = (text) =>
  text.replace(/\\([nN\\,;:])/g, (_, char) => /[nN]/.test(char) ? " " : char);
function nameParts(value) {
  const parts = [""];
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "\\" && index + 1 < value.length) parts[parts.length - 1] += char + value[++index];
    else if (char === ";") parts.push("");
    else parts[parts.length - 1] += char;
  }
  return parts.map(unescapeText);
}

// A single, bounded vCard is a local fallback. Only FN/N are read; no phone,
// email, address, photo or card bytes are persisted or sent to the server.
export function parseVcardName(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_CONTACT_FILE_BYTES) throw new ContactImportError("file-too-large");
  const unfolded = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
  const lines = unfolded.split("\n");
  const starts = lines.filter((line) => /^BEGIN:VCARD\s*$/i.test(line));
  const ends = lines.filter((line) => /^END:VCARD\s*$/i.test(line));
  if (starts.length !== 1 || ends.length !== 1) throw new ContactImportError("one-contact");
  const begin = lines.findIndex((line) => /^BEGIN:VCARD\s*$/i.test(line));
  const end = lines.findIndex((line) => /^END:VCARD\s*$/i.test(line));
  if (end <= begin) throw new ContactImportError("invalid-contact");
  let structuredName = null;
  for (const line of lines.slice(begin + 1, end)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const header = line.slice(0, colon);
    const property = header.split(";")[0].split(".").at(-1).toUpperCase();
    if (property !== "FN" && property !== "N") continue;
    if (/;ENCODING=/i.test(header) || /;CHARSET=(?!"?UTF-8(?:"?;|"?$))/i.test(header)) throw new ContactImportError("unsupported-encoding");
    const value = line.slice(colon + 1);
    if (property === "FN" && value.trim()) return contactName(unescapeText(value));
    if (property === "N") structuredName = nameParts(value);
  }
  if (structuredName) {
    const [family, given, additional, prefix, suffix] = structuredName;
    return contactName([prefix, given, additional, family, suffix].filter(Boolean).join(" "));
  }
  throw new ContactImportError("no-name");
}

export async function readContactFile(file) {
  if (!file || file.size > MAX_CONTACT_FILE_BYTES) throw new ContactImportError("file-too-large");
  if (!/\.vcf$/i.test(file.name || "") && !/^text\/(?:x-)?vcard$/i.test(file.type || "")) throw new ContactImportError("invalid-file");
  const bytes = await file.arrayBuffer();
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ContactImportError("unsupported-encoding");
  }
  return parseVcardName(text);
}
