import type { Sample } from './brush';

/** Streams uniform Catmull–Rom curves with one sample of lookahead and bounded flattening error. */
export function createCubicStroke(size: number, zoom = 1) {
  const tolerance = Math.min(0.15 / Math.max(0.0001, zoom), Math.max(0.05, size * 0.025));
  let before: Sample | undefined;
  let start: Sample | undefined;
  let end: Sample | undefined;
  let finished = false;
  return {
    /** Pads the first tangent with the starting sample; only committed input supports interior segments. */
    add(samples: readonly Sample[]): Sample[] {
      if (finished) return [];
      const output: Sample[] = [];
      for (const sample of samples) {
        if (!before || !start) {
          before = start = sample;
          output.push(sample);
        } else if (!end) {
          end = sample;
        } else {
          segment(before, start, end, sample, tolerance, output);
          before = start;
          start = end;
          end = sample;
        }
      }
      return output;
    },
    /** Evaluates the withheld segment without consuming its lookahead state. */
    preview(): Sample[] {
      const output: Sample[] = [];
      if (!finished && before && start && end) segment(before, start, end, extrapolate(start, end), tolerance, output);
      return output;
    },
    /** Uses an extrapolated neighbor only for tangent support and flushes to the final filtered sample. */
    finish(): Sample[] {
      if (finished) return [];
      finished = true;
      const output: Sample[] = [];
      if (before && start && end) segment(before, start, end, extrapolate(start, end), tolerance, output);
      return output;
    }
  };
}

/** Bezier controls are the equivalent form of the recovered uniform Catmull–Rom polynomial. */
function segment(p0: Sample, p1: Sample, p2: Sample, p3: Sample, tolerance: number, output: Sample[]) {
  // A stationary pressure update must not create a cubic loop or an extra ink deposit.
  if (p1.x === p2.x && p1.y === p2.y) {
    output.push(p2);
    return;
  }
  const control = (origin: Sample, from: Sample, to: Sample): Sample => ({
    x: origin.x + (to.x - from.x) / 6,
    y: origin.y + (to.y - from.y) / 6,
    pressure: origin.pressure + (to.pressure - from.pressure) / 6,
    time: origin.time + (to.time - from.time) / 6
  });
  flatten(p1, control(p1, p0, p2), control(p2, p3, p1), p2, tolerance, output);
}

/** Subdivision checks position and pressure, including pressure changes along geometrically straight lines. */
function flatten(a: Sample, b: Sample, c: Sample, d: Sample, tolerance: number, output: Sample[], depth = 0) {
  const chord1 = mix(a, d, 1 / 3),
    chord2 = mix(a, d, 2 / 3);
  const flat =
    Math.max(Math.hypot(b.x - chord1.x, b.y - chord1.y), Math.hypot(c.x - chord2.x, c.y - chord2.y)) <= tolerance;
  const linearPressure =
    Math.max(Math.abs(b.pressure - chord1.pressure), Math.abs(c.pressure - chord2.pressure)) <= 0.001;
  if (depth >= 16 || (flat && linearPressure)) {
    output.push({ ...d, pressure: Math.max(0, Math.min(1, d.pressure)) });
    return;
  }
  const ab = mix(a, b),
    bc = mix(b, c),
    cd = mix(c, d);
  const abc = mix(ab, bc),
    bcd = mix(bc, cd),
    center = mix(abc, bcd);
  flatten(a, ab, abc, center, tolerance, output, depth + 1);
  flatten(center, bcd, cd, d, tolerance, output, depth + 1);
}

function mix(a: Sample, b: Sample, t = 0.5): Sample {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
    time: a.time + (b.time - a.time) * t
  };
}

function extrapolate(previous: Sample, last: Sample): Sample {
  return mix(previous, last, 2);
}
