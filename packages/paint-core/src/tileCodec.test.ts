import { expect, it } from 'vitest';
import { compressTile, isCompressedTile, restoreTile } from './tileCodec';
import { packTile, TILE_BYTES } from './tilePixels';

it('compresses flat tiles, keeps noise and tiny tiles as they are, and restores either', async () => {
  const flat = new Uint8Array(TILE_BYTES).fill(200);
  const stored = await compressTile(flat);
  expect(isCompressedTile(stored)).toBe(true);
  expect(stored.byteLength).toBeLessThan(TILE_BYTES / 50);
  expect(await restoreTile(stored)).toEqual(flat);

  // Noise does not shrink, so it is stored raw; a raw tile is never taken for a compressed one.
  const noise = new Uint8Array(TILE_BYTES).map(() => Math.floor(Math.random() * 256));
  expect(await compressTile(noise)).toBe(noise);
  expect(await restoreTile(noise)).toBe(noise);

  const empty = packTile(new Uint8Array(TILE_BYTES));
  expect(await compressTile(empty)).toBe(empty);
  expect(await restoreTile(empty)).toBe(empty);
});

it('rejects a damaged compressed tile', async () => {
  const stored = await compressTile(new Uint8Array(TILE_BYTES).fill(7));
  const truncated = stored.slice(0, stored.byteLength - 4);
  await expect(restoreTile(truncated)).rejects.toThrow();
});
