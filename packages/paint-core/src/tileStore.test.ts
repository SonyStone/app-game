import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { restoreDocument, snapshotDocument } from './storage';
import type { TileData } from './tilePixels';
import { createTileStore } from './tileStore';

it('keeps tiles captured while collection waits behind earlier saves', async () => {
  // A zero RAM budget evicts clean tiles, so the final read must come from IndexedDB.
  const store = await createTileStore('collect-race', 0);
  const pixels = new Uint8Array(256 * 256 * 4).fill(7);
  let live: TileData[] = [];

  const running = store.flush();
  const queued = store.flush();
  const collected = store.collect(() => live);
  const tile = store.capture(pixels);
  live = [tile];
  await Promise.all([running, queued, collected]);

  await expect(store.read(tile)).resolves.toEqual(pixels);
  await store.close();
});

it('removes tiles that no live reference or checkpoint uses', async () => {
  const store = await createTileStore('collect-unused', 0);
  const tile = store.capture(new Uint8Array(16).fill(1));
  await store.flush();

  await store.collect(() => []);

  await expect(store.read(tile)).rejects.toThrow('A saved tile could not be read.');
  await store.close();
});

it('persists navigation in the view record without rewriting the checkpoint or staged tiles', async () => {
  const store = await createTileStore('view-record');
  const document = restoreDocument(checkpoint({ x: 1, y: 2, zoom: 1, angle: 0, mirrored: false }));
  await store.save(snapshotDocument(document.layers, document.activeId, document.camera));
  const staged = store.capture(new Uint8Array(256 * 256 * 4).fill(3));

  await store.saveView({ x: 40, y: -8, zoom: 2, angle: 0.5, mirrored: true });

  expect(store.stats().dirtyBytes).toBe(256 * 256 * 4); // Navigation does not flush staged pixels.
  await store.close();
  const reopened = await createTileStore('view-record');
  const loaded = await reopened.load();
  expect(loaded?.camera).toEqual({ x: 40, y: -8, zoom: 2, angle: 0.5, mirrored: true });
  expect(loaded?.layers.map((layer) => layer.id)).toEqual(['layer-1']);
  await expect(reopened.read(staged)).rejects.toThrow();
  await reopened.close();
});

it('restores existing version 3 checkpoints that have no view record', async () => {
  const name = 'legacy-checkpoint';
  const legacy = { ...checkpoint({ x: 7, y: 9, zoom: 0.5, angle: 0, mirrored: false }), version: 3, overviewKeys: [] };
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onupgradeneeded = () => {
      for (const store of ['documents', 'tiles', 'overviews', 'overviewIndex']) request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      const tx = request.result.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(legacy, 'current');
      tx.oncomplete = () => {
        request.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });

  const store = await createTileStore(name);
  expect((await store.load())?.camera).toEqual({ x: 7, y: 9, zoom: 0.5, angle: 0, mirrored: false });

  // A later full checkpoint also refreshes the view record.
  const restored = (await store.load())!;
  await store.save(snapshotDocument(restored.layers, restored.activeId, { ...restored.camera, x: 11 }));
  await store.close();
  const reopened = await createTileStore(name);
  expect((await reopened.load())?.camera.x).toBe(11);
  await reopened.close();
});

it('keeps the checkpoint camera when the view record is malformed', async () => {
  const store = await createTileStore('malformed-view');
  const document = restoreDocument(checkpoint({ x: 3, y: 4, zoom: 1, angle: 0, mirrored: false }));
  await store.save(snapshotDocument(document.layers, document.activeId, document.camera));
  await store.saveView({ x: 0, y: 0, zoom: 1000, angle: 0, mirrored: false });

  expect((await store.load())?.camera).toEqual({ x: 3, y: 4, zoom: 1, angle: 0, mirrored: false });
  await store.close();
});

function checkpoint(camera: { x: number; y: number; zoom: number; angle: number; mirrored: boolean }) {
  return {
    version: 2,
    tileSize: 256,
    activeId: 'layer-1',
    camera,
    layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, opacity: 1, blend: 'normal', tiles: [] }]
  };
}

it('tracks unsaved bytes incrementally across capture and flush', async () => {
  const store = await createTileStore('dirty-bytes');
  store.capture(new Uint8Array(64).fill(1));
  const second = new Uint8Array(32).fill(2);
  store.capture(second);
  store.capture(second);
  expect(store.stats().dirtyBytes).toBe(96);

  await store.flush();

  expect(store.stats().dirtyBytes).toBe(0);
  await store.close();
});

it('rejects corrupt and truncated tile records instead of returning wrong pixels', async () => {
  const store = await createTileStore('corrupt-tiles', 0);
  const tile = store.capture(new Uint8Array(64).fill(5));
  const other = store.capture(new Uint8Array(64).fill(6));
  await store.flush();
  await store.close();
  await putRecords('corrupt-tiles', 'tiles', [
    [tile.storageId, new Uint8Array(32)],
    [other.storageId, 'not pixels']
  ]);

  const reopened = await createTileStore('corrupt-tiles', 0);
  await expect(reopened.read(tile)).rejects.toThrow('A saved tile could not be read.');
  await expect(reopened.read(other)).rejects.toThrow('A saved tile could not be read.');
  await reopened.close();
});

it('surfaces a corrupt checkpoint instead of opening an empty document', async () => {
  const valid = await createTileStore('corrupt-checkpoint');
  const document = restoreDocument(checkpoint({ x: 0, y: 0, zoom: 1, angle: 0, mirrored: false }));
  await valid.save(snapshotDocument(document.layers, document.activeId, document.camera));
  await valid.close();

  for (const corrupt of [
    { ...checkpoint({ x: 0, y: 0, zoom: 1, angle: 0, mirrored: false }), version: 3, activeId: 'missing' },
    { version: 3, layers: 'truncated' }
  ]) {
    await putRecords('corrupt-checkpoint', 'documents', [['current', corrupt]]);
    const store = await createTileStore('corrupt-checkpoint');
    await expect(store.load()).rejects.toThrow();
    await store.close();
  }
});

it('keeps the previous checkpoint and pinned pixels when a checkpoint transaction aborts, then retries', async () => {
  const name = 'aborted-checkpoint';
  const store = await createTileStore(name, 0);
  const first = restoreDocument(checkpoint({ x: 1, y: 1, zoom: 1, angle: 0, mirrored: false }));
  const firstPixels = new Uint8Array(256 * 256 * 4).fill(10);
  first.layers[0]!.tiles.set('0,0', firstPixels);
  await store.save(snapshotDocument(first.layers, first.activeId, first.camera));

  const secondPixels = new Uint8Array(256 * 256 * 4).fill(20);
  first.layers[0]!.tiles.set('1,0', secondPixels);
  const second = snapshotDocument(first.layers, first.activeId, { ...first.camera, x: 2 });
  // Storage quota is enforced by aborting the write transaction; nothing it wrote may become visible.
  const restore = abortNextWriteTransaction();
  try {
    await expect(store.save(second)).rejects.toThrow('Tile checkpoint failed.');
  } finally {
    restore();
  }

  expect(store.stats().dirtyBytes).toBe(secondPixels.byteLength);
  const afterFailure = await createTileStore(name, 0);
  const previous = (await afterFailure.load())!;
  expect(previous.camera.x).toBe(1);
  expect([...previous.layers[0]!.tiles.keys()]).toEqual(['0,0']);
  await expect(afterFailure.read(previous.layers[0]!.tiles.get('0,0')!)).resolves.toEqual(firstPixels);
  await afterFailure.close();

  await store.save(second);
  expect(store.stats().dirtyBytes).toBe(0);
  await store.close();
  const reopened = await createTileStore(name, 0);
  const saved = (await reopened.load())!;
  expect(saved.camera.x).toBe(2);
  await expect(reopened.read(saved.layers[0]!.tiles.get('1,0')!)).resolves.toEqual(secondPixels);
  await reopened.close();
});

/** Writes raw records, bypassing the store, to model corruption or a partial write from another version. */
async function putRecords(name: string, store: string, records: [IDBValidKey, unknown][]) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    for (const [key, value] of records) tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Aborts the next read-write transaction after its requests are issued, as the browser does when quota is exceeded. */
function abortNextWriteTransaction() {
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
    const tx = transaction.apply(this, args);

    if (args[1] === 'readwrite') {
      IDBDatabase.prototype.transaction = transaction;
      queueMicrotask(() => tx.abort());
    }

    return tx;
  } as IDBDatabase['transaction'];
  return () => {
    IDBDatabase.prototype.transaction = transaction;
  };
}
