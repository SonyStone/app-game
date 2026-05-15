import { unpack } from '../../utils';
import { lch2rgb } from './lch2rgb';

/**
 * Converts HCL input into an internal RGBA tuple.
 *
 * HCL is the same underlying space as LCh, but ordered as hue, chroma, then lightness.
 */
export function hcl2rgb(...args: unknown[]): [number, number, number, number] {
  const hcl = [...(unpack(args, 'hcl') as number[])].reverse();
  return lch2rgb(...hcl);
}
