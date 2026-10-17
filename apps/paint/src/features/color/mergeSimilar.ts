import { labDistance } from './colorModels';

/**
 * A color history, newest first, after using `color` (`#rrggbb`): when the history already holds a color closer to it
 * than `threshold` (a CIE76 difference), that earlier color moves to the front instead and `color` is not added, so
 * near-duplicates do not fill the history, as in Infinite Painter's "smart color selection". Otherwise `color` goes to
 * the front. The result is not limited in length; slice it to the history's size.
 */
export function mergeSimilar(history: readonly string[], color: string, threshold = similarColorDistance): string[] {
  const kept = history.find((entry) => labDistance(entry, color) < threshold) ?? color;
  return [kept, ...history.filter((entry) => entry !== kept)];
}

/** The CIE76 difference under which two colors count as the same for a history: about two noticeable steps. */
export const similarColorDistance = 4;
