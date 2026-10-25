// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { paintDisc } from '../../shared/ui/colorDisc';
import { paintTriangle } from '../hue-triangle/paintTriangle';
import { paintDisk } from './paintDisk';
import { referenceDisc, referenceDisk, referenceTriangle } from './testing/referencePickers';

afterEach(() => vi.restoreAllMocks());

it.each([44, 176, 424])('keeps the OKLCH disk within one channel step of the old renderer at %s pixels', (size) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const images: ImageData[] = [];
  const context = {
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    }),
    putImageData: (image: ImageData) => images.push({ ...image, data: image.data.slice() })
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  const allocations = vi.spyOn(context, 'createImageData');

  for (const l of [0, 0.15, 0.5, 0.85, 1]) {
    referenceDisk(canvas, l);
    paintDisk(canvas, l);
    expectPixels(images.at(-2)!, images.at(-1)!);
  }

  // Five reference allocations and one retained optimized buffer.
  expect(allocations).toHaveBeenCalledTimes(6);
});

it.each([0, 57, 180, 293])('keeps HSV disc and rotated triangle pixels at hue %s', (hue) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 176;
  const images: ImageData[] = [];
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    }),
    putImageData: (image: ImageData) => images.push({ ...image, data: image.data.slice() })
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>);

  referenceDisc(canvas, hue, 176);
  paintDisc(canvas, hue, 176);
  expectPixels(images[0]!, images[1]!);

  for (const angle of [hue, hue + 31]) {
    referenceTriangle(canvas, angle, hue);
    paintTriangle(canvas, angle, hue);
    expectPixels(images.at(-2)!, images.at(-1)!);
  }
});

function expectPixels(expected: ImageData, actual: ImageData) {
  let max = 0;
  for (let i = 0; i < expected.data.length; i++) {
    // Fully transparent RGB does not affect the displayed bitmap.
    if (i % 4 !== 3 && expected.data[i - (i % 4) + 3] === 0) {
      continue;
    }

    max = Math.max(max, Math.abs(expected.data[i]! - actual.data[i]!));
  }

  expect(max).toBeLessThanOrEqual(1);
}
