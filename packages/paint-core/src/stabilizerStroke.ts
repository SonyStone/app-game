import type { Brush, Sample } from './brush';
import type { Point } from './camera';
import type { StrokeProcessor } from './strokeProcessors';
import { normalizeStrokeSettings } from './strokeSettings';
import { interpolateTabletAxes } from './tabletAxes';

/**
 * A time-based stabilizer after Paint Tool SAI's: the pen position is resampled at a fixed rate and each output point
 * is a Gaussian-weighted average of the latest ticks, newest weighted most. Because ticks continue while the pen
 * holds still (`idle`), the line keeps closing in on the pen, which a filter of input events alone cannot do; how far
 * it trails grows with `stroke.stabilizer`. On a fast stroke the average would trail far behind and cut across the
 * pen's arcs, so beyond {@link lagPerLevel} screen pixels per level the line is pulled along behind the pen like a
 * string instead, taking the pressure the pen had there; see `follow`. Lifting the pen draws the rest of the way to
 * it unless `stroke.catchUp` is off: as one arc when the rest of the pen's path is one plain bend, else along that
 * path averaged over a window narrowing to where the pen lifted, eased onto from the line's heading; a hook aside as
 * the pen eases off to lift is left out, the line ending along its heading, tapering. Pressure is calibrated like
 * Leonardo's filter. `zoom` is the document-to-screen scale of the view.
 */
export function createStabilizerProcessor(brush: Brush, zoom = 1): StrokeProcessor {
  const settings = normalizeStrokeSettings(brush.stroke);
  /** The farthest the line trails the pen, in document pixels; see {@link lagPerLevel}. */
  const maxLag = (settings.stabilizer * lagPerLevel) / Math.max(1e-6, zoom);
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
  /** Whether the line is pulled along behind the pen; see `follow`. */
  let roped = false;
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
      // A line held near the pen on a fast stroke starts from the pen's path where it is nearest instead.
      let nearest = Infinity,
        nearestIndex = 0;
      ticks.forEach((point, index) => {
        const distance = Math.hypot(point.x - from.x, point.y - from.y);
        if (distance <= nearest) {
          nearest = distance;
          nearestIndex = index;
        }
      });
      center = Math.max(center, nearestIndex);
      const span = end - center;
      if (span <= 0) {
        return [];
      }

      // Pressure reaches the pen's own over the first half, so the end tapers as the pen did when it lifted.
      const pressureAt = (u: number, at: number) => {
        const base = Math.min(end - 1, Math.floor(at));
        const sample = between(path[base]!, path[base + 1]!, at - base);
        const pressure = calibrate(sample.pressure);
        const t = Math.min(1, u * 2);
        return { sample, pressure: pressure + (from.pressure - pressure) * (1 - t * t * (3 - 2 * t)) };
      };
      const heading = direction({ x: from.x - (beforeOutput?.x ?? from.x), y: from.y - (beforeOutput?.y ?? from.y) });
      const bend = pathBend(path, center);
      const lift = path[end]!;
      if (heading && Math.abs(bend.net) > hookTurn && calibrate(lift.pressure) < from.pressure * hookPressure) {
        // The pen hooked aside as it lifted, easing off: the line ends along its own heading, tapering, instead of
        // following the hook and drawing a tick.
        const length = Math.min(bend.length, maxLag) * hookShare;
        const count = Math.max(1, Math.ceil(length / catchUpSpacing));
        const last = calibrate(lift.pressure);
        const result: Sample[] = [];
        for (let step = 1; step <= count; step++) {
          const u = step / count;
          clock += (tickMs * span) / count;
          output = {
            ...lift,
            x: from.x + heading.x * length * u,
            y: from.y + heading.y * length * u,
            pressure: from.pressure + (last - from.pressure) * u,
            time: clock
          };
          result.push(output);
        }

        return result;
      }

      const arc = heading && plainArc(from, heading, path, bend);
      if (arc) {
        // The rest of the pen's path is one plain bend: the catch-up is one arc onto it, without bends of its own.
        const count = Math.max(1, Math.ceil(arcLength(arc) / catchUpSpacing));
        const result: Sample[] = [];
        for (let step = 1; step <= count; step++) {
          const u = step / count;
          const { sample, pressure } = pressureAt(u, center + span * u);
          const position = bezier(arc, u);
          clock += (tickMs * span) / count;
          output = { ...sample, x: position.x, y: position.y, pressure, time: clock };
          result.push(output);
        }

        return result;
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
      const speed = Math.hypot(start.x, start.y);
      const turn = heading ? { x: heading.x * speed - start.x, y: heading.y * speed - start.y } : { x: 0, y: 0 };
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
          const { sample, pressure } = pressureAt((at - center) / span, at);
          clock += (tickMs * (along[index + 1]! - along[index]!)) / steps;
          output = {
            ...sample,
            x: position.x + offset.x * fade + turn.x * bend,
            y: position.y + offset.y * fade + turn.y * bend,
            pressure,
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

    const average = { x: newest.x + x / total, y: newest.y + y / total };
    // The string pulls toward the pen over its last few ticks, so that it does not pass on a shaking hand.
    const recent = ticks.slice(-anchorTicks);
    const anchor = {
      x: recent.reduce((sum, tick) => sum + tick.x, 0) / recent.length,
      y: recent.reduce((sum, tick) => sum + tick.y, 0) / recent.length
    };
    const position = follow(anchor, average);
    beforeOutput = output;
    // Pulled along, the line takes the pressure the pen had where it now is, so a flick tapers where the pen lifted.
    const raw = roped ? pressureNear(position) : pressure / total;
    output = { ...newest, ...position, pressure: calibrate(raw), time: clock };
    return output;
  }

  /** The pen's pressure at the tick nearest `point`, among those of the average. */
  function pressureNear(point: Point) {
    let nearest = Infinity,
      pressure = ticks.at(-1)!.pressure;
    for (const tick of ticks) {
      const distance = Math.hypot(tick.x - point.x, tick.y - point.y);
      if (distance < nearest) {
        nearest = distance;
        pressure = tick.pressure;
      }
    }

    return pressure;
  }

  /**
   * Where the line goes for the pen at `pen` and the average of the ticks at `average`. On a fast stroke the average
   * falls far behind and cuts across the pen's arcs; once it trails by more than `maxLag`, the line is pulled along
   * behind the pen like a string instead, keeping to its arcs. As the pen slows the string shortens, by {@link closeIn}
   * a tick but never nearer the pen than the average, so the line closes in along the pen's path; it is the average
   * again once the two meet while the pen nearly rests.
   */
  function follow(pen: Point, average: Point): Point {
    const previous = output;
    const distance = (point: Point) => Math.hypot(pen.x - point.x, pen.y - point.y);
    if (!previous || (!roped && distance(average) <= maxLag)) {
      roped = false;
      return average;
    }

    roped = true;
    const trail = distance(previous);
    const length = Math.min(maxLag, Math.max(distance(average), trail * closeIn));
    const string =
      trail > length
        ? { x: pen.x + ((previous.x - pen.x) * length) / trail, y: pen.y + ((previous.y - pen.y) * length) / trail }
        : { x: previous.x, y: previous.y };
    // Only a pen nearly at rest lets it go: a moving one may pass the average where that cuts inside its curve.
    const recent = ticks[Math.max(0, ticks.length - 1 - restTicks)]!;
    const resting = Math.hypot(pen.x - recent.x, pen.y - recent.y) <= releaseGap * restTicks;
    if (resting && Math.hypot(average.x - string.x, average.y - string.y) <= releaseGap) {
      roped = false;
      return average;
    }

    return string;
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

/**
 * The catch-up as one cubic Bézier arc from `from`, leaving along `heading`, to where the pen lifted, arriving along
 * the pen's last direction, when the rest of the pen's path, whose turns are `bend`, bends one way without wiggles by
 * at most {@link maxArcTurn}; otherwise `undefined`. Its handles are those of a circular arc turning as much.
 */
function plainArc(from: Point, heading: Point, path: readonly Sample[], { net, total }: ReturnType<typeof pathBend>) {
  const end = path.length - 1;
  const lift = path[end]!;
  const arrive = direction({ x: lift.x - path[Math.max(0, end - 2)]!.x, y: lift.y - path[Math.max(0, end - 2)]!.y });
  const chord = Math.hypot(lift.x - from.x, lift.y - from.y);
  if (
    !arrive ||
    chord < 1e-6 ||
    total - Math.abs(net) > maxArcWiggle ||
    Math.abs(net) > maxArcTurn ||
    // A line heading away from where the pen lifted would loop back to it.
    heading.x * (lift.x - from.x) + heading.y * (lift.y - from.y) < 0
  ) {
    return undefined;
  }

  const bend = Math.min(maxArcTurn, Math.acos(Math.max(-1, Math.min(1, heading.x * arrive.x + heading.y * arrive.y))));
  const handle = bend > 1e-3 ? ((4 / 3) * Math.tan(bend / 4) * chord) / (2 * Math.sin(bend / 2)) : chord / 3;
  return [
    from,
    { x: from.x + heading.x * handle, y: from.y + heading.y * handle },
    { x: lift.x - arrive.x * handle, y: lift.y - arrive.y * handle },
    { x: lift.x, y: lift.y }
  ] as const;
}

/**
 * How the pen's path from the fractional index `start` on turns, in radians: its net turn, the sum of its turns either
 * way, and its length in document pixels. Lightly smoothed, so that the pen's jitter does not count as wiggles.
 */
function pathBend(path: readonly Sample[], start: number) {
  const points = path.slice(Math.max(0, Math.floor(start))).map((point, index, all) => {
    const before = all[Math.max(0, index - 1)]!,
      after = all[Math.min(all.length - 1, index + 1)]!;
    return { x: (before.x + point.x * 2 + after.x) / 4, y: (before.y + point.y * 2 + after.y) / 4 };
  });
  let net = 0,
    total = 0,
    length = 0,
    previous: number | undefined;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!,
      b = points[index]!;
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    length += step;
    if (step < minArcStep) {
      continue;
    }

    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (previous !== undefined) {
      const turn = Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
      net += turn;
      total += Math.abs(turn);
    }

    previous = angle;
  }

  return { net, total, length };
}

/** The cubic Bézier curve through `points` at `u` from 0 to 1. */
function bezier(points: readonly [Point, Point, Point, Point], u: number): Point {
  const v = 1 - u;
  const [a, b, c, d] = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return {
    x: a * points[0].x + b * points[1].x + c * points[2].x + d * points[3].x,
    y: a * points[0].y + b * points[1].y + c * points[2].y + d * points[3].y
  };
}

/** About the length of a cubic Bézier curve: between its chord and its control polygon. */
function arcLength(points: readonly [Point, Point, Point, Point]) {
  const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  return (
    (length(points[0], points[3]) +
      length(points[0], points[1]) +
      length(points[1], points[2]) +
      length(points[2], points[3])) /
    2
  );
}

/** `vector` at unit length, or `undefined` when it has none. */
function direction(vector: Point): Point | undefined {
  const length = Math.hypot(vector.x, vector.y);
  return length > 1e-6 ? { x: vector.x / length, y: vector.y / length } : undefined;
}

/** The most the pen's path may turn, in radians, for the catch-up to be one arc. */
const maxArcTurn = (170 * Math.PI) / 180;

/** How much the pen's path may turn back and forth, in radians, beyond its net turn, and still count as one bend. */
const maxArcWiggle = (25 * Math.PI) / 180;

/** Shortest step, in document pixels, whose heading counts for the bend of the pen's path. */
const minArcStep = 0.5;

/** The share of its length a string pulling the line keeps per tick as the pen slows; see `follow`. */
const closeIn = 0.97;

/** How near, in document pixels, a line pulled along must come to the average to become it again. */
const releaseGap = 0.5;

/** Ticks of the pen averaged for the point a string pulling the line follows. */
const anchorTicks = 6;

/** Ticks over which the pen moves less than `releaseGap` a tick when it nearly rests. */
const restTicks = 4;

/** Screen pixels per stabilizer level that the line may trail the pen at most, on fast strokes. */
const lagPerLevel = 4;

/** A lift hook: the pen turns more than this, in radians, between the line and where it lifted… */
const hookTurn = (40 * Math.PI) / 180;

/** …while its pressure falls below this share of the line's. */
const hookPressure = 0.6;

/** The share of the hook's length, at most of `maxLag`, that the line runs on along its heading, tapering. */
const hookShare = 0.3;

/** The pen is resampled at 120 Hz, a common tablet report rate. */
const tickMs = 1000 / 120;

/** The share of the catch-up's length over which it eases from the line onto its curve. */
const easeShare = 1;

/** Longest step, in document pixels, between points of the catch-up, and the most points per tick of it. */
const catchUpSpacing = 2;
const maxCatchUpSteps = 16;

/** Ticks averaged per stabilizer level: each level trails the pen by about 33 ms more. */
const ticksPerLevel = 4;
