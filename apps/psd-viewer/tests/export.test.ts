import type { PsdDifference } from '@app-game/psd/viewer';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { nextMismatch } from '../src/features/comparison/mismatches';
import { pngBytes } from '../src/features/export/png';

it('PNG preserves straight RGB8 bytes including hidden RGB and low alpha', async () => {
  const pixels = Uint8Array.of(12, 34, 56, 0, 100, 150, 200, 1, 255, 0, 70, 255, 44, 55, 66, 127);
  const png = await pngBytes({ width: 2, height: 2, pixels });
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let decoded: Uint8Array | undefined;
  while (offset < png.length) {
    const length = new DataView(png.buffer).getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') {
      decoded = inflateSync(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  expect([...decoded!]).toEqual([0, ...pixels.subarray(0, 8), 0, ...pixels.subarray(8)]);
  await expect(pngBytes({ width: 1, height: 1, pixels: new Uint8Array() })).rejects.toThrow(/admitted/);
});

it('mismatch navigation wraps and uses the native-difference heat map rather than display RGB equality', () => {
  const difference: PsdDifference = {
    width: 3,
    height: 1,
    pixels: Uint8Array.of(24, 24, 24, 255, 255, 0, 255, 255, 255, 48, 0, 255),
    unit: 'float32 ULP',
    samples: 9,
    differingSamples: 2,
    differingPixels: 2,
    alphaDiffering: 0,
    max: 1,
    histogram: []
  };
  expect(nextMismatch(difference, -1, 1)).toBe(1);
  expect(nextMismatch(difference, 1, 1)).toBe(2);
  expect(nextMismatch(difference, 2, 1)).toBe(1);
  expect(nextMismatch(difference, 1, -1)).toBe(2);
  expect(nextMismatch({ ...difference, differingPixels: 0 }, 0, 1)).toBeUndefined();
});
