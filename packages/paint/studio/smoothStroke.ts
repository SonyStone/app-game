import { createStrokeSampler, type Brush, type Dab, type Sample } from './brush';

/** Smooths real input with midpoint quadratic curves, then places stamps by arc length.
 * A two-CSS-pixel input threshold suppresses coordinate quantization at every zoom.
 * The last segment is deferred until another point or finish(); no predicted ink is committed.
 */
export function createSmoothStroke(brush: Brush, zoom = 1) {
  const sampler = createStrokeSampler(brush);
  const scale = Math.max(0.0001, zoom);
  const threshold = 2 / scale;
  const tolerance = Math.min(0.15 / scale, Math.max(0.05, brush.size * 0.025));
  let control: Sample | undefined;
  let start: Sample | undefined;
  let endpoint: Sample | undefined;
  let finished = false;
  const append = (sample: Sample): Dab[] => {
    if (!control || !start) {
      start = control = sample;
      return sampler.add([sample]);
    }
    const end = midpoint(control, sample);
    const points: Sample[] = [];
    flatten(start, control, end, tolerance, points);
    start = end;
    control = sample;
    return sampler.add(points);
  };
  return {
    /** Preserves order and pressure regardless of pointer-event/frame batching. */
    add(samples: readonly Sample[]): Dab[] {
      if (finished) return [];
      const result: Dab[] = [];
      for (const sample of samples) {
        if (![sample.x, sample.y, sample.pressure, sample.time].every(Number.isFinite)) continue;
        endpoint = sample;
        if (!control || Math.hypot(sample.x - control.x, sample.y - control.y) >= threshold)
          for (const dab of append(sample)) result.push(dab);
      }
      return result;
    },
    /** Flushes the curve tail to the last real position, without duplicating a stationary tap. */
    finish(): Dab[] {
      if (finished || !endpoint) return [];
      const result = control !== endpoint ? append(endpoint) : [];
      for (const dab of sampler.add([endpoint])) result.push(dab);
      finished = true;
      return result;
    }
  };
}

function midpoint(a: Sample, b: Sample): Sample {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    pressure: (a.pressure + b.pressure) / 2,
    time: (a.time + b.time) / 2
  };
}

/** Subdivision bounds geometric error in document space; the convex hull prevents overshoot. */
function flatten(a: Sample, b: Sample, c: Sample, tolerance: number, output: Sample[], depth = 0) {
  const chord = midpoint(a, c);
  if (depth >= 16 || Math.hypot(b.x - chord.x, b.y - chord.y) <= tolerance * 2) {
    output.push(c);
    return;
  }
  const ab = midpoint(a, b),
    bc = midpoint(b, c),
    center = midpoint(ab, bc);
  flatten(a, ab, center, tolerance, output, depth + 1);
  flatten(center, bc, c, tolerance, output, depth + 1);
}
