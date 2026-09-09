import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler, dualPreviewInput, stampStride, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { AbrParser } from '@app-game/abr-parser/browser';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it.each([1, 0.5])('Wet Blender scatter uses the full distribution width at pressure %s', (pressure) => {
  const { values, tip } = wetBlender();
  expect(values.diameter).toBe(50);
  expect(values.scattering).toMatchObject({ scatter: 208, bothAxes: true, control: 2, count: 3, countJitter: 100 });
  expect(values.shapeDynamics).toMatchObject({ sizeControl: 2, minimumDiameter: 0, sizeJitter: 0 });
  const input = { values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 12345 };
  const points = [point(0, 0, pressure), point(0, 400, pressure)];
  const scattered = createAbrStrokeSampler(input, tip).add(points);
  const centered = createAbrStrokeSampler(
    { ...input, values: { ...values, scattering: { ...values.scattering, scatter: 0 } } },
    tip
  ).add(points);
  // Mouse contact is pressure 1. Reducing scatter must not shrink its 50 px tip or change count/spacing.
  expect(scattered.count).toBe(centered.count);
  const offsets: number[] = [];
  for (let i = 0; i < scattered.count; i++) {
    const offset = i * stampStride;
    offsets.push(scattered.data[offset]!);
    expect(scattered.data[offset + 2]! * 2).toBeCloseTo(50 * pressure);
    expect(scattered.data[offset + 3]! * 2).toBeCloseTo((50 * 25 * pressure) / 36);
    expect(scattered.data.slice(offset + 2, offset + stampStride)).toEqual(
      centered.data.slice(offset + 2, offset + stampStride)
    );
  }
  // Native Photoshop 50 px / 208% exports span about 153 px including the sampled tip.
  // Stamp centers span 104 px at full pressure, rather than the old 208 px.
  expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-52 * pressure);
  expect(Math.max(...offsets)).toBeLessThanOrEqual(52 * pressure);
  expect(Math.min(...offsets)).toBeLessThan(-48 * pressure);
  expect(Math.max(...offsets)).toBeGreaterThan(48 * pressure);
});

it.each([false, true])('scatter respects count and the stroke axes (both axes: %s)', (bothAxes) => {
  const { values, tip } = wetBlender();
  values.useShapeDynamics = false;
  values.tool.type = 'PbTl';
  Object.assign(values.scattering, { scatter: 100, bothAxes, control: 0, count: 3, countJitter: 0, countControl: 0 });
  const result = createAbrStrokeSampler({ values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 7 }, tip).add([
    point(0, 0),
    point(300, 0)
  ]);
  expect(result.count).toBe(201 * 3); // One group at contact, then one every 1.5 document pixels.
  let largestAlong = 0;
  let largestAcross = 0;
  for (let i = 0; i < result.count; i++) {
    const along = result.data[i * stampStride]! - Math.floor(i / 3) * 1.5;
    const across = result.data[i * stampStride + 1]!;
    largestAlong = Math.max(largestAlong, Math.abs(along));
    largestAcross = Math.max(largestAcross, Math.abs(across));
    expect(Math.abs(along)).toBeLessThanOrEqual(25);
    expect(Math.abs(across)).toBeLessThanOrEqual(25);
  }
  expect(largestAcross).toBeGreaterThan(24);
  if (bothAxes) expect(largestAlong).toBeGreaterThan(24);
  else expect(largestAlong).toBe(0);
});

it('Wet Blender scatter stays deterministic across input batches and disposable previews', () => {
  const { values, tip } = wetBlender();
  const input = { values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 12345 };
  const points = Array.from({ length: 101 }, (_, i) => point(0, i * 4));
  const expected = createAbrStrokeSampler(input, tip).add(points);
  const sampler = createAbrStrokeSampler(input, tip);
  const actual: number[] = [];
  for (let offset = 0; offset < points.length; offset += 7) {
    const batch = points.slice(offset, offset + 7);
    sampler.preview(batch);
    actual.push(...sampler.add(batch).data);
  }
  expect(new Float32Array(actual)).toEqual(expected.data);
});

it('dual tips retain their existing scatter radius without changing preview fitting or saved settings', () => {
  const { values, tip } = wetBlender();
  Object.assign(values.dualBrush, { diameter: 50, scatter: 208, bothAxes: true, count: 3 });
  const saved = structuredClone(values);
  const secondary = dualPreviewInput({
    values,
    color: '#000000',
    flow: 1,
    opacity: 1,
    width: 320,
    height: 100,
    dpr: 1,
    background: '#ffffff'
  });
  expect(secondary.values.scattering.scatter).toBe(208);
  expect(values).toEqual(saved);
  const result = createAbrStrokeSampler({ ...secondary, size: 50, seed: 12345 }, tip).add([point(0, 0), point(0, 400)]);
  const centers = Array.from({ length: result.count }, (_, i) => result.data[i * stampStride]!);
  expect(Math.min(...centers)).toBeGreaterThanOrEqual(-104);
  expect(Math.max(...centers)).toBeLessThanOrEqual(104);
  expect(Math.min(...centers)).toBeLessThan(-100);
  expect(Math.max(...centers)).toBeGreaterThan(100);
});

it.each([
  [0, 3, 3],
  [1, 3, 3],
  [30, 3, 3],
  [50, 2, 4],
  [100, 0, 6]
])('sampled Smudge Count 3 with jitter %s%% spans %s–%s marks per spacing interval', (jitter, minimum, maximum) => {
  const { values, tip } = wetBlender();
  values.useShapeDynamics = false;
  values.spacing = 100;
  Object.assign(values.scattering, { scatter: 0, count: 3, countJitter: jitter, countControl: 0 });
  const sampler = createAbrStrokeSampler({ values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 12345 }, tip);
  const counts = Array.from({ length: 4096 }, (_, i) => sampler.add([point(i * 50, 0)]).count);
  expect(Math.min(...counts)).toBe(minimum);
  expect(Math.max(...counts)).toBe(maximum);
  if (jitter === 50) {
    // The fractional amplitude 1.5 survives the integer clamp of ±1.
    // Drawing with an amplitude truncated to 1 would put half the marks in the center bin.
    for (const count of [2, 3, 4]) {
      const frequency = counts.filter((value) => value === count).length / counts.length;
      expect(frequency).toBeGreaterThan(0.30);
      expect(frequency).toBeLessThan(0.37);
    }
  }
  if (jitter === 100) {
    // Signed jitter is rounded: endpoint bins have half the width of the interior bins.
    // Broad deterministic bounds distinguish this from flooring or an inclusive integer-uniform draw.
    for (const endpoint of [0, 6]) {
      const frequency = counts.filter((count) => count === endpoint).length / counts.length;
      expect(frequency).toBeGreaterThan(0.06);
      expect(frequency).toBeLessThan(0.11);
    }
    for (const interior of [1, 2, 3, 4, 5]) {
      const frequency = counts.filter((count) => count === interior).length / counts.length;
      expect(frequency).toBeGreaterThan(0.14);
      expect(frequency).toBeLessThan(0.2);
    }
  }
});

it('empty count-jitter intervals advance spacing and retain the mouse count-control behavior', () => {
  const { values, tip } = wetBlender();
  values.useShapeDynamics = false;
  values.spacing = 100;
  Object.assign(values.scattering, { scatter: 0, count: 3, countJitter: 100, countControl: 0 });
  const input = { values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 12345 };
  const points = Array.from({ length: 129 }, (_, i) => point(i * 50, 0));
  const sampler = createAbrStrokeSampler(input, tip);
  const combined: number[] = [];
  let empty = 0;
  for (const point of points) {
    const group = sampler.add([point]);
    if (!group.count) empty++;
    for (let i = 0; i < group.count; i++) expect(group.data[i * stampStride]).toBe(point.x);
    combined.push(...group.data);
  }
  expect(empty).toBeGreaterThan(0);
  const whole = createAbrStrokeSampler(input, tip).add(points);
  expect(new Float32Array(combined)).toEqual(whole.data);
  const pressureControlled = createAbrStrokeSampler(
    { ...input, values: { ...values, scattering: { ...values.scattering, countControl: 2 } } },
    tip
  ).add(points);
  expect(pressureControlled).toEqual(whole);
});

it.each([
  [0, 1],
  [0.49, 1],
  [0.5, 2],
  [0.99, 2],
  [1, 3]
])('sampled Smudge interpolates count from one before truncating at pressure %s', (pressure, count) => {
  const { values, tip } = wetBlender();
  values.useShapeDynamics = false;
  values.spacing = 100;
  Object.assign(values.scattering, { scatter: 0, count: 3, countJitter: 30, countControl: 2 });
  const sampler = createAbrStrokeSampler({ values, size: 50, color: '#000000', flow: 1, opacity: 1 }, tip);
  for (let i = 0; i < 32; i++) expect(sampler.add([point(i * 50, 0, pressure)]).count).toBe(count);
});

it('sampled Smudge both-axis scatter fills a disk with a uniform radius, not a square or uniform area', () => {
  const { values, tip } = wetBlender();
  values.useShapeDynamics = false;
  values.spacing = 100;
  Object.assign(values.scattering, { scatter: 100, count: 1, countJitter: 0, countControl: 0, control: 0 });
  const sampler = createAbrStrokeSampler({ values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 37 }, tip);
  let insideHalfRadius = 0;
  const radii: number[] = [];
  for (let i = 0; i < 4096; i++) {
    const result = sampler.add([point(i * 50, 0)]);
    expect(result.count).toBe(1);
    const radius = Math.hypot(result.data[0]! - i * 50, result.data[1]!);
    // Float32 position storage loses a small fraction of a pixel this far from the origin.
    expect(radius).toBeLessThanOrEqual(25.02);
    if (radius < 12.5) insideHalfRadius++;
    radii.push(radius);
  }
  expect(insideHalfRadius / radii.length).toBeGreaterThan(0.46);
  expect(insideHalfRadius / radii.length).toBeLessThan(0.54);
  expect(Math.max(...radii)).toBeGreaterThan(24.5);
});

it('sampled Smudge starts one-axis scattering with one mark, then expands later count groups', () => {
  const { values, tip } = wetBlender();
  values.useShapeDynamics = false;
  values.spacing = 100;
  Object.assign(values.scattering, { scatter: 100, bothAxes: false, count: 3, countJitter: 0, countControl: 0 });
  const sampler = createAbrStrokeSampler({ values, size: 50, color: '#000000', flow: 1, opacity: 1 }, tip);
  expect(sampler.preview([point(0, 0)]).count).toBe(1);
  expect(sampler.add([point(0, 0)]).count).toBe(1);
  for (let i = 1; i < 32; i++) {
    const result = sampler.add([point(i * 50, 0)]);
    expect(result.count).toBe(3);
    for (let copy = 0; copy < result.count; copy++) {
      expect(result.data[copy * stampStride]).toBe(i * 50);
      expect(Math.abs(result.data[copy * stampStride + 1]!)).toBeLessThanOrEqual(25);
    }
  }
});

it.each(['PbTl', 'MixB', 'BlTl'] as const)('keeps the existing count model for the unverified %s route', (type) => {
  const { values, tip } = wetBlender();
  values.tool.type = type;
  values.useShapeDynamics = false;
  values.spacing = 100;
  Object.assign(values.scattering, { scatter: 0, count: 3, countJitter: 30, countControl: 0 });
  const sampler = createAbrStrokeSampler({ values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 37 }, tip);
  const counts = Array.from({ length: 256 }, (_, i) => sampler.add([point(i * 50, 0)]).count);
  expect(Math.min(...counts)).toBe(2);
  expect(Math.max(...counts)).toBe(4);
});

function wetBlender() {
  const file = new AbrParser().parse(readFileSync('apps/abr-viewer/src/assets/examples/megapack.abr'));
  const brush = file.brushes.find((brush) => brush.name === "Kyle's Paintbox - Wet Blender");
  if (!brush?.brushTip) throw new Error('The bundled Wet Blender preset or its sampled tip is missing.');
  return { values: brushToFormValues(brush), tip: brush.brushTip };
}

function point(x: number, y: number, pressure = 1): PreviewPoint {
  return { x, y, pressure, tiltX: 0, tiltY: 0, rotation: 0, time: Math.hypot(x, y) };
}
