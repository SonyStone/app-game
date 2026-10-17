import { hexToWheel, wheelToHex } from '../color-wheel/oklch';
import { hexToHsv, hsvToHex } from './hsv';

/*
 * Tone: a color's perceived lightness, OKLab's L, which is what remains of the color in a grayscale view. Infinite
 * Painter's Tone Lock keeps it while the hue changes, and its Compare tone shows it under the color swatches.
 */

/**
 * `color` (`#rrggbb`) moved to the HSB hue `hue` (degrees) at the same tone, as Infinite Painter's Tone Lock adjusts
 * brightness and saturation when the hue changes: the result has exactly the hue `hue` (up to 8-bit rounding) and
 * the OKLab lightness of `color`. It keeps the HSB saturation of `color` and finds the brightness for the tone; where
 * even full brightness is too dark at that saturation (a light yellow turned blue), it gives up as much saturation as
 * the tone requires. Grays stay gray.
 *
 * Moving the hue step by step would lose saturation for good wherever it had to give some up, so callers dragging a
 * hue should pass the color the drag started from each time.
 */
export function withHue(color: string, hue: number): string {
  const target = tone(color);
  const h = ((hue % 360) + 360) % 360;
  const { s } = hexToHsv(color);
  if (hsvTone(h, s, 1) >= target) {
    return hsvToHex({ h, s, v: bisect((v) => hsvTone(h, s, v) < target) });
  }

  // At full brightness the tone falls as saturation rises, from white's.
  return hsvToHex({ h, s: bisect((saturation) => hsvTone(h, saturation, 1) > target, 0, s), v: 1 });
}

/** The tone of `color` (`#rrggbb`): OKLab lightness from 0 (black) to 1 (white). */
export function tone(color: string): number {
  return hexToWheel(color).l;
}

/** The gray of the same tone as `color`, as `#rrggbb`: the color as a grayscale view shows it. */
export function toneGray(color: string): string {
  return wheelToHex({ l: tone(color), s: 0, h: 0 });
}

/**
 * The value in `[low, high]` where `below` turns from true to false, `below` being true at `low` and false at
 * `high`, to well under an 8-bit step.
 */
function bisect(below: (value: number) => boolean, low = 0, high = 1) {
  for (let step = 0; step < 20; step++) {
    const middle = (low + high) / 2;
    if (below(middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

/** The OKLab lightness of an HSV color, unrounded. */
function hsvTone(h: number, s: number, v: number) {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return decode(v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  const [r, g, b] = [channel(5), channel(3), channel(1)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * short;
}

/** The sRGB transfer function, encoded to linear light. */
function decode(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
