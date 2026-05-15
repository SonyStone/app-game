import type { ColorSpaces, HueDegrees, PercentageChannel } from '../../types';
import { unpackNumberArray } from '../../utils';

/**
 * Converts RGB input into HCG channel values.
 *
 * Hue is returned in degrees. Chroma and grayness are normalized to percentage-style 0..100 values.
 */
export function rgb2hcg(...args: unknown[]): ColorSpaces['hcg'] {
  const values = unpackNumberArray(args, 'rgb');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [r = 0, g = 0, b = 0] = values;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const delta = max - min;
  const chroma = (delta * 100) / 255;
  const grayness = (min / (255 - delta)) * 100;
  let hue = Number.NaN;
  if (delta !== 0) {
    if (r === max) {
      hue = (g - b) / delta;
    } else if (g === max) {
      hue = 2 + (b - r) / delta;
    } else {
      hue = 4 + (r - g) / delta;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  return [toHueDegrees(hue), toPercentageChannel(chroma), toPercentageChannel(grayness)];
}

function toHueDegrees(value: number): HueDegrees {
  return value as HueDegrees;
}

function toPercentageChannel(value: number): PercentageChannel {
  return value as PercentageChannel;
}
