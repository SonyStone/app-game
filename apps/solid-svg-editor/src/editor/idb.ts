/** The editor's IndexedDB stores: file handles bound to tabs, and custom interface fonts. */
export type StoreName = 'file-handles' | 'fonts';

const databaseName = 'solid-svg-editor';
const storeNames: readonly StoreName[] = ['file-handles', 'fonts'];

/** Opens a store of the editor's database, creating missing stores on upgrade. Rejects where IndexedDB is unavailable. */
export async function objectStore(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const open = indexedDB.open(databaseName, 2);
  open.onupgradeneeded = () => {
    for (const store of storeNames) {
      if (!open.result.objectStoreNames.contains(store)) {
        open.result.createObjectStore(store);
      }
    }
  };
  const database = await request(open);
  return database.transaction(name, mode).objectStore(name);
}

/** Resolves an IndexedDB request. */
export function request<T>(item: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    item.onsuccess = () => resolve(item.result);
    item.onerror = () => reject(item.error ?? new Error('IndexedDB request failed'));
  });
}
