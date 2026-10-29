import type { PsdDifference } from '@app-game/psd/viewer';

/** Finds the next native mismatch using the worker heat map's documented gray-match/colored-mismatch contract. Wraps without retaining a coordinate array. */
export function nextMismatch(difference: PsdDifference, previous: number, direction: 1 | -1): number | undefined {
  if (!difference.differingPixels) {
    return undefined;
  }

  const count = difference.width * difference.height;
  for (let step = 1; step <= count; step++) {
    const index = (previous + direction * step + count) % count;
    const offset = index * 4;
    if (
      difference.pixels[offset] !== difference.pixels[offset + 1] ||
      difference.pixels[offset + 1] !== difference.pixels[offset + 2]
    ) {
      return index;
    }
  }

  return undefined;
}
