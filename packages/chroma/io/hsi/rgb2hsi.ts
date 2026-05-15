import { TWOPI, unpack } from '../../utils';

const { acos, min, sqrt } = Math;

/**
 * Converts RGB input into HSI channel values.
 *
 * Hue is returned in degrees. Saturation and intensity are normalized to 0..1.
 */
export function rgb2hsi(...args: unknown[]): [number, number, number] {
  let [r = 0, g = 0, b = 0] = unpack(args, 'rgb') as number[];
  r /= 255;
  g /= 255;
  b /= 255;

  const minValue = min(r, g, b);
  const intensity = (r + g + b) / 3;
  const saturation = intensity > 0 ? 1 - minValue / intensity : 0;
  if (saturation === 0) {
    return [Number.NaN, saturation, intensity];
  }

  let hue = (r - g + (r - b)) / 2;
  hue /= sqrt((r - g) * (r - g) + (r - b) * (g - b));
  hue = acos(hue);
  if (b > g) {
    hue = TWOPI - hue;
  }

  return [(hue / TWOPI) * 360, saturation, intensity];
}
