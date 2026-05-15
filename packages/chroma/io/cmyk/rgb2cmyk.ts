import { unpack } from '../../utils';

const { max } = Math;

export function rgb2cmyk(...args: unknown[]): [number, number, number, number] {
  const [r = 0, g = 0, b = 0] = unpack(args, 'rgb') as number[];
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const k = 1 - max(red, max(green, blue));
  const factor = k < 1 ? 1 / (1 - k) : 0;
  return [(1 - red - k) * factor, (1 - green - k) * factor, (1 - blue - k) * factor, k];
}
