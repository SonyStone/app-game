/**
 * Press-and-drag values on the pebble: the drag moves a value from where it started, by `pixelsPerUnit`, but never
 * so slowly that the screen's edge cuts the range off. The pebble may rest against an edge, so on one side of the
 * press there may be only a few pixels; there the same drag covers the rest of the range, so the limit is reachable
 * either way.
 *
 * `travel` is the drag toward more (positive) or less (negative); `room` the pixels between the press and the
 * screen's edge in each direction. Sizes scrub geometrically, so that small brushes get as much travel as large ones.
 */
export function scrubValue(options: {
  start: number;
  min: number;
  max: number;
  travel: number;
  room: { more: number; less: number };
  /** Pixels per unit: per doubling for `log`, per whole range for `linear`. */
  pixelsPerUnit: number;
  scale: 'log' | 'linear';
}): number {
  const { min, max, travel, room, pixelsPerUnit, scale } = options;
  const start = Math.min(max, Math.max(min, options.start));
  const toUnits = scale === 'log' ? (value: number) => Math.log2(value) : (value: number) => value / (max - min);
  const fromUnits = scale === 'log' ? (units: number) => 2 ** units : (units: number) => units * (max - min);
  const more = travel >= 0;
  const remaining = more ? toUnits(max) - toUnits(start) : toUnits(start) - toUnits(min);
  const space = Math.max(1, more ? room.more : room.less);
  const perPixel = Math.max(1 / pixelsPerUnit, remaining / space);
  const units = toUnits(start) + travel * perPixel;
  return Math.min(max, Math.max(min, fromUnits(units)));
}

/**
 * The axis a pebble drag adjusts, once it has moved `threshold` pixels: vertical drags change the size, horizontal
 * ones the opacity. Undecided below the threshold.
 */
export function scrubAxis(offset: { x: number; y: number }, threshold = 6): 'size' | 'opacity' | undefined {
  if (Math.hypot(offset.x, offset.y) < threshold) {
    return undefined;
  }

  return Math.abs(offset.y) >= Math.abs(offset.x) ? 'size' : 'opacity';
}
