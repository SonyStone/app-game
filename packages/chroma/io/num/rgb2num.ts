import { unpack } from '../../utils';

export function rgb2num(...args: unknown[]): number {
  const [r = 0, g = 0, b = 0] = unpack(args, 'rgb') as number[];
  return (r << 16) + (g << 8) + b;
}
