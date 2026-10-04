import type { Point, ViewSize } from '@app-game/paint-core/camera';

/**
 * Where a floating bar goes next to a shape on screen: centered below the shape's `points`, or above them when there
 * is no room below, and kept inside `size`. `left` is the bar's horizontal center; `bar` is its approximate size.
 */
export function placeBeside(
  points: readonly Point[],
  size: ViewSize,
  bar: { width: number; height: number },
  gap = 16
): { left: number; top: number } {
  const xs = points.map(({ x }) => x),
    ys = points.map(({ y }) => y);
  const below = Math.max(...ys) + gap;
  const top = below + bar.height <= size.height ? below : Math.max(8, Math.min(...ys) - gap - bar.height);
  const center = (Math.min(...xs) + Math.max(...xs)) / 2;
  const half = Math.min(bar.width / 2, size.width / 2);
  return { left: Math.max(half, Math.min(size.width - half, center)), top: Math.min(top, size.height - bar.height) };
}
