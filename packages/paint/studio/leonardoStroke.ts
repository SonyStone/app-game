import { createStrokeSampler, type Brush, type Dab, type Sample } from './brush';
import { createCubicStroke } from './cubicStroke';
import type { StrokeProcessor } from './strokeProcessors';
import { normalizeStrokeSettings, type StrokeSettings } from './strokeSettings';

/** Compatibility round-brush adapter; the sample processor can also feed other brush engines. */
export function createLeonardoStroke(brush: Brush, zoom = 1) {
  const processor = createLeonardoProcessor(brush, zoom);
  const sampler = createStrokeSampler(brush);
  return {
    add: (samples: readonly Sample[]): Dab[] => sampler.add(processor.add(samples)),
    preview: (): Dab[] => sampler.preview(processor.preview()),
    finish: (): Dab[] => sampler.add(processor.finish())
  };
}

/** Researched pressure filter and cubic curve, independent of stamp placement and rasterization. */
export function createLeonardoProcessor(brush: Brush, zoom = 1): StrokeProcessor {
  const filter = createStrokeFilter(brush.stroke);
  const curve = createCubicStroke(brush.size, zoom);
  let finished = false;
  let latest: Sample | undefined;
  const settings = normalizeStrokeSettings(brush.stroke);
  const draw = (samples: readonly Sample[]) => curve.add(samples);
  return {
    /** Every real sample participates, independent of animation-frame or event batching. */
    add(samples: readonly Sample[]): Sample[] {
      if (finished) return [];
      for (const sample of samples)
        if ([sample.x, sample.y, sample.pressure, sample.time].every(Number.isFinite)) latest = sample;
      return draw(filter.add(samples));
    },
    /** Extends the filtered curve to real input only in the disposable display tail. */
    preview(): Sample[] {
      if (finished || !latest) return [];
      const pressure =
        Math.max(0, Math.min(1, (latest.pressure - settings.minimum) / (settings.maximum - settings.minimum))) **
        settings.firmness;
      return [...curve.preview(), { ...latest, pressure }];
    },
    /** Catches up when enabled, then flushes the curve once without adding an endpoint stamp. */
    finish(): Sample[] {
      if (finished) return [];
      finished = true;
      return [...draw(filter.finish()), ...curve.finish()];
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
      ...sample,
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
