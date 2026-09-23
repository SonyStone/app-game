import { expect, it } from 'vitest';
import { selectImageTiles } from './selectImageTiles';
import { createImageTileCache, imageTiles, type Tile, type VirtualImage } from './virtualTiles';

it('matches stable full sorting including ties, retained tiles and overflow', () => {
  const candidates = new Map<string, Tile & { priority: number }>();
  const resident = new Map<string, unknown>();
  for (let i = 0; i < 10000; i++) {
    candidates.set(String(i), { image: i, level: 0, x: 0, y: 0, priority: (i * 7919) % 101 });
    if (i % 3 === 0) resident.set(String(i), true);
  }
  for (const capacity of [0, 1, 961, 12000]) {
    const expected = [...candidates]
      .sort(([a, l], [b, r]) => l.priority - (resident.has(a) ? 0.1 : 0) - (r.priority - (resident.has(b) ? 0.1 : 0)))
      .slice(0, capacity);
    expect([...selectImageTiles(candidates, capacity, resident)]).toEqual(expected);
  }
});

it('reuses memberships while updating priorities, and rebuilds across tile and LOD boundaries', () => {
  const cached = createImageTileCache(100);
  const image: VirtualImage = { id: 0, width: 2048, height: 2048, level: 6, x: 0, y: 0, tailWidth: 1, tailHeight: 1 };
  const region = { left: 0, right: 1, top: 0, bottom: 1, width: 256, height: 256, distance: 0 };
  const first = cached(1, image, region);
  const moved = { ...region, distance: 0.8 };
  expect(cached(1, image, moved)).toBe(first);
  expect(first).toEqual(imageTiles(image, moved));
  for (const next of [
    { ...moved, width: 512, height: 512 },
    { ...moved, left: 0.6 }
  ]) {
    expect(cached(1, image, next)).toEqual(imageTiles(image, next));
  }
  // Bounded eviction must not alter the selected pixels.
  for (let i = 0; i < 200; i++) expect(cached(i, image, moved)).toEqual(imageTiles(image, moved));
});
