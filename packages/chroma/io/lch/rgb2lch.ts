import type { ColorSpaces } from '../../types';
import { unpackNumberArray } from '../../utils';
import { rgb2lab } from '../lab/rgb2lab';
import { lab2lch } from './lab2lch';

/**
 * Converts RGB input into CIELCh coordinates.
 */
export function rgb2lch(...args: unknown[]): ColorSpaces['lch'] {
  const values = unpackNumberArray(args, 'rgb');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [r = 0, g = 0, b = 0] = values;
  const [l, a, b_] = rgb2lab(r, g, b);
  return lab2lch(l, a, b_);
}
