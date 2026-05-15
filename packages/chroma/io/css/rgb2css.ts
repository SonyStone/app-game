import type { CssColorString } from '../../types';
import { last, unpackNumberArray } from '../../utils';
import { rgb2hsl } from '../hsl/rgb2hsl';
import { hsl2css } from './hsl2css';

const { round } = Math;
type CssStringMode = 'hsl' | 'hsla' | 'rgb' | 'rgba';

/**
 * Formats RGB(A) channel values as a CSS `rgb(...)`, `rgba(...)`, `hsl(...)`, or `hsla(...)` string.
 */
export function rgb2css(...args: unknown[]): CssColorString {
  const rgba = unpackNumberArray(args, 'rgba');
  if (rgba == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const channels = [...rgba];
  let mode = last<CssStringMode>(args) ?? 'rgb';
  if (mode.startsWith('hsl')) {
    return hsl2css(rgb2hsl(channels), mode);
  }

  channels[0] = round(channels[0] ?? 0);
  channels[1] = round(channels[1] ?? 0);
  channels[2] = round(channels[2] ?? 0);
  if (mode === 'rgba' || (channels.length > 3 && (channels[3] ?? 1) < 1)) {
    channels[3] = channels.length > 3 ? (channels[3] ?? 1) : 1;
    mode = 'rgba';
  }

  return `${mode}(${channels.slice(0, mode === 'rgb' ? 3 : 4).join(',')})` as CssColorString;
}
