/**
 * A pen's pressure curve: points from raw pen pressure (`x`) to the pressure strokes receive (`y`), both in [0, 1],
 * like CLIP STUDIO PAINT's pressure curve. Between points the curve is a monotone cubic with Steffen's slopes (1990):
 * smooth through every point, never falling and never overshooting a point. Left of the first point it stays at the
 * first point's `y`, so a first point moved right is a threshold and one moved up a least pressure; right of the last
 * point it stays at the last point's `y`. A device calibration maps raw pen pressure through it before any stroke
 * processor or brush engine sees it; see {@link fitPressureCurve}.
 *
 * Normalized curves ({@link normalizePressureCurve}) have 2 to {@link maxPressurePoints} points, `x` increasing by at
 * least {@link pointGap} and `y` never decreasing.
 *
 * Points rather than an exponent such as a brush's `StrokeSettings.firmness`: a hand that draws in a narrow band, as
 * one MovinkPad recording with a median of 0.58 and a 95th percentile of 0.61, would need an exponent near 7 to put
 * its median at one half. Free points rather than the first curve's three (2026-10-10), whose outputs were fixed at
 * zero, one half and full pressure: with fixed outputs the middle point could only bend the curve, as the user found
 * on the tablet.
 */
export type PressureCurve = { points: readonly PressurePoint[] };

/** A point of a {@link PressureCurve}: raw pen pressure `x` gives pressure `y`. */
export type PressurePoint = { x: number; y: number };

/** The curve that leaves pressure unchanged, used until the pen is calibrated. */
export const identityPressureCurve: PressureCurve = {
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 }
  ]
};

/** Most points a curve has, ends included. */
export const maxPressurePoints = 8;

/** Smallest raw pressure distance between neighbouring points. */
export const pointGap = 0.02;

/** Raw pressure through `curve`, in [0, 1]. Monotone and continuous, with a continuous slope, for normalized curves. */
export function applyPressureCurve(curve: PressureCurve, raw: number): number {
  return pressureMapping(curve)(raw);
}

/**
 * `applyPressureCurve` for one curve as a function of raw pressure, with the slopes computed once, for per-sample use
 * such as `attachInput`'s `mapPressure`. A new function for each call, so a host can pass a new mapping whenever the
 * curve changes.
 */
export function pressureMapping(curve: PressureCurve): (raw: number) => number {
  const points = curve.points.map((point) => ({ ...point }));
  const slopes = steffenSlopes(points);
  return (raw) => {
    const first = points[0]!;
    const last = points.at(-1)!;
    if (!(raw > first.x)) {
      return first.y;
    }

    if (raw >= last.x) {
      return last.y;
    }

    let index = 1;
    while (points[index]!.x <= raw) {
      index++;
    }

    const start = points[index - 1]!;
    const end = points[index]!;
    const width = end.x - start.x;
    const t = (raw - start.x) / width;
    const value =
      (2 * t ** 3 - 3 * t ** 2 + 1) * start.y +
      (t ** 3 - 2 * t ** 2 + t) * width * slopes[index - 1]! +
      (-2 * t ** 3 + 3 * t ** 2) * end.y +
      (t ** 3 - t ** 2) * width * slopes[index]!;
    // Steffen's slopes keep the cubic between its ends; rounding may not.
    return Math.max(start.y, Math.min(end.y, value));
  };
}

/** Whether `curve` leaves pressure unchanged. */
export function isIdentityPressureCurve(curve: PressureCurve): boolean {
  const [first, last] = curve.points;
  return curve.points.length === 2 && first!.x === 0 && first!.y === 0 && last!.x === 1 && last!.y === 1;
}

/** Whether two curves have the same points. */
export function samePressureCurve(a: PressureCurve, b: PressureCurve): boolean {
  return (
    a.points.length === b.points.length &&
    a.points.every((point, index) => {
      const other = b.points[index]!;
      return point.x === other.x && point.y === other.y;
    })
  );
}

/**
 * Makes a stored or hand-edited curve usable: points with numbers in [0, 1] are kept in raw pressure order, at most
 * {@link maxPressurePoints} (the last one always), each at least {@link pointGap} after the one before (closer ones are
 * dropped, and a last point too close to the first is moved right), each `y` at least the one before. Fewer than two
 * usable points give the identity curve. Values keep four decimals.
 */
export function normalizePressureCurve(curve: unknown): PressureCurve {
  const raw =
    curve && typeof curve === 'object' && 'points' in curve && Array.isArray(curve.points) ? curve.points : [];
  const usable = (raw as unknown[])
    .flatMap((point) => {
      if (!point || typeof point !== 'object') {
        return [];
      }

      const { x, y } = point as Record<string, unknown>;
      return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
        ? [{ x: clamp(x), y: clamp(y) }]
        : [];
    })
    .sort((a, b) => a.x - b.x);
  if (usable.length < 2) {
    return identityPressureCurve;
  }

  const first = usable[0]!;
  first.x = Math.min(first.x, 1 - pointGap);
  const last = usable.at(-1)!;
  last.x = Math.max(last.x, first.x + pointGap);
  const points = [first];
  for (const point of usable.slice(1, -1)) {
    if (points.length < maxPressurePoints - 1 && apart(points.at(-1)!.x, point.x) && apart(point.x, last.x)) {
      points.push(point);
    }
  }

  points.push(last);
  let floor = 0;
  return {
    points: points.map((point) => {
      floor = Math.max(floor, point.y);
      return { x: tidy(point.x), y: tidy(floor) };
    })
  };
}

/** One pen stroke's contact samples: time in milliseconds and raw pressure in [0, 1]. */
export type PressureStroke = readonly { time: number; pressure: number }[];

/**
 * Fits a pen's curve to strokes drawn in three ways: `normal` as the user usually draws, `hard` with the firmest
 * comfortable pressure and `light` with the lightest that still draws. Five points: the 5th percentile of light
 * pressure gives zero and the 90th percentile of hard pressure full pressure; between them the quartiles of normal
 * drawing, the median at one half and the outer quartiles halfway between a straight line and an equalized histogram
 * (one quarter and three quarters), so that pressures the hand uses most get more of the range without the steps of a
 * full equalization. Percentiles keep a few stray samples from moving the curve; the first and last
 * {@link strokeEdgeMs} of each stroke, where the pen lands and lifts, are not counted. Without a calibration a hand
 * rarely reaches full pressure: the user's MovinkPad recordings (`apps/paint/recordings`, the test fixture) draw with
 * a median of 0.45 to 0.60 and a 95th percentile near 0.70, and seldom pass 0.8.
 *
 * Without enough normal samples ({@link minimumSamples}) the identity curve results. A step without enough samples
 * of its own falls back: no hard strokes take the 95th percentile of normal drawing as the top, no light strokes keep
 * the bottom at zero. A quartile closer than {@link pointGap} to the median or an end is dropped, so the median keeps
 * one half.
 */
export function fitPressureCurve(steps: {
  normal: readonly PressureStroke[];
  hard?: readonly PressureStroke[];
  light?: readonly PressureStroke[];
}): PressureCurve {
  const normal = strokePressures(steps.normal);
  if (normal.length < minimumSamples) {
    return identityPressureCurve;
  }

  const hard = strokePressures(steps.hard ?? []);
  const light = strokePressures(steps.light ?? []);
  const median = quantile(normal, 0.5);
  const top = Math.min(
    1,
    Math.max(median + pointGap, hard.length >= minimumSamples ? quantile(hard, 0.9) : quantile(normal, 0.95))
  );
  const bottom = Math.max(0, Math.min(median - pointGap, light.length >= minimumSamples ? quantile(light, 0.05) : 0));
  const line = (x: number) => clamp((x - bottom) / (top - bottom));
  const quartile = (share: number, before: number, after: number) => {
    const x = quantile(normal, share);
    // A quartile gives way to its neighbours, so that a narrow hand keeps its median at one half.
    return apart(before, x) && apart(x, after) ? [{ x, y: (line(x) + share) / 2 }] : [];
  };
  return normalizePressureCurve({
    points: [
      { x: bottom, y: 0 },
      ...quartile(0.25, bottom, median),
      { x: median, y: 0.5 },
      ...quartile(0.75, median, top),
      { x: top, y: 1 }
    ]
  });
}

/**
 * The pressures `fitPressureCurve` counts, sorted ascending: samples of each stroke more than {@link strokeEdgeMs}
 * after its first and before its last sample, with a finite pressure above zero.
 */
export function strokePressures(strokes: readonly PressureStroke[]): number[] {
  const pressures: number[] = [];
  for (const stroke of strokes) {
    const first = stroke[0]?.time ?? 0;
    const last = stroke.at(-1)?.time ?? 0;
    for (const sample of stroke) {
      if (
        sample.time - first > strokeEdgeMs &&
        last - sample.time > strokeEdgeMs &&
        Number.isFinite(sample.pressure) &&
        sample.pressure > 0
      ) {
        pressures.push(Math.min(1, sample.pressure));
      }
    }
  }

  return pressures.sort((a, b) => a - b);
}

/** The `q` quantile of ascending `sorted` values, interpolated between neighbours; zero for no values. */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) {
    return 0;
  }

  const position = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const below = Math.floor(position);
  const above = Math.min(sorted.length - 1, below + 1);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below);
}

/** Milliseconds at each end of a stroke, where the pen lands and lifts, that calibration ignores. */
export const strokeEdgeMs = 30;

/** Counted samples a calibration step needs before it says anything about the pen. */
export const minimumSamples = 50;

/**
 * Steffen's slopes at `points` (M. Steffen, "A simple method for monotonic interpolation in one dimension", 1990):
 * inside, the slope of the parabola through a point and its neighbours, limited to twice the smaller neighbouring
 * secant; at the ends, the one-sided parabola, limited the same way. Zero next to a flat piece.
 *
 * The parabola's slope is kept wherever it leaves each piece between its points, so points lying on a smooth curve
 * give that curve. The harmonic mean of the neighbouring secants (Fritsch–Butland), which the three-point curve used,
 * leans toward the flatter side at every point. Where a steep piece meets a flat one, any curve that neither falls nor
 * overshoots must still turn sharply; there the points themselves have to move, which is why they move freely.
 */
function steffenSlopes(points: readonly PressurePoint[]): number[] {
  const widths = points.slice(1).map((point, index) => point.x - points[index]!.x);
  const secants = points.slice(1).map((point, index) => (point.y - points[index]!.y) / widths[index]!);
  if (secants.length === 1) {
    return [secants[0]!, secants[0]!];
  }

  const limited = (slope: number, secant: number, other: number) =>
    slope <= 0 || secant <= 0 ? 0 : Math.min(slope, 2 * secant, 2 * other);
  const end = (near: number, nearWidth: number, far: number, farWidth: number) => {
    const slope = near * (1 + nearWidth / (nearWidth + farWidth)) - (far * nearWidth) / (nearWidth + farWidth);
    return slope <= 0 || near <= 0 ? 0 : Math.min(slope, 2 * near);
  };
  const last = secants.length - 1;
  return [
    end(secants[0]!, widths[0]!, secants[1]!, widths[1]!),
    ...secants.slice(1).map((secant, index) => {
      const before = secants[index]!;
      const parabola = (before * widths[index + 1]! + secant * widths[index]!) / (widths[index]! + widths[index + 1]!);
      return limited(parabola, before, secant);
    }),
    end(secants[last]!, widths[last]!, secants[last - 1]!, widths[last - 1]!)
  ];
}

/** Whether raw pressure `to` is at least {@link pointGap} after `from`, allowing binary noise: 0.42 − 0.4 < 0.02. */
function apart(from: number, to: number) {
  return to - from >= pointGap - 1e-9;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function tidy(value: number) {
  return Math.round(value * 1e4) / 1e4;
}
