import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler, dualPreviewInput, stampStride, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { percent } from '@app-game/abr-parser';
import { expect, it } from 'vitest';

it('secondary marks follow the traced channel-12/14/19/20 arithmetic', () => {
  const input = secondaryInput();
  input.values.dualBrush.flip = true;
  Object.assign(input.values.scattering, { scatter: 100, bothAxes: true, count: 3 });
  const stroke = createAbrStrokeSampler(input, tip).add([point(0, 0)]);
  // Independent modular-integer evaluation of Photoshop's recovered helpers,
  // using this sampler's documented seed mapping, in document x/y order.
  // The original helper returns cos * radius for x, sin * radius for y.
  const expected = [
    [-24.336310906, 5.646535869, 0.969288154, 0.245927782, 1, 1],
    [4.223706557, 11.94344608, 0.850786224, 0.525511941, 1, -1],
    [2.106059213, -2.011146723, -0.998129528, -0.061134649, -1, -1]
  ];
  expect(stroke.count).toBe(3);
  for (let i = 0; i < expected.length; i++) {
    for (const [column, attribute] of [0, 1, 4, 5, 6, 7].entries()) {
      expect(stroke.data[i * stampStride + attribute]!).toBeCloseTo(expected[i]![column]!, 5);
    }
  }
});

it('secondary spacing never advances by less than one pixel', () => {
  const input = secondaryInput();
  input.values.spacing = 1;
  const sampler = createAbrStrokeSampler(input, tip);
  const stroke = sampler.add([point(0, 0), point(10, 0)]);
  expect(stroke.count).toBe(11);
  for (let i = 0; i < stroke.count; i++) expect(stroke.data[i * stampStride]).toBe(i);
});

it('secondary count applies at contact and one-axis scatter becomes perpendicular after movement', () => {
  const input = secondaryInput();
  Object.assign(input.values.scattering, { scatter: 100, bothAxes: false, count: 3 });
  const sampler = createAbrStrokeSampler(input, tip);
  const first = sampler.add([point(0, 0)]);
  expect(first.count).toBe(3);
  const contactOffsets = Array.from({ length: 3 }, (_, i) => first.data[i * stampStride]!);
  expect(contactOffsets.some((x) => Math.abs(x) > 1)).toBe(true);
  for (let i = 0; i < 3; i++) {
    expect(Math.hypot(first.data[i * stampStride]!, first.data[i * stampStride + 1]!)).toBeLessThanOrEqual(25.001);
  }
  const next = sampler.add([point(50, 0)]);
  expect(next.count).toBe(3);
  for (let i = 0; i < 3; i++) {
    expect(next.data[i * stampStride]).toBe(50);
    expect(Math.abs(next.data[i * stampStride + 1]!)).toBeLessThanOrEqual(25);
  }
});

it('secondary scatter uses a disk and ignores movement direction for Both Axes', () => {
  const input = secondaryInput();
  Object.assign(input.values.scattering, { scatter: 100, bothAxes: true, count: 1 });
  const horizontal = createAbrStrokeSampler(input, tip);
  const vertical = createAbrStrokeSampler(input, tip);
  let central = 0;
  for (let i = 0; i < 1024; i++) {
    const a = horizontal.add([point(i * 50, 0)]);
    const b = vertical.add([point(0, i * 50)]);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);
    const x = a.data[0]! - i * 50,
      y = a.data[1]!;
    expect(x).toBeCloseTo(b.data[0]!, 2);
    expect(y).toBeCloseTo(b.data[1]! - i * 50, 2);
    const radius = Math.hypot(x, y);
    expect(radius).toBeLessThanOrEqual(25.005);
    if (radius < 12.5) central++;
  }
  expect(central / 1024).toBeGreaterThan(0.45);
  expect(central / 1024).toBeLessThan(0.55);
});

it('secondary rotation varies per mark even with Flip and primary shape dynamics disabled', () => {
  const input = secondaryInput();
  const sampler = createAbrStrokeSampler(input, tip);
  const quadrants = new Set<string>();
  for (let i = 0; i < 128; i++) {
    const { data } = sampler.add([point(i * 50, 0)]);
    expect(Math.hypot(data[4]!, data[5]!)).toBeCloseTo(1, 6);
    quadrants.add(`${data[4]! > 0},${data[5]! > 0}`);
    expect(data[6]).toBe(1);
    expect(data[7]).toBe(1);
  }
  expect(quadrants.size).toBe(4);
});

it('Flip randomizes both secondary axes independently without changing rotation, scatter, or count', () => {
  const plain = secondaryInput();
  Object.assign(plain.values.scattering, { scatter: 100, bothAxes: true });
  const flipped = structuredClone(plain);
  flipped.values.dualBrush.flip = true;
  const a = createAbrStrokeSampler(plain, tip),
    b = createAbrStrokeSampler(flipped, tip);
  const combinations = new Set<string>();
  for (let i = 0; i < 128; i++) {
    const x = a.add([point(i * 50, 0)]),
      y = b.add([point(i * 50, 0)]);
    expect(x.count).toBe(y.count);
    expect(x.data.slice(0, 6)).toEqual(y.data.slice(0, 6));
    expect(x.data.slice(8)).toEqual(y.data.slice(8));
    combinations.add(`${y.data[6]},${y.data[7]}`);
  }
  expect(combinations).toEqual(new Set(['1,1', '-1,1', '1,-1', '-1,-1']));
});

it('saved secondary axis flips compose with random Flip and do not change its sequence', () => {
  const input = secondaryInput();
  input.values.dualBrush.flip = true;
  const inverted = structuredClone(input);
  inverted.values.flipX = true;
  inverted.values.flipY = true;
  const a = createAbrStrokeSampler(input, tip),
    b = createAbrStrokeSampler(inverted, tip);
  for (let i = 0; i < 32; i++) {
    const x = a.add([point(i * 50, 0)]).data,
      y = b.add([point(i * 50, 0)]).data;
    expect(y[6]).toBe(-x[6]!);
    expect(y[7]).toBe(-x[7]!);
  }
});

it('secondary random channels survive batching and disposable predictions', () => {
  const input = secondaryInput();
  input.values.dualBrush.flip = true;
  Object.assign(input.values.scattering, { scatter: 208, bothAxes: true, count: 3 });
  const points = Array.from({ length: 128 }, (_, i) => point(i * 50, i * 15));
  const expected = createAbrStrokeSampler(input, tip).add(points);
  const sampler = createAbrStrokeSampler(input, tip);
  const actual: number[] = [];
  for (let i = 0; i < points.length; i += 7) {
    sampler.preview(points.slice(i, i + 10));
    actual.push(...sampler.add(points.slice(i, i + 7)).data);
  }
  expect(new Float32Array(actual)).toEqual(expected.data);
});

it('secondary settings do not inherit a physical primary tip or reinterpret Flip as a fixed mirror', () => {
  const values = brushToFormValues({
    id: 'test',
    name: 'Test',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed', spacing: percent(100) } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  values.tipKind = 'dBrush';
  values.dualBrush.flip = true;
  values.dualBrush.flipX = false;
  const input = dualPreviewInput({
    values,
    color: '#000000',
    flow: 1,
    opacity: 1,
    width: 100,
    height: 100,
    dpr: 1,
    background: '#ffffff'
  });
  expect(input.stampRole).toBe('secondary');
  expect(input.values.tipKind).toBe('computedBrush');
  expect(input.values.flipX).toBe(false);
  expect(input.values.dualBrush.flip).toBe(true);
});

function secondaryInput() {
  const values = brushToFormValues({
    id: 'test',
    name: 'Test',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed', spacing: percent(100) } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  Object.assign(values.dualBrush, { diameter: 50, spacing: 100, count: 1, scatter: 0, flip: false, angle: 14 });
  const input = dualPreviewInput({
    values,
    color: '#000000',
    flow: 1,
    opacity: 1,
    width: 100,
    height: 100,
    dpr: 1,
    background: '#ffffff'
  });
  return { ...input, size: 50, seed: 37 };
}

const tip = { width: 36, height: 25 };
function point(x: number, y: number): PreviewPoint {
  return { x, y, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: Math.hypot(x, y) };
}
