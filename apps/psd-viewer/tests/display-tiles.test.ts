import { expect, it } from 'vitest';
import { displayTiles, tileTextureUpload } from '../src/features/gpu-viewport/displayTiles';

it('bounds whole-render upload views while retaining source bytes, halos and identity', () => {
  const buffer = new ArrayBuffer(4096 * 1029 * 4 + 16);
  const image = { width: 4096, height: 1029, pixels: new Uint8Array(buffer, 16) };
  const tiles = displayTiles(image);
  expect(displayTiles(image)).toBe(tiles);
  const tile = tiles.find((tile) => tile.clip.left === 512 && tile.clip.top === 512)!;
  const upload = tileTextureUpload(tile);
  expect(upload).toMatchObject({ width: 514, height: 514, left: 511, top: 511, bytesPerRow: 16384 });
  expect(upload.source.buffer).toBe(buffer);
  expect(upload.source.byteOffset).toBe(16 + (511 * 4096 + 511) * 4);
  expect(upload.source.byteLength).toBe((513 * 4096 + 514) * 4);
  expect(upload.source.byteLength).toBeLessThan(image.pixels.byteLength / 2);
  upload.source[0] = 42;
  expect(image.pixels[(511 * 4096 + 511) * 4]).toBe(42);
  const edge = tileTextureUpload(tiles.at(-1)!);
  expect(edge.source.byteOffset + edge.source.byteLength).toBe(buffer.byteLength);
});

it('splits coarse overviews into stable bounded chunks and preserves document-space stride', () => {
  const image = { width: 1027, height: 517, pixels: new Uint8Array(1027 * 517 * 4) };
  const tile = { image, left: 0, top: 0, step: 64, clip: { left: 0, top: 0, width: 1027 * 64, height: 517 * 64 } };
  const frame = { width: 300000, height: 300000, pixels: new Uint8Array(), tiles: [tile] };
  const chunks = displayTiles(frame);
  expect(chunks).toHaveLength(6);
  expect(displayTiles(frame)[4]).toBe(chunks[4]);
  for (const chunk of chunks) {
    const upload = tileTextureUpload(chunk);
    expect(upload.width).toBeLessThanOrEqual(514);
    expect(upload.height).toBeLessThanOrEqual(514);
  }

  expect(chunks[4].clip).toEqual({ left: 512 * 64, top: 512 * 64, width: 512 * 64, height: 5 * 64 });
});
