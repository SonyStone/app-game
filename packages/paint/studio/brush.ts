import type { Point } from './camera';
import type { BrushEngineSelection } from './composition/defineBrushEngine';
import { defaultStrokeSettings, type StrokeSettings } from './strokeSettings';

/** Brush settings are captured at stroke start; opacity applies once to the entire stroke. */
export type Brush = {
  /** Optional engine/preset selection. Missing selection preserves the application's tool routing. */
  engine?: BrushEngineSelection;
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
  /** Input filtering, interpolation, and pressure calibration for this stroke. */
  stroke: StrokeSettings;
};
/** Actual, non-predicted input in document space. Mouse pressure is normalized by the input adapter. */
export type Sample = Point & {
  pressure: number;
  time: number;
  /** Tablet tilt in degrees and clockwise barrel rotation, when available. */
  tiltX?: number;
  tiltY?: number;
  rotation?: number;
  tangentialPressure?: number;
};
/** A GPU-ready round brush stamp, in document pixels. */
export type Dab = Point & {
  radius: number;
  flow: number;
  /** Packed ABR bounds/transform/dynamics/color. Radius is the conservative tile-culling extent. */
  abr?: { data: Float32Array; secondary: boolean };
};

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
    mixing: 'linear',
    stroke: defaultStrokeSettings()
  };
}

/** Resamples by distance measured in pressure-scaled brush diameters.
 * Carries fractional stamp spacing across input batches; linearly interpolated pressure ramps
 * produce the same stamps even when the browser subdivides their pointer samples.
 */
export function createStrokeSampler(brush: Brush) {
  let previous: Sample | undefined;
  const baseSpacing = brush.size * brush.spacing;
  // Match the radius floor below; a half-pixel minimum step would visibly dot thin tips.
  const minimumSpacing = Math.max(0.05, 0.5 * brush.spacing, baseSpacing * 0.04);
  const step = (pressure: number) =>
    brush.pressureSize ? Math.max(minimumSpacing, baseSpacing * pressure) : Math.max(0.05, baseSpacing);
  let remaining = 1;
  const dab = (sample: Sample): Dab => ({
    x: sample.x,
    y: sample.y,
    radius: Math.max(0.25, brush.size * 0.5 * (brush.pressureSize ? Math.max(0.04, sample.pressure) : 1)),
    flow: brush.flow * (brush.pressureFlow ? sample.pressure : 1)
  });
  const sampler = {
    /** Appends real input samples. No repeated endpoint stamp is added on pointerup. */
    add(samples: readonly Sample[]): Dab[] {
      const result: Dab[] = [];
      for (const input of samples) {
        if (![input.x, input.y, input.pressure, input.time].every(Number.isFinite)) continue;
        const sample = { ...input, pressure: Math.max(0, Math.min(1, input.pressure)) };
        if (!previous) {
          result.push(dab(sample));
          previous = sample;
          continue;
        }
        const dx = sample.x - previous.x,
          dy = sample.y - previous.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0) {
          const delta = sample.pressure - previous.pressure;
          // step(p) is linear except where the pressure/minimum-radius floor takes over.
          const crossing = (minimumSpacing / baseSpacing - previous.pressure) / delta;
          const cuts = brush.pressureSize && crossing > 0 && crossing < 1 ? [0, crossing, 1] : [0, 1];
          for (let i = 1; i < cuts.length; i++) {
            const from = cuts[i - 1]!,
              to = cuts[i]!;
            const length = distance * (to - from);
            const startStep = step(previous.pressure + delta * from);
            const endStep = step(previous.pressure + delta * to);
            const slope = (endStep - startStep) / length;
            // Integrate 1 / step(s), then invert it for each whole stamp interval.
            // log1p/expm1 retain precision for nearly constant pressure.
            const intervals = slope === 0 ? length / startStep : Math.log1p((endStep - startStep) / startStep) / slope;
            let interval = remaining;
            while (interval <= intervals + 1e-10) {
              const offset = slope === 0 ? interval * startStep : (startStep * Math.expm1(slope * interval)) / slope;
              const t = from + Math.min(length, offset) / distance;
              result.push(
                dab({
                  x: previous.x + dx * t,
                  y: previous.y + dy * t,
                  pressure: previous.pressure + delta * t,
                  time: sample.time
                })
              );
              interval++;
            }
            remaining = interval - intervals;
          }
        }
        previous = sample;
      }
      return result;
    },
    /** Samples a disposable tail without advancing committed spacing or pressure history. */
    preview(samples: readonly Sample[]): Dab[] {
      const savedPrevious = previous,
        savedRemaining = remaining;
      try {
        return sampler.add(samples);
      } finally {
        previous = savedPrevious;
        remaining = savedRemaining;
      }
    }
  };
  return sampler;
}

/** Enumerates signed tile coordinates intersecting a stamp, including its antialiasing fringe. */
export function dabTiles(dab: Dab, size = TILE_SIZE): string[] {
  const keys: string[] = [];
  const radius = dab.radius + 1;
  for (let y = Math.floor((dab.y - radius) / size); y <= Math.floor((dab.y + radius) / size); y++) {
    for (let x = Math.floor((dab.x - radius) / size); x <= Math.floor((dab.x + radius) / size); x++) {
      const dx = Math.max(x * size - dab.x, 0, dab.x - (x + 1) * size);
      const dy = Math.max(y * size - dab.y, 0, dab.y - (y + 1) * size);
      if (dx * dx + dy * dy <= radius * radius) keys.push(`${x},${y}`);
    }
  }
  return keys;
}

/** Tile edge in document pixels; persisted files record this value for format compatibility. */
export const TILE_SIZE = 256;
