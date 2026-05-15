import { Color } from '../color';
import type { ColorValue } from '../types';

type ChannelReader = (mode: string) => number[];

function ensureColor(value: ColorValue): Color {
  return value instanceof Color ? value : new Color(value);
}

function readChannels(color: Color, mode: string): number[] {
  const get = color.get;
  if (typeof get !== 'function') {
    throw new Error('Missing get method');
  }

  const value = (get as ChannelReader).call(color, mode);
  if (!Array.isArray(value)) {
    throw new Error(`Mode ${mode} did not return channel data`);
  }

  return value;
}

export function distance(a: ColorValue, b: ColorValue, mode = 'lab'): number {
  const left = readChannels(ensureColor(a), mode);
  const right = readChannels(ensureColor(b), mode);
  let sumSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sumSquared += delta * delta;
  }

  return Math.sqrt(sumSquared);
}
