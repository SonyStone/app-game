import type { PaletteSurface } from './paletteSurface';

/**
 * Keeps the mixing palette's paint in IndexedDB, as its raw pixels, so that mixed paint survives reloads as a real
 * palette's would. One palette per browser profile, shared by every drawing. Failures (no IndexedDB, private mode,
 * quota) are silent: the palette keeps working and starts blank next time.
 */

/** The stored palette, if one of `width` × `height` pixels was saved; another size is ignored. */
export async function readPalette(width: number, height: number): Promise<Uint8ClampedArray | undefined> {
  try {
    const database = await open();
    const stored = await request<unknown>(database.transaction(storeName).objectStore(storeName).get(key));
    database.close();
    if (
      typeof stored === 'object' &&
      stored !== null &&
      'width' in stored &&
      'height' in stored &&
      'data' in stored &&
      stored.width === width &&
      stored.height === height &&
      stored.data instanceof Uint8ClampedArray &&
      stored.data.length === width * height * 4
    ) {
      return stored.data;
    }
  } catch {
    // Start blank.
  }

  return undefined;
}

/** Replaces the stored palette with a copy of `surface`. */
export async function writePalette(surface: PaletteSurface): Promise<void> {
  try {
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction
      .objectStore(storeName)
      .put({ width: surface.width, height: surface.height, data: surface.data.slice() }, key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Keep the palette in memory only.
  }
}

const databaseName = 'paint-palette';
const storeName = 'palette';
const key = 'palette';

function open() {
  const opening = indexedDB.open(databaseName, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore(storeName);
  return request(opening);
}

function request<T>(pending: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.onsuccess = () => resolve(pending.result);
    pending.onerror = () => reject(pending.error);
  });
}
