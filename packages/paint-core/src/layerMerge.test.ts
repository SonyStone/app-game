import { describe, expect, it } from 'vitest';
import { mergeTilePixels } from './layerMerge';
import { TILE_BYTES } from './tilePixels';

describe('mergeTilePixels', () => {
  it('composites the upper layer over the lower one with its opacity, normal mode', () => {
    const lower = tile([0, 0, 255, 255]);
    const upper = tile([255, 0, 0, 255]);
    expect(first(mergeTilePixels(lower, upper, 'normal', 0.5))).toEqual([128, 0, 128, 255]);
    expect(first(mergeTilePixels(undefined, upper, 'normal', 0.5))).toEqual([128, 0, 0, 128]);
  });

  it('blends every mode in linear light for a document that does', () => {
    const lower = tile([0, 0, 0, 255]);
    const upper = tile([255, 255, 255, 255]);
    // Half of white over black in linear light is linear 0.5, which encodes to sRGB 188.
    expect(first(mergeTilePixels(lower, upper, 'normal', 0.5, undefined, true))).toEqual([188, 188, 188, 255]);
    // Multiply of two sRGB 188 grays: linear 0.503 × 0.503 = 0.253 encodes to 138, where encoded values give 139.
    const gray = tile([188, 188, 188, 255]);
    expect(first(mergeTilePixels(gray, gray, 'multiply', 1, undefined, true))).toEqual([138, 138, 138, 255]);
    expect(first(mergeTilePixels(gray, gray, 'multiply', 1))).toEqual([139, 139, 139, 255]);
  });

  it('applies separable blend modes against the lower layer', () => {
    const lower = tile([128, 128, 128, 255]);
    const upper = tile([128, 255, 0, 255]);
    expect(first(mergeTilePixels(lower, upper, 'multiply', 1))).toEqual([64, 128, 0, 255]);
    expect(first(mergeTilePixels(lower, upper, 'screen', 1))).toEqual([192, 255, 128, 255]);
    // Overlay: the base 128/255 is just above 0.5, so it screens.
    expect(first(mergeTilePixels(lower, upper, 'overlay', 1))).toEqual([128, 255, 1, 255]);
  });

  it('clips the upper layer to the alpha of its clipping base', () => {
    const upper = tile([255, 0, 0, 255]);
    // A half-transparent base lets half of the clipped red through, before its own opacity.
    expect(first(mergeTilePixels(undefined, upper, 'normal', 1, { base: tile([0, 0, 0, 128]) }))).toEqual([
      128, 0, 0, 128
    ]);
    // Without base pixels nothing of the clipped layer remains.
    expect(mergeTilePixels(undefined, upper, 'normal', 1, { base: undefined })).toBeUndefined();
    const base = tile([0, 0, 255, 255]);
    expect(first(mergeTilePixels(base, upper, 'normal', 0.5, { base }))).toEqual([128, 0, 128, 255]);
  });

  it('returns undefined for a fully transparent result', () => {
    expect(mergeTilePixels(undefined, new Uint8Array(TILE_BYTES), 'normal', 1)).toBeUndefined();
    expect(mergeTilePixels(undefined, tile([255, 0, 0, 255]), 'normal', 0)).toBeUndefined();
  });
});

/** A tile filled with one premultiplied RGBA8 pixel. */
function tile(rgba: [number, number, number, number]) {
  const pixels = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 4) pixels.set(rgba, index);
  return pixels;
}

function first(pixels: Uint8Array | undefined) {
  return pixels ? [...pixels.subarray(0, 4)] : undefined;
}
