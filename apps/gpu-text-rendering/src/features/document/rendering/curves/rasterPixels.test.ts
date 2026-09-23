import { expect, it } from 'vitest';
import { expandPackedTile, tilePixels } from './rasterPixels';
import { tileExtent, tileSize } from './virtualTiles';

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
