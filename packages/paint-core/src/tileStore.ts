import { createTaskQueue, unwrapResult } from './asyncResult';
import type { Camera } from './camera';
import { openDrawingFolder, type DrawingFolder } from './drawingFolder';
import { restoreDocument, restoreView, snapshotView, type SavedDocument } from './storage';
import { compressTile, restoreTile } from './tileCodec';
import { type TileData, type TileReference } from './tilePixels';

/** Immutable tile versions in IndexedDB with a bounded RAM cache.
 * Dirty bytes remain pinned until their transaction succeeds. Checkpoints atomically publish their versions.
 * Tiles and overviews are stored compressed (`compressTile`); the cache and every reader see packed pixels.
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
    // Running total of pinned (unsaved) bytes; status reads it every frame.
    dirtyBytes = 0,
    reads = 0,
    writes = 0;
  const queue = createTaskQueue();
  /**
   * The folder the drawing is kept in, if any: checkpoints are mirrored there (`mirror`) and versions missing from
   * IndexedDB are read from it. `granted` settles once the browser allows reading and writing it; `mirroring` is off
   * once another drawing replaced the one in the folder, which can then still be read for this session.
   */
  let folder:
    | {
        files: DrawingFolder;
        access: 'granted' | 'prompt';
        granted: Promise<void>;
        grant: () => void;
        mirroring: boolean;
        /** Ids of the versions in the folder, listed on first use. */
        known?: Set<string>;
        /** Versions still to be written for the latest checkpoint. */
        pending: number;
        /** Whether the folder holds this drawing yet: after the first checkpoint written there, or when opened from it. */
        written: boolean;
        error?: string;
      }
    | undefined;
  let mirrorTarget: object | undefined;
  let pruneCandidates: Set<string> | undefined;
  let mirroring: Promise<void> | undefined;
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
    if (old) {
      bytes -= old.pixels.byteLength;
      if (old.dirty) dirtyBytes -= old.pixels.byteLength;
    }
    cache.delete(id);
    cache.set(id, { pixels, dirty });
    bytes += pixels.byteLength;
    if (dirty) dirtyBytes += pixels.byteLength;
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
    const promise = new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('tiles').objectStore('tiles').get(data.storageId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })
      .then(async (record) => {
        const stored = record instanceof Uint8Array ? record : await fromFolder(data.storageId);
        const pixels = stored ? await restoreTile(stored) : undefined;
        if (!pixels || pixels.byteLength !== data.byteLength) {
          throw new Error('A saved tile could not be read.');
        }

        reads++;
        remember(data.storageId, pixels, false);
        return pixels;
      })
      .finally(() => loading.delete(data.storageId));
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
  const flush = (checkpoint?: { camera: Camera }) => {
    const task = queue.run(async () => {
      const dirty = [...cache].filter(([, entry]) => entry.dirty);
      const derived = [...overviewWrites];
      // Compressed before the transaction opens: one left waiting for other work commits early.
      const storedTiles = await compressAll(dirty.map(([, entry]) => entry.pixels));
      const storedOverviews = await compressAll(derived.map(([, pixels]) => pixels));
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['tiles', 'documents', 'overviews', 'overviewIndex'], 'readwrite');
        dirty.forEach(([id], index) => tx.objectStore('tiles').put(storedTiles[index], id));
        derived.forEach(([key], index) => {
          const stored = storedOverviews[index]!;
          tx.objectStore('overviews').put(stored, key);
          tx.objectStore('overviewIndex').put({ bytes: stored.byteLength, touched: Date.now() }, key);
        });
        if (checkpoint) {
          tx.objectStore('documents').put(checkpoint, 'current');
          tx.objectStore('documents').put(snapshotView(checkpoint.camera), 'view');
          // A checkpoint of a drawing no longer kept in a folder no longer needs it after a restart.
          if (!folder?.mirroring) {
            tx.objectStore('documents').delete('folder');
          }
        }
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Tile checkpoint failed.'));
      });
      for (const [id, saved] of dirty) {
        const entry = cache.get(id);
        if (entry === saved && entry.dirty) {
          entry.dirty = false;
          dirtyBytes -= entry.pixels.byteLength;
        }
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
      if (checkpoint && folder?.mirroring) {
        mirror(checkpoint);
      }
    });
    return task.then(unwrapResult);
  };
  /** The stored bytes of version `id` from the folder, once it may be read; `undefined` without one. */
  const fromFolder = async (id: string) => {
    const link = folder;
    if (!link) {
      return undefined;
    }

    await link.granted;
    return link.files.readTile(id).catch(() => undefined);
  };
  /** The stored bytes of version `id` from RAM or IndexedDB, compressed for the folder. */
  const storedTile = async (id: string) => {
    const cached = cache.get(id);
    if (cached) {
      return compressTile(cached.pixels);
    }

    const record = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('tiles').objectStore('tiles').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return record instanceof Uint8Array ? record : undefined;
  };
  /** Whether IndexedDB holds version `id`. */
  const savedInDatabase = (id: string) =>
    new Promise<boolean>((resolve, reject) => {
      const request = db.transaction('tiles').objectStore('tiles').getKey(id);
      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => reject(request.error);
    });
  /**
   * Mirrors `checkpoint` into the folder after it is saved in IndexedDB, in the background: the versions the folder
   * lacks, then `drawing.json`, so the folder always holds a complete drawing. Only the latest checkpoint waiting is
   * written; versions no drawing or history needs any more (`collect`) are removed in between.
   */
  const mirror = (checkpoint?: object) => {
    if (checkpoint) {
      mirrorTarget = checkpoint;
    }

    mirroring ??= runMirror().finally(() => {
      mirroring = undefined;
    });
  };
  const runMirror = async () => {
    while (folder?.mirroring && (mirrorTarget || pruneCandidates)) {
      const link = folder;
      try {
        await link.granted;
        link.known ??= await link.files.listTiles();
        const known = link.known;
        const target = mirrorTarget;
        mirrorTarget = undefined;
        if (target) {
          const missing = [...new Set(checkpointTiles(target))].filter((id) => !known.has(id));
          link.pending = missing.length;
          for (let start = 0; start < missing.length; start += folderBatch) {
            await Promise.all(
              missing.slice(start, start + folderBatch).map(async (id) => {
                const stored = await storedTile(id);
                if (!stored) {
                  throw new Error('A tile of the drawing could not be copied to its folder.');
                }

                await link.files.writeTile(id, stored);
                known.add(id);
                link.pending--;
              })
            );
          }

          await link.files.writeDrawing(target);
          link.written = true;
        } else {
          const candidates = pruneCandidates!;
          pruneCandidates = undefined;
          for (const id of candidates) {
            await link.files.deleteTile(id);
            known.delete(id);
          }
        }

        link.error = undefined;
      } catch (error) {
        link.error = error instanceof Error ? error.message : String(error);
        return;
      }
    }
  };
  /** Starts keeping the drawing in `directory`: `granted` once the browser allows it, persisted for restarts. */
  const linkFolder = (files: DrawingFolder, access: 'granted' | 'prompt', written: boolean, known?: Set<string>) => {
    let grant!: () => void;
    const granted = new Promise<void>((resolve) => (grant = resolve));
    folder = { files, access, granted, grant, mirroring: true, known, pending: 0, written };
    if (access === 'granted') {
      grant();
    }
  };
  const persistFolder = (directory: FileSystemDirectoryHandle) =>
    queue
      .run(
        () =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put({ directory }, 'folder');
            tx.oncomplete = () => resolve();
            tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Linking the folder failed.'));
          })
      )
      .then(unwrapResult);
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
        const stored = await new Promise<unknown>((resolve, reject) => {
          const request = db.transaction('overviews').objectStore('overviews').get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (!(stored instanceof Uint8Array)) {
          return undefined;
        }

        overviewReads++;
        return restoreTile(stored);
      },
      write(key: string, pixels: Uint8Array) {
        overviewPendingBytes -= overviewWrites.get(key)?.byteLength ?? 0;
        overviewWrites.set(key, pixels);
        overviewPendingBytes += pixels.byteLength;
        if (overviewPendingBytes >= 8 * 1048576) return flush();
      }
    },
    /** Serial storage queue is independent from the drawing worker's command queue.
     * Rejects failed transactions; dirty pixels stay pinned for a later retry.
     */
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
    /** Persists staged imports without replacing the current drawing checkpoint. Rejects failed transactions. */
    flush: () => flush(),
    /** Persists only the camera, without staged tiles or the tile list. Ordered with checkpoints; `load` prefers it. */
    saveView(camera: Camera) {
      const task = queue.run(
        () =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put(snapshotView(camera), 'view');
            tx.oncomplete = () => resolve();
            tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Saving the view failed.'));
          })
      );
      return task.then(unwrapResult);
    },

    /** Restores the checkpoint, with the newer camera from the separate view record when one is valid. */
    async load() {
      const [value, view] = await new Promise<[unknown, unknown]>((resolve, reject) => {
        const store = db.transaction('documents').objectStore('documents');
        const current = store.get('current');
        const view = store.get('view');
        view.onsuccess = () => resolve([current.result, view.result]);
        current.onerror = view.onerror = () => reject(current.error ?? view.error);
      });
      if (value && typeof value === 'object' && 'overviewKeys' in value && Array.isArray(value.overviewKeys))
        protectedOverviews = new Set(value.overviewKeys.filter((key): key is string => typeof key === 'string'));
      if (value === undefined) {
        return undefined;
      }

      const link = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('documents').objectStore('documents').get('folder');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (link && typeof link === 'object' && 'directory' in link && isDirectory(link.directory)) {
        linkFolder(openDrawingFolder(link.directory), await folderAccess(link.directory), true);
      }

      const document = restoreDocument(value);
      return { ...document, camera: restoreView(view) ?? document.camera };
    },
    /** Removes unreachable historical versions after a checkpoint.
     * `live` returns current, undo/redo and clipboard references. It is read when the queued collection
     * starts, so tiles captured while earlier saves were pending stay protected.
     */
    collect(live: () => Iterable<TileData>) {
      const task = queue.run(
        () =>
          new Promise<void>((resolve, reject) => {
            const keep = new Set<string>();
            for (const tile of live()) {
              const id = tile instanceof Uint8Array ? identities.get(tile)?.storageId : tile.storageId;
              if (id) {
                keep.add(id);
              }
            }

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
            tx.oncomplete = () => {
              // Versions in the folder that neither the saved drawing nor its history refers to go too.
              const known = folder?.mirroring ? folder.known : undefined;
              if (known) {
                pruneCandidates = new Set([...known].filter((id) => !keep.has(id)));
                mirror();
              }

              resolve();
            };
            tx.onerror = tx.onabort = () => reject(tx.error);
          })
      );
      return task.then(unwrapResult);
    },
    /**
     * Keeping the drawing in a folder on disk; see `openDrawingFolder`. The folder is linked until another drawing
     * replaces this one (`detach`) or `unlink`, also across restarts, when the browser may ask again for access.
     */
    folder: {
      /** Starts keeping the current drawing in `directory`; the next checkpoint writes it there. */
      async save(directory: FileSystemDirectoryHandle) {
        linkFolder(openDrawingFolder(directory), 'granted', false);
        await persistFolder(directory);
      },
      /**
       * Opens the drawing kept in `directory`, linked to it; its versions stay in the folder and are read from it.
       * Throws when the folder holds no drawing or misses some of its tiles.
       */
      async open(directory: FileSystemDirectoryHandle) {
        const files = openDrawingFolder(directory);
        const value = await files.readDrawing();
        const document = restoreDocument(value);
        const known = await files.listTiles();
        if (checkpointTiles(value).some((id) => !known.has(id))) {
          throw new Error('The drawing in this folder is missing some of its tiles.');
        }

        linkFolder(files, 'granted', true, known);
        await persistFolder(directory);
        return document;
      },
      /** Another drawing replaced the one in the folder: stops writing to it, still reading it for this session. */
      detach() {
        if (folder) {
          folder.mirroring = false;
        }
      },
      /**
       * Stops keeping the drawing in its folder. Versions that `live`, the drawing and its history, still needs and that
       * are only in the folder are first copied into IndexedDB, so it throws while the browser does not allow the folder.
       */
      async unlink(live: () => Iterable<TileData>) {
        const link = folder;
        if (!link) {
          return;
        }

        if (link.access !== 'granted') {
          throw new Error('Allow access to the folder first: the drawing needs tiles kept only there.');
        }

        link.mirroring = false;
        const task = queue.run(async () => {
          const ids = new Set<string>();
          for (const tile of live()) {
            if (!(tile instanceof Uint8Array)) {
              ids.add(tile.storageId);
            }
          }

          const copies: [string, Uint8Array][] = [];
          for (const id of ids) {
            if (!cache.get(id)?.dirty && !(await savedInDatabase(id))) {
              copies.push([id, await link.files.readTile(id)]);
            }
          }

          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['tiles', 'documents'], 'readwrite');
            for (const [id, stored] of copies) tx.objectStore('tiles').put(stored, id);
            tx.objectStore('documents').delete('folder');
            tx.oncomplete = () => resolve();
            tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Unlinking the folder failed.'));
          });
          if (folder === link) {
            folder = undefined;
          }
        });
        return task.then(unwrapResult);
      },
      /** Checks again whether the browser allows the folder, after the user was asked; reads waiting on it resume. */
      async access() {
        const link = folder;
        if (link && (await folderAccess(link.files.directory)) === 'granted') {
          link.access = 'granted';
          link.grant();
          mirror();
        }
      },
      /** Settles when the folder holds the latest checkpoint, or mirroring stopped on a failure (`status`). */
      idle: () => mirroring ?? Promise.resolve(),
      /**
       * The linked folder: its name, whether the browser allows it yet, whether it is being written and how many versions
       * are left to write for the latest checkpoint, and the last failure.
       */
      status: () =>
        folder?.mirroring
          ? {
              name: folder.files.name,
              access: folder.access,
              writing: mirroring !== undefined || !folder.written,
              pending: folder.pending,
              ...(folder.error ? { error: folder.error } : {})
            }
          : undefined
    },
    stats: () => ({
      ramBytes: bytes,
      dirtyBytes,
      reads,
      writes,
      pendingLoads: loading.size,
      overviewReads,
      overviewWrites: overviewSaved,
      overviewDirty: overviewWrites.size,
      overviewDirtyBytes: overviewPendingBytes
    }),
    /** Closes after queued work. Returns its final outcome so shutdown can report write failures. */
    async close() {
      const result = await queue.drain();
      db.close();
      return result;
    }
  };
}

/**
 * The folder the drawing in storage `name` is kept in, if any, for the page to ask the user again for access to it
 * (`requestPermission` needs a click, which a worker cannot have). Reads the same record as the tile store.
 */
export async function readLinkedFolder(name: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains('documents')) {
      return undefined;
    }

    const link = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get('folder');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return link && typeof link === 'object' && 'directory' in link && isDirectory(link.directory)
      ? link.directory
      : undefined;
  } finally {
    db.close();
  }
}

/** The version ids a saved checkpoint refers to. */
function checkpointTiles(checkpoint: unknown): string[] {
  const layers = (checkpoint as { layers?: { tiles?: { pixels?: unknown }[] }[] }).layers ?? [];
  return layers.flatMap((layer) =>
    (layer.tiles ?? []).flatMap(({ pixels }) =>
      pixels && typeof pixels === 'object' && 'storageId' in pixels && typeof pixels.storageId === 'string'
        ? [pixels.storageId]
        : []
    )
  );
}

/** Whether the browser lets the editor read and write `directory` now, without asking. */
async function folderAccess(directory: FileSystemDirectoryHandle): Promise<'granted' | 'prompt'> {
  // Folders of the origin private file system have no permissions to ask for.
  const query = (directory as { queryPermission?: (options: object) => Promise<PermissionState> }).queryPermission;
  return !query || (await query.call(directory, { mode: 'readwrite' })) === 'granted' ? 'granted' : 'prompt';
}

/** Whether a value read back from IndexedDB is a directory handle. */
function isDirectory(value: unknown): value is FileSystemDirectoryHandle {
  return typeof FileSystemDirectoryHandle !== 'undefined' && value instanceof FileSystemDirectoryHandle;
}

/** Folder files written at once while mirroring. */
const folderBatch = 8;

/** Compresses tiles for storage a few at a time, in order. */
async function compressAll(tiles: Uint8Array[]): Promise<Uint8Array[]> {
  const stored: Uint8Array[] = [];
  for (let start = 0; start < tiles.length; start += compressBatch) {
    stored.push(...(await Promise.all(tiles.slice(start, start + compressBatch).map(compressTile))));
  }

  return stored;
}

/** Tiles compressed at once while saving. */
const compressBatch = 16;
