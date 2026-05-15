import { unpack } from '../../utils';

const { pow, sign } = Math;

function lrgb2rgb(c: number): number {
  const absolute = Math.abs(c);
  return absolute > 0.0031308 ? (sign(c) || 1) * (1.055 * pow(absolute, 1 / 2.4) - 0.055) : c * 12.92;
}

/**
 * Converts Oklab coordinates into an internal RGBA tuple.
 */
export function oklab2rgb(...args: unknown[]): [number, number, number, number] {
  const values = unpack(args, 'lab') as number[];
  const [L = 0, a = 0, b = 0] = values;
  const l = pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    255 * lrgb2rgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    255 * lrgb2rgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    255 * lrgb2rgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    values.length > 3 ? (values[3] ?? 1) : 1
  ];
}
