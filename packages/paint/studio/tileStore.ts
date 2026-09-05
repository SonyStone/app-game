import { restoreDocument, type SavedDocument } from './storage';
import { type TileData, type TileReference } from './tilePixels';

/** Immutable tile versions in IndexedDB with a bounded RAM cache.
 * Dirty bytes remain pinned until their transaction succeeds. Checkpoints atomically publish their versions.
 */
export async function createTileStore(name: string, budget = 64 * 1048576) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents');
      if (!request.result.objectStoreNames.contains('tiles')) request.result.createObjectStore('tiles');
      if (!request.result.objectStoreNames.contains('overviews')) request.result.createObjectStore('overviews');
      if (!request.result.objectStoreNames.contains('overviewIndex')) request.result.createObjectStore('overviewIndex');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.onversionchange = () => db.close();
  // A newly edited ancestor cannot already be on disk. Avoid queuing a guaranteed-miss
  // read behind an in-flight checkpoint, which would stall the next stroke's overview.
  const overviewKeys = new Set(
    await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db.transaction('overviewIndex').objectStore('overviewIndex').getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })
  );
  let protectedOverviews = new Set<string>();
  const overviewWrites = new Map<string, Uint8Array>();
  let overviewPendingBytes = 0;
  let overviewReads = 0;
  let overviewSaved = 0;
  const cache = new Map<string, { pixels: Uint8Array; dirty: boolean }>();
  const identities = new WeakMap<Uint8Array, TileReference>();
  const loading = new Map<string, Promise<Uint8Array>>();
  let bytes = 0,
    reads = 0,
    writes = 0;
  let queue = Promise.resolve();
  const trim = () => {
    for (const [id, entry] of cache) {
      if (bytes <= budget) break;
      if (entry.dirty) continue;
      bytes -= entry.pixels.byteLength;
      cache.delete(id);
    }
  };
  const remember = (id: string, pixels: Uint8Array, dirty: boolean) => {
    const old = cache.get(id);
    if (old) bytes -= old.pixels.byteLength;
    cache.delete(id);
    cache.set(id, { pixels, dirty });
    bytes += pixels.byteLength;
    trim();
  };
  const read = async (data: TileData): Promise<Uint8Array> => {
    if (data instanceof Uint8Array) return data;
    const cached = cache.get(data.storageId);
    if (cached) {
      cache.delete(data.storageId);
      cache.set(data.storageId, cached);
      return cached.pixels;
    }
    const pending = loading.get(data.storageId);
    if (pending) return pending;
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      const request = db.transaction('tiles').objectStore('tiles').get(data.storageId);
      request.onsuccess = () => {
        const pixels: unknown = request.result;
        if (!(pixels instanceof Uint8Array) || pixels.byteLength !== data.byteLength) {
          reject(new Error('A saved tile could not be read.'));
          return;
        }
        reads++;
        remember(data.storageId, pixels, false);
        resolve(pixels);
      };
      request.onerror = () => reject(request.error);
    }).finally(() => loading.delete(data.storageId));
    loading.set(data.storageId, promise);
    return promise;
  };
  const capture = (pixels: TileData): TileReference => {
    if (!(pixels instanceof Uint8Array)) return pixels;
    const existing = identities.get(pixels);
    if (existing) return existing;
    const ref = { storageId: crypto.randomUUID(), byteLength: pixels.byteLength };
    identities.set(pixels, ref);
    remember(ref.storageId, pixels, true);
    return ref;
  };
  const flush = (checkpoint?: unknown) => {
    const task = queue
      .catch(() => {})
      .then(async () => {
        const dirty = [...cache].filter(([, entry]) => entry.dirty);
        const derived = [...overviewWrites];
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['tiles', 'documents', 'overviews', 'overviewIndex'], 'readwrite');
          for (const [id, entry] of dirty) tx.objectStore('tiles').put(entry.pixels, id);
          for (const [key, pixels] of derived) {
            tx.objectStore('overviews').put(pixels, key);
            tx.objectStore('overviewIndex').put({ bytes: pixels.byteLength, touched: Date.now() }, key);
          }
          if (checkpoint) tx.objectStore('documents').put(checkpoint, 'current');
          tx.oncomplete = () => resolve();
          tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Tile checkpoint failed.'));
        });
        for (const [id] of dirty) {
          const entry = cache.get(id);
          if (entry) entry.dirty = false;
        }
        for (const [key, pixels] of derived)
          if (overviewWrites.get(key) === pixels) {
            overviewKeys.add(key);
            overviewWrites.delete(key);
            overviewPendingBytes -= pixels.byteLength;
          }
        overviewSaved += derived.length;
        writes += dirty.length;
        trim();
      });
    queue = task;
    return task;
  };
  return {
    read,
    capture,
    /** Derived pixels are content-addressed by their source versions and saved with the next checkpoint. */
    overviews: {
      retain(keys: string[]) {
        protectedOverviews = new Set(keys);
      },
      async read(key: string): Promise<Uint8Array | undefined> {
        const pending = overviewWrites.get(key);
        if (pending) return pending;
        if (!overviewKeys.has(key)) return undefined;
        return new Promise((resolve, reject) => {
          const request = db.transaction('overviews').objectStore('overviews').get(key);
          request.onsuccess = () => {
            const pixels: unknown = request.result;
            if (pixels instanceof Uint8Array) {
              overviewReads++;
              resolve(pixels);
            } else resolve(undefined);
          };
          request.onerror = () => reject(request.error);
        });
      },
      write(key: string, pixels: Uint8Array) {
        overviewPendingBytes -= overviewWrites.get(key)?.byteLength ?? 0;
        overviewWrites.set(key, pixels);
        overviewPendingBytes += pixels.byteLength;
        if (overviewPendingBytes >= 8 * 1048576) return flush();
      }
    },
    /** Serial storage queue is independent from the drawing worker's command queue. */
    save(snapshot: SavedDocument) {
      const checkpoint = {
        ...snapshot,
        version: 3,
        overviewKeys: [...protectedOverviews],
        layers: snapshot.layers.map((layer) => ({
          ...layer,
          tiles: layer.tiles.map((tile) => ({ ...tile, pixels: capture(tile.pixels) }))
        }))
      };
      return flush(checkpoint);
    },
    /** Persists staged imports without replacing the current drawing checkpoint. */
    flush: () => flush(),

    async load() {
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('documents').objectStore('documents').get('current');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (value && typeof value === 'object' && 'overviewKeys' in value && Array.isArray(value.overviewKeys))
        protectedOverviews = new Set(value.overviewKeys.filter((key): key is string => typeof key === 'string'));
      return value === undefined ? undefined : restoreDocument(value);
    },
    /** Removes unreachable historical versions after a checkpoint; callers include live undo/redo references. */
    collect(live: Iterable<TileData>) {
      const keep = new Set([...live].flatMap((p) => (p instanceof Uint8Array ? [] : [p.storageId])));
      const task = queue
        .catch(() => {})
        .then(
          () =>
            new Promise<void>((resolve, reject) => {
              const tx = db.transaction(['tiles', 'documents', 'overviews', 'overviewIndex'], 'readwrite');
              const metadata = tx.objectStore('overviewIndex').getAll();
              const keys = tx.objectStore('overviewIndex').getAllKeys();
              const current = tx.objectStore('documents').get('current');
              current.onsuccess = () => {
                const saved = current.result as (SavedDocument & { overviewKeys?: string[] }) | undefined;
                const records = metadata.result as { bytes: number; touched: number }[];
                let total = records.reduce((sum, record) => sum + record.bytes, 0);
                const sorted = records
                  .map((record, i) => ({ ...record, key: keys.result[i]! }))
                  .sort((a, b) => a.touched - b.touched);
                for (const record of sorted) {
                  if (total <= 256 * 1048576) break;
                  if (protectedOverviews.has(String(record.key)) || saved?.overviewKeys?.includes(String(record.key)))
                    continue;
                  tx.objectStore('overviews').delete(record.key);
                  tx.objectStore('overviewIndex').delete(record.key);
                  overviewKeys.delete(record.key);
                  total -= record.bytes;
                }

                for (const layer of saved?.layers ?? [])
                  for (const tile of layer.tiles)
                    if (!(tile.pixels instanceof Uint8Array)) keep.add(tile.pixels.storageId);
                const request = tx.objectStore('tiles').openKeyCursor();
                request.onsuccess = () => {
                  const cursor = request.result;
                  if (!cursor) return;
                  if (!keep.has(String(cursor.key)) && !cache.get(String(cursor.key))?.dirty) {
                    tx.objectStore('tiles').delete(cursor.primaryKey);
                    const entry = cache.get(String(cursor.key));
                    if (entry) {
                      bytes -= entry.pixels.byteLength;
                      cache.delete(String(cursor.key));
                    }
                  }
                  cursor.continue();
                };
              };
              tx.oncomplete = () => resolve();
              tx.onerror = tx.onabort = () => reject(tx.error);
            })
        );
      queue = task;
      return task;
    },
    stats: () => ({
      ramBytes: bytes,
      dirtyBytes: [...cache.values()].reduce((n, e) => n + (e.dirty ? e.pixels.byteLength : 0), 0),
      reads,
      writes,
      pendingLoads: loading.size,
      overviewReads,
      overviewWrites: overviewSaved,
      overviewDirty: overviewWrites.size,
      overviewDirtyBytes: overviewPendingBytes
    }),
    async close() {
      await queue.catch(() => {});
      db.close();
    }
  };
}
