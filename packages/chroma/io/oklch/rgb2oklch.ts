import type { ColorSpaces, OklabLightness } from '../../types';
import { unpackNumberArray } from '../../utils';
import { lab2lch } from '../lch/lab2lch';
import { rgb2oklab } from '../oklab/rgb2oklab';

/**
 * Converts RGB input into Oklch coordinates.
 */
export function rgb2oklch(...args: unknown[]): ColorSpaces['oklch'] {
  const values = unpackNumberArray(args, 'rgb');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [r = 0, g = 0, b = 0] = values;
  const [l, a, b_] = rgb2oklab(r, g, b);
  const [, chroma, hue] = lab2lch(l, a, b_);
  return [toOklabLightness(l), chroma, hue];
}

function toOklabLightness(value: number): OklabLightness {
  return value as OklabLightness;
}
