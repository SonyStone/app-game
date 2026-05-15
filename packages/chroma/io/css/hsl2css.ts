import type { CssColorString } from '../../types';
import { last, unpackNumberArray } from '../../utils';

const roundPercentage = (value: number) => Math.round(value * 100) / 100;
type HslStringMode = 'hsl' | 'hsla';

export function hsl2css(...args: unknown[]): CssColorString {
  const hsla = unpackNumberArray(args, 'hsla');
  if (hsla == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const channels = [...hsla];
  let mode = last<HslStringMode>(args) ?? 'hsl';
  channels[0] = roundPercentage(channels[0] ?? 0);
  channels[1] = Number(`${roundPercentage((channels[1] ?? 0) * 100)}`);
  channels[2] = Number(`${roundPercentage((channels[2] ?? 0) * 100)}`);

  const components = [`${channels[0]}`, `${channels[1]}%`, `${channels[2]}%`];
  if (mode === 'hsla' || (channels.length > 3 && (channels[3] ?? 1) < 1)) {
    components.push(`${channels.length > 3 ? (channels[3] ?? 1) : 1}`);
    mode = 'hsla';
  }

  return `${mode}(${components.join(',')})` as CssColorString;
}
