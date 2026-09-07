import type { Brush, Sample } from './brush';
import { createLeonardoProcessor } from './leonardoStroke';
import { interpolateTabletAxes } from './tabletAxes';

/** Per-stroke sample transformation. Preview must not advance committed state; finish flushes once. */
export type StrokeProcessor = {
  add(samples: readonly Sample[]): Sample[];
  preview(): Sample[];
  finish(): Sample[];
};

/** Creates independent filter/curve state at pen-down. Zoom is document-to-CSS scale. */
export type StrokeProcessorFactory = (brush: Brush, zoom: number) => StrokeProcessor;

/** Built-in choices; applications may supply a different registry without changing the runtime. */
export const studioProcessors = {
  none: createRawProcessor,
  studio: createStudioProcessor,
  normal: createLeonardoProcessor,
  smooth: createLeonardoProcessor
} satisfies Record<string, StrokeProcessorFactory>;

/** Preserves real input and pressure, with no withheld endpoint or smoothing. */
export function createRawProcessor(): StrokeProcessor {
  let finished = false;
  return {
    add: (samples) =>
      finished
        ? []
        : samples.filter((sample) => [sample.x, sample.y, sample.pressure, sample.time].every(Number.isFinite)),
    preview: () => [],
    finish() {
      finished = true;
      return [];
    }
  };
}

/** Midpoint quadratics with a two-CSS-pixel threshold and bounded geometric error. */
export function createStudioProcessor(brush: Brush, zoom = 1): StrokeProcessor {
  const scale = Math.max(0.0001, zoom);
  const threshold = 2 / scale;
  const tolerance = Math.min(0.15 / scale, Math.max(0.05, brush.size * 0.025));
  let control: Sample | undefined;
  let start: Sample | undefined;
  let endpoint: Sample | undefined;
  let finished = false;
  const append = (sample: Sample): Sample[] => {
    if (!control || !start) {
      start = control = sample;
      return [sample];
    }
    const end = midpoint(control, sample);
    const points: Sample[] = [];
    flatten(start, control, end, tolerance, points);
    start = end;
    control = sample;
    return points;
  };
  return {
    /** Preserves order and pressure regardless of pointer-event/frame batching. */
    add(samples: readonly Sample[]): Sample[] {
      if (finished) return [];
      const result: Sample[] = [];
      for (const sample of samples) {
        if (![sample.x, sample.y, sample.pressure, sample.time].every(Number.isFinite)) continue;
        endpoint = sample;
        if (!control || Math.hypot(sample.x - control.x, sample.y - control.y) >= threshold)
          for (const point of append(sample)) result.push(point);
      }
      return result;
    },
    /** Renders the withheld curve to the latest real point without committing its provisional shape. */
    preview(): Sample[] {
      if (finished || !endpoint || !start || !control) return [];
      const points: Sample[] = [];
      flatten(start, control, endpoint, tolerance, points);
      return points;
    },
    /** Flushes the curve tail to the last real position, without duplicating a stationary tap. */
    finish(): Sample[] {
      if (finished || !endpoint) return [];
      const result = control !== endpoint ? append(endpoint) : [];
      result.push(endpoint);
      finished = true;
      return result;
    }
  };
}

function midpoint(a: Sample, b: Sample): Sample {
  return {
    ...interpolateTabletAxes(a, b, 0.5),
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
