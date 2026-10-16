import { describe, expect, it } from 'vitest';
import penStrokes from './fixtures/penStrokes.json';
import type { Sample } from './brush';
import type { Point } from './camera';
import { fitShape, moveShape, shapeName, shapeOutline, shapePivot, shapeSamples, snapShape, type QuickShape } from './shapeFit';

describe('fitShape', () => {
  it('recognizes each shape in hand-drawn strokes with wobble and jitter', () => {
    for (let seed = 1; seed <= 12; seed++) {
      expect(nameOf(drawn(segments([0, 0], [300, 120]), seed))).toBe('Line');
      expect(nameOf(drawn(arc([0, 0], 150, -0.3, 1.9), seed))).toBe('Arc');
      expect(nameOf(drawn(arc([0, 0], 150, 2, -1.4), seed))).toBe('Arc');
      expect(nameOf(drawn(ellipse([0, 0], 200, 110, 0.4, 0.3, 1), seed))).toBe('Ellipse');
      expect(['Ellipse', 'Circle']).toContain(nameOf(drawn(ellipse([0, 0], 150, 150, 0, 2, -1), seed)));
      expect(nameOf(drawn(segments([0, 0], [240, 20], [120, 210], [0, 0]), seed))).toBe('Triangle');
      expect(nameOf(drawn(rotated(segments([0, 0], [260, 0], [260, 160], [0, 160], [0, 0]), 0.3), seed))).toBe(
        'Rectangle'
      );
      expect(nameOf(drawn(segments([0, 0], [300, 0], [220, 160], [60, 160], [0, 0]), seed))).toBe('Quadrilateral');
      expect(nameOf(drawn(segments([0, 0], [0, 200], [220, 200]), seed))).toBe('Polyline');
      expect(nameOf(drawn(segments([0, 0], [100, 180], [200, 0], [300, 180]), seed))).toBe('Polyline');
    }
  });

  it('closes a loop that overshoots or stops short of its start', () => {
    expect(nameOf(drawn(ellipse([0, 0], 200, 120, 0, 0, 1, 2.25 * Math.PI), 3))).toBe('Ellipse');
    expect(nameOf(drawn(ellipse([0, 0], 200, 120, 0, 0, 1, 1.9 * Math.PI), 3))).toBe('Ellipse');
    expect(nameOf(drawn(segments([0, 0], [240, 0], [240, 240], [0, 240], [0, 30]), 3))).toBe('Rectangle');
  });

  it('leaves scribbles, spirals and zigzags of many corners as strokes', () => {
    for (let seed = 1; seed <= 12; seed++) {
      expect(fitShape(scribble(seed))).toBeUndefined();
    }

    const spiral = Array.from({ length: 200 }, (_, index) => {
      const angle = (index / 199) * 5 * Math.PI;
      return { x: (20 + index) * Math.cos(angle), y: (20 + index) * Math.sin(angle) };
    });
    expect(fitShape(spiral)).toBeUndefined();
    const zigzag = segments(...Array.from({ length: 14 }, (_, index) => [index * 40, index % 2 ? 60 : 0] as const));
    expect(fitShape(drawn(zigzag, 2))).toBeUndefined();
    expect(fitShape([{ x: 3, y: 4 }])).toBeUndefined();
    expect(fitShape([{ x: 3, y: 4 }, { x: 3, y: 4 }])).toBeUndefined();
  });

  it('recognizes polylines of up to eight corners, not counting the ends of an open one', () => {
    const zigzag = (corners: number) =>
      segments(...Array.from({ length: corners + 2 }, (_, index) => [index * 40, index % 2 ? 120 : 0] as const));
    for (let seed = 1; seed <= 12; seed++) {
      const shape = fitShape(drawn(zigzag(8), seed, 320));
      expect(shape?.kind === 'polyline' && shape.points.length).toBe(10);
      expect(fitShape(drawn(zigzag(9), seed, 320))).toBeUndefined();
    }
  });

  it('gives the same shapes at any scale', () => {
    const strokes = [
      drawn(arc([0, 0], 150, -0.3, 1.9), 5),
      drawn(ellipse([0, 0], 200, 110, 0.4, 0.3, 1), 5),
      drawn(segments([0, 0], [240, 20], [120, 210], [0, 0]), 5),
      drawn(segments([0, 0], [0, 200], [220, 200]), 5)
    ];
    for (const stroke of strokes) {
      const reference = fitShape(stroke)!;
      for (const scale of [0.004, 0.37, 25, 3000]) {
        const scaled = fitShape(stroke.map((point) => ({ x: point.x * scale + 7, y: point.y * scale - 3 })))!;
        expect(shapeName(scaled)).toBe(shapeName(reference));
        const outline = shapeOutline(scaled, 1e9).map(({ point }) => point);
        const expected = shapeOutline(reference, 1e9).map(({ point }) => ({ x: point.x * scale + 7, y: point.y * scale - 3 }));
        expect(outline.length).toBe(expected.length);
        outline.forEach((point, index) => {
          expect(point.x).toBeCloseTo(expected[index]!.x, Math.max(0, 3 - Math.round(Math.log10(scale * 100))));
          expect(point.y).toBeCloseTo(expected[index]!.y, Math.max(0, 3 - Math.round(Math.log10(scale * 100))));
        });
      }
    }
  });

  it('fits close to the shape that was drawn', () => {
    // A line runs exactly from where the stroke began to where the pen held.
    const stroke = drawn(segments([10, 20], [310, 140]), 4);
    const line = fitShape(stroke) as Extract<QuickShape, { kind: 'line' }>;
    expect(line).toEqual({ kind: 'line', start: stroke[0], end: stroke.at(-1) });

    const circle = fitShape(drawn(ellipse([40, -30], 150, 150, 0, 1, 1), 4)) as Extract<QuickShape, { kind: 'ellipse' }>;
    expect(circle.kind).toBe('ellipse');
    expect(Math.abs(circle.center.x - 40)).toBeLessThan(6);
    expect(Math.abs(circle.center.y + 30)).toBeLessThan(6);
    expect(Math.abs(circle.radii.x - 150)).toBeLessThan(8);
    expect(Math.abs(circle.radii.y - 150)).toBeLessThan(8);

    const triangle = fitShape(drawn(segments([0, 0], [240, 20], [120, 210], [0, 0]), 4)) as Extract<
      QuickShape,
      { kind: 'polyline' }
    >;
    for (const corner of [
      { x: 0, y: 0 },
      { x: 240, y: 20 },
      { x: 120, y: 210 }
    ]) {
      expect(Math.min(...triangle.points.map((point) => Math.hypot(point.x - corner.x, point.y - corner.y)))).toBeLessThan(10);
    }
  });

  it('recognizes recorded pen strokes', () => {
    for (const [name, stroke] of Object.entries(penStrokes.strokes)) {
      const shape = nameOf(stroke.map(([x, y]) => ({ x: x!, y: y! })));
      expect(shape ?? 'none').toBe(name.replace(/ \d+$/, ''));
    }
  });
});

describe('editing shapes', () => {
  it('turns and scales an open shape around its start and a closed one around its center', () => {
    const line: QuickShape = { kind: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const moved = moveShape(line, shapePivot(line), { x: 100, y: 0 }, { x: 0, y: 50 }) as typeof line;
    expect(moved.start).toEqual({ x: 0, y: 0 });
    expect(moved.end.x).toBeCloseTo(0);
    expect(moved.end.y).toBeCloseTo(50);

    const ellipse: QuickShape = {
      kind: 'ellipse',
      center: { x: 10, y: 10 },
      radii: { x: 40, y: 20 },
      rotation: 0,
      start: 0,
      direction: 1
    };
    const turned = moveShape(ellipse, shapePivot(ellipse), { x: 50, y: 10 }, { x: 10, y: 90 }) as typeof ellipse;
    expect(turned.center).toEqual({ x: 10, y: 10 });
    expect(turned.radii.x).toBeCloseTo(80);
    expect(turned.radii.y).toBeCloseTo(40);
    expect(turned.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('snaps lines to 15°, ellipses to circles, rectangles to squares and triangles to equilateral ones', () => {
    const line = snapShape({ kind: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 22 } }) as Extract<
      QuickShape,
      { kind: 'line' }
    >;
    expect(Math.atan2(line.end.y, line.end.x)).toBeCloseTo(Math.PI / 12);
    expect(Math.hypot(line.end.x, line.end.y)).toBeCloseTo(Math.hypot(100, 22));

    expect(
      shapeName(snapShape({ kind: 'ellipse', center: { x: 0, y: 0 }, radii: { x: 40, y: 20 }, rotation: 1, start: 0, direction: 1 }))
    ).toBe('Circle');
    const rectangle: QuickShape = {
      kind: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 }
      ],
      closed: true,
      start: 0.3
    };
    expect(shapeName(rectangle)).toBe('Rectangle');
    expect(shapeName(snapShape(rectangle))).toBe('Square');
    const triangle = snapShape({
      kind: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 10 },
        { x: 80, y: 150 }
      ],
      closed: true,
      start: 0
    }) as Extract<QuickShape, { kind: 'polyline' }>;
    const sides = triangle.points.map((point, index) => {
      const next = triangle.points[(index + 1) % 3]!;
      return Math.hypot(next.x - point.x, next.y - point.y);
    });
    expect(sides[1]).toBeCloseTo(sides[0]!);
    expect(sides[2]).toBeCloseTo(sides[0]!);
  });
});

describe('shapeSamples', () => {
  it('carries pressure and time along the outline by length, keeping time increasing and ignoring the hold', () => {
    const stroke: Sample[] = [
      { x: 0, y: 0, pressure: 0.1, time: 0 },
      { x: 50, y: 3, pressure: 0.8, time: 50 },
      { x: 100, y: 0, pressure: 0.4, time: 100 },
      // The pen held still before the shape appeared.
      { x: 100, y: 0, pressure: 0.6, time: 600 }
    ];
    const samples = shapeSamples({ kind: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, stroke, 10);
    expect(samples).toHaveLength(11);
    expect(samples[0]).toMatchObject({ x: 0, y: 0, pressure: 0.1, time: 0 });
    expect(samples[5]!.pressure).toBeCloseTo(0.8, 1);
    expect(samples.at(-1)).toMatchObject({ x: 100, y: 0, pressure: 0.4 });
    expect(samples.at(-1)!.time).toBeCloseTo(100);
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index]!.time).toBeGreaterThanOrEqual(samples[index - 1]!.time);
    }
  });

  it('keeps polyline corners exact and closes closed shapes where the stroke began', () => {
    const square: QuickShape = {
      kind: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ],
      closed: true,
      start: 0.5
    };
    const points = shapeOutline(square, 7).map(({ point }) => point);
    expect(points[0]).toEqual({ x: 50, y: 0 });
    expect(points.at(-1)).toEqual({ x: 50, y: 0 });
    for (const corner of square.points) {
      expect(points).toContainEqual(corner);
    }
  });
});

function nameOf(stroke: readonly Point[]) {
  const shape = fitShape(stroke);
  return shape && shapeName(shape);
}

/** A path of straight segments through `corners`, as a function of the fraction along it. */
function segments(...corners: (readonly [number, number])[]) {
  const lengths = corners.slice(1).map((corner, index) => Math.hypot(corner[0] - corners[index]![0], corner[1] - corners[index]![1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return (t: number): Point => {
    let distance = t * total;
    for (const [index, length] of lengths.entries()) {
      if (distance <= length || index === lengths.length - 1) {
        const a = corners[index]!,
          b = corners[index + 1]!;
        const f = length > 0 ? Math.min(1, distance / length) : 0;
        return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
      }

      distance -= length;
    }

    return { x: corners.at(-1)![0], y: corners.at(-1)![1] };
  };
}

function arc(center: readonly [number, number], radius: number, start: number, sweep: number) {
  return (t: number): Point => ({
    x: center[0] + radius * Math.cos(start + sweep * t),
    y: center[1] + radius * Math.sin(start + sweep * t)
  });
}

function ellipse(
  center: readonly [number, number],
  rx: number,
  ry: number,
  rotation: number,
  start: number,
  direction: 1 | -1,
  sweep = 2 * Math.PI
) {
  return (t: number): Point => {
    const angle = start + direction * sweep * t;
    const x = rx * Math.cos(angle),
      y = ry * Math.sin(angle);
    return {
      x: center[0] + x * Math.cos(rotation) - y * Math.sin(rotation),
      y: center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)
    };
  };
}

function rotated(path: (t: number) => Point, angle: number) {
  return (t: number): Point => {
    const { x, y } = path(t);
    return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
  };
}

/**
 * Samples `path` like a hand would: uneven speed, a slow wobble of about 1.5% of the size across the path and
 * jitter of 0.4%, from a seeded generator.
 */
function drawn(path: (t: number) => Point, seed: number, count = 160): Point[] {
  const random = generator(seed);
  const points = Array.from({ length: count }, (_, index) => path(index / (count - 1)));
  const size = Math.hypot(
    Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y))
  );
  const phases = [random() * 6.28, random() * 6.28, random() * 6.28, random() * 6.28];
  return points.map((_, index) => {
    // Uneven speed: the hand slows near the ends.
    const t = index / (count - 1);
    const eased = t + 0.04 * Math.sin(2 * Math.PI * t + phases[0]!);
    const point = path(Math.min(1, Math.max(0, eased)));
    const wobble = 0.015 * size;
    return {
      x: point.x + wobble * Math.sin(5 * t + phases[1]!) + 0.004 * size * (random() - 0.5) * 2,
      y: point.y + wobble * Math.sin(7 * t + phases[2]!) + 0.004 * size * (random() - 0.5) * 2
    };
  });
}

/** A random walk with momentum, like a scribble. */
function scribble(seed: number): Point[] {
  const random = generator(seed);
  let x = 0,
    y = 0,
    angle = random() * 6.28;
  const points: Point[] = [];
  for (let index = 0; index < 220; index++) {
    angle += (random() - 0.5) * 1.6;
    x += 6 * Math.cos(angle);
    y += 6 * Math.sin(angle);
    points.push({ x, y });
  }

  return points;
}

function generator(seed: number) {
  let state = seed * 2654435761;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
