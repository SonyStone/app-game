import { describe, it, expect } from 'vitest';
import { createVirtualPages } from './virtualPages';
import { createDocument } from './document';
import { defaultCamera } from './camera';
import { unpackTile } from './tilePixels';

it('combines four children, including negative tile coordinates, and refreshes after undo', async () => {
  const doc = createDocument();
  const page = { layerId: doc.active.id, level: 1, x: -1, y: -1 };
  const pyramid = createVirtualPages(async (data) => unpackTile(data));
  doc.commit(
    ['-2,-2', '-1,-2', '-2,-1', '-1,-1'].map((key, i) => ({
      layerId: doc.active.id,
      key,
      before: undefined,
      after: new Uint8Array(256 * 256 * 4).fill(40 + i * 40)
    }))
  );
  pyramid.sync(doc.layers);
  const pixels = await pyramid.pagePixels(page);
  expect([pixels[0], pixels[128 * 4], pixels[128 * 256 * 4], pixels[(128 * 256 + 128) * 4]]).toEqual([
    40, 80, 120, 160
  ]);
  doc.undo();
  pyramid.sync(doc.layers);
  expect((await pyramid.pagePixels(page)).every((x) => x === 0)).toBe(true);
  doc.redo();
  pyramid.sync(doc.layers);
  expect(await pyramid.pagePixels(page)).toEqual(pixels);
});
it('uses real neighboring pixels in gutters and invalidates them after a neighboring edit', async () => {
  const doc = createDocument(),
    pyramid = createVirtualPages(async (data) => unpackTile(data));
  const a = new Uint8Array(262144).fill(30),
    b = new Uint8Array(262144).fill(180);
  doc.commit([
    { layerId: doc.active.id, key: '0,0', before: undefined, after: a },
    { layerId: doc.active.id, key: '1,0', before: undefined, after: b }
  ]);
  pyramid.sync(doc.layers);
  const page = { layerId: doc.active.id, level: 0, x: 0, y: 0 };
  const old = pyramid.token(page);
  const pixels = await pyramid.bordered(page);
  expect(pixels[(258 + 256) * 4]).toBe(30);
  expect(pixels[(258 + 257) * 4]).toBe(180);
  doc.commit([{ layerId: doc.active.id, key: '1,0', before: b, after: undefined }]);
  pyramid.sync(doc.layers);
  expect(pyramid.token(page)).not.toBe(old);
  expect((await pyramid.bordered(page))[(258 + 257) * 4]).toBe(0);
});
it('selects a bounded set of overview pages instead of all occupied source tiles', () => {
  const doc = createDocument(),
    pixels = new Uint8Array(262144).fill(255);
  for (let x = -16; x < 16; x++) for (let y = -16; y < 16; y++) doc.active.tiles.set(`${x},${y}`, pixels);
  const pyramid = createVirtualPages(async (data) => unpackTile(data));
  pyramid.sync(doc.layers);
  const selected = pyramid.visible(doc.active.id, { ...defaultCamera(), zoom: 0.05 }, { width: 512, height: 512 }, 1);
  expect(selected).toHaveLength(4);
  expect(selected.every((page) => page.level === 4)).toBe(true);
});

it('does not reuse pixels from a deleted layer when the same ID is restored', async () => {
  const doc = createDocument();
  const pyramid = createVirtualPages(async (data) => unpackTile(data));
  doc.active.tiles.set('0,0', new Uint8Array(262144).fill(30));
  pyramid.sync(doc.layers);
  const page = { layerId: doc.active.id, level: 0, x: 0, y: 0 };
  expect((await pyramid.pagePixels(page))[0]).toBe(30);
  pyramid.sync([]);
  doc.active.tiles.set('0,0', new Uint8Array(262144).fill(180));
  pyramid.sync(doc.layers);
  expect((await pyramid.pagePixels(page))[0]).toBe(180);
});

it('coarsens a large viewport to fit the shared GPU page budget', () => {
  const doc = createDocument();
  const pixel = new Uint8Array(262144);
  for (let x = -400; x <= 400; x += 100)
    for (let y = -400; y <= 400; y += 100) doc.active.tiles.set(`${x},${y}`, pixel);
  const pyramid = createVirtualPages(async (data) => unpackTile(data));
  pyramid.sync(doc.layers);
  expect(
    pyramid.visible(doc.active.id, { ...defaultCamera(), zoom: 0.05 }, { width: 8000, height: 4000 }, 1, 4).length
  ).toBeLessThanOrEqual(4);
});

it('reloads stored low resolution without reading high resolution, then rebuilds only edited ancestors', async () => {
  const doc = createDocument({ paged: true });
  const raw = new Uint8Array(262144).fill(40);
  const sources = new Map<string, Uint8Array>();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ref = { storageId: crypto.randomUUID(), byteLength: raw.byteLength };
      doc.active.tiles.set(`${x},${y}`, ref);
      sources.set(ref.storageId, raw);
    }
  const stored = new Map<string, Uint8Array>();
  let reads = 0,
    writes = 0;
  const storage = {
    read: async (key: string) => stored.get(key),
    write: (key: string, pixels: Uint8Array) => {
      writes++;
      stored.set(key, pixels);
    }
  };
  const reader = async (data: import('./tilePixels').TileData) => {
    reads++;
    return data instanceof Uint8Array ? data : sources.get(data.storageId)!;
  };
  const page = { layerId: doc.active.id, level: 4, x: 0, y: 0 };
  const first = createVirtualPages(reader, 1024, storage);
  first.sync(doc.layers);
  const original = await first.pagePixels(page);
  expect(reads).toBe(256);
  first.clear();
  reads = 0;
  writes = 0;
  const reopened = createVirtualPages(reader, 1024, storage);
  reopened.sync(doc.layers);
  expect(await reopened.pagePixels(page)).toEqual(original);
  expect(reads).toBe(0);
  expect(writes).toBe(0);
  const before = doc.active.tiles.get('0,0')!;
  const updated = { storageId: crypto.randomUUID(), byteLength: raw.byteLength };
  sources.set(updated.storageId, new Uint8Array(262144).fill(180));
  doc.commit([{ layerId: doc.active.id, key: '0,0', before, after: updated }]);
  reopened.sync(doc.layers);
  const result = await reopened.pagePixels(page);
  expect(result[0]).toBe(180);
  expect(result[16 * 4]).toBe(40);
  expect(reads).toBe(4);
  expect(writes).toBe(4);
  reads = 0;
  writes = 0;
  doc.undo();
  reopened.sync(doc.layers);
  expect(await reopened.pagePixels(page)).toEqual(original);
  expect(reads).toBe(0);
  expect(writes).toBe(0);
});
