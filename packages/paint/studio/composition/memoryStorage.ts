import { restoreDocument } from '../storage';
import type { TileData, TileReference } from '../tilePixels';
import type { PaintStorage, StorageFactory } from './contracts';

/** Volatile storage for scratchpads and isolated tests. Reopening a name through this factory restores it.
 * Data disappears with the factory, so this adapter is not a durable browser autosave replacement.
 * Captured bytes and checkpoints are copied; collection retains the checkpoint plus live history.
 */
export function createMemoryStorage(): StorageFactory {
  const documents = new Map<string, ReturnType<typeof createMemoryDocument>>();
  return async (name) => {
    let document = documents.get(name);
    if (!document) documents.set(name, (document = createMemoryDocument()));
    let closed = false;
    const check = () => {
      if (closed) throw new Error('Memory storage is closed.');
    };
    const capture: PaintStorage['capture'] = (data) => {
      check();
      if (!(data instanceof Uint8Array)) {
        if (!document.tiles.has(data.storageId)) throw new Error('Unknown memory tile reference.');
        return data;
      }
      const existing = document.identities.get(data);
      if (existing && document.tiles.has(existing.storageId)) return existing;
      const ref = { storageId: crypto.randomUUID(), byteLength: data.byteLength };
      document.identities.set(data, ref);
      document.tiles.set(ref.storageId, data.slice());
      return ref;
    };
    return {
      capture,
      async read(data) {
        check();
        if (data instanceof Uint8Array) return data;
        const pixels = document.tiles.get(data.storageId);
        if (!pixels || pixels.byteLength !== data.byteLength) throw new Error('A memory tile could not be read.');
        return pixels.slice();
      },
      async load() {
        check();
        return document.checkpoint ? restoreDocument(structuredClone(document.checkpoint)) : undefined;
      },
      async save(snapshot) {
        check();
        const checkpoint = structuredClone({
          ...snapshot,
          version: 3,
          layers: snapshot.layers.map((layer) => ({
            ...layer,
            tiles: layer.tiles.map((tile) => ({ ...tile, pixels: capture(tile.pixels) }))
          }))
        });
        // Validate completely before publishing a replacement checkpoint.
        restoreDocument(checkpoint);
        document.checkpoint = checkpoint;
        document.savedOverviews = new Set(document.retained);
      },
      async flush() {
        check();
      },
      async collect(live) {
        check();
        const keep = new Set<string>();
        const retain = (tile: TileData) => {
          if (!(tile instanceof Uint8Array)) keep.add(tile.storageId);
        };
        for (const tile of live) retain(tile);
        for (const layer of document.checkpoint?.layers ?? []) for (const tile of layer.tiles) retain(tile.pixels);
        for (const id of document.tiles.keys()) if (!keep.has(id)) document.tiles.delete(id);
        for (const key of document.overviews.keys())
          if (!document.retained.has(key) && !document.savedOverviews.has(key)) document.overviews.delete(key);
      },
      overviews: {
        retain(keys) {
          check();
          document.retained = new Set(keys);
        },
        async read(key) {
          check();
          return document.overviews.get(key)?.slice();
        },
        write(key, pixels) {
          check();
          document.overviews.set(key, pixels.slice());
        }
      },
      stats: () => ({
        ramBytes: [...document.tiles.values(), ...document.overviews.values()].reduce(
          (sum, pixels) => sum + pixels.byteLength,
          0
        ),
        dirtyBytes: 0,
        reads: 0,
        writes: 0,
        pendingLoads: 0,
        overviewReads: 0,
        overviewWrites: 0,
        overviewDirty: 0,
        overviewDirtyBytes: 0
      }),
      async close() {
        closed = true;
        return { ok: true, value: undefined };
      }
    } satisfies PaintStorage;
  };
}

function createMemoryDocument() {
  return {
    tiles: new Map<string, Uint8Array>(),
    identities: new WeakMap<Uint8Array, TileReference>(),
    overviews: new Map<string, Uint8Array>(),
    retained: new Set<string>(),
    savedOverviews: new Set<string>(),
    checkpoint: undefined as (Omit<import('../storage').SavedDocument, 'version'> & { version: number }) | undefined
  };
}
