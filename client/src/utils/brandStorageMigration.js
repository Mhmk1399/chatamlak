// `atob` deliberately keeps the retired prefix out of compiled product text.
const RETIRED_PREFIX = globalThis.atob("c29uZ2JpcmQt");
const CURRENT_PREFIX = "ouj-chat-";

const migrateStorage = (storage) => {
  if (!storage?.length) return 0;
  const retiredKeys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(RETIRED_PREFIX)) retiredKeys.push(key);
  }

  let migrated = 0;
  retiredKeys.forEach((retiredKey) => {
    const nextKey = `${CURRENT_PREFIX}${retiredKey.slice(RETIRED_PREFIX.length)}`;
    try {
      if (storage.getItem(nextKey) === null) {
        storage.setItem(nextKey, storage.getItem(retiredKey) || "");
      }
      storage.removeItem(retiredKey);
      migrated += 1;
    } catch {
      // Storage can be disabled or full. Keeping the source key is safer.
    }
  });
  return migrated;
};

export const migrateRetiredBrowserStorage = ({
  local = globalThis.localStorage,
  session = globalThis.sessionStorage,
} = {}) => ({
  local: migrateStorage(local),
  session: migrateStorage(session),
});

export const clearRetiredAppCaches = async (
  cacheStorage = globalThis.caches,
) => {
  if (!cacheStorage?.keys || !cacheStorage?.delete) return 0;
  try {
    const keys = await cacheStorage.keys();
    const retired = keys.filter((key) => key.startsWith(RETIRED_PREFIX));
    await Promise.all(retired.map((key) => cacheStorage.delete(key)));
    return retired.length;
  } catch {
    return 0;
  }
};
