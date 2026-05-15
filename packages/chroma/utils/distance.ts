import { Color } from '../color';
import type { ColorDistanceValue, ColorSpaceName, ColorSpaces, ColorValue } from '../types';

type ChannelReader<Mode extends ColorSpaceName> = () => ColorSpaces[Mode];

function ensureColor(value: ColorValue): Color {
  return value instanceof Color ? value : new Color(value);
}

function readChannels<Mode extends ColorSpaceName>(color: Color, mode: Mode): ColorSpaces[Mode] {
  const reader = color[mode];
  if (typeof reader !== 'function') {
    throw new Error(`Missing ${mode} reader`);
  }

  const value = (reader as ChannelReader<Mode>).call(color);
  if (!Array.isArray(value)) {
    throw new Error(`Mode ${mode} did not return channel data`);
  }

  return value;
}

export function distance(a: ColorValue, b: ColorValue, mode: ColorSpaceName = 'lab'): ColorDistanceValue {
  const left = readChannels(ensureColor(a), mode);
  const right = readChannels(ensureColor(b), mode);
  let sumSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sumSquared += delta * delta;
  }

  return Math.sqrt(sumSquared) as ColorDistanceValue;
}
