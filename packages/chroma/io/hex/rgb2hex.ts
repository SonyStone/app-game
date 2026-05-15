import type { HexMode, HexString } from '../../types';
import { last, unpackNumberArray } from '../../utils';

const { round } = Math;
type HexStringMode = HexMode | 'argb';

/**
 * Formats RGB(A) channel values as a hexadecimal string.
 *
 * Supported modes:
 * - `auto`: include alpha only when opacity is less than 1
 * - `rgb`: emit `#rrggbb`
 * - `rgba`: emit `#rrggbbaa`
 * - `argb`: emit `#aarrggbb`
 */
export function rgb2hex(...args: unknown[]): HexString {
  const rgba = unpackNumberArray(args, 'rgba');
  if (rgba == null) {
    throw new Error(`unknown format: ${args}`);
  }

  let [r = 0, g = 0, b = 0, a = 1] = rgba;
  let mode = last<HexStringMode>(args) ?? 'auto';
  if (mode === 'auto') {
    mode = a < 1 ? 'rgba' : 'rgb';
  }

  const packed = (round(r) << 16) | (round(g) << 8) | round(b);
  const rgb = `000000${packed.toString(16)}`.slice(-6);
  const alpha = `0${round(a * 255).toString(16)}`.slice(-2);
  switch (mode.toLowerCase()) {
    case 'rgba':
      return `#${rgb}${alpha}` as HexString;
    case 'argb':
      return `#${alpha}${rgb}` as HexString;
    default:
      return `#${rgb}` as HexString;
  }
}
