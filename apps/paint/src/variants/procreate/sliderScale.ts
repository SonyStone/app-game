/**
 * Value mappings of the Procreate variant's sliders. A slider position is a fraction 0–1 along its track; the
 * sidebar's brush size slider is geometric, so that small sizes get as much travel as large ones, and every other
 * slider is linear.
 */

/** The fraction of a geometric slider from `min` to `max` at `value`, clamped to the track. */
export function geometricFraction(value: number, min: number, max: number) {
  if (max <= min) {
    return 0;
  }

  return clamp01(Math.log(Math.max(min, value) / min) / Math.log(max / min));
}

/** The value of a geometric slider from `min` to `max` at `fraction`, rounded to tenths below 10 and to whole pixels above. */
export function geometricValue(fraction: number, min: number, max: number) {
  const value = min * (max / min) ** clamp01(fraction);
  return Math.min(max, Math.max(min, value < 10 ? Math.round(value * 10) / 10 : Math.round(value)));
}

/** The fraction of a linear slider from `min` to `max` at `value`, clamped to the track. */
export function linearFraction(value: number, min: number, max: number) {
  return max <= min ? 0 : clamp01((value - min) / (max - min));
}

/** The value of a linear slider from `min` to `max` at `fraction`. */
export function linearValue(fraction: number, min: number, max: number) {
  return min + (max - min) * clamp01(fraction);
}

/**
 * The fraction under a pointer on a track of `length` pixels whose thumb is `thumb` pixels long: the thumb's center
 * follows the pointer and stops where the thumb meets an end. `offset` is the pointer's distance from the track's
 * start (left, or bottom for a vertical track).
 */
export function trackFraction(offset: number, length: number, thumb: number) {
  const travel = length - thumb;
  return travel <= 0 ? 0 : clamp01((offset - thumb / 2) / travel);
}

/** The smallest brush size the size slider reaches, in pixels. */
export const minBrushSize = 1;

/** The lowest opacity the opacity slider reaches; a fully transparent brush would paint nothing. */
export const minOpacity = 0.01;

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
