const DB_NAME = 'document-viewer-remote-cache';
const STORE_NAME = 'files';
const DB_VERSION = 1;

export type CachedRemoteFile = {
  path: string;
  blob: Blob;
  hash: string;
  /** Supabase storage `updated_at` when the blob was cached. */
  storageUpdatedAt: string | null;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openCacheDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open remote file cache'));
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Remote file cache transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Remote file cache transaction aborted'));
  });
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Remote file cache request failed'));
  });
}

export async function getRemoteCachedFile(path: string): Promise<CachedRemoteFile | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openCacheDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const record = await req(tx.objectStore(STORE_NAME).get(path));
    await txDone(tx);
    return (record as CachedRemoteFile | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function putRemoteCachedFile(record: CachedRemoteFile): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openCacheDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    await txDone(tx);
  } catch {
    // Cache is best-effort.
  }
}

export async function deleteRemoteCachedPaths(paths: string[]): Promise<void> {
  if (typeof indexedDB === 'undefined' || paths.length === 0) return;
  try {
    const db = await openCacheDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const path of paths) {
      store.delete(path);
    }
    await txDone(tx);
  } catch {
    // Cache is best-effort.
  }
}

export async function clearRemoteDocCache(docId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const prefix = `${docId}/`;
  try {
    const db = await openCacheDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const keys = await req(store.getAllKeys());
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith(prefix)) {
        store.delete(key);
      }
    }
    await txDone(tx);
  } catch {
    // Cache is best-effort.
  }
}
