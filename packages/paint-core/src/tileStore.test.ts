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
