import { unpack } from '../../utils';

export function cmyk2rgb(...args: unknown[]): [number, number, number, number] {
  const cmyk = unpack(args, 'cmyk') as number[];
  const [c = 0, m = 0, y = 0, k = 0] = cmyk;
  const alpha = cmyk.length > 4 ? (cmyk[4] ?? 1) : 1;
  if (k === 1) {
    return [0, 0, 0, alpha];
  }

  return [
    c >= 1 ? 0 : 255 * (1 - c) * (1 - k),
    m >= 1 ? 0 : 255 * (1 - m) * (1 - k),
    y >= 1 ? 0 : 255 * (1 - y) * (1 - k),
    alpha
  ];
}
