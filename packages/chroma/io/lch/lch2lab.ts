import { DEG2RAD, unpack } from '../../utils';

const { cos, sin } = Math;

export function lch2lab(...args: unknown[]): [number, number, number] {
  let [l = 0, c = 0, h = 0] = unpack(args, 'lch') as number[];
  if (Number.isNaN(h)) {
    h = 0;
  }
  const radians = h * DEG2RAD;
  return [l, cos(radians) * c, sin(radians) * c];
}
