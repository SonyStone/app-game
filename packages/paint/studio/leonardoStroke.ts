import { createStrokeSampler, type Brush, type Dab, type Sample } from './brush';
import { createCubicStroke } from './cubicStroke';
import { normalizeStrokeSettings, type StrokeSettings } from './strokeSettings';

/** Reconstructs the researched filter and cubic curve, retaining Studio's distance-based dab placement. */
export function createLeonardoStroke(brush: Brush, zoom = 1) {
  const filter = createStrokeFilter(brush.stroke);
  const curve = createCubicStroke(brush.size, zoom);
  const sampler = createStrokeSampler(brush);
  let finished = false;
  const draw = (samples: readonly Sample[]) => sampler.add(curve.add(samples));
  return {
    /** Every real sample participates, independent of animation-frame or event batching. */
    add(samples: readonly Sample[]): Dab[] {
      return finished ? [] : draw(filter.add(samples));
    },
    /** Catches up when enabled, then flushes the curve once without adding an endpoint stamp. */
    finish(): Dab[] {
      if (finished) return [];
      finished = true;
      return [...draw(filter.finish()), ...sampler.add(curve.finish())];
    }
  };
}

/** Equal-weight sample history, seeded with the first input; calibration follows raw-pressure averaging. */
export function createStrokeFilter(input: StrokeSettings) {
  const settings = normalizeStrokeSettings(input);
  const count = (settings.mode === 'smooth' ? settings.smooth : settings.normal) + 1;
  const history: Sample[] = [];
  let index = 0;
  let latest: Sample | undefined;
  let finished = false;
  const append = (sample: Sample): Sample => {
    if (!history.length) history.push(...Array<Sample>(count).fill(sample));
    history[index] = sample;
    index = (index + 1) % count;
    // Sum offsets from the newest point to retain precision far from the document origin.
    let x = 0,
      y = 0,
      pressure = 0,
      time = 0;
    for (const point of history) {
      x += point.x - sample.x;
      y += point.y - sample.y;
      pressure += point.pressure;
      time += point.time - sample.time;
    }
    const normalized = Math.max(
      0,
      Math.min(1, (pressure / count - settings.minimum) / (settings.maximum - settings.minimum))
    );
    return {
      x: sample.x + x / count,
      y: sample.y + y / count,
      pressure: normalized ** settings.firmness,
      time: sample.time + time / count
    };
  };
  return {
    /** Ignores malformed samples and never carries history between strokes. */
    add(samples: readonly Sample[]): Sample[] {
      if (finished) return [];
      const output: Sample[] = [];
      for (const sample of samples) {
        if (![sample.x, sample.y, sample.pressure, sample.time].every(Number.isFinite)) continue;
        latest = { ...sample, pressure: Math.max(0, Math.min(1, sample.pressure)) };
        output.push(append(latest));
      }
      return output;
    },
    /** Repeats the final real input synchronously, matching the recovered endpoint catch-up. */
    finish(): Sample[] {
      if (finished) return [];
      finished = true;
      if (!latest || (settings.mode === 'smooth' && !settings.catchUp)) return [];
      return Array.from({ length: count }, () => append(latest!));
    }
  };
}
