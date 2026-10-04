import { expect, it } from 'vitest';
import { blendPreview } from './blendPreview';

/** Sum of the channels at a pixel, as a rough lightness. */
const lightness = (image: Uint8ClampedArray, x: number, y: number) => {
  const index = (y * 256 + x) * 4;
  return image[index]! + image[index + 1]! + image[index + 2]!;
};

it('shows how each mode blends the overlapping circles, as the canvas composites them', () => {
  const [normal, multiply, screen] = (['normal', 'multiply', 'screen'] as const).map((mode) => blendPreview(mode));
  const smooth = blendPreview('normal', true);
  // Where the circles overlap, Multiply darkens and Screen lightens what Normal shows.
  expect(lightness(multiply!, 128, 128)).toBeLessThan(lightness(normal!, 128, 128) - 60);
  expect(lightness(screen!, 128, 128)).toBeGreaterThan(lightness(normal!, 128, 128) + 60);
  // On the blue circle's soft edge over orange, blending in linear light has no dark fringe.
  expect(lightness(smooth!, 98, 128)).toBeGreaterThan(lightness(normal!, 98, 128) + 20);
  // Outside both circles, every mode shows the paper.
  expect([...normal!.subarray(0, 4)]).toEqual([250, 248, 244, 255]);
});
