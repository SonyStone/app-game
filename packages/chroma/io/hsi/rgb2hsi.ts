import type { ColorSpaces, HueDegrees, NormalizedChannel } from '../../types';
import { TWOPI, unpackNumberArray } from '../../utils';

const { acos, min, sqrt } = Math;

/**
 * Converts RGB input into HSI channel values.
 *
 * Hue is returned in degrees. Saturation and intensity are normalized to 0..1.
 */
export function rgb2hsi(...args: unknown[]): ColorSpaces['hsi'] {
  const values = unpackNumberArray(args, 'rgb');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  let [r = 0, g = 0, b = 0] = values;
  r /= 255;
  g /= 255;
  b /= 255;

  const minValue = min(r, g, b);
  const intensity = (r + g + b) / 3;
  const saturation = intensity > 0 ? 1 - minValue / intensity : 0;
  if (saturation === 0) {
    return [toHueDegrees(Number.NaN), toNormalizedChannel(saturation), toNormalizedChannel(intensity)];
  }

  let hue = (r - g + (r - b)) / 2;
  hue /= sqrt((r - g) * (r - g) + (r - b) * (g - b));
  hue = acos(hue);
  if (b > g) {
    hue = TWOPI - hue;
  }

  return [toHueDegrees((hue / TWOPI) * 360), toNormalizedChannel(saturation), toNormalizedChannel(intensity)];
}

function toHueDegrees(value: number): HueDegrees {
  return value as HueDegrees;
}

function toNormalizedChannel(value: number): NormalizedChannel {
  return value as NormalizedChannel;
}
