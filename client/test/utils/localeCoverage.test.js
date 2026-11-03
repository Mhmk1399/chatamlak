import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { fa } from "../../src/i18n/fa.js";

test("every literal UI translation key has a Persian entry", () => {
  const sourceRoot = new URL("../../src/", import.meta.url);
  const missing = [];
  for (const file of readdirSync(sourceRoot, { recursive: true })) {
    if (!/\.(jsx|js)$/.test(file) || file.startsWith(`i18n${path.sep}`)) continue;
    const source = readFileSync(new URL(file.replaceAll(path.sep, "/"), sourceRoot), "utf8");
    for (const match of source.matchAll(/\b(?:t|localize)\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) {
      const quoted = match[1];
      const key = (quoted.startsWith('"') ? JSON.parse(quoted) : quoted.slice(1, -1).replace(/\\'/g, "'")).trim().replace(/\s+/g, " ");
      if (!/[A-Za-z]/.test(key) || /^#[a-f\d]+$/i.test(key) || key.startsWith("ct:")) continue;
      if (!Object.hasOwn(fa, key)) missing.push(`${file}: ${key}`);
    }
  }
  expect([...new Set(missing)]).toEqual([]);
});
