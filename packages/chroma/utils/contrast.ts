import { Color } from '../color';
import type { ColorValue } from '../types';

type LuminanceReader = () => number;

function ensureColor(value: ColorValue): Color {
  return value instanceof Color ? value : new Color(value);
}

function readLuminance(color: Color): number {
  const luminance = color.luminance;
  if (typeof luminance !== 'function') {
    throw new Error('Missing luminance method');
  }

  return (luminance as LuminanceReader).call(color);
}

export function contrast(a: ColorValue, b: ColorValue): number {
  const left = ensureColor(a);
  const right = ensureColor(b);
  const l1 = readLuminance(left);
  const l2 = readLuminance(right);
  return l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
}
