import type { Brush, Sample } from './brush';
import type { StrokeProcessor } from './strokeProcessors';
import { normalizeStrokeSettings } from './strokeSettings';
import { interpolateTabletAxes } from './tabletAxes';

/**
 * A time-based stabilizer after Paint Tool SAI's: the pen position is resampled at a fixed rate and each output point
 * is a Gaussian-weighted average of the latest ticks, newest weighted most. Because ticks continue while the pen
 * holds still (`idle`), the line keeps closing in on the pen, which a filter of input events alone cannot do; how far
 * it trails grows with `stroke.stabilizer`. Lifting the pen draws the rest of the way to it unless `stroke.catchUp` is
 * off: from the point of the pen's path nearest the line, along that path to where the pen lifted, eased onto it over
 * the first half, so the end neither cuts across a curve nor kinks where the catch-up begins. Pressure is averaged with
 * the position and calibrated like Leonardo's filter.
 */
export function createStabilizerProcessor(brush: Brush): StrokeProcessor {
  const settings = normalizeStrokeSettings(brush.stroke);
  const size = settings.stabilizer * ticksPerLevel;
  const weights = Array.from({ length: size }, (_, age) => Math.exp(-((age / (size / 2)) ** 2)));
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

      // The pen where it lifted closes its path, the ticks; the line joins that path where it is nearest and follows it.
      const from = output!;
      ticks.push({ ...latest, time: clock + tickMs });
      let start = 0,
        nearest = Infinity;
      ticks.forEach((point, index) => {
        // On ties the later point wins, past the copies of the first contact the ticks start with.
        const distance = Math.hypot(point.x - from.x, point.y - from.y);
        if (distance <= nearest) {
          nearest = distance;
          start = index;
        }
      });

      // Each point of the path is shifted by the line's offset from it, which fades out smoothly over the first half,
      // so the catch-up neither jumps aside nor kinks where it begins.
      const smoothed = ticks.slice(start).map((point, index, all) => {
        const before = all[index - 1] ?? point,
          after = all[index + 1] ?? point;
        return index === all.length - 1
          ? point
          : { x: (before.x + point.x * 2 + after.x) / 4, y: (before.y + point.y * 2 + after.y) / 4 };
      });
      const offset = { x: from.x - smoothed[0]!.x, y: from.y - smoothed[0]!.y };
      const path = ticks.slice(start + 1);
      const ease = Math.max(Math.min(easeTicks, path.length), Math.ceil(path.length / 2));
      return path.map((point, index) => {
        const t = Math.min(1, (index + 1) / ease);
        const remaining = 1 - t * t * (3 - 2 * t);
        clock += tickMs;
        output = {
          ...point,
          x: smoothed[index + 1]!.x + offset.x * remaining,
          y: smoothed[index + 1]!.y + offset.y * remaining,
          pressure: calibrate(point.pressure) + (from.pressure - calibrate(point.pressure)) * remaining,
          time: clock
        };
        return output;
      });
    }
  };

  function tick(position: Sample) {
    ticks.push(position);
    ticks.shift();
    return emit();
  }

  /** The weighted average of the ticks, as offsets from the newest to keep precision far from the origin. */
  function emit(): Sample {
    const newest = ticks.at(-1)!;
    let x = 0,
      y = 0,
      pressure = 0,
      total = 0;
    for (let age = 0; age < ticks.length; age++) {
      const point = ticks[ticks.length - 1 - age]!;
      const weight = weights[age]!;
      x += (point.x - newest.x) * weight;
      y += (point.y - newest.y) * weight;
      pressure += point.pressure * weight;
      total += weight;
    }

    output = {
      ...newest,
      x: newest.x + x / total,
      y: newest.y + y / total,
      pressure: calibrate(pressure / total),
      time: clock
    };
    return output;
  }

  /** Raw pen pressure through the brush's minimum, maximum and firmness. */
  function calibrate(raw: number) {
    return (
      Math.max(0, Math.min(1, (raw - settings.minimum) / (settings.maximum - settings.minimum))) ** settings.firmness
    );
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

/** Fewest ticks over which the catch-up eases from the line onto the pen's path; otherwise half of it. */
const easeTicks = 4;

/** Ticks averaged per stabilizer level: each level trails the pen by about 33 ms more. */
const ticksPerLevel = 4;
