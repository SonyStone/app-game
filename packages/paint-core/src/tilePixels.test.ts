import { expect, it } from 'vitest';
import { packTile, packTileCopy, TILE_BYTES, tileHasAlpha, unpackTile } from './tilePixels';

it('detects alpha in packed tiles without expanding them', () => {
  const empty = new Uint8Array(TILE_BYTES);
  const colorOnly = new Uint8Array(TILE_BYTES);
  colorOnly.set([9, 9, 9, 0], 4000);
  const painted = new Uint8Array(TILE_BYTES);
  painted.set([1, 2, 3, 4], 8000);

  for (const [pixels, expected] of [
    [empty, false],
    [colorOnly, false],
    [painted, true]
  ] as const) {
    expect(tileHasAlpha(pixels)).toBe(expected);
    expect(tileHasAlpha(packTile(pixels))).toBe(expected);
  }
});

it('copies dense mapped views and recognizes already packed output', () => {
  const dense = new Uint8Array(TILE_BYTES).fill(200);
  const sparse = new Uint8Array(TILE_BYTES);
  sparse.set([1, 2, 3, 4], 100);

  const denseCopy = packTileCopy(dense);
  const sparseCopy = packTileCopy(sparse);

  expect(denseCopy).not.toBe(dense);
  expect(denseCopy).toEqual(dense);
  expect(packTile(denseCopy)).toBe(denseCopy);
  expect(sparseCopy.byteLength).toBeLessThan(TILE_BYTES);
  expect(packTile(sparseCopy)).toBe(sparseCopy);
  expect(unpackTile(sparseCopy)).toEqual(sparse);
});

it('rejects malformed packets while checking alpha', () => {
  const packed = packTile(new Uint8Array(TILE_BYTES)).slice();
  packed[0] = 0;

  expect(() => tileHasAlpha(packed)).toThrow('Invalid packed tile header.');
  expect(() => tileHasAlpha({ storageId: 'cold', byteLength: 8 })).toThrow('Load this tile');
});
