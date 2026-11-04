import { describe, expect, test, vi } from "vitest";
import { contactPickerAvailability, MAX_CONTACT_FILE_BYTES, parseVcardName, pickContactName, readContactFile } from "../../src/utils/contactImport.js";

const card = (lines) => `BEGIN:VCARD\r\nVERSION:3.0\r\n${lines}\r\nEND:VCARD\r\n`;
const file = (text, overrides = {}) => {
  const bytes = new TextEncoder().encode(text);
  return { name: "contact.vcf", type: "text/vcard", size: bytes.length, arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer), ...overrides };
};

describe("one-off native contact selection", () => {
  test("feature detection never reads contacts and requires secure top-level context", () => {
    const select = vi.fn(), nav = { contacts: { select } }, browser = { isSecureContext: true };
    browser.self = browser; browser.top = browser;
    expect(contactPickerAvailability(browser, nav)).toBe("available");
    expect(contactPickerAvailability({ ...browser, isSecureContext: false }, nav)).toBe("insecure");
    expect(contactPickerAvailability({ ...browser, top: {} }, nav)).toBe("embedded");
    expect(contactPickerAvailability(browser, {})).toBe("unsupported");
    expect(select).not.toHaveBeenCalled();
  });

  test("requests only a single contact's name and returns no other fields", async () => {
    const select = vi.fn().mockResolvedValue([{ name: ["  علی   رضایی  "], tel: ["+980000000000"], email: ["fixture@example.invalid"] }]);
    const result = pickContactName({ contacts: { select } });
    // Must invoke select synchronously while the original click's activation is valid.
    expect(select).toHaveBeenCalledWith(["name"], { multiple: false });
    await expect(result).resolves.toBe("علی رضایی");
  });

  test("empty selection is cancellation; AbortError and denial remain distinguishable", async () => {
    await expect(pickContactName({ contacts: { select: async () => [] } })).resolves.toBeNull();
    for (const name of ["AbortError", "NotAllowedError"]) {
      await expect(pickContactName({ contacts: { select: async () => { throw new DOMException("fixture", name); } } })).rejects.toMatchObject({ name });
    }
  });

  test.each([
    [null, "invalid-contact"], [[{ name: [] }], "no-name"], [[{ name: ["  "] }], "no-name"],
    [[{ name: ["A"] }, { name: ["B"] }], "one-contact"], [[{ name: ["A".repeat(513)] }], "name-too-long"],
  ])("rejects unusable selection %j", async (contacts, code) => {
    await expect(pickContactName({ contacts: { select: async () => contacts } })).rejects.toMatchObject({ code });
  });
});

describe("bounded local single-contact vCard import", () => {
  test("reads Persian UTF-8 names, BOM, folded lines and escaped punctuation", () => {
    expect(parseVcardName("\uFEFF" + card("FN;CHARSET=UTF-8:علی\r\n\t رضایی\\, مدیر\\; اوج"))).toBe("علی رضایی, مدیر; اوج");
    expect(parseVcardName(card("item1.FN;CHARSET=\"UTF-8\":Test\\nName"))).toBe("Test Name");
    expect(parseVcardName(card("FN:Literal\\\\name"))).toBe("Literal\\name");
  });
  test("prefers formatted name and falls back to structured names in display order", () => {
    expect(parseVcardName(card("N:Family;Given;Middle;Dr.;Jr.\nFN:Preferred Name"))).toBe("Preferred Name");
    expect(parseVcardName(card("N:Family\\;Name;Given;Middle;Dr.;Jr."))).toBe("Dr. Given Middle Family;Name Jr.");
  });
  test.each([
    [card("TEL:+980000000000"), "no-name"], [card("FN:A") + card("FN:B"), "one-contact"],
    ["FN:Name", "one-contact"], ["END:VCARD\nFN:A\nBEGIN:VCARD", "invalid-contact"],
    [card("FN;ENCODING=QUOTED-PRINTABLE:=41"), "unsupported-encoding"],
    [card("FN;CHARSET=WINDOWS-1256:Name"), "unsupported-encoding"],
    [card("FN:" + "A".repeat(513)), "name-too-long"],
  ])("rejects invalid/unsupported cards without exposing their contents", (value, code) => {
    expect(() => parseVcardName(value)).toThrow(expect.objectContaining({ code }));
  });
  test("caps input bytes including multi-byte Persian content", () => {
    expect(() => parseVcardName("ا".repeat(MAX_CONTACT_FILE_BYTES / 2 + 1))).toThrow(expect.objectContaining({ code: "file-too-large" }));
  });
  test("checks size and file type before reading file contents", async () => {
    const large = file("", { size: MAX_CONTACT_FILE_BYTES + 1 });
    await expect(readContactFile(large)).rejects.toMatchObject({ code: "file-too-large" });
    expect(large.arrayBuffer).not.toHaveBeenCalled();
    const invalid = file("", { name: "file.png", type: "image/png" });
    await expect(readContactFile(invalid)).rejects.toMatchObject({ code: "invalid-file" });
    expect(invalid.arrayBuffer).not.toHaveBeenCalled();
    await expect(readContactFile(file(card("FN:Ali"), { type: "" }))).resolves.toBe("Ali");
  });
  test("rejects non-UTF-8 bytes instead of silently corrupting the contact name", async () => {
    await expect(readContactFile(file("", { arrayBuffer: async () => new Uint8Array([0xff, 0xfe, 0x61]).buffer }))).rejects.toMatchObject({ code: "unsupported-encoding" });
  });
});
