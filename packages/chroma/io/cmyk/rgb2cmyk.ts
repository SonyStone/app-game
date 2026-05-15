import type { ColorSpaces, NormalizedChannel } from '../../types';
import { unpackNumberArray } from '../../utils';

const { max } = Math;

export function rgb2cmyk(...args: unknown[]): ColorSpaces['cmyk'] {
  const values = unpackNumberArray(args, 'rgb');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [r = 0, g = 0, b = 0] = values;
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const k = 1 - max(red, max(green, blue));
  const factor = k < 1 ? 1 / (1 - k) : 0;
  return [
    toNormalizedChannel((1 - red - k) * factor),
    toNormalizedChannel((1 - green - k) * factor),
    toNormalizedChannel((1 - blue - k) * factor),
    toNormalizedChannel(k)
  ];
}

function toNormalizedChannel(value: number): NormalizedChannel {
  return value as NormalizedChannel;
}
