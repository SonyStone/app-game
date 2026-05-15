import { Color } from '../color';
import { interpolator } from '../interpolator';
import type { ColorValue, Interpolator as InterpolatorFn } from '../types';

type AlphaReader = () => number;
type AlphaWriter = (value: number) => Color;

function ensureColor(value: ColorValue): Color {
  return value instanceof Color ? value : new Color(value);
}

function readAlpha(color: Color): number {
  const alpha = color.alpha;
  if (typeof alpha !== 'function') {
    throw new Error('Missing alpha reader');
  }

  return (alpha as AlphaReader).call(color);
}

function writeAlpha(color: Color, value: number): Color {
  const alpha = color.alpha;
  if (typeof alpha !== 'function') {
    throw new Error('Missing alpha writer');
  }

  return (alpha as AlphaWriter).call(color, value);
}

export function mix(col1: ColorValue, col2: ColorValue, f = 0.5, ...rest: string[]): Color {
  const registry = interpolator as Record<string, InterpolatorFn>;
  let mode = rest[0] ?? 'lrgb';
  if (registry[mode] == null && rest.length === 0) {
    const fallbackMode = Object.keys(registry)[0];
    if (fallbackMode == null) {
      throw new Error('No interpolation modes are registered');
    }
    mode = fallbackMode;
  }

  const interpolate = registry[mode];
  if (interpolate == null) {
    throw new Error(`interpolation mode ${mode} is not defined`);
  }

  const left = ensureColor(col1);
  const right = ensureColor(col2);
  const alpha = readAlpha(left) + f * (readAlpha(right) - readAlpha(left));
  return writeAlpha(interpolate(left, right, f), alpha);
}
