import { describe, expect, it } from 'vitest';
import recordings from './fixtures/movinkPadPressure.json';
import {
  applyPressureCurve,
  fitPressureCurve,
  identityPressureCurve,
  maxPressurePoints,
  normalizePressureCurve,
  pointGap,
  pressureMapping,
  quantile,
  strokePressures,
  type PressureCurve,
  type PressureStroke
} from './pressureCurve';

/** Pen strokes from the user's MovinkPad input recordings (`apps/paint/recordings`): [time ms, raw pressure]. */
const movinkPad = (recordings as { recording: string; strokes: [number, number][][] }[]).map(
  ({ recording, strokes }) => ({
    recording,
    strokes: strokes.map((stroke) => stroke.map(([time, pressure]) => ({ time, pressure })))
  })
);

describe('fitPressureCurve', () => {
  it.each(movinkPad.map(({ recording, strokes }) => [recording, strokes] as const))(
    'puts the median of everyday drawing at one half and its 95th percentile near full pressure (%s)',
    (_recording, strokes) => {
      const curve = fitPressureCurve({ normal: strokes });
      const mapped = strokePressures(strokes).map(pressureMapping(curve));
      expect(curve.points[0]).toEqual({ x: 0, y: 0 });
      expect(quantile(mapped, 0.5)).toBeCloseTo(0.5, 1);
      expect(quantile(mapped, 0.95)).toBeGreaterThan(0.9);
    }
  );

  it.each(movinkPad.map(({ recording, strokes }) => [recording, strokes] as const))(
    'puts about five points from the light step to the firm one (%s)',
    (_recording, strokes) => {
      const hard = firmer(strokes);
      const light = lighter(strokes);
      const curve = fitPressureCurve({ normal: strokes, hard, light });
      const mapped = strokePressures(strokes).map(pressureMapping(curve));
      expect(curve.points.length).toBeGreaterThanOrEqual(4);
      expect(curve.points.length).toBeLessThanOrEqual(5);
      expect(curve.points[0]!.x).toBeCloseTo(quantile(strokePressures(light), 0.05), 2);
      expect(curve.points[0]!.y).toBe(0);
      expect(curve.points.at(-1)!.x).toBeCloseTo(quantile(strokePressures(hard), 0.9), 2);
      expect(curve.points.at(-1)!.y).toBe(1);
      expect(quantile(mapped, 0.5)).toBeCloseTo(0.5, 1);
      // Equalizing halfway gives the middle half of everyday pressure the mean of its straight-line share and one half.
      const [bottom, top] = [curve.points[0]!.x, curve.points.at(-1)!.x];
      const straight =
        (quantile(strokePressures(strokes), 0.75) - quantile(strokePressures(strokes), 0.25)) / (top - bottom);
      expect(quantile(mapped, 0.75) - quantile(mapped, 0.25)).toBeCloseTo((straight + 0.5) / 2, 2);
    }
  );

  it('ignores stray samples, pen landings and lifts, and strokes too short to count', () => {
    const strokes = movinkPad[1]!.strokes;
    const clean = fitPressureCurve({ normal: strokes, hard: firmer(strokes), light: lighter(strokes) });
    const spiked = (from: readonly PressureStroke[], pressure: number) =>
      from.map((stroke) => stroke.map((sample, index) => (index % 100 === 50 ? { ...sample, pressure } : sample)));
    const taps = Array.from({ length: 200 }, () => [
      { time: 0, pressure: 1 },
      { time: 20, pressure: 1 },
      { time: 50, pressure: 0.01 }
    ]);
    const noisy = fitPressureCurve({
      normal: [...strokes, ...taps],
      hard: [...spiked(firmer(strokes), 1), ...taps],
      light: [...spiked(lighter(strokes), 0.001), ...taps]
    });
    expect(noisy.points).toHaveLength(clean.points.length);
    noisy.points.forEach((point, index) => {
      expect(Math.abs(point.x - clean.points[index]!.x)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(point.y - clean.points[index]!.y)).toBeLessThanOrEqual(0.02);
    });

    const landings = [
      [
        { time: 0, pressure: 1 },
        ...Array.from({ length: 100 }, (_, index) => ({ time: 31 + index, pressure: 0.5 })),
        { time: 170, pressure: 0 }
      ]
    ];
    expect(strokePressures(landings)).toEqual(Array(100).fill(0.5));
  });

  it('leaves pressure unchanged without enough data', () => {
    expect(fitPressureCurve({ normal: [] })).toEqual(identityPressureCurve);
    expect(fitPressureCurve({ normal: [[{ time: 0, pressure: 0.4 }]], hard: movinkPad[0]!.strokes })).toEqual(
      identityPressureCurve
    );
    expect(
      fitPressureCurve({
        normal: Array(100).fill([
          { time: 0, pressure: 0.5 },
          { time: 40, pressure: 0.5 }
        ])
      })
    ).toEqual(identityPressureCurve);
    for (const raw of [0, 0.3, 0.71, 1]) {
      expect(applyPressureCurve(identityPressureCurve, raw)).toBeCloseTo(raw, 12);
    }
  });

  it('drops a quartile next to the median rather than the median', () => {
    // Pressure rises slowly to the median and quickly above it: the lower quartile lies 0.0125 below the median.
    const stroke = Array.from({ length: 400 }, (_, index) => ({
      time: index,
      pressure: index < 200 ? 0.55 + (index / 200) * 0.03 : 0.58 + ((index - 200) / 200) * 0.1
    }));
    const pressures = strokePressures([stroke]);
    const median = quantile(pressures, 0.5);
    const curve = fitPressureCurve({ normal: [stroke] });
    expect(median - quantile(pressures, 0.25)).toBeLessThan(pointGap);
    expect(curve.points.map(({ y }) => y)).toEqual([0, 0.5, expect.any(Number), 1]);
    expect(curve.points[1]!.x).toBeCloseTo(median, 4);
    expect(curve.points[2]!.x).toBeCloseTo(quantile(pressures, 0.75), 4);
  });

  it('keeps a usable curve when the steps contradict each other', () => {
    const strokes = movinkPad[0]!.strokes;
    const curve = fitPressureCurve({ normal: strokes, hard: lighter(strokes), light: firmer(strokes) });
    expect(normalizePressureCurve(curve)).toEqual(curve);
    expect(curve.points[0]!.x).toBeLessThan(curve.points.at(-1)!.x);
  });
});

describe('applyPressureCurve', () => {
  /** Fitted curves, the old three-point default and hand-made ones with flat and steep pieces. */
  const curves: PressureCurve[] = [
    ...movinkPad.map(({ strokes }) =>
      fitPressureCurve({ normal: strokes, hard: firmer(strokes), light: lighter(strokes) })
    ),
    identityPressureCurve,
    curve([0.05, 0], [0.42, 0.5], [0.8, 1]),
    curve([0, 0.1], [0.3, 0.12], [0.35, 0.8], [0.9, 0.85], [1, 1]),
    curve([0.2, 0], [0.22, 0.5], [0.24, 0.5], [0.26, 1]),
    curve([0, 0], [0.5, 0.5], [0.52, 0.5], [1, 0.9])
  ];

  it('passes through its points, never falls and never leaves the range between neighbouring points', () => {
    for (const shape of curves) {
      const map = pressureMapping(shape);
      for (const point of shape.points) {
        expect(map(point.x)).toBeCloseTo(point.y, 9);
      }

      const values = Array.from({ length: 10001 }, (_, step) => map(step / 10000));
      expect(values[0]).toBe(shape.points[0]!.y);
      expect(values.at(-1)).toBe(shape.points.at(-1)!.y);
      expect(Math.min(...values.slice(1).map((value, index) => value - values[index]!))).toBeGreaterThanOrEqual(0);
      shape.points.slice(1).forEach((end, index) => {
        const start = shape.points[index]!;
        for (let step = 0; step <= 50; step++) {
          const value = map(start.x + ((end.x - start.x) * step) / 50);
          expect(value).toBeGreaterThanOrEqual(start.y - 1e-12);
          expect(value).toBeLessThanOrEqual(end.y + 1e-12);
        }
      });
    }
  });

  it('turns smoothly through every inner point: the slope is the same on both sides', () => {
    for (const shape of curves) {
      const map = pressureMapping(shape);
      for (const point of shape.points.slice(1, -1)) {
        const h = 1e-6;
        const left = (map(point.x) - map(point.x - h)) / h;
        const right = (map(point.x + h) - map(point.x)) / h;
        // One-sided differences differ by about curvature × h; a kink would differ by the slope itself.
        expect(Math.abs(left - right)).toBeLessThan(1e-2 * Math.max(1, left, right));
      }
    }
  });

  it('holds the first point left of it and the last point right of it', () => {
    const map = pressureMapping(curve([0.1, 0.2], [0.9, 0.7]));
    expect(map(0)).toBe(0.2);
    expect(map(0.1)).toBe(0.2);
    expect(map(0.5)).toBeCloseTo(0.45, 9);
    expect(map(0.95)).toBe(0.7);
  });
});

describe('normalizePressureCurve', () => {
  it('orders points, keeps gaps and the point limit, and never lets the output fall', () => {
    expect(
      normalizePressureCurve({
        points: [
          { x: 0.9, y: 0.4 },
          { x: 0.1, y: 0.6 },
          { x: 0.5, y: 2 }
        ]
      })
    ).toEqual(curve([0.1, 0.6], [0.5, 1], [0.9, 1]));
    expect(
      normalizePressureCurve({
        points: [
          { x: 0.3, y: 0 },
          { x: 0.31, y: 0.5 },
          { x: 1, y: 1 }
        ]
      })
    ).toEqual(curve([0.3, 0], [1, 1]));
    expect(
      normalizePressureCurve({
        points: [
          { x: 0.99, y: 0 },
          { x: 0.99, y: 1 }
        ]
      })
    ).toEqual(curve([0.98, 0], [1, 1]));
    const crowded = { points: Array.from({ length: 12 }, (_, index) => ({ x: index / 11, y: index / 11 })) };
    const limited = normalizePressureCurve(crowded);
    expect(limited.points).toHaveLength(maxPressurePoints);
    expect(limited.points.at(-1)).toEqual({ x: 1, y: 1 });
    limited.points
      .slice(1)
      .forEach((point, index) => expect(point.x - limited.points[index]!.x).toBeGreaterThanOrEqual(pointGap));
  });

  it('falls back to the identity curve for anything unusable', () => {
    for (const junk of [
      undefined,
      null,
      3,
      {},
      { points: [] },
      { points: [{ x: 0.5, y: 0.5 }] },
      { points: [{ x: 'a' }, 7] }
    ]) {
      expect(normalizePressureCurve(junk)).toEqual(identityPressureCurve);
    }
  });
});

/** A curve through `[x, y]` pairs, normalized. */
function curve(...points: [number, number][]): PressureCurve {
  return normalizePressureCurve({ points: points.map(([x, y]) => ({ x, y })) });
}

/** The same strokes pressed about as hard as the MovinkPad recordings ever go (0.8). */
function firmer(strokes: readonly PressureStroke[]) {
  const top = quantile(strokePressures(strokes), 0.95);
  return strokes.map((stroke) =>
    stroke.map((sample) => ({ ...sample, pressure: Math.min(1, (sample.pressure * 0.8) / top) }))
  );
}

/** The same strokes drawn with a fifth of the pressure, about as light as a pen still draws. */
function lighter(strokes: readonly PressureStroke[]) {
  return strokes.map((stroke) => stroke.map((sample) => ({ ...sample, pressure: sample.pressure / 5 })));
}
