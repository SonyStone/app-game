import { last, unpack } from '../../utils';
import { rgb2hsl } from '../hsl/rgb2hsl';
import { hsl2css } from './hsl2css';

const { round } = Math;

/**
 * Formats RGB(A) channel values as a CSS `rgb(...)`, `rgba(...)`, `hsl(...)`, or `hsla(...)` string.
 */
export function rgb2css(...args: unknown[]): string {
  const rgba = [...(unpack(args, 'rgba') as number[])];
  let mode = last(args) ?? 'rgb';
  if (mode.startsWith('hsl')) {
    return hsl2css(rgb2hsl(rgba), mode);
  }

  rgba[0] = round(rgba[0] ?? 0);
  rgba[1] = round(rgba[1] ?? 0);
  rgba[2] = round(rgba[2] ?? 0);
  if (mode === 'rgba' || (rgba.length > 3 && (rgba[3] ?? 1) < 1)) {
    rgba[3] = rgba.length > 3 ? (rgba[3] ?? 1) : 1;
    mode = 'rgba';
  }

  return `${mode}(${rgba.slice(0, mode === 'rgb' ? 3 : 4).join(',')})`;
}
