import { describe, expect, it } from 'vitest';
import { imageTiles, placeImage } from './imageTiles';

describe('placeImage', () => {
  it('centers at natural size, and only scales down to fit', () => {
    expect(placeImage(100, 50, { x: 10, y: 20 }, { width: 1000, height: 1000 })).toEqual({
      left: -40,
      top: -5,
      width: 100,
      height: 50
    });
    expect(placeImage(2000, 1000, { x: 0, y: 0 }, { width: 500, height: 500 })).toEqual({
      left: -250,
      top: -125,
      width: 500,
      height: 250
    });
    expect(placeImage(10_000, 100, { x: 0, y: 0 }, { width: 1e6, height: 1e6 }).width).toBe(4096);
  });
});

describe('imageTiles', () => {
  it('premultiplies pixels into the tiles they cover, across tile edges and negative coordinates', () => {
    // A 2×1 image straddling the origin: a half-transparent red pixel at x = -1 and a transparent pixel at x = 0.
    const pixels = new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 0]);
    const tiles = imageTiles(pixels, 2, 1, -1, 5);
    expect([...tiles.keys()]).toEqual(['-1,0']);
    const tile = tiles.get('-1,0')!;
    const offset = (5 * 256 + 255) * 4;
    expect([...tile.subarray(offset, offset + 4)]).toEqual([128, 0, 0, 128]);
  });

  it('omits fully transparent tiles', () => {
    expect(imageTiles(new Uint8ClampedArray(4 * 4), 2, 2, 300, 300).size).toBe(0);
  });
});
