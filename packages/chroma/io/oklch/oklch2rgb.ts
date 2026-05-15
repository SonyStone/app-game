import { unpack } from '../../utils';
import { lch2lab } from '../lch/lch2lab';
import { oklab2rgb } from '../oklab/oklab2rgb';

/**
 * Converts Oklch coordinates into an internal RGBA tuple.
 */
export function oklch2rgb(...args: unknown[]): [number, number, number, number] {
  const values = unpack(args, 'lch') as number[];
  const [l = 0, c = 0, h = 0] = values;
  const [L, a, b_] = lch2lab(l, c, h);
  const [r, g, b] = oklab2rgb(L, a, b_);
  return [r, g, b, values.length > 3 ? (values[3] ?? 1) : 1];
}
