import { err, ok } from 'neverthrow';
import { expect, it } from 'vitest';
import { assembleTiledMip, expandChannels, expandPackedTile, tilePixels } from './rasterPixels';
import { tileExtent, tileSize } from './virtualTiles';

it('widens gray and RGB samples to opaque RGBA and keeps RGBA as is', () => {
  expect(Array.from(expandChannels(Uint8Array.of(7, 250), 1))).toEqual([7, 7, 7, 255, 250, 250, 250, 255]);
  expect(Array.from(expandChannels(Uint8Array.of(1, 2, 3, 4, 5, 6), 3))).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  const rgba = Uint8Array.of(1, 2, 3, 4);
  expect(expandChannels(rgba, 4)).toBe(rgba);
});

it('transfers full packed tiles without copying or changing their pixels', () => {
  const pixels = new Uint8Array(tileExtent * tileExtent * 4);
  pixels[10] = 123;
  expect(expandPackedTile(pixels, tileExtent, tileExtent)).toBe(pixels.buffer);
});

it.each([
  [3, 5],
  [tileExtent, 3],
  [2, tileExtent],
  [1, 1]
])('replicates boundary texels for a %i × %i packed tile', (width, height) => {
  const source = Uint32Array.from({ length: width * height }, (_, i) => i + 1);
  const expanded = new Uint32Array(expandPackedTile(new Uint8Array(source.buffer), width, height));

  for (let y = 0; y < tileExtent; y++) {
    for (let x = 0; x < tileExtent; x++) {
      expect(expanded[y * tileExtent + x]).toBe(source[Math.min(y, height - 1) * width + Math.min(x, width - 1)]);
    }
  }
});

it.each([
  [1, 1, 0, 0],
  [513, 259, 0, 0],
  [513, 259, 1, 0],
  [513, 259, 2, 1]
])('copies %i × %i source tile (%i,%i) with exact neighbors and clamped image edges', (width, height, x, y) => {
  const source = Uint32Array.from({ length: width * height }, (_, i) => i + 1);
  const actual = new Uint32Array(tilePixels({ width, height, pixels: new Uint8Array(source.buffer) }, x, y));
  const expected = new Uint32Array(tileExtent * tileExtent);

  for (let row = 0; row < tileExtent; row++) {
    for (let column = 0; column < tileExtent; column++) {
      const sx = Math.max(0, Math.min(width - 1, x * tileSize + column - 1));
      const sy = Math.max(0, Math.min(height - 1, y * tileSize + row - 1));
      expected[row * tileExtent + column] = source[sy * width + sx]!;
    }
  }

  expect(actual).toEqual(expected);
});

it.each([
  [500, 1],
  [300, 200],
  [128, 129]
])('assembles a %i × %i mip from every gutter tile it spans', async (width, height) => {
  const reads: string[] = [];
  const mip = await assembleTiledMip(width, height, async (tx, ty) => {
    reads.push(`${tx},${ty}`);
    // Gutter texels are marked with zero; interior texels encode their image coordinates.
    const tile = new Uint32Array(tileExtent * tileExtent);

    for (let y = 1; y <= tileSize; y++) {
      for (let x = 1; x <= tileSize; x++) {
        tile[y * tileExtent + x] = (ty * tileSize + y - 1) * 65536 + tx * tileSize + x;
      }
    }

    return ok(tile.buffer);
  });
  const pixels = new Uint32Array(mip._unsafeUnwrap().pixels.buffer);

  expect(reads).toHaveLength(Math.ceil(width / tileSize) * Math.ceil(height / tileSize));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      expect(pixels[y * width + x]).toBe(y * 65536 + x + 1);
    }
  }
});

it('propagates a failed tile read while assembling a mip', async () => {
  const mip = await assembleTiledMip(300, 1, async (tx) =>
    tx === 1 ? err('Broken tile') : ok(new ArrayBuffer(tileExtent * tileExtent * 4))
  );
  expect(mip._unsafeUnwrapErr()).toBe('Broken tile');
});
