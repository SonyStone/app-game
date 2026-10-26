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

it.each([44, 176, 648].flatMap((size) => [0, 57, 180, 293].map((hue) => ({ size, hue }))))(
  'keeps HSV disc and rotated triangle pixels at $size px, hue $hue',
  ({ size, hue }) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const images: ImageData[] = [];
    vi.spyOn(canvas, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4)
      }),
      putImageData: (image: ImageData) => images.push({ ...image, data: image.data.slice() })
    } as unknown as ReturnType<HTMLCanvasElement['getContext']>);

    referenceDisc(canvas, hue, size);
    paintDisc(canvas, hue, size);
    expectPixels(images[0]!, images[1]!);

    for (const angle of [hue, hue + 31]) {
      referenceTriangle(canvas, angle, hue);
      paintTriangle(canvas, angle, hue);
      expectPixels(images.at(-2)!, images.at(-1)!);
    }
  }
);

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

it('shares OKLCH preparation across canvases and evicts the least recently used backing size', () => {
  const allocations = vi.fn((width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  }));
  const painted = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: allocations,
    putImageData: painted
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  const a = document.createElement('canvas');
  const b = document.createElement('canvas');
  paintDisk(a, 0.4, 31);
  paintDisk(b, 0.6, 31);
  expect(allocations).toHaveBeenCalledTimes(1);
  expect(a.width).toBe(31);
  expect(b.width).toBe(31);
  for (const size of [32, 33, 34]) {
    paintDisk(a, 0.4, size);
  }
  paintDisk(b, 0.5, 31); // Touch 31, so 32 is now oldest.
  paintDisk(a, 0.4, 35);
  paintDisk(b, 0.6, 31);
  expect(allocations).toHaveBeenCalledTimes(5);
  paintDisk(a, 0.4, 32);
  expect(allocations).toHaveBeenCalledTimes(6);
});
