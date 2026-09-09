import { expect, it } from 'vitest';
import { defaultBrush, type Dab } from './brush';
import { defaultCamera, screenToWorld, worldToScreen } from './camera';
import { createDocument } from './document';
import { readPaintFile, writePaintFile } from './paintFile';
import { decodeDocument, encodeDocument, restoreDocument, snapshotDocument } from './storage';
import {
  defaultPaintSymmetry,
  paintSymmetrySchema,
  supportsPaintSymmetry,
  symmetryDabs,
  symmetryGuide,
  symmetryPoint,
  symmetryTransforms
} from './symmetry';

it('reflects about document axes and composes radial/mandala copies without duplicating full turns', () => {
  const origin = { ...defaultPaintSymmetry(), x: 10, y: -20 };
  const point = { x: 14, y: -11 };
  const points = (mode: typeof origin.mode, segments = 6) =>
    symmetryTransforms({ ...origin, mode, segments }).map((t) => symmetryPoint(point, t));
  expect(points('vertical')).toEqual([point, { x: 6, y: -11 }]);
  expect(points('horizontal')[1]!.x).toBeCloseTo(14);
  expect(points('horizontal')[1]!.y).toBeCloseTo(-29);
  expect(points('diagonal')[1]!.x).toBeCloseTo(19);
  expect(points('diagonal')[1]!.y).toBeCloseTo(-16);
  expect(points('dual')).toHaveLength(4);
  expect(points('radial', 12)).toHaveLength(12);
  expect(points('mandala', 10)).toHaveLength(20);
  for (const mode of ['vertical', 'horizontal', 'dual', 'diagonal', 'radial', 'mandala'] as const) {
    const values = points(mode);
    expect(new Set(values.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)).size).toBe(values.length);
    for (const p of values) expect(Math.hypot(p.x - origin.x, p.y - origin.y)).toBeCloseTo(Math.hypot(4, 9));
  }
});

it('moves and rotates an axis while camera zoom/rotation/mirroring only affect its projection', () => {
  const state = { ...defaultPaintSymmetry(), mode: 'vertical' as const, x: -70, y: 93, angle: Math.PI / 5 };
  const transform = symmetryTransforms(state)[1]!;
  const line = symmetryGuide(state, 100)[0]!;
  for (const point of line) {
    const reflected = symmetryPoint(point, transform);
    expect(reflected.x).toBeCloseTo(point.x);
    expect(reflected.y).toBeCloseTo(point.y);
  }
  const point = { x: -100, y: 20 };
  const mirrored = symmetryPoint(point, transform);
  const camera = { ...defaultCamera(), x: -51, y: 26, zoom: 0.05, angle: 0.7, mirrored: true };
  const view = { width: 501, height: 702 };
  const restored = screenToWorld(worldToScreen(mirrored, camera, view), camera, view);
  expect(restored.x).toBeCloseTo(mirrored.x);
  expect(restored.y).toBeCloseTo(mirrored.y);
});

it('transforms asymmetric ABR mask orientation/handedness without changing source buffers or dynamics', () => {
  const data = Float32Array.of(
    -40,
    65,
    13,
    7,
    Math.cos(0.4),
    Math.sin(0.4),
    -1,
    1,
    0.2,
    0.3,
    0.4,
    37,
    0.5,
    0.6,
    0.7,
    1
  );
  const before = data.slice();
  const dab: Dab = { x: -40, y: 65, radius: 15, flow: 0.2, abr: { data, secondary: true } };
  const transforms = symmetryTransforms({
    ...defaultPaintSymmetry(),
    mode: 'mandala',
    x: 12,
    y: -8,
    segments: 7,
    angle: 0.8
  });
  const result = symmetryDabs([dab], transforms);
  expect(result[0]).toBe(dab);
  expect(data).toEqual(before);
  for (let i = 0; i < result.length; i++) {
    const transformed = result[i]!;
    const packed = transformed.abr!.data;
    expect(packed.slice(8)).toEqual(data.slice(8));
    expect(transformed.abr!.secondary).toBe(true);
    expect(transformed.radius).toBe(dab.radius);
    // Compare four fixed UV locations, not just the circumscribed bounds of the stamp.
    for (const uv of [
      [-0.7, -0.3],
      [0.4, -0.8],
      [0.9, 0.6],
      [-0.3, 0.7]
    ]) {
      const corner = (d: Float32Array) => {
        const x = uv[0]! * d[6]! * d[2]!,
          y = uv[1]! * d[7]! * d[3]!;
        return { x: d[0]! + x * d[4]! - y * d[5]!, y: d[1]! + x * d[5]! + y * d[4]! };
      };
      const expected = symmetryPoint(corner(data), transforms[i]!);
      expect(corner(packed).x).toBeCloseTo(expected.x, 4);
      expect(corner(packed).y).toBeCloseTo(expected.y, 4);
    }
  }
  expect(symmetryDabs([dab], symmetryTransforms(defaultPaintSymmetry()))[0]).toBe(dab);
});

it('stores guides in JSON, binary and internal checkpoints; legacy files default to off and invalid counts fail', async () => {
  const document = createDocument();
  const symmetry = {
    ...defaultPaintSymmetry(),
    mode: 'mandala' as const,
    x: -100,
    y: 25,
    angle: 0.3,
    segments: 9,
    visible: false
  };
  const saved = snapshotDocument(document.layers, document.active.id, defaultCamera(), symmetry);
  const file = await writePaintFile(saved, async (value) => value as Uint8Array);
  expect((await readPaintFile(file)).symmetry).toEqual(symmetry);
  expect(decodeDocument(encodeDocument(saved)).symmetry).toEqual(symmetry);
  expect(restoreDocument({ ...saved, version: 3 }).symmetry).toEqual(symmetry);
  expect(restoreDocument({ ...saved, symmetry: undefined }).symmetry).toEqual(defaultPaintSymmetry());
  for (const segments of [0, 2, 11, 20, 3.5, NaN])
    expect(paintSymmetrySchema.safeParse({ ...symmetry, segments }).success).toBe(false);
  for (const mode of ['MixB', 'SmTl', 'BlTl', 'ShTl']) {
    const brush = {
      ...defaultBrush(),
      engine: { id: 'abr', settings: { values: { tipKind: 'sampledBrush', tool: { type: mode } } } }
    };
    expect(supportsPaintSymmetry(brush)).toBe(false);
  }
  expect(supportsPaintSymmetry(defaultBrush())).toBe(true);
});
