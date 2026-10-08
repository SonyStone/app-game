import { hsvToHex } from '../../../../features/color/hsv';

/**
 * The Hive's hexagonal palette, after the classic hex colour pickers: hues around, the middle cell's grey toward
 * the middle. With a white middle (the default) the rings run from pure hues outside to pale tints inside; a black
 * middle turns them into shades, a mid grey into muted tones. `hue` turns every hue around the palette.
 */
export type PaletteState = {
  /** Degrees added to every cell's hue. */
  hue: number;
  /** The middle cell's lightness, 0 (black) – 1 (white). */
  light: number;
};

/** The colour of a palette cell `ring` steps out (0 the middle, 3 the rim) at `angle` degrees clockwise from up. */
export function paletteColor(state: PaletteState, ring: number, angle: number) {
  const middle = grey(state.light);
  if (ring === 0) {
    return middle;
  }

  const pure = hsvToHex({ h: (((angle + state.hue) % 360) + 360) % 360, s: 0.9, v: 0.94 });
  return mix(middle, pure, ring / 3);
}

/** A neutral grey of lightness 0–1. */
export function grey(level: number) {
  const channel = Math.round(Math.min(1, Math.max(0, level)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

/** Mixes two `#rrggbb` colours, `amount` 0 giving `a` and 1 giving `b`. */
function mix(a: string, b: string, amount: number) {
  const channels = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const from = channels(a);
  const to = channels(b);
  return `#${from
    .map((channel, index) =>
      Math.round(channel + (to[index]! - channel) * amount)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
