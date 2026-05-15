import type { ColorSpaces, LabAxis, OklabLightness } from '../../types';
import { unpackNumberArray } from '../../utils';

const { cbrt, pow, sign } = Math;

function rgb2lrgb(c: number): number {
  const absolute = Math.abs(c);
  return absolute < 0.04045 ? c / 12.92 : (sign(c) || 1) * pow((absolute + 0.055) / 1.055, 2.4);
}

/**
 * Converts RGB input into Oklab coordinates.
 */
export function rgb2oklab(...args: unknown[]): ColorSpaces['oklab'] {
  const values = unpackNumberArray(args, 'rgb');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [r = 0, g = 0, b = 0] = values;
  const [lr, lg, lb] = [rgb2lrgb(r / 255), rgb2lrgb(g / 255), rgb2lrgb(b / 255)];
  const l = cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    toOklabLightness(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s),
    toLabAxis(1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s),
    toLabAxis(0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s)
  ];
}

function toLabAxis(value: number): LabAxis {
  return value as LabAxis;
}

function toOklabLightness(value: number): OklabLightness {
  return value as OklabLightness;
}
