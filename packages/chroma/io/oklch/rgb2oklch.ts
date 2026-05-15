import { unpack } from '../../utils';
import { lab2lch } from '../lch/lab2lch';
import { rgb2oklab } from '../oklab/rgb2oklab';

/**
 * Converts RGB input into Oklch coordinates.
 */
export function rgb2oklch(...args: unknown[]): [number, number, number] {
  const [r = 0, g = 0, b = 0] = unpack(args, 'rgb') as number[];
  const [l, a, b_] = rgb2oklab(r, g, b);
  return lab2lch(l, a, b_);
}
