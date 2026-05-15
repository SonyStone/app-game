import { unpack } from '../../utils';
import { rgb2lab } from '../lab/rgb2lab';
import { lab2lch } from './lab2lch';

/**
 * Converts RGB input into CIELCh coordinates.
 */
export function rgb2lch(...args: unknown[]): [number, number, number] {
  const [r = 0, g = 0, b = 0] = unpack(args, 'rgb') as number[];
  const [l, a, b_] = rgb2lab(r, g, b);
  return lab2lch(l, a, b_);
}
