import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AdminUserModal from "../../../src/components/admin/AdminUserModal.jsx";
import { api } from "../../../src/components/admin/adminShared.js";
import { contactPickerAvailability } from "../../../src/utils/contactImport.js";
import { setLocale, t } from "../../../src/i18n/locale.js";
import { setNameLimits } from "../../../src/utils/nameLimits.js";
import "../../../src/index.css";

// Browser components run in an iframe. Mock only top-level availability;
// exercise the actual select call and real local-file parser below.
vi.mock("../../../src/utils/contactImport.js", async (original) => ({
  ...await original(), contactPickerAvailability: vi.fn(),
}));

let nativeSelect, post, originalContacts;
beforeEach(() => {
  setLocale("en"); setNameLimits({ nicknameMax: 24, usernameMax: 16 });
  vi.mocked(contactPickerAvailability).mockReturnValue("available");
  originalContacts = Object.getOwnPropertyDescriptor(navigator, "contacts");
  nativeSelect = vi.fn().mockResolvedValue([{ name: ["علی رضایی"], tel: ["+980000000000"] }]);
  Object.defineProperty(navigator, "contacts", { configurable: true, value: { select: nativeSelect } });
  post = vi.spyOn(api, "post").mockImplementation(async () => new Response(JSON.stringify({ user: { id: "fixture-user" } }), { status: 200 }));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
});
afterEach(async () => {
  if (originalContacts) Object.defineProperty(navigator, "contacts", originalContacts);
  else delete navigator.contacts;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); setLocale("en");
  document.documentElement.classList.remove("dark");
  await page.viewport(1280, 800);
});

const nickname = () => page.getByRole("textbox", { name: new RegExp(`^${t("Nickname")}`) });
const username = () => page.getByRole("textbox", { name: new RegExp(`^${t("Username")}`) });
const choose = () => page.getByRole("button", { name: t("Choose contact"), exact: true });
const submit = () => page.getByRole("button", { name: t("Create user"), exact: true });
const contactFile = (body) => new File([`BEGIN:VCARD\r\nVERSION:3.0\r\n${body}\r\nEND:VCARD\r\n`], "contact.vcf", { type: "text/vcard" });
const upload = (file) => userEvent.upload(page.getByLabelText(t("Contact file (.vcf)"), { exact: true }), file);
const props = () => ({ mode: "create", onClose: vi.fn(), onSaved: vi.fn() });

test("only an explicit choice prefills nickname; credentials and account submission stay manual", async () => {
  const handlers = props(); await render(<AdminUserModal {...handlers} />);
  expect(nativeSelect).not.toHaveBeenCalled();
  await username().fill("ali.owj");
  await page.getByPlaceholder(t("Min 6 characters"), { exact: true }).fill("fixture-password");
  await page.getByPlaceholder(t("Repeat password"), { exact: true }).fill("fixture-password");
  await choose().click();
  await expect.element(nickname()).toHaveValue("علی رضایی");
  await expect.element(username()).toHaveValue("ali.owj");
  await expect.element(page.getByPlaceholder(t("Min 6 characters"), { exact: true })).toHaveValue("fixture-password");
  expect(nativeSelect).toHaveBeenCalledWith(["name"], { multiple: false });
  expect(post).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  await submit().click();
  await expect.poll(() => post.mock.calls.length).toBe(1);
  expect(post.mock.calls[0][0]).toBe("/api/admin/users");
  expect(post.mock.calls[0][1]).toEqual({ nickname: "علی رضایی", username: "ali.owj", password: "fixture-password", role: "user", verified: false, color: expect.any(String) });
  await expect.poll(() => handlers.onSaved.mock.calls.length).toBe(1);
});

test.each(["empty", "AbortError"])("cancelling (%s) preserves the form and permits retry", async (cancel) => {
  nativeSelect.mockImplementationOnce(async () => {
    if (cancel === "AbortError") throw new DOMException("cancelled", "AbortError");
    return [];
  });
  await render(<AdminUserModal {...props()} />);
  await nickname().fill("Original"); await choose().click();
  await expect.element(choose()).toBeEnabled();
  await expect.element(nickname()).toHaveValue("Original");
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await choose().click(); await expect.element(nickname()).toHaveValue("علی رضایی");
  expect(post).not.toHaveBeenCalled();
});

test("denial is translated, hides native details and retains manual entry", async () => {
  setLocale("fa");
  nativeSelect.mockRejectedValueOnce(new DOMException("private-contact-fixture", "NotAllowedError"));
  await render(<AdminUserModal {...props()} />);
  await nickname().fill("نام قبلی"); await choose().click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(t("Contact access was not allowed. Try again or enter the name manually."));
  expect(document.body.textContent).not.toContain("private-contact-fixture");
  await expect.element(nickname()).toHaveValue("نام قبلی");
  await nickname().fill("نام دستی"); await expect.element(nickname()).toHaveValue("نام دستی");
  expect(post).not.toHaveBeenCalled();
});

test("pending selection prevents duplicate selection and submission; dismissal ignores late results", async () => {
  let resolve; nativeSelect.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const handlers = props(), view = await render(<AdminUserModal {...handlers} />);
  await choose().click();
  await expect.element(submit()).toBeDisabled(); await expect.element(choose()).toBeDisabled();
  await expect.element(nickname()).toHaveAttribute("readonly");
  await expect.element(page.getByRole("status")).toHaveTextContent(t("Reading contact…"));
  await view.unmount(); resolve([{ name: ["Too late"] }]);
  await Promise.resolve();
  expect(nativeSelect).toHaveBeenCalledTimes(1); expect(post).not.toHaveBeenCalled();
  expect(handlers.onSaved).not.toHaveBeenCalled();
});

test.each(["unsupported", "insecure"])("%s browsers can use a local vCard while manual credentials remain intact", async (availability) => {
  vi.mocked(contactPickerAvailability).mockReturnValue(availability);
  await render(<AdminUserModal {...props()} />);
  await expect.element(choose()).toBeDisabled(); await username().fill("manual.user");
  await upload(contactFile("FN:مریم احمدی\r\nTEL:+980000000000\r\nEMAIL:fixture@example.invalid"));
  await expect.element(nickname()).toHaveValue("مریم احمدی");
  await expect.element(username()).toHaveValue("manual.user");
  expect(nativeSelect).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

test("bad vCards preserve the current form; the same input can retry after an error", async () => {
  await render(<AdminUserModal {...props()} />); await nickname().fill("Keep me");
  await upload(contactFile("TEL:+980000000000"));
  await expect.element(page.getByRole("alert")).toHaveTextContent(t("The selected contact has no name. Enter the name manually."));
  await expect.element(nickname()).toHaveValue("Keep me");
  const file = contactFile("FN:Recovered");
  await upload(file); await expect.element(nickname()).toHaveValue("Recovered");
  await nickname().fill("Changed"); await upload(file); await expect.element(nickname()).toHaveValue("Recovered");
  expect(post).not.toHaveBeenCalled();
});

test("an over-limit name remains visible for review and must be shortened before submission", async () => {
  const name = "نام بسیار بلند برای بازبینی پیش از ساخت کاربر";
  nativeSelect.mockResolvedValueOnce([{ name: [name] }]);
  await render(<AdminUserModal {...props()} />); await choose().click();
  await expect.element(nickname()).toHaveValue(name);
  await expect.element(nickname()).toHaveAttribute("aria-invalid", "true");
  await expect.element(submit()).toBeDisabled();
  await nickname().fill("نام کوتاه"); await expect.element(submit()).toBeEnabled();
  expect(post).not.toHaveBeenCalled();
});

test("size and multi-contact errors are actionable without losing manually entered fields", async () => {
  await render(<AdminUserModal {...props()} />);
  await nickname().fill("Keep name"); await username().fill("keep.user");
  await upload(new File(["X".repeat(256 * 1024 + 1)], "large.vcf", { type: "text/vcard" }));
  await expect.element(page.getByRole("alert")).toHaveTextContent(t("The contact file must be at most 256 KB."));
  await upload(new File([await contactFile("FN:A").text(), await contactFile("FN:B").text()], "contacts.vcf", { type: "text/vcard" }));
  await expect.element(page.getByRole("alert")).toHaveTextContent(t("Choose a vCard file containing exactly one contact."));
  await expect.element(nickname()).toHaveValue("Keep name");
  await expect.element(username()).toHaveValue("keep.user");
  expect(post).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

test("switching language preserves imported content and translates its status", async () => {
  await render(<AdminUserModal {...props()} />); await choose().click();
  await expect.element(nickname()).toHaveValue("علی رضایی");
  setLocale("fa");
  await expect.element(page.getByRole("status")).toHaveTextContent(t("Contact name filled. Review it before creating the user."));
  await expect.element(nickname()).toHaveValue("علی رضایی");
  await expect.element(choose()).toBeEnabled();
  expect(nativeSelect).toHaveBeenCalledTimes(1); expect(post).not.toHaveBeenCalled();
});

test("editing an existing user never offers contact import", async () => {
  await render(<AdminUserModal {...props()} mode="edit" user={{ id: "fixture-user", nickname: "Existing", username: "existing" }} />);
  await expect.element(nickname()).toHaveValue("Existing");
  await expect.element(choose()).not.toBeInTheDocument();
  expect(nativeSelect).not.toHaveBeenCalled();
});

for (const locale of ["fa", "en"]) for (const width of [320, 1280]) {
  test(`contact actions fit ${locale} at ${width}px without horizontal scrolling`, async () => {
    setLocale(locale); await page.viewport(width, 800);
    document.documentElement.classList.toggle("dark", locale === "fa");
    await render(<AdminUserModal {...props()} />);
    const section = page.getByRole("region", { name: t("Fill from contacts") });
    await expect.element(section).toBeVisible();
    const node = section.element(), form = node.closest("form");
    expect(form.scrollWidth).toBeLessThanOrEqual(form.clientWidth + 1);
    const bounds = node.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width);
    for (const button of node.querySelectorAll("button")) {
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    }
    if (width === 320) {
      const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
      await page.screenshot({ path: `../../../.vitest/admin-contacts-${locale}-${browser}.png` });
    }
    expect(nativeSelect).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
}
