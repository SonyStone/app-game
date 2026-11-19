import type { BrushResource } from '@app-game/abr-paint/resources';
import { normalizeStrokeSettings } from '@app-game/paint-core/strokeSettings';
import { onCleanup } from 'solid-js';
import { brushError, type PaintError } from '../../shared/errors';
import type { BrushPreset } from './brushPresets';

/**
 * Stores the user's brush presets and the brush tool state in IndexedDB. Preset settings and their images are stored
 * separately, so that the editor can start by reading only the presets in use and their images, and list presets
 * without reading any image. An image shared by several presets is stored once and deleted with its last preset.
 *
 * Values are stored by structured clone, so engine settings and image bytes survive unchanged. Writes run in call
 * order; consecutive state writes coalesce to the latest value, so writing on every slider step costs at most one
 * pending write. Storage failures are reported once through `onError` and leave the editor working with unsaved
 * brushes; a browser without IndexedDB stores nothing. Must be created within a Solid owner; the database closes
 * after pending writes when the owner is disposed.
 */
export function createBrushStorage(options: {
  /** Database name; tests use their own. Default `paint-brushes`. */
  name?: string;
  onError: (error: PaintError) => void;
}) {
  const opened = openDatabase(options.name ?? 'paint-brushes').catch((cause: unknown) => {
    fail('Brushes cannot be saved on this device.', cause);
    return undefined;
  });
  /** The last queued write; each write starts after the previous one settles. */
  let queue: Promise<unknown> = Promise.resolve();
  let pendingState: { value: unknown } | undefined;
  let failed = false;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    void queue.then(() => opened).then((database) => database?.close());
  });

  return {
    /** The last written tool state, or `undefined`. Callers validate it: it may come from an older Paint. */
    readState(): Promise<unknown> {
      return read('Saved brush settings could not be read.', undefined, (database) =>
        request(database.transaction('state').objectStore('state').get(stateKey))
      );
    },
    /** Replaces the stored tool state; a write still waiting in the queue takes the newer value instead. */
    writeState(value: unknown) {
      if (pendingState) {
        pendingState.value = value;
        return;
      }

      const pending = { value };
      pendingState = pending;
      void write(['state'], (transaction) => {
        pendingState = undefined;
        transaction.objectStore('state').put(pending.value, stateKey);
      });
    },
    /** One stored preset, without reading any image; `undefined` when it does not exist. */
    readPreset(id: string): Promise<StoredPreset | undefined> {
      return read('A saved brush could not be read.', undefined, async (database) => {
        const record = await request(database.transaction('presets').objectStore('presets').get(id));
        return isStoredPreset(record) ? restorePreset(record) : undefined;
      });
    },
    /** Every stored preset in creation order, without reading any image. */
    readPresets(): Promise<StoredPreset[]> {
      return read('Saved brushes could not be read.', [], async (database) => {
        const records = await request<unknown[]>(database.transaction('presets').objectStore('presets').getAll());
        return records
          .filter(isStoredPreset)
          .map(restorePreset)
          .sort((left, right) => left.created - right.created);
      });
    },
    /** The stored images with `ids`, in order; `undefined` when any of them is missing or cannot be read. */
    readResources(ids: readonly string[]): Promise<BrushResource[] | undefined> {
      return read('Brush images could not be read.', undefined, async (database) => {
        const store = database.transaction('resources').objectStore('resources');
        const resources = await Promise.all(ids.map((id) => request<unknown>(store.get(id))));
        return resources.every(isResource) ? resources : undefined;
      });
    },
    /**
     * Adds or replaces a preset together with images it uses that are not stored yet, in one transaction. Resolves
     * whether the write succeeded. A migration also checks that the legacy record still exists and is current.
     */
    async putPreset(
      preset: StoredPreset,
      resources: readonly BrushResource[] = [],
      legacy?: StoredPreset
    ): Promise<boolean> {
      let current = true;
      const committed = await write(['presets', 'resources'], async (transaction) => {
        const presets = transaction.objectStore('presets');
        const old = await request<unknown>(presets.get(preset.id));
        if (
          legacy &&
          (!isStoredPreset(old) ||
            old.abrDocument ||
            old.nativeDocument ||
            old.sampledDocument ||
            !!old.abrSource !== !!legacy.abrSource ||
            old.name !== legacy.name ||
            old.created !== legacy.created ||
            JSON.stringify(old.resourceIds) !== JSON.stringify(legacy.resourceIds) ||
            JSON.stringify(restorePreset(old).settings) !== JSON.stringify(legacy.settings))
        ) {
          current = false;
          return;
        }
        presets.put(preset);
        for (const resource of resources) {
          transaction.objectStore('resources').put(resource, resource.id);
        }
        await releaseUnused(transaction, old, preset);
      });
      return committed && current;
    },
    /** Commits an imported set and all its native tip images in one transaction. */
    putPresets(presets: readonly StoredPreset[], resources: readonly BrushResource[]) {
      return write(['presets', 'resources'], (transaction) => {
        for (const preset of presets) {
          transaction.objectStore('presets').add(preset);
        }
        for (const resource of resources) {
          transaction.objectStore('resources').put(resource, resource.id);
        }
      });
    },
    /** Deletes a preset and the images no other preset uses. */
    deletePreset(id: string) {
      void write(['presets', 'resources'], async (transaction) => {
        const presets = transaction.objectStore('presets');
        const deleted = await request<unknown>(presets.get(id));
        presets.delete(id);
        await releaseUnused(transaction, deleted);
      });
    },
    /** Resolves when the writes queued so far have finished, whether or not they succeeded. */
    async idle(): Promise<void> {
      await queue;
    }
  };

  async function read<T>(message: string, fallback: T, reading: (database: IDBDatabase) => Promise<T>): Promise<T> {
    const database = await opened;
    if (!database) {
      return fallback;
    }

    try {
      return await reading(database);
    } catch (cause) {
      fail(message, cause);
      return fallback;
    }
  }

  /** Queues a write transaction; `change` may await requests of its own transaction. Resolves whether it committed. */
  function write(stores: StoreName[], change: (transaction: IDBTransaction) => void | Promise<void>): Promise<boolean> {
    const written = queue.then(async () => {
      const database = await opened;
      if (!database || failed) {
        return false;
      }

      try {
        const transaction = database.transaction(stores, 'readwrite');
        const committed = completion(transaction);
        // An abort below rejects `committed` too; the cause is reported instead.
        committed.catch(() => undefined);
        try {
          await change(transaction);
        } catch (cause) {
          transaction.abort();
          throw cause;
        }

        await committed;
        return true;
      } catch (cause) {
        fail('Brush changes could not be saved on this device.', cause);
        return false;
      }
    });
    queue = written;
    return written;
  }

  /** Reports the first storage failure; later writes are skipped, since they would fail the same way. */
  function fail(message: string, cause: unknown) {
    if (failed || disposed) {
      return;
    }

    failed = true;
    options.onError(brushError('storage', message, cause));
  }
}

/** Brush storage of one editor; see {@link createBrushStorage}. */
export type BrushStorage = ReturnType<typeof createBrushStorage>;

/** A stored user preset; `created` orders presets and is kept when a preset is replaced. */
export type StoredPreset = BrushPreset & {
  created: number;
  /** Migration projection beside the original settings and image ids for older readers. */
  sampledDocument?: Pick<BrushPreset, 'abrDocument' | 'settings' | 'resourceIds' | 'assetIds'>;
};

type StoreName = 'presets' | 'resources' | 'state';

const stateKey = 'tools';

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }

  const opening = indexedDB.open(name, 2);
  opening.onupgradeneeded = () => {
    const database = opening.result;
    // Version 1 stored images inside presets; it never shipped, so its stores are replaced rather than migrated.
    for (const store of Array.from(database.objectStoreNames)) {
      database.deleteObjectStore(store);
    }

    database.createObjectStore('presets', { keyPath: 'id' });
    database.createObjectStore('resources');
    database.createObjectStore('state');
  };
  return request<IDBDatabase>(opening).then((database) => {
    // Another tab upgrading the schema must not wait for this one.
    database.onversionchange = () => database.close();
    return database;
  });
}

function request<T>(pending: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.onsuccess = () => resolve(pending.result as T);
    pending.onerror = () => reject(pending.error);
  });
}

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('The brush storage transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error);
  });
}

/** A record written by `putPreset`; other values are skipped. */
/** Reads only the stroke settings supported by this version of Paint. */
function restorePreset(preset: StoredPreset): StoredPreset {
  if (preset.settings.stroke) {
    preset.settings.stroke = normalizeStrokeSettings(preset.settings.stroke);
  }

  return preset;
}

function isStoredPreset(value: unknown): value is StoredPreset {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.created === 'number' &&
    typeof record.settings === 'object' &&
    record.settings !== null &&
    Array.isArray(record.resourceIds) &&
    record.resourceIds.every((id) => typeof id === 'string')
  );
}

function isResource(value: unknown): value is BrushResource {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && ArrayBuffer.isView(record.pixels);
}

async function releaseUnused(transaction: IDBTransaction, deleted: unknown, replacement?: StoredPreset) {
  if (!isStoredPreset(deleted)) {
    return;
  }
  const retained = new Set(replacement && storedImages(replacement));
  const discarded = storedImages(deleted).filter((id) => !retained.has(id));
  if (!discarded.length) {
    return;
  }
  const remaining = await request<unknown[]>(transaction.objectStore('presets').getAll());
  const used = new Set(remaining.filter(isStoredPreset).flatMap(storedImages));
  for (const resource of discarded) {
    if (!used.has(resource)) {
      transaction.objectStore('resources').delete(resource);
    }
  }
}

/** Includes the original image ids used by older readers and the migrated projection's digests. */
function storedImages(preset: StoredPreset) {
  const migrated = preset.sampledDocument;
  return [
    ...preset.resourceIds,
    ...(preset.assetIds ?? []),
    ...(migrated?.assetIds ?? []),
    ...(migrated?.resourceIds ?? [])
  ];
}
