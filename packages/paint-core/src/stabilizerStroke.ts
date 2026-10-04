import type { Brush, Sample } from './brush';
import type { Point } from './camera';
import type { StrokeProcessor } from './strokeProcessors';
import { normalizeStrokeSettings } from './strokeSettings';
import { interpolateTabletAxes } from './tabletAxes';

/**
 * A time-based stabilizer after Paint Tool SAI's: the pen position is resampled at a fixed rate and each output point
 * is a Gaussian-weighted average of the latest ticks, newest weighted most. Because ticks continue while the pen
 * holds still (`idle`), the line keeps closing in on the pen, which a filter of input events alone cannot do; how far
 * it trails grows with `stroke.stabilizer`. Lifting the pen draws the rest of the way to it unless `stroke.catchUp` is
 * off: along the pen's path averaged on both sides of each point over a window that narrows to nothing where the pen
 * lifted, so the end cuts the pen's curves about as the line did, neither straight across nor with bends of its own;
 * the line eases onto that curve over its whole length from its own heading, without a corner. Pressure is averaged
 * with the position and calibrated like Leonardo's filter.
 */
export function createStabilizerProcessor(brush: Brush): StrokeProcessor {
  const settings = normalizeStrokeSettings(brush.stroke);
  const size = settings.stabilizer * ticksPerLevel;
  const weights = Array.from({ length: size }, (_, age) => Math.exp(-((age / (size / 2)) ** 2)));
  /** The standard deviation of `weights`, in ticks. */
  const sigma = size / (2 * Math.SQRT2);
  /** Pen positions at the latest ticks, newest last. */
  const ticks: Sample[] = [];
  let clock = 0;
  let previous: Sample | undefined;
  let latest: Sample | undefined;
  let output: Sample | undefined;
  /** The output before `output`, for the line's heading when the pen lifts. */
  let beforeOutput: Sample | undefined;
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

      // The line's last point averaged the ticks about `center` ticks along them; the pen where it lifted ends them.
      const from = output!;
      const path = [...ticks, { ...latest, time: clock + tickMs }];
      const end = path.length - 1;
      let center = 0,
        total = 0;
      for (let age = 0; age < ticks.length; age++) {
        center += (ticks.length - 1 - age) * weights[age]!;
        total += weights[age]!;
      }

      center /= total;
      const span = end - center;
      if (span <= 0) {
        return [];
      }

      // The catch-up keeps averaging the pen's path, now on both sides of each point since the rest of it is known, over
      // a window that narrows from the line's to nothing where the pen lifted. It cuts the pen's curves as the line did
      // and bends nowhere the path does not, unlike joining the path itself, which turns a corner or swings out and back.
      const knots = Math.max(1, Math.ceil(span));
      const along = Array.from({ length: knots + 1 }, (_, index) => center + (span * index) / knots);
      const curve = along.map((at) => averageAround(path, at, (sigma * (end - at)) / span));
      const tangent = (index: number) => {
        const before = curve[Math.max(0, index - 1)]!,
          after = curve[Math.min(knots, index + 1)]!;
        const steps = Math.min(knots, index + 1) - Math.max(0, index - 1);
        return { x: (after.x - before.x) / steps, y: (after.y - before.y) / steps };
      };

      // The line's small offset from that curve fades out over all of it, leaving along the line's own heading.
      const offset = { x: from.x - curve[0]!.x, y: from.y - curve[0]!.y };
      const start = tangent(0);
      const heading = { x: from.x - (beforeOutput?.x ?? from.x), y: from.y - (beforeOutput?.y ?? from.y) };
      const headingLength = Math.hypot(heading.x, heading.y);
      const scale = headingLength > 1e-6 ? Math.hypot(start.x, start.y) / headingLength : 0;
      const turn = scale > 0 ? { x: heading.x * scale - start.x, y: heading.y * scale - start.y } : { x: 0, y: 0 };
      // Distances along the curve; the offset and the heading fade over all of it, so the turn onto it stays gentle.
      const reach = [0];
      for (let index = 1; index <= knots; index++) {
        reach.push(
          reach[index - 1]! + Math.hypot(curve[index]!.x - curve[index - 1]!.x, curve[index]!.y - curve[index - 1]!.y)
        );
      }

      const ease = reach[knots]! * easeShare;
      const result: Sample[] = [];
      for (let index = 0; index < knots; index++) {
        const a = curve[index]!,
          b = curve[index + 1]!;
        // Points close enough together that the curve's bend shows as a curve, not as corners.
        const steps = Math.min(
          maxCatchUpSteps,
          Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / catchUpSpacing))
        );
        for (let step = 1; step <= steps; step++) {
          const f = step / steps;
          const position = hermite(a, tangent(index), b, tangent(index + 1), f);
          const t = ease > 0 ? Math.min(1, (reach[index]! + (reach[index + 1]! - reach[index]!) * f) / ease) : 1;
          const fade = 1 - t * t * (3 - 2 * t);
          const bend = (index + f) * fade;
          const at = along[index]! + (along[index + 1]! - along[index]!) * f;
          const base = Math.min(end - 1, Math.floor(at));
          const sample = between(path[base]!, path[base + 1]!, at - base);
          const pressure = calibrate(sample.pressure);
          clock += (tickMs * (along[index + 1]! - along[index]!)) / steps;
          output = {
            ...sample,
            x: position.x + offset.x * fade + turn.x * bend,
            y: position.y + offset.y * fade + turn.y * bend,
            pressure: pressure + (from.pressure - pressure) * fade,
            time: clock
          };
          result.push(output);
        }
      }

      return result;
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

    beforeOutput = output;
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

/** The cubic Hermite curve from `a` to `b` with tangents `ta` and `tb` per unit of `f`, at `f` from 0 to 1. */
function hermite(a: Point, ta: Point, b: Point, tb: Point, f: number): Point {
  const f2 = f * f,
    f3 = f2 * f;
  const h00 = 2 * f3 - 3 * f2 + 1,
    h10 = f3 - 2 * f2 + f,
    h01 = -2 * f3 + 3 * f2,
    h11 = f3 - f2;
  return {
    x: h00 * a.x + h10 * ta.x + h01 * b.x + h11 * tb.x,
    y: h00 * a.y + h10 * ta.y + h01 * b.y + h11 * tb.y
  };
}

/**
 * The Gaussian-weighted average of `path` around the fractional index `at`, with standard deviation `sigma` ticks,
 * over a window symmetric about `at` that stays within the path, so the average is not pulled toward either end, and
 * tapers to nothing at its edges.
 */
function averageAround(path: readonly Sample[], at: number, sigma: number): Point {
  const reach = Math.min(3 * sigma, at, path.length - 1 - at);
  const tick = Math.min(path.length - 2, Math.floor(at));
  const here = between(path[tick]!, path[tick + 1]!, at - tick);
  if (sigma < 1e-3 || reach < 1e-3) {
    return here;
  }

  let x = 0,
    y = 0,
    total = 0;
  for (let index = Math.ceil(at - reach); index <= Math.floor(at + reach); index++) {
    // Tapered to nothing at the window's edges, so that ticks enter and leave it without a jump.
    const weight = Math.exp(-(((index - at) / sigma) ** 2) / 2) * (1 - ((index - at) / (reach + 1)) ** 2) ** 2;
    x += (path[index]!.x - here.x) * weight;
    y += (path[index]!.y - here.y) * weight;
    total += weight;
  }

  return total > 0 ? { x: here.x + x / total, y: here.y + y / total } : here;
}

/** The pen is resampled at 120 Hz, a common tablet report rate. */
const tickMs = 1000 / 120;

/** The share of the catch-up's length over which it eases from the line onto its curve. */
const easeShare = 1;

/** Longest step, in document pixels, between points of the catch-up, and the most points per tick of it. */
const catchUpSpacing = 2;
const maxCatchUpSteps = 16;

/** Ticks averaged per stabilizer level: each level trails the pen by about 33 ms more. */
const ticksPerLevel = 4;
