import { unpackNumberArray } from '../../utils';
import { lch2rgb } from './lch2rgb';

/**
 * Converts HCL input into an internal RGBA tuple.
 *
 * HCL is the same underlying space as LCh, but ordered as hue, chroma, then lightness.
 */
export function hcl2rgb(...args: unknown[]): [number, number, number, number] {
  const hcl = unpackNumberArray(args, 'hcl');
  if (hcl == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const lch = [hcl[2] ?? 0, hcl[1] ?? 0, hcl[0] ?? 0] as const;
  return lch2rgb(...lch);
}
