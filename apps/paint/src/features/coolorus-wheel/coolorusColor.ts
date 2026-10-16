import { hsvToHex, type Hsv } from '../color/hsv';
import { hexToWheel } from '../color-wheel/oklch';

/**
 * Turns a hue on the painter's RYB wheel into the RGB hue it shows, both in degrees `[0, 360)`. On the RYB wheel red,
 * yellow and blue are primaries a third of the wheel apart, so red faces green and yellow faces violet, as painters
 * mix them and as Coolorus and Itten's wheel lay them out; the RGB wheel gives the yellow-to-red third a sixth of its
 * circle. Piecewise linear between the anchors in `rybAnchors`, so it is monotonic and `rgbToRybHue` inverts it.
 */
export function rybToRgbHue(ryb: number) {
  return interpolate(wrap(ryb), 0, 1);
}

/** Turns an RGB hue into its place on the painter's RYB wheel; the inverse of `rybToRgbHue`. */
export function rgbToRybHue(rgb: number) {
  return interpolate(wrap(rgb), 1, 0);
}

/**
 * Keeps the perceived lightness (OKLab L) of `from` in `next`, an HSV color with a new hue: lowers or raises the
 * value at the same saturation, and where even full value is too dark, as a light yellow turned to blue, also lowers
 * the saturation toward white. Black and white stay as they are.
 */
export function keepLightness(from: string, next: Hsv): Hsv {
  const target = hexToWheel(from).l;
  const lightness = (hsv: Hsv) => hexToWheel(hsvToHex(hsv)).l;
  if (lightness({ ...next, v: 1 }) >= target) {
    return { ...next, v: bisect((v) => lightness({ ...next, v }), target, 0, 1) };
  }

  // Less saturation is lighter at full value, so the search runs from white (0) up to the saturation asked for.
  return { ...next, v: 1, s: bisect((s) => -lightness({ ...next, v: 1, s }), -target, 0, next.s) };
}

/** RYB hues and the RGB hues they show: red, orange, yellow, green, blue and violet, then red again. */
const rybAnchors: readonly (readonly [number, number])[] = [
  [0, 0],
  [60, 30],
  [120, 60],
  [180, 120],
  [240, 240],
  [300, 285],
  [360, 360]
];

/** Maps `hue` from the anchors' column `from` to column `to`. */
function interpolate(hue: number, from: 0 | 1, to: 0 | 1) {
  for (let index = 1; index < rybAnchors.length; index++) {
    const start = rybAnchors[index - 1]!,
      end = rybAnchors[index]!;
    if (hue <= end[from]) {
      const t = (hue - start[from]) / (end[from] - start[from]);
      return wrap(start[to] + t * (end[to] - start[to]));
    }
  }

  return 0;
}

function wrap(hue: number) {
  return ((hue % 360) + 360) % 360;
}

/** The input in `[low, high]` where the increasing `measure` reaches `target`, to well below an 8-bit step. */
function bisect(measure: (value: number) => number, target: number, low: number, high: number) {
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (measure(middle) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}
