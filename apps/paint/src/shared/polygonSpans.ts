import type { Point } from '@app-game/paint-core/camera';

/**
 * Spans `[start, end)` of whole pixels inside a closed polygon, such as a lasso outline, on the row whose pixel centers
 * lie at `y`, by the even-odd rule; a pixel belongs to a span when its center lies inside.
 */
export function polygonSpans(points: readonly Point[], y: number): (readonly [number, number])[] {
  const crossings: number[] = [];
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index]!,
      b = points[previous]!;
    if (a.y > y !== b.y > y) {
      crossings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  }

  crossings.sort((a, b) => a - b);
  const spans: (readonly [number, number])[] = [];
  for (let index = 0; index + 1 < crossings.length; index += 2) {
    spans.push([Math.ceil(crossings[index]! - 0.5), Math.ceil(crossings[index + 1]! - 0.5)]);
  }

  return spans;
}

/** One byte per pixel of `area`, row by row: 1 inside the polygon, 0 outside. */
export function polygonMask(
  points: readonly Point[],
  area: { left: number; top: number; width: number; height: number }
): Uint8Array {
  const mask = new Uint8Array(area.width * area.height);
  for (let row = 0; row < area.height; row++) {
    for (const [start, end] of polygonSpans(points, area.top + row + 0.5)) {
      const from = Math.max(start, area.left) - area.left,
        to = Math.min(end, area.left + area.width) - area.left;
      if (to > from) {
        mask.fill(1, row * area.width + from, row * area.width + to);
      }
    }
  }

  return mask;
}
