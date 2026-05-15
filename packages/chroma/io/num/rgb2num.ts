import type { RgbHexNumber } from '../../types';
import { unpackNumberArray } from '../../utils';

export function rgb2num(...args: unknown[]): RgbHexNumber {
  const values = unpackNumberArray(args, 'rgb');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [r = 0, g = 0, b = 0] = values;
  return ((r << 16) + (g << 8) + b) as RgbHexNumber;
}
