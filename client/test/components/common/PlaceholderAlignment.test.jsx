import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageComposer } from "../../../src/components/chat/messages/MessageComposer.jsx";
import AuthFormFields from "../../../src/components/auth/AuthFormFields.jsx";
import SidebarHeader from "../../../src/components/sidebar/header/SidebarHeader.jsx";
import { CompactSelect, CustomSelect, TabSearchInput } from "../../../src/components/admin/AdminCommon.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import { clearChatDraft } from "../../../src/utils/chatDrafts.js";
import "../../../src/index.css";

afterEach(async () => { setLocale("en"); clearChatDraft("placeholder-user", "placeholder-chat"); document.documentElement.classList.remove("dark"); await page.viewport(1280, 800); });
function alignment(element) {
  const { textAlign, direction } = getComputedStyle(element);
  return textAlign === "start" ? direction === "rtl" ? "right" : "left" : textAlign === "end" ? direction === "rtl" ? "left" : "right" : textAlign;
}
const composer = { activeChatId: "placeholder-chat", draftAccountId: "placeholder-user", currentUsername: "tester", isDesktop: true, handleSend: vi.fn(async () => true), pendingUploadFiles: [], activeUploadProgress: null, fileUploadEnabled: true, setShowUploadMenu: vi.fn(), onMessageInput: vi.fn() };
const auth = { isLogin: false, canSignup: true, setShowPassword: vi.fn(), setShowConfirmPassword: vi.fn(), nicknameLength: 0, usernameLength: 0, setNicknameLength: vi.fn(), setUsernameLength: vi.fn(), onSubmit: vi.fn() };
function SidebarSearch() {
  const [query, setQuery] = useState(""), [focused, setFocused] = useState(false);
  return <SidebarHeader user={{ username: "tester" }} isConnected hasChats chatsSearchQuery={query} chatsSearchFocused={focused}
    onChatsSearchChange={setQuery} onChatsSearchFocus={() => setFocused(true)} onChatsSearchBlur={() => setFocused(false)} />;
}
function AdminSearch() { const [value, setValue] = useState(""); return <TabSearchInput value={value} onChange={setValue} />; }

for (const locale of ["fa", "en"]) {
  const expected = locale === "fa" ? "right" : "left";
  test(`native placeholders follow ${locale} even in technical, disabled and readonly fields`, async () => {
    setLocale(locale);
    const fields = [["text", "Name"], ["password", "********"], ["email", "person@example.com"], ["url", "https://example.com"], ["tel", "+989121234567"], ["number", "123456"]];
    await render(<div>{fields.map(([type, placeholder]) => <label key={type}>{type}<input type={type} dir="ltr" placeholder={placeholder} className="text-start" /></label>)}
      <label>Readonly<input readOnly dir="ltr" placeholder="ADMIN_API_TOKEN" /></label><label>Disabled<input disabled dir="ltr" placeholder="Not available" /></label>
      <label>Notes<textarea dir="auto" placeholder={t("Type a message")} className="resize-none text-start" /></label></div>);
    for (const name of [...fields.map(([type]) => type), "Readonly", "Disabled", "Notes"]) {
      const input = page.getByLabelText(name, { exact: true });
      expect(alignment(input.element()), name).toBe(expected);
      expect(getComputedStyle(input.element(), "::placeholder").fontFamily).toContain(locale === "fa" ? "Vazirmatn" : "DM Sans");
    }
    const url = page.getByLabelText("url", { exact: true }); await url.fill("https://oujamlak.ir/report");
    expect(getComputedStyle(url.element()).direction).toBe("ltr"); expect(alignment(url.element())).toBe("left");
    await url.fill(""); expect(alignment(url.element())).toBe(expected);
  });
  test(`message placeholder follows ${locale}, including after clearing and switching locale`, async () => {
    setLocale(locale); await page.viewport(375, 812); if (locale === "fa") document.documentElement.classList.add("dark");
    await render(<MessageComposer {...composer} isDesktop={false} />);
    const input = page.getByRole("textbox", { name: t("Type a message"), exact: true });
    expect(alignment(input.element())).toBe(expected);
    await input.fill("English report"); expect(getComputedStyle(input.element()).direction).toBe("ltr"); expect(alignment(input.element())).toBe("left");
    await input.fill("گزارش امروز"); expect(getComputedStyle(input.element()).direction).toBe("rtl"); expect(alignment(input.element())).toBe("right");
    await input.fill(""); expect(alignment(input.element())).toBe(expected);
    const browser = navigator.userAgent.includes("Firefox") ? "firefox" : "chromium";
    await page.screenshot({ path: `../../../.vitest/placeholder-composer-${locale}-${browser}.png` });
    const node = input.element();
    setLocale(locale === "fa" ? "en" : "fa");
    await expect.poll(() => alignment(node)).toBe(locale === "fa" ? "left" : "right");
  });
  test(`signup placeholders follow ${locale} while entered usernames keep their LTR direction`, async () => {
    setLocale(locale); await render(<AuthFormFields {...auth} />);
    for (const name of ["Your full name", "ali.ahmadi", "********"]) {
      const nodes = document.querySelectorAll(`input[placeholder="${t(name)}"]`);
      expect(nodes.length).toBeGreaterThan(0); for (const node of nodes) expect(alignment(node)).toBe(expected);
    }
    const username = page.getByRole("textbox", { name: new RegExp(`^${t("Username")}`) }); await username.fill("ali.ahmadi");
    expect(alignment(username.element())).toBe("left"); await username.fill(""); expect(alignment(username.element())).toBe(expected);
  });
  test(`sidebar search placeholder stays at the ${expected} edge before and after focus`, async () => {
    setLocale(locale); await render(<SidebarSearch />);
    const search = page.getByRole("searchbox", { name: t("Search"), exact: true });
    expect(alignment(search.element())).toBe(expected);
    expect(getComputedStyle(search.element(), "::placeholder").color).not.toBe("rgba(0, 0, 0, 0)");
    await search.click(); expect(alignment(search.element())).toBe(expected);
    await search.fill("report"); await page.getByRole("button", { name: t("Clear search"), exact: true }).click();
    expect(alignment(search.element())).toBe(expected);
  });
  test(`admin search and authored select placeholders follow ${locale}`, async () => {
    setLocale(locale); await render(<><AdminSearch /><section aria-label="Custom"><CustomSelect value="" options={[["x", "Item"]]} onChange={vi.fn()} /></section>
      <section aria-label="Compact"><CompactSelect value="" options={[["x", "Item"]]} onChange={vi.fn()} /></section></>);
    expect(alignment(page.getByRole("textbox").element())).toBe(expected);
    for (const name of ["Custom", "Compact"]) expect(alignment(page.getByRole("region", { name, exact: true }).getByRole("button").element())).toBe(expected);
  });
}
