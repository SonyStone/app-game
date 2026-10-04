import type { Brush, Sample } from './brush';
import type { StrokeProcessor } from './strokeProcessors';
import { normalizeStrokeSettings } from './strokeSettings';
import { interpolateTabletAxes } from './tabletAxes';

/**
 * A time-based stabilizer after Paint Tool SAI's: the pen position is resampled at a fixed rate and each output point
 * is a Gaussian-weighted average of the latest ticks, newest weighted most. Because ticks continue while the pen
 * holds still (`idle`), the line keeps closing in on the pen, which a filter of input events alone cannot do; how far
 * it trails grows with `stroke.stabilizer`. Lifting the pen draws the rest of the way to it unless `stroke.catchUp` is
 * off: the averaged window shrinks tick by tick to the newest, so the line follows the pen's own path to where it
 * lifted, less and less smoothed, instead of cutting straight across to it. Pressure is averaged with the position and
 * calibrated like Leonardo's filter.
 */
export function createStabilizerProcessor(brush: Brush): StrokeProcessor {
  const settings = normalizeStrokeSettings(brush.stroke);
  const size = settings.stabilizer * ticksPerLevel;
  /** Gaussian weights by age for a window of `length` ticks, newest first. */
  const weightsFor = (length: number) =>
    Array.from({ length }, (_, age) => Math.exp(-((age / Math.max(0.5, length / 2)) ** 2)));
  const weights = weightsFor(size);
  /** Pen positions at the latest ticks, newest last. */
  const ticks: Sample[] = [];
  let clock = 0;
  let previous: Sample | undefined;
  let latest: Sample | undefined;
  let output: Sample | undefined;
  let finished = false;

  return {
    add(samples) {
      if (finished) {
        return [];
      }

      const result: Sample[] = [];
      for (const sample of samples) {
        if (![sample.x, sample.y, sample.pressure, sample.time].every(Number.isFinite)) {
          continue;
        }

        const current = { ...sample, pressure: Math.max(0, Math.min(1, sample.pressure)) };
        if (!previous) {
          // The stroke starts exactly where the pen touched.
          clock = current.time;
          ticks.push(...Array<Sample>(size).fill(current));
          result.push(emit());
        } else {
          while (clock + tickMs <= current.time) {
            clock += tickMs;
            const span = current.time - previous.time;
            result.push(tick(span > 0 ? between(previous, current, (clock - previous.time) / span) : current));
          }
        }

        previous = latest = current;
      }

      return result;
    },
    /** The stabilized line is drawn as it is; a tail to the raw pen would show the jitter it removes. */
    preview: () => [],
    /** Keeps closing in on a pen held still; returns nothing once the line has reached it. */
    idle(elapsedMs) {
      if (finished || !latest || !Number.isFinite(elapsedMs) || reached()) {
        return [];
      }

      const result: Sample[] = [];
      const until = clock + elapsedMs;
      while (clock + tickMs <= until) {
        clock += tickMs;
        result.push(tick({ ...latest, time: clock }));
      }

      return result;
    },
    finish() {
      if (finished) {
        return [];
      }

      finished = true;
      if (!latest || !settings.catchUp) {
        return [];
      }

      // The pen where it lifted becomes the newest tick, then the window narrows to it: the last output is the pen.
      clock += tickMs;
      const result = [tick({ ...latest, time: clock })];
      for (let window = size - 1; window >= 1 && !reached(); window--) {
        clock += tickMs;
        result.push(emit(window));
      }

      if (output && (output.x !== latest.x || output.y !== latest.y)) {
        result.push(emit(1));
      }

      return result;
    }
  };

  function tick(position: Sample) {
    ticks.push(position);
    ticks.shift();
    return emit();
  }

  /**
   * The weighted average of the newest `window` ticks, all by default, as offsets from the newest to keep precision
   * far from the origin.
   */
  function emit(window = ticks.length): Sample {
    const newest = ticks.at(-1)!;
    const windowWeights = window === size ? weights : weightsFor(window);
    let x = 0,
      y = 0,
      pressure = 0,
      total = 0;
    for (let age = 0; age < window; age++) {
      const point = ticks[ticks.length - 1 - age]!;
      const weight = windowWeights[age]!;
      x += (point.x - newest.x) * weight;
      y += (point.y - newest.y) * weight;
      pressure += point.pressure * weight;
      total += weight;
    }

    const calibrated = Math.max(
      0,
      Math.min(1, (pressure / total - settings.minimum) / (settings.maximum - settings.minimum))
    );
    output = {
      ...newest,
      x: newest.x + x / total,
      y: newest.y + y / total,
      pressure: calibrated ** settings.firmness,
      time: clock
    };
    return output;
  }

  /** Whether the line has reached the pen, so further ticks would change nothing visible. */
  function reached() {
    return (
      !!output &&
      !!latest &&
      Math.hypot(output.x - latest.x, output.y - latest.y) < 0.05 &&
      ticks.every((point) => point.pressure === latest!.pressure)
    );
  }
}

/** The pen between two input samples, by time. */
function between(a: Sample, b: Sample, t: number): Sample {
  return {
    ...interpolateTabletAxes(a, b, t),
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
    time: a.time + (b.time - a.time) * t
  };
}

/** The pen is resampled at 120 Hz, a common tablet report rate. */
const tickMs = 1000 / 120;

/** Ticks averaged per stabilizer level: each level trails the pen by about 33 ms more. */
const ticksPerLevel = 4;
