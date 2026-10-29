import type { PsdRegionPixels } from '@app-game/psd/viewer';
import { expect, it } from 'vitest';
import { regionMips } from '../src/features/psd-worker/regionMips';

it('weights hidden RGB by alpha and extends odd document edges', () => {
  const source = image(3, 1, new Uint8Array([255, 0, 0, 0, 0, 100, 200, 255, 20, 40, 60, 255]));
  const [mip] = regionMips(source, 2);
  expect([...mip.pixels]).toEqual([0, 100, 200, 128, 20, 40, 60, 255]);
  expect(mip.exactToLayerRender).toBe(false);
  expect(source.pixels[0]).toBe(255);
});

it('matches a whole-image pyramid across tile seams, halo texels and odd edges at every LOD', () => {
  const width = 1027;
  const height = 517;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.set([x % 256, y % 256, (x + y) % 256, (x + y) % 7 ? 255 : 0], (y * width + x) * 4);
    }
  }

  const whole = regionMips(image(width, height, pixels), 16);
  for (const core of [0, 512, 1024]) {
    const left = Math.max(0, core - 16);
    const right = Math.min(width, core + 512 + 16);
    const crop = new Uint8Array((right - left) * height * 4);
    for (let y = 0; y < height; y++) {
      crop.set(pixels.subarray((y * width + left) * 4, (y * width + right) * 4), y * (right - left) * 4);
    }

    const levels = regionMips({ ...image(right - left, height, crop), left }, 16);
    for (const [level, mip] of levels.entries()) {
      const expected = whole[level];
      for (let y = 0; y < mip.height; y++) {
        const offset = (y * expected.width + left / mip.step) * 4;
        expect(mip.pixels.subarray(y * mip.width * 4, (y + 1) * mip.width * 4)).toEqual(
          expected.pixels.subarray(offset, offset + mip.width * 4)
        );
      }
    }
  }
});

function image(width: number, height: number, pixels: Uint8Array): PsdRegionPixels {
  return {
    width,
    height,
    pixels,
    left: 0,
    top: 0,
    step: 1,
    source: 'layers',
    strategy: 'window',
    exactToLayerRender: true,
    approximations: []
  };
}
