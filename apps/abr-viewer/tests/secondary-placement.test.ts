import { expect, test } from 'vitest';
import { secondaryTipTransform } from '@app-game/abr-brush/sampledTipRaster';
import { createAbrStrokeSampler, type PreviewInput } from '@app-game/abr-brush/stroke';
import { brushToFormValues } from '@app-game/abr-brush/form';

test('odd sampled secondary dimensions retain the asymmetric integer center and flipped UVs', () => {
  const actual = secondaryTipTransform({ width: 11, height: 9 }, { x: 16, y: 12 }, 1, 0, true);
  expect(actual.quad).toEqual([[11, 8, 11, 0], [22, 8, 0, 0], [22, 17, 0, 9], [11, 17, 11, 9]]);
  expect(actual.axisAligned).toBe(true);
});

test('positive secondary rotation turns the right edge toward decreasing document y', () => {
  const actual = secondaryTipTransform({ width: 4, height: 2 }, { x: 0, y: 0 }, 1, 90);
  const expected = [[-1, 2], [-1, -2], [1, -2], [1, 2]];
  actual.quad.forEach((vertex, i) => {
    expect(vertex[0]).toBeCloseTo(expected[i]![0]!);
    expect(vertex[1]).toBeCloseTo(expected[i]![1]!);
  });
  expect(actual.axisAligned).toBe(false);
});

test('sampled secondary geometry rounds nominal size and ignores stored roundness', () => {
  const input = settings();
  const source = { width: 11, height: 9 };
  const stroke = createAbrStrokeSampler(input, source).add([point(0)]);
  const normal = stroke.sampledTips!;
  input.values.roundness = 20;
  const narrow = createAbrStrokeSampler(input, source).add([point(0)]).sampledTips!;
  expect(narrow).toEqual(normal);
  expect(normal[0]!.scale).toBe(16 / 11);
  const [a, b] = normal[0]!.quad;
  // The sampled quad uses the evaluated angle directly in clockwise document coordinates.
  expect((b![0] - a![0]) / 16).toBeCloseTo(stroke.data[4]!, 6);
  expect((b![1] - a![1]) / 16).toBeCloseTo(-stroke.data[5]!, 6);
});

test('secondary geometry survives input batching and speculative preview rollback', () => {
  const input = settings(), source = { width: 11, height: 9 };
  const points = [point(0), point(25), point(50)];
  const sampler = createAbrStrokeSampler(input, source);
  const first = sampler.add([points[0]!]);
  sampler.preview([point(100)]);
  const rest = points.slice(1).flatMap(p => sampler.add([p]).sampledTips!);
  expect([...first.sampledTips!, ...rest]).toEqual(createAbrStrokeSampler(input, source).add(points).sampledTips);
});

test('secondary scatter uses the rounded nominal size for computed and sampled tips', () => {
  for (const tipKind of ['computedBrush', 'sampledBrush'] as const) {
    const input = settings();
    Object.assign(input.values, { tipKind, useScattering: true });
    Object.assign(input.values.scattering, { scatter: 208, bothAxes: true, count: 3 });
    const source = { width: 31, height: 25 };
    const fractional = createAbrStrokeSampler(input, source).add([point(0), point(50)]);
    const rounded = createAbrStrokeSampler({ ...input, size: 16 }, source).add([point(0), point(50)]);
    expect(fractional.sampledTips).toEqual(rounded.sampledTips);
  }
});

test('known path tangent controls first secondary scatter without delaying live contact', () => {
  const input = settings();
  input.values.useScattering = true;
  Object.assign(input.values.scattering, { scatter: 208, bothAxes: false, count: 3 });
  const source = { width: 11, height: 9 };
  const directed = createAbrStrokeSampler({ ...input, initialTangent: { x: 1, y: 0 } }, source);
  const live = createAbrStrokeSampler(input, source);
  const marks = directed.add([point(0)]);
  expect(marks.count).toBe(3);
  expect(live.add([point(0)]).count).toBe(3);
  // Horizontal tangent only shifts y; live contact has no tangent and draws radially.
  for (let i = 0; i < marks.count; i++) expect(marks.data[i * 16]).toBe(0);
  expect(directed.randomState()[14]).not.toBe(live.randomState()[14]);
  const all = createAbrStrokeSampler({ ...input, initialTangent: { x: 1, y: 0 } }, source)
    .add([point(0), point(50)]);
  directed.preview([point(100)]);
  expect([...marks.sampledTips!, ...directed.add([point(50)]).sampledTips!]).toEqual(all.sampledTips);
});

function settings(): PreviewInput & { size: number } {
  const values = brushToFormValues({ id: 'secondary', name: 'Secondary', type: 'computed', settings: {}, diameter: 16, spacing: 25 });
  Object.assign(values, { tipKind: 'sampledBrush', roundness: 100, angle: 14, spacing: 25,
    spacingEnabled: true, useShapeDynamics: false, useScattering: false, useBuildUp: false });
  return { values, size: 15.6, width: 128, height: 128, dpr: 1, color: '#000000', background: '#ffffff',
    flow: 1, opacity: 1, stampRole: 'secondary', sampledTipGeometry: true };
}
function point(x: number) {
  return { x, y: 32, time: x, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, pointerType: 'mouse' };
}
