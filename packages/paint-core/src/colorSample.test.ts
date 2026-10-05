import { expect, it } from 'vitest';
import { averageOpaque, sampleLayer } from './colorSample';
import type { Layer } from './document';
import { TILE_BYTES } from './tilePixels';

it('averages opaque pixels', () => {
  expect(averageOpaque([255, 0, 0, 255])).toBe('#ff0000');
  expect(averageOpaque([255, 0, 0, 255, 0, 0, 255, 255])).toBe('#800080');
});

it("averages a layer's paint by coverage across tiles, and finds none where it is empty", async () => {
  // Tile 0,0 has opaque red at its right edge; tile 1,0 half-transparent blue (premultiplied) at its left edge.
  const left = new Uint8Array(TILE_BYTES),
    right = new Uint8Array(TILE_BYTES);
  for (let y = 0; y < 256; y++) {
    left.set([255, 0, 0, 255], (y * 256 + 255) * 4);
    right.set([0, 0, 128, 128], y * 256 * 4);
  }

  const layer: Layer = {
    id: 'layer',
    name: 'Layer',
    visible: true,
    opacity: 1,
    blend: 'normal',
    tiles: new Map([
      ['0,0', left],
      ['1,0', right]
    ])
  };
  const read = async (pixels: unknown) => pixels as Uint8Array;

  expect(await sampleLayer(layer, { x: 255.5, y: 10.2 }, 1, read)).toBe('#ff0000');
  // Unpremultiplied, the blue pixel is fully blue.
  expect(await sampleLayer(layer, { x: 256.5, y: 10 }, 1, read)).toBe('#0000ff');
  // A 3×3 square over both columns and an empty one: red weighs twice as much as the half-covered blue.
  expect(await sampleLayer(layer, { x: 256, y: 10 }, 3, read)).toBe('#aa0055');
  expect(await sampleLayer(layer, { x: 100, y: 10 }, 5, read)).toBeNull();
  expect(await sampleLayer(layer, { x: -300, y: 10 }, 1, read)).toBeNull();
});
