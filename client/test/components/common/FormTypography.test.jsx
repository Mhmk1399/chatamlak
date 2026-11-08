import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { PersianDateField, PersianTimeField } from "../../../src/components/common/PersianDateTimeField.jsx";
import { inputCls, inputSmCls } from "../../../src/components/admin/adminShared.js";
import { toolInput } from "../../../src/components/chat/tools/toolStyles.js";
import { setLocale } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

const initialRootFontSize = document.documentElement.style.fontSize;

afterEach(async () => {
  document.documentElement.style.fontSize = initialRootFontSize;
  document.documentElement.classList.remove("dark");
  setLocale("en");
  await page.viewport(1280, 800);
});

function Fields() {
  return (
    <section aria-label="Form typography" className="w-full max-w-sm space-y-2 p-3 text-xs">
      {["text", "search", "password", "email", "url", "tel", "number"].map((type) => (
        <input key={type} type={type} aria-label={type} placeholder={type} className="w-full text-xs md:text-sm" />
      ))}
      <input aria-label="Admin field" className={inputCls} />
      <input aria-label="Admin search" className={inputSmCls} />
      <input aria-label="Tool field" className={toolInput} />
      <input aria-label="Readonly field" readOnly className="w-full text-xs" />
      <input aria-label="Disabled field" disabled className="w-full text-xs" />
      <textarea aria-label="Message" placeholder="Message" className="w-full resize-none text-xs" />
      <select aria-label="Topic" className="w-full text-xs"><option>General</option></select>
      <PersianDateField label="Date" value="2026-11-08" onChange={vi.fn()} />
      <PersianTimeField label="Time" value="09:17" onChange={vi.fn()} />
    </section>
  );
}

for (const locale of ["fa", "en"]) {
  for (const theme of ["light", "dark"]) {
    for (const width of [320, 1280]) {
      test(`fields keep a 16px floor and respect larger text in ${locale}/${theme} at ${width}px`, async () => {
        setLocale(locale);
        document.documentElement.classList.toggle("dark", theme === "dark");
        await page.viewport(width, 900);
        await render(<Fields />);
        const region = page.getByRole("region", { name: "Form typography", exact: true });
        await expect.element(region).toBeVisible();
        const fields = region.element().querySelectorAll("input:not([type='hidden']), textarea, select, .ouj-date-segments, .ouj-date-segment");
        expect(fields.length).toBeGreaterThan(15);
        for (const rootSize of [16, 20, 12]) {
          document.documentElement.style.fontSize = `${rootSize}px`;
          for (const field of fields) {
            expect(parseFloat(getComputedStyle(field).fontSize), field.getAttribute("aria-label") || field.outerHTML).toBe(Math.max(16, rootSize));
          }
        }
        document.documentElement.style.fontSize = "16px";
        const message = page.getByRole("textbox", { name: "Message", exact: true });
        await message.fill(locale === "fa" ? "گزارش امروز" : "Daily report");
        await expect.element(message).toHaveFocus();
        expect(getComputedStyle(message.element()).fontSize).toBe("16px");
        expect(region.element().scrollWidth).toBeLessThanOrEqual(region.element().clientWidth);
      });
    }
  }
}

test("custom editable fields retain the same font floor as native inputs", async () => {
  await render(<div className="text-xs">
    <div contentEditable aria-label="Rich editor" suppressContentEditableWarning className="text-xs">Draft</div>
    <div contentEditable="plaintext-only" aria-label="Plain editor" suppressContentEditableWarning className="text-sm">Draft</div>
    <div contentEditable="" aria-label="Default editor" suppressContentEditableWarning className="text-xs">Draft</div>
  </div>);
  for (const name of ["Rich editor", "Plain editor", "Default editor"]) {
    expect(getComputedStyle(page.getByLabelText(name, { exact: true }).element()).fontSize).toBe("16px");
  }
});
