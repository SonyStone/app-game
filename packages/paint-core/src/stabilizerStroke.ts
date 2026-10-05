import type { Brush, Sample } from './brush';
import type { Point } from './camera';
import type { StrokeProcessor } from './strokeProcessors';
import { normalizeStrokeSettings } from './strokeSettings';
import { interpolateTabletAxes } from './tabletAxes';

/**
 * Paint Tool SAI 2's stroke stabilizer, ported from the routines recovered from its 2020-11-28 build
 * (`paint-tool-sai-analysis/stylus-and-stabilization.md`), in its normal mode. Each pen sample is one filter update:
 * levels 0 to 15 average the latest 1 to 16 samples equally, S-1 to S-7 average the latest 15 and then average that
 * with their own latest outputs (`createSaiFilter`). Before the filter, a pen step much longer than the one before it
 * is split along the circle through the last three samples, as SAI corrects uneven tablet packets; after it, cubic
 * Bézier curves join the filtered points. A pen's pressure starts from zero and over a longer window, so strokes ease
 * in; lifting the pen finishes the line toward the pen with its pressure tapering to zero. `stroke.stabilizer` is the
 * level, 0 to 15 or 16 to 22 for S-1 to S-7; `zoom` is the document-to-screen scale, as SAI corrects packets in screen
 * pixels. While the pen rests, the latest sample keeps being filtered at the pen's rate (`idle`), as tablets keep
 * reporting a pen held still. Pressure is calibrated like Leonardo's filter.
 */
export function createStabilizerProcessor(brush: Brush, zoom = 1): StrokeProcessor {
  const settings = normalizeStrokeSettings(brush.stroke);
  const code = saiCode(settings.stabilizer);
  let filter: SaiFilter | undefined;
  /** Pen samples before the filter, newest last: the last three, for the packet correction. */
  const recent: Sample[] = [];
  /** Filter outputs, newest last, with the calibrated pressure; see `curve`. */
  const filtered: Sample[] = [];
  const curve = createCurve();
  let tablet = false;
  let interval = defaultInterval;
  let idleTime = 0;
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
        const previous = recent.at(-1);
        if (!previous) {
          tablet = current.pointerType === 'pen';
          filter = createSaiFilter(code, current, tablet);
          result.push(...emit(filter.initial));
        } else {
          // A pen resting on the canvas at zero pressure adds nothing, as in SAI.
          if (tablet && current.x === previous.x && current.y === previous.y && current.pressure === 0) {
            continue;
          }

          interval = recentInterval(previous, current, interval);
          for (const inserted of evenOut(recent.at(-2), previous, current, zoom)) {
            result.push(...emit(filter!.update(inserted)));
          }

          result.push(...emit(filter!.update(current)));
        }

        recent.push(current);
        if (recent.length > 3) {
          recent.shift();
        }

        idleTime = 0;
      }

      return result;
    },
    /** The line on from the last curve drawn to the latest filtered point, which the next curve replaces. */
    preview: () => {
      const latest = filtered.at(-1);
      return latest && curve.pending() ? [latest] : [];
    },
    /** Filters the latest sample again at the pen's rate while it rests; nothing once the line has reached it. */
    idle(elapsedMs) {
      const latest = recent.at(-1);
      if (finished || !filter || !latest || !Number.isFinite(elapsedMs) || reached(latest)) {
        return [];
      }

      const result: Sample[] = [];
      idleTime += elapsedMs;
      while (idleTime >= interval) {
        idleTime -= interval;
        result.push(...emit(filter.update({ ...latest, time: latest.time + interval })));
      }

      return result;
    },
    finish() {
      if (finished || !filter) {
        finished = true;
        return [];
      }

      finished = true;
      const lift = recent.at(-1)!;
      const result = code > 128 ? finishOnArc(lift) : [];
      if (!result.length) {
        result.push(...finishByRepeating(lift));
      }

      result.push(...curve.flush());
      return result;
    }
  };

  /** Passes a filter output on to the curve, with its pressure calibrated. */
  function emit(output: Sample) {
    return draw({ ...output, pressure: calibrate(output.pressure) });
  }

  /** Passes a point of the line, its pressure calibrated, on to the curve. */
  function draw(point: Sample) {
    filtered.push(point);
    if (filtered.length > 3) {
      filtered.shift();
    }

    return curve.add(point);
  }

  /**
   * SAI's ordinary finish: the lifted sample is filtered again as many times as the filter is long (15 times K for S
   * levels), with a pen's pressure at zero, so the line closes in on where the pen lifted; the pressure meanwhile
   * tapers from the line's to zero (`1 - (1 - i/F)²`) instead of following the average.
   */
  function finishByRepeating(lift: Sample) {
    const count = code > 128 ? 15 * feedbackWindow(code) : code;
    const target = tablet ? 0 : lift.pressure;
    const from = filtered.at(-1)!.pressure;
    const result: Sample[] = [];
    for (let step = 1; step <= count; step++) {
      const output = filter!.update({ ...lift, pressure: target });
      const share = 1 - (1 - step / count) ** 2;
      const pressure = code > 1 ? from + share * (calibrate(target) - from) : calibrate(output.pressure);
      result.push(...draw({ ...output, pressure }));
    }

    return result;
  }

  /**
   * SAI's finish for S levels: one more filter update with the lifted sample, then on along the circle through the
   * last two points of the line and that one, to the angle where the pen lifted, in steps about as long as the line's
   * last, with the pressure tapering linearly to zero. Nothing when the three points make no circle, so the ordinary
   * finish runs instead.
   */
  function finishOnArc(lift: Sample) {
    const [a, b] = filtered.slice(-2);
    const target = tablet ? 0 : lift.pressure;
    const c = filter!.update({ ...lift, pressure: target });
    if (!a || !b || distance(a, b) < minimumStep || distance(b, c) < minimumStep) {
      return [];
    }

    const center = circleCenter(a, b, c);
    if (!center) {
      return [];
    }

    const step = turn(angle(center, a), angle(center, b));
    const sweep = turn(angle(center, b), angle(center, lift));
    const count = Math.min(maxArcSteps, Math.max(1, Math.trunc(sweep / step)));
    const from = b.pressure;
    const result: Sample[] = [];
    for (let index = 1; index <= count + 1; index++) {
      const share = index / count;
      const point = rotate(b, center, share * sweep);
      const pressure = from + (calibrate(target) - from) * Math.min(1, share);
      result.push(...draw({ ...lift, ...point, pressure }));
    }

    return result;
  }

  /** Whether the line has reached the resting pen, so filtering it again would change nothing visible. */
  function reached(latest: Sample) {
    const last = filtered.at(-1);
    return !!last && distance(last, latest) < 0.01 && Math.abs(last.pressure - calibrate(latest.pressure)) < 1e-4;
  }

  /** Raw pen pressure through the brush's minimum, maximum and firmness. */
  function calibrate(raw: number) {
    return (
      Math.max(0, Math.min(1, (raw - settings.minimum) / (settings.maximum - settings.minimum))) ** settings.firmness
    );
  }
}

/**
 * SAI's filter for one stroke, started at `first`: `initial` is its first output and `update` filters each later
 * sample. Position and pressure are averaged; other fields pass through. Numeric codes 1 to 16 average the latest
 * `code` samples. S codes 129 to 135 average the latest 15 and then that with their own latest `K - 1` outputs,
 * `K = (code & 31) + 1`. A pen's (`tablet`) pressure starts from zero above code 1, over a window `code` (or `2K`)
 * longer that shortens by one each update. Matches `sai_filter.py`, checked against SAI's machine code.
 */
export function createSaiFilter(code: number, first: Sample, tablet: boolean) {
  const seed = tablet && code !== 1 ? 0 : first.pressure;
  const numeric = code < 128;
  const k = numeric ? 0 : feedbackWindow(code);
  let extra = numeric ? (code !== 1 ? code : 0) : 2 * k;
  const input = numeric
    ? [history(code, first.x), history(code, first.y), history(code + extra, seed)]
    : [history(15, first.x), history(15, first.y), history(15, seed)];
  const feedback = numeric ? undefined : [history(k, first.x), history(k, first.y), history(3 * k, seed)];

  return {
    initial: { ...first, pressure: seed } as Sample,
    update(sample: Sample): Sample {
      const values = [sample.x, sample.y, sample.pressure];
      input.forEach((entries, index) => push(entries, values[index]!));
      let output: number[];
      if (!feedback) {
        output = [average(input[0]!, code), average(input[1]!, code), average(input[2]!, code + extra)];
      } else {
        const counts = [k, k, k + extra];
        output = feedback.map((entries, index) => averageWith(entries, counts[index]!, average(input[index]!, 15)));
        feedback.forEach((entries, index) => push(entries, output[index]!));
      }

      extra = Math.max(0, extra - 1);
      return { ...sample, x: output[0]!, y: output[1]!, pressure: output[2]! };
    }
  };
}

/** A running SAI filter; see `createSaiFilter`. */
export type SaiFilter = ReturnType<typeof createSaiFilter>;

/** SAI's internal code of a stabilizer level: 0 to 15 are codes 1 to 16, 16 to 22 (S-1 to S-7) codes 129 to 135. */
export function saiCode(level: number) {
  return level <= 15 ? level + 1 : 129 + (level - 16);
}

/** The label SAI shows for a stabilizer level: `0` to `15`, then `S-1` to `S-7`. */
export function stabilizerLabel(level: number) {
  return level <= 15 ? String(level) : `S-${level - 15}`;
}

/** The feedback window K of an S code. */
function feedbackWindow(code: number) {
  return (code & 31) + 1;
}

/** SAI's filter history: 32 entries, the oldest dropped. */
function history(count: number, value: number) {
  return Array<number>(Math.min(Math.max(count, 0), historySize)).fill(value);
}

function push(entries: number[], value: number) {
  entries.push(value);
  if (entries.length > historySize) {
    entries.shift();
  }
}

/** The mean of the latest `count` entries, or of all when there are fewer. */
function average(entries: number[], count: number) {
  const latest = entries.slice(-Math.min(Math.max(count, 1), historySize));
  return latest.reduce((sum, value) => sum + value, 0) / latest.length;
}

/** The mean of `value` and the latest `count - 1` entries. */
function averageWith(entries: number[], count: number, value: number) {
  const bounded = Math.min(Math.max(count, 1), historySize);
  const latest = bounded > 1 ? entries.slice(-(bounded - 1)) : [];
  return (value + latest.reduce((sum, entry) => sum + entry, 0)) / (1 + latest.length);
}

/**
 * SAI's correction of uneven tablet packets ("Anti-Stroke-Distortion"): when the step to `current` is at least 1.4
 * times the step before it, which is at least a screen pixel, the samples between are taken from the circle through
 * the three points, as many as the new step turns times the last, up to 7, with the pressure changing linearly.
 */
function evenOut(older: Sample | undefined, previous: Sample, current: Sample, zoom: number): Sample[] {
  if (!older) {
    return [];
  }

  const last = distance(older, previous) * zoom;
  const next = distance(previous, current) * zoom;
  if (last < 1 || next / last < 1.4 || last < minimumStep || next <= minimumStep) {
    return [];
  }

  const center = circleCenter(older, previous, current);
  if (!center) {
    return [];
  }

  const step = turn(angle(center, older), angle(center, previous));
  const sweep = turn(angle(center, previous), angle(center, current));
  const count = Math.min(maxInserted, Math.max(1, Math.trunc(sweep / step)));
  const inserted: Sample[] = [];
  for (let index = 1; index < count; index++) {
    const share = index / count;
    inserted.push({
      ...interpolateTabletAxes(previous, current, share),
      ...rotate(previous, center, share * sweep),
      pressure: previous.pressure + (current.pressure - previous.pressure) * Math.min(1, share),
      time: previous.time + (current.time - previous.time) * share
    });
  }

  return inserted;
}

/**
 * SAI's curve stage: each filtered point gets Bézier handles from its neighbors, longer toward the farther one
 * (`handles`), and each curve between two points is split in half until its control points span at most a pixel, up
 * to 16 times, the ends of the pieces becoming the samples painted. A curve is drawn once the point after it arrives.
 */
function createCurve() {
  /** The latest points, newest last, with the handle each received: `out` toward the next point. */
  const points: { sample: Sample; in: Point; out: Point }[] = [];
  let started = false;

  return {
    /** Adds a filtered point; returns the samples of the curve it completes, or the point itself if it is the first. */
    add(sample: Sample): Sample[] {
      const point = { sample, in: { x: sample.x, y: sample.y }, out: { x: sample.x, y: sample.y } };
      points.push(point);
      if (points.length > 3) {
        points.shift();
      }

      if (!started) {
        started = true;
        return [sample];
      }

      if (points.length < 3) {
        return [];
      }

      const [a, b, c] = points as [(typeof points)[0], (typeof points)[0], (typeof points)[0]];
      [b.in, b.out] = handles(a.sample, b.sample, c.sample);
      return segment(a, b);
    },
    /** Whether a point waits for the next one to draw the curve to it. */
    pending: () => points.length >= 2,
    /** Draws the curve to the last point, which has no next point to shape its end. */
    flush(): Sample[] {
      if (points.length < 2) {
        return [];
      }

      const [a, b] = points.slice(-2) as [(typeof points)[0], (typeof points)[0]];
      points.length = 0;
      return segment(a, b);
    }
  };

  function segment(a: (typeof points)[0], b: (typeof points)[0]): Sample[] {
    const leaves: Point[] = [];
    split([a.sample, a.out, b.in, b.sample], maxSplits, leaves);
    const lengths = leaves.map((point, index) => distance(index ? leaves[index - 1]! : a.sample, point));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let travelled = 0;
    return leaves.map((point, index) => {
      travelled += lengths[index]!;
      const share = total > 0 ? travelled / total : 1;
      return {
        ...interpolateTabletAxes(a.sample, b.sample, share),
        x: point.x,
        y: point.y,
        pressure: a.sample.pressure + (b.sample.pressure - a.sample.pressure) * share,
        time: a.sample.time + (b.sample.time - a.sample.time) * share
      };
    });
  }
}

/**
 * SAI's Bézier handles at `point` between `previous` and `following`: `T = 0.7 (a (C - B) - b (A - B)) / (a + b)²`
 * with `a` and `b` the distances to the neighbors; the incoming handle is `B - a T`, the outgoing `B + b T`.
 */
function handles(previous: Point, point: Point, following: Point): [Point, Point] {
  const a = distance(previous, point);
  const b = distance(point, following);
  if (a <= degenerate || b <= degenerate) {
    return [
      { x: point.x, y: point.y },
      { x: point.x, y: point.y }
    ];
  }

  const scale = handleScale / (a + b) ** 2;
  const tx = scale * (a * (following.x - point.x) - b * (previous.x - point.x));
  const ty = scale * (a * (following.y - point.y) - b * (previous.y - point.y));
  return [
    { x: point.x - a * tx, y: point.y - a * ty },
    { x: point.x + b * tx, y: point.y + b * ty }
  ];
}

/** Splits a cubic Bézier curve in half while its control points span more than a pixel; collects the pieces' ends. */
function split(curve: readonly [Point, Point, Point, Point], depth: number, ends: Point[]) {
  if (depth > 0 && span(curve) > 1) {
    const mix = (p: Point, q: Point) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const [p0, p1, p2, p3] = curve;
    const a = mix(p0, p1),
      b = mix(p1, p2),
      c = mix(p2, p3);
    const d = mix(a, b),
      e = mix(b, c);
    const middle = mix(d, e);
    split([p0, a, d, middle], depth - 1, ends);
    split([middle, e, c, p3], depth - 1, ends);
    return;
  }

  ends.push({ x: curve[3].x, y: curve[3].y });
}

/** The larger side of the box around a curve's control points, as SAI measures it. */
function span(curve: readonly Point[]) {
  const xs = curve.map(({ x }) => x),
    ys = curve.map(({ y }) => y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** The center of the circle through three points, or `undefined` when they are in line. */
function circleCenter(a: Point, b: Point, c: Point): Point | undefined {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) {
    return undefined;
  }

  const aa = a.x * a.x + a.y * a.y,
    bb = b.x * b.x + b.y * b.y,
    cc = c.x * c.x + c.y * c.y;
  return {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d
  };
}

function angle(center: Point, point: Point) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

/** The signed turn from angle `from` to angle `to`, between -π and π. */
function turn(from: number, to: number) {
  const difference = to - from;
  return Math.atan2(Math.sin(difference), Math.cos(difference));
}

/** `point` turned about `center` by `radians`. */
function rotate(point: Point, center: Point, radians: number): Point {
  const cos = Math.cos(radians),
    sin = Math.sin(radians);
  const x = point.x - center.x,
    y = point.y - center.y;
  return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The pen's rate from its latest samples, for filtering it again while it rests, between 4 and 16 ms. */
function recentInterval(previous: Sample, current: Sample, last: number) {
  const step = current.time - previous.time;
  return step > 0 ? Math.min(16, Math.max(4, last * 0.8 + step * 0.2)) : last;
}

/** SAI keeps 32 entries of each history. */
const historySize = 32;

/** Interval assumed before the pen's rate is known, in milliseconds. */
const defaultInterval = 1000 / 120;

/** Shortest step SAI's circle constructions accept. */
const minimumStep = 0.0001;

/** Samples SAI's packet correction inserts at most, and arc steps its S-level finish takes at most. */
const maxInserted = 8;
const maxArcSteps = 256;

/** SAI's Bézier handle coefficient, the length below which a neighbor gives no handle, and the deepest split. */
const handleScale = 0.7;
const degenerate = 2 ** -23;
const maxSplits = 16;
