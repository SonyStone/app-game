import { unpack } from '../../utils';

/**
 * Converts RGB input into HCG channel values.
 *
 * Hue is returned in degrees. Chroma and grayness are normalized to percentage-style 0..100 values.
 */
export function rgb2hcg(...args: unknown[]): [number, number, number] {
  const [r = 0, g = 0, b = 0] = unpack(args, 'rgb') as number[];
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const delta = max - min;
  const chroma = (delta * 100) / 255;
  const grayness = (min / (255 - delta)) * 100;
  let hue = Number.NaN;
  if (delta !== 0) {
    if (r === max) {
      hue = (g - b) / delta;
    } else if (g === max) {
      hue = 2 + (b - r) / delta;
    } else {
      hue = 4 + (r - g) / delta;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  return [hue, chroma, grayness];
}
