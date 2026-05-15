import { unpack } from '../../utils';

/**
 * Converts RGB(A) input into HSL channel values.
 *
 * Hue is returned in degrees. Saturation and lightness are normalized to 0..1.
 * If an alpha channel is present, it is preserved as the fourth tuple entry.
 */
export function rgb2hsl(...args: unknown[]): number[] {
  const rgba = unpack(args, 'rgba') as number[];
  let [r = 0, g = 0, b = 0] = rgba;
  r /= 255;
  g /= 255;
  b /= 255;

  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const lightness = (max + min) / 2;
  let saturation = 0;
  let hue = Number.NaN;

  if (max !== min) {
    saturation = lightness < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
    if (r === max) {
      hue = (g - b) / (max - min);
    } else if (g === max) {
      hue = 2 + (b - r) / (max - min);
    } else {
      hue = 4 + (r - g) / (max - min);
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  return rgba.length > 3 && rgba[3] !== undefined
    ? [hue, saturation, lightness, rgba[3]]
    : [hue, saturation, lightness];
}
