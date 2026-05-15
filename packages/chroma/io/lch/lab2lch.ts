import { RAD2DEG, unpack } from '../../utils';

const { atan2, round, sqrt } = Math;

export function lab2lch(...args: unknown[]): [number, number, number] {
  const [l = 0, a = 0, b = 0] = unpack(args, 'lab') as number[];
  const chroma = sqrt(a * a + b * b);
  let hue = (atan2(b, a) * RAD2DEG + 360) % 360;
  if (round(chroma * 10000) === 0) {
    hue = Number.NaN;
  }
  return [l, chroma, hue];
}
