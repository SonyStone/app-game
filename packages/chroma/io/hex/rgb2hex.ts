import { last, unpack } from '../../utils';

const { round } = Math;

/**
 * Formats RGB(A) channel values as a hexadecimal string.
 *
 * Supported modes:
 * - `auto`: include alpha only when opacity is less than 1
 * - `rgb`: emit `#rrggbb`
 * - `rgba`: emit `#rrggbbaa`
 * - `argb`: emit `#aarrggbb`
 */
export function rgb2hex(...args: unknown[]): string {
  let [r = 0, g = 0, b = 0, a = 1] = unpack(args, 'rgba') as number[];
  let mode = last(args) ?? 'auto';
  if (mode === 'auto') {
    mode = a < 1 ? 'rgba' : 'rgb';
  }

  const packed = (round(r) << 16) | (round(g) << 8) | round(b);
  const rgb = `000000${packed.toString(16)}`.slice(-6);
  const alpha = `0${round(a * 255).toString(16)}`.slice(-2);
  switch (mode.toLowerCase()) {
    case 'rgba':
      return `#${rgb}${alpha}`;
    case 'argb':
      return `#${alpha}${rgb}`;
    default:
      return `#${rgb}`;
  }
}
