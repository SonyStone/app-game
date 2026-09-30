import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
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
