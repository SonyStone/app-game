import type { Brush, Sample } from './brush';
import type { StrokeProcessor } from './strokeProcessors';
import { normalizeStrokeSettings } from './strokeSettings';
import { interpolateTabletAxes } from './tabletAxes';

/**
 * A time-based stabilizer after Paint Tool SAI's: the pen position is resampled at a fixed rate and each output point
 * is a Gaussian-weighted average of the latest ticks, newest weighted most. Because ticks continue while the pen
 * holds still (`idle`), the line keeps closing in on the pen, which a filter of input events alone cannot do; how far
 * it trails grows with `stroke.stabilizer`. Lifting the pen draws the rest of the way to it unless `stroke.catchUp` is
 * off: the averaged window shrinks tick by tick to the newest, so the line follows the pen's own path, less and less
 * smoothed, instead of cutting straight across. It ends where the pen was before lifting: the last moments in which
 * the pressure falls away usually jerk the pen aside, so their positions are held at the point before them while their
 * pressure still tapers the end. Pressure is averaged with the position and calibrated like Leonardo's filter.
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
  /** Input samples of the last {@link liftWindowMs}, for finding where the pen began to lift. */
  const recent: Sample[] = [];
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
        recent.push(current);
        while (recent.length > 1 && current.time - recent[0]!.time > liftWindowMs) {
          recent.shift();
        }
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

      // Positions after the lift began stay at the point before it; their pressure still tapers the end.
      const lift = liftPoint(recent);
      for (let index = 0; index < ticks.length; index++) {
        if (ticks[index]!.time > lift.time) {
          ticks[index] = { ...ticks[index]!, x: lift.x, y: lift.y };
        }
      }

      // The end becomes the newest tick, then the window narrows to it: the last output is the end.
      const end = { ...latest, x: lift.x, y: lift.y };
      latest = end;
      clock += tickMs;
      const result = [tick({ ...end, time: clock })];
      for (let window = size - 1; window >= 1 && !reached(); window--) {
        clock += tickMs;
        result.push(emit(window));
      }

      if (output && (output.x !== end.x || output.y !== end.y)) {
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

/**
 * Where the pen was before it began to lift: the start of the pressure's steady fall at the end of the stroke, at most
 * {@link hookMs} back, provided it fell by at least a third of the recent peak. Otherwise the last sample.
 */
function liftPoint(recent: readonly Sample[]): Sample {
  const peak = Math.max(...recent.map(({ pressure }) => pressure));
  const last = recent.at(-1)!;
  let index = recent.length - 1;
  while (
    index > 0 &&
    last.time - recent[index - 1]!.time <= hookMs &&
    recent[index]!.pressure < peak * 0.95 &&
    recent[index - 1]!.pressure >= recent[index]!.pressure
  ) {
    index--;
  }

  return recent[index]!.pressure - last.pressure >= peak / 3 ? recent[index]! : last;
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

/** Input kept for finding the lift; long enough to know the stroke's pressure before it. */
const liftWindowMs = 200;

/** The longest stretch at the end of a stroke treated as the pen lifting. */
const hookMs = 60;

/** Ticks averaged per stabilizer level: each level trails the pen by about 33 ms more. */
const ticksPerLevel = 4;
