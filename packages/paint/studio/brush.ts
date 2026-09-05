import type { Point } from './camera';

/** Brush settings are captured at stroke start; opacity applies once to the entire stroke. */
export type Brush = {
  color: string;
  size: number;
  hardness: number;
  flow: number;
  opacity: number;
  spacing: number;
  pressureSize: boolean;
  pressureFlow: boolean;
  tool: 'brush' | 'eraser';
  /** Linear light avoids the dark midpoint of mixing encoded RGB. Classic preserves legacy stroke behavior. */
  mixing: 'linear' | 'classic';
};
/** Actual, non-predicted input in document space. Mouse pressure is normalized by the input adapter. */
export type Sample = Point & { pressure: number; time: number };
/** A GPU-ready round brush stamp, in document pixels. */
export type Dab = Point & { radius: number; flow: number };

/** A soft round brush with explicit, independent flow and stroke opacity. */
export function defaultBrush(): Brush {
  return {
    color: '#344b66',
    size: 32,
    hardness: 0.65,
    flow: 0.35,
    opacity: 1,
    spacing: 0.12,
    pressureSize: true,
    pressureFlow: false,
    tool: 'brush',
    mixing: 'linear'
  };
}

/** Resamples a polyline by arc length, preserving spacing across event and frame boundaries. */
export function createStrokeSampler(brush: Brush) {
  let previous: Sample | undefined;
  const spacing = Math.max(0.5, brush.size * brush.spacing);
  let remaining = spacing;
  const dab = (sample: Sample): Dab => ({
    x: sample.x,
    y: sample.y,
    radius: Math.max(0.25, brush.size * 0.5 * (brush.pressureSize ? Math.max(0.04, sample.pressure) : 1)),
    flow: brush.flow * (brush.pressureFlow ? sample.pressure : 1)
  });
  return {
    /** Appends real input samples. No repeated endpoint stamp is added on pointerup. */
    add(samples: readonly Sample[]): Dab[] {
      const result: Dab[] = [];
      for (const sample of samples) {
        if (![sample.x, sample.y, sample.pressure, sample.time].every(Number.isFinite)) continue;
        if (!previous) {
          result.push(dab(sample));
          previous = sample;
          continue;
        }
        const dx = sample.x - previous.x,
          dy = sample.y - previous.y;
        const distance = Math.hypot(dx, dy);
        let offset = remaining;
        while (offset <= distance) {
          const t = offset / distance;
          result.push(
            dab({
              x: previous.x + dx * t,
              y: previous.y + dy * t,
              pressure: previous.pressure + (sample.pressure - previous.pressure) * t,
              time: sample.time
            })
          );
          offset += spacing;
        }
        remaining = offset - distance;
        previous = sample;
      }
      return result;
    }
  };
}

/** Enumerates signed tile coordinates intersecting a stamp, including its antialiasing fringe. */
export function dabTiles(dab: Dab, size = TILE_SIZE): string[] {
  const keys: string[] = [];
  const radius = dab.radius + 1;
  for (let y = Math.floor((dab.y - radius) / size); y <= Math.floor((dab.y + radius) / size); y++) {
    for (let x = Math.floor((dab.x - radius) / size); x <= Math.floor((dab.x + radius) / size); x++)
      keys.push(`${x},${y}`);
  }
  return keys;
}

/** Tile edge in document pixels; persisted files record this value for format compatibility. */
export const TILE_SIZE = 256;
