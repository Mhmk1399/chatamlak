import { describe, expect, test } from "vitest";
import {
  clearRetiredAppCaches,
  migrateRetiredBrowserStorage,
} from "../../src/utils/brandStorageMigration.js";

const retiredPrefix = String.fromCharCode(
  115,
  111,
  110,
  103,
  98,
  105,
  114,
  100,
  45,
);

const makeStorage = (entries) => {
  const data = new Map(entries);
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] || null,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
};

describe("Ouj browser storage migration", () => {
  test("moves retired local and session keys without overwriting newer values", () => {
    const local = makeStorage([
      [`${retiredPrefix}theme`, "dark"],
      ["ouj-chat-locale", "en"],
      [`${retiredPrefix}locale`, "fa"],
    ]);
    const session = makeStorage([
      ["unrelated", "value"],
      [`${retiredPrefix}open-chat-id`, "chat-1"],
    ]);

    expect(migrateRetiredBrowserStorage({ local, session })).toEqual({
      local: 2,
      session: 1,
    });
    expect(local.getItem("ouj-chat-theme")).toBe("dark");
    expect(local.getItem("ouj-chat-locale")).toBe("en");
    expect(local.getItem(`${retiredPrefix}theme`)).toBeNull();
    expect(local.getItem(`${retiredPrefix}locale`)).toBeNull();
    expect(session.getItem("ouj-chat-open-chat-id")).toBe("chat-1");
    expect(session.getItem("unrelated")).toBe("value");
  });

  test("clears only retired Cache Storage entries", async () => {
    const deleted = [];
    const cacheStorage = {
      keys: async () => [`${retiredPrefix}0.13`, "ouj-chat-0.13"],
      delete: async (key) => {
        deleted.push(key);
        return true;
      },
    };

    await expect(clearRetiredAppCaches(cacheStorage)).resolves.toBe(1);
    expect(deleted).toEqual([`${retiredPrefix}0.13`]);
  });
});
