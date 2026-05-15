import { PITHIRD, TWOPI, limit, unpackNumberArray } from '../../utils';

const { cos } = Math;

/**
 * Converts HSI input into an internal RGBA tuple.
 */
export function hsi2rgb(...args: unknown[]): [number, number, number, number] {
  const values = unpackNumberArray(args, 'hsi');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  let [h = 0, s = 0, i = 0] = values;
  let r: number;
  let g: number;
  let b: number;

  if (Number.isNaN(h)) {
    h = 0;
  }
  if (Number.isNaN(s)) {
    s = 0;
  }
  if (h > 360) {
    h -= 360;
  }
  if (h < 0) {
    h += 360;
  }
  h /= 360;

  if (h < 1 / 3) {
    b = (1 - s) / 3;
    r = (1 + (s * cos(TWOPI * h)) / cos(PITHIRD - TWOPI * h)) / 3;
    g = 1 - (b + r);
  } else if (h < 2 / 3) {
    h -= 1 / 3;
    r = (1 - s) / 3;
    g = (1 + (s * cos(TWOPI * h)) / cos(PITHIRD - TWOPI * h)) / 3;
    b = 1 - (r + g);
  } else {
    h -= 2 / 3;
    g = (1 - s) / 3;
    b = (1 + (s * cos(TWOPI * h)) / cos(PITHIRD - TWOPI * h)) / 3;
    r = 1 - (g + b);
  }

  return [
    limit(i * r * 3) * 255,
    limit(i * g * 3) * 255,
    limit(i * b * 3) * 255,
    values.length > 3 ? (values[3] ?? 1) : 1
  ];
}
