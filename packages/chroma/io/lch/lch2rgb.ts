import { unpack } from '../../utils';
import { lab2rgb } from '../lab/lab2rgb';
import { lch2lab } from './lch2lab';

/**
 * Converts CIELCh coordinates into an internal RGBA tuple.
 */
export function lch2rgb(...args: unknown[]): [number, number, number, number] {
  const values = unpack(args, 'lch') as number[];
  const [l = 0, c = 0, h = 0] = values;
  const [L, a, b_] = lch2lab(l, c, h);
  const [r, g, b] = lab2rgb(L, a, b_);
  return [r, g, b, values.length > 3 ? (values[3] ?? 1) : 1];
}
