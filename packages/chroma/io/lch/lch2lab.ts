import { DEG2RAD, unpackNumberArray } from '../../utils';

const { cos, sin } = Math;

export function lch2lab(...args: unknown[]): [number, number, number] {
  const values = unpackNumberArray(args, 'lch');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  let [l = 0, c = 0, h = 0] = values;
  if (Number.isNaN(h)) {
    h = 0;
  }
  const radians = h * DEG2RAD;
  return [l, cos(radians) * c, sin(radians) * c];
}
