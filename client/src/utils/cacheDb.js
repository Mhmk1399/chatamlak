const DB_NAME = "ouj-chat-cache";
const DB_VERSION = 3;
const RETIRED_DB_NAME = globalThis.atob("c29uZ2JpcmQtY2FjaGU=");

const STORES = {
  outbox: "outbox",
  chatList: "chatList",
  messages: "messages",
  index: "messagesIndex",
  channelSeen: "channelSeen",
  mediaThumbs: "mediaThumbs",
  mediaPosters: "mediaPosters",
  voiceWaveforms: "voiceWaveforms",
};

let dbPromise;

const openExistingDatabase = (name) =>
  new Promise((resolve) => {
    const request = window.indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });

const deleteDatabase = (name) =>
  new Promise((resolve) => {
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });

const copyRetiredOutbox = (sourceDb, targetDb) =>
  new Promise((resolve, reject) => {
    const sourceTx = sourceDb.transaction("outbox", "readonly");
    const targetTx = targetDb.transaction("outbox", "readwrite");
    const sourceStore = sourceTx.objectStore("outbox");
    const targetStore = targetTx.objectStore("outbox");
    let sourceDone = false;
    let targetDone = false;
    const completeWhenReady = () => {
      if (sourceDone && targetDone) resolve();
    };

    sourceTx.oncomplete = () => {
      sourceDone = true;
      completeWhenReady();
    };
    targetTx.oncomplete = () => {
      targetDone = true;
      completeWhenReady();
    };
    sourceTx.onerror = () => reject(sourceTx.error || new Error("Could not read retired outbox."));
    targetTx.onabort = () => reject(targetTx.error || new Error("Could not write Ouj outbox."));

    const cursor = sourceStore.openCursor();
    cursor.onerror = () => reject(cursor.error || new Error("Could not read retired outbox."));
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      const add = targetStore.add(current.value, current.primaryKey);
      // A message created after the rename wins over its retired counterpart.
      add.onerror = (event) => event.preventDefault();
      current.continue();
    };
  });

const migrateRetiredOutbox = async (targetDb) => {
  if (
    !window.indexedDB?.databases ||
    !targetDb?.objectStoreNames?.contains("outbox")
  ) {
    return;
  }
  try {
    const databases = await window.indexedDB.databases();
    if (!databases.some((database) => database?.name === RETIRED_DB_NAME)) {
      return;
    }
    const sourceDb = await openExistingDatabase(RETIRED_DB_NAME);
    if (!sourceDb?.objectStoreNames?.contains("outbox")) {
      sourceDb?.close();
      await deleteDatabase(RETIRED_DB_NAME);
      return;
    }
    await copyRetiredOutbox(sourceDb, targetDb);
    sourceDb.close();
    await deleteDatabase(RETIRED_DB_NAME);
  } catch {
    // Keep the retired database intact if a migration cannot complete.
  }
};

export const isIdbAvailable = () =>
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

const openDb = () => {
  if (!isIdbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      Object.values(STORES).forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      });
    };
    request.onsuccess = () => {
      const db = request.result;
      migrateRetiredOutbox(db).finally(() => resolve(db));
    };
    request.onerror = () => resolve(null);
  });
  return dbPromise;
};

const withStore = async (storeName, mode, callback) => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store, tx);
    tx.oncomplete = () => {
      if (result && typeof result.then === "function") {
        result.then(resolve).catch(() => resolve(null));
        return;
      }
      resolve(result ?? true);
    };
    tx.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
  });
};

const estimateSizeBytes = (value) => {
  try {
    const raw = JSON.stringify(value);
    if (typeof Blob !== "undefined") {
      return new Blob([raw]).size;
    }
    return raw.length;
  } catch {
    return 0;
  }
};

export const idbGet = async (storeName, key) =>
  withStore(storeName, "readonly", (store) => {
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  });

export const idbSet = async (storeName, key, value) =>
  withStore(storeName, "readwrite", (store) => {
    const payload = {
      data: value,
      sizeBytes: estimateSizeBytes(value),
      updatedAt: Date.now(),
    };
    store.put(payload, key);
  });

export const idbDelete = async (storeName, key) =>
  withStore(storeName, "readwrite", (store) => {
    store.delete(key);
  });

export const idbClearStore = async (storeName) =>
  withStore(storeName, "readwrite", (store) => {
    store.clear();
  });

export const idbGetAllEntries = async (storeName) =>
  withStore(storeName, "readonly", (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () =>
        resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  });

/**
 * Get detailed statistics about IndexedDB storage usage
 * Useful for cache size reporting and diagnostics
 */
export const idbGetStats = async () => {
  if (!isIdbAvailable()) {
    return {
      available: false,
      totalBytes: 0,
      storeStats: {},
    };
  }

  try {
    const storeStats = {};
    let totalBytes = 0;

    for (const [storeName] of Object.entries(STORES)) {
      const entries = await idbGetAllEntries(storeName);
      let storeBytes = 0;
      let count = 0;

      entries.forEach((entry) => {
        if (entry && typeof entry === "object") {
          const entrySize = Number(entry.sizeBytes || 0);
          storeBytes += entrySize;
          count += 1;
        }
      });

      totalBytes += storeBytes;
      storeStats[storeName] = {
        count,
        bytes: storeBytes,
      };
    }

    return {
      available: true,
      totalBytes,
      storeStats,
    };
  } catch {
    return {
      available: false,
      totalBytes: 0,
      storeStats: {},
    };
  }
};

export const CACHE_STORES = STORES;
