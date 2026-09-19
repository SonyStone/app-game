import { brushToFormValues } from '@app-game/abr-brush/form';
import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { createAbrStrokeSampler, dualPreviewInput, stampStride, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { initAbr } from '@app-game/abr-parser';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Wet Blender's 36×25 tip has a rounded minor diameter of 35 at size 50.
// Count/scatter probes use 35px events at 100% spacing to isolate one group per sample.

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
  // The traced radius call multiplies the 50 px diameter by 0.5 and 208 / 100.
  // Stamp centers therefore span 104 px at full pressure.
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
  const firstCount = bothAxes ? 3 : 1;
  expect(result.count).toBe(firstCount + 285 * 3); // Rounded 35px minor diameter × 3% = 1.05px per group.
  let largestAlong = 0;
  let largestAcross = 0;
  for (let i = 0; i < result.count; i++) {
    const group = i < firstCount ? 0 : 1 + Math.floor((i - firstCount) / 3);
    const along = result.data[i * stampStride]! - group * 1.05;
    const across = result.data[i * stampStride + 1]!;
    largestAlong = Math.max(largestAlong, Math.abs(along));
    largestAcross = Math.max(largestAcross, Math.abs(across));
    expect(Math.abs(along)).toBeLessThanOrEqual(25);
    expect(Math.abs(across)).toBeLessThanOrEqual(25);
  }
  expect(largestAcross).toBeGreaterThan(24);
  if (bothAxes) expect(largestAlong).toBeGreaterThan(24);
  else expect(largestAlong).toBeLessThan(0.0001);
});

await initAbr(
  readFileSync(new URL('../../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url))
);

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

it('dual tips use Photoshop half-diameter scatter without changing the saved settings', () => {
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
  const result = createAbrStrokeSampler({ ...secondary, size: 50, seed: 12345 }, tip).add([
    point(0, 0),
    point(0, 4000)
  ]);
  const centers = Array.from({ length: result.count }, (_, i) => result.data[i * stampStride]!);
  expect(Math.min(...centers)).toBeGreaterThanOrEqual(-52);
  expect(Math.max(...centers)).toBeLessThanOrEqual(52);
  expect(Math.min(...centers)).toBeLessThan(-48);
  expect(Math.max(...centers)).toBeGreaterThan(48);
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
  const counts = Array.from({ length: 4096 }, (_, i) => sampler.add([point(i * 35, 0)]).count);
  expect(Math.min(...counts)).toBe(minimum);
  expect(Math.max(...counts)).toBe(maximum);
  if (jitter === 50) {
    // The fractional amplitude 1.5 survives the integer clamp of ±1.
    // Drawing with an amplitude truncated to 1 would put half the marks in the center bin.
    for (const count of [2, 3, 4]) {
      const frequency = counts.filter((value) => value === count).length / counts.length;
      expect(frequency).toBeGreaterThan(0.3);
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
  const points = Array.from({ length: 129 }, (_, i) => point(i * 35, 0));
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
  for (let i = 0; i < 32; i++) expect(sampler.add([point(i * 35, 0, pressure)]).count).toBe(count);
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
    const result = sampler.add([point(i * 35, 0)]);
    expect(result.count).toBe(1);
    const radius = Math.hypot(result.data[0]! - i * 35, result.data[1]!);
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
    const result = sampler.add([point(i * 35, 0)]);
    expect(result.count).toBe(3);
    for (let copy = 0; copy < result.count; copy++) {
      expect(result.data[copy * stampStride]).toBe(i * 35);
      expect(Math.abs(result.data[copy * stampStride + 1]!)).toBeLessThanOrEqual(25);
    }
  }
});

it.each(['PbTl', 'PcTl', 'SmTl', 'BlTl', 'ShTl'] as const)(
  '%s uses Photoshop count truncation and bounded jitter',
  (type) => {
    const { values, tip } = wetBlender();
    values.tool.type = type;
    values.useShapeDynamics = false;
    values.spacing = 100;
    Object.assign(values.scattering, { scatter: 0, count: 3, countJitter: 30, countControl: 2 });
    const sampler = createAbrStrokeSampler({ values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 37 }, tip);
    // Count 3 at 25% pressure truncates 1 + (3 - 1) * 0.25 to 1, before jitter.
    // At full pressure, the ±0.9 jitter is clamped to integer bounds of zero.
    for (let i = 0; i < 256; i++) {
      expect(sampler.add([point(i * 35, 0, i % 2 ? 1 : 0.25)]).count).toBe(i % 2 ? 3 : 1);
    }
  }
);

it.each(['PbTl', 'PcTl', 'SmTl', 'BlTl', 'ShTl'] as const)(
  '%s starts one-axis scatter at contact without consuming the scatter stream',
  (type) => {
    const { values, tip } = wetBlender();
    values.tool.type = type;
    values.useShapeDynamics = false;
    values.spacing = 100;
    Object.assign(values.scattering, { scatter: 100, bothAxes: false, control: 0, count: 3, countJitter: 0 });
    const input = { values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 37 };
    const sampler = createAbrStrokeSampler(input, tip);
    const contact = sampler.add([point(0, 0)]);
    expect(contact.count).toBe(1);
    const quantized = type === 'PcTl' ? 0.5 : 0;
    expect([...contact.data.slice(0, 2)]).toEqual([quantized, quantized]);
    const next = sampler.add([point(50, 0)]);
    // Compare to the same stream with scatter disabled only for the contact mark.
    const settings = structuredClone(values);
    settings.scattering.scatter = 0;
    const reference = createAbrStrokeSampler({ ...input, values: settings }, tip);
    reference.add([point(0, 0)]);
    settings.scattering.scatter = 100;
    expect(next).toEqual(reference.add([point(50, 0)]));
  }
);

it.each(['PbTl', 'SmTl', 'BlTl', 'ShTl'] as const)(
  '%s keeps both-axis scatter offsets in document coordinates when the path turns',
  (type) => {
    const { values, tip } = wetBlender();
    values.tool.type = type;
    values.useShapeDynamics = false;
    values.spacing = 100;
    Object.assign(values.scattering, { scatter: 100, bothAxes: true, control: 0, count: 1, countJitter: 0 });
    const input = { values, size: 50, color: '#000000', flow: 1, opacity: 1, seed: 37 };
    const horizontal = createAbrStrokeSampler(input, tip).add([point(0, 0), point(50, 0)]);
    const vertical = createAbrStrokeSampler(input, tip).add([point(0, 0), point(0, 50)]);
    expect(horizontal.count).toBe(2);
    expect(vertical.count).toBe(2);
    expect(horizontal.data[stampStride]! - 35).toBeCloseTo(vertical.data[stampStride]!, 4);
    expect(horizontal.data[stampStride + 1]!).toBeCloseTo(vertical.data[stampStride + 1]! - 35, 4);
  }
);

it.each(['PbTl', 'PcTl', 'SmTl', 'BlTl', 'ShTl'] as const)(
  '%s clamps tightly spaced primary marks to one pixel and preserves the spacing remainder',
  (type) => {
    const { values, tip } = wetBlender();
    values.tool.type = type;
    values.useShapeDynamics = false;
    values.useScattering = false;
    values.spacing = 1;
    const input = { values, size: 50, color: '#000000', flow: 1, opacity: 1 };
    const sampler = createAbrStrokeSampler(input, tip);
    const a = sampler.add([point(0, 0), point(0.4, 0)]);
    const b = sampler.add([point(0.9, 0)]);
    sampler.preview([point(3.5, 0)]);
    const c = sampler.add([point(3.5, 0)]);
    expect(a.count).toBe(1);
    expect(b.count).toBe(0);
    expect(c.count).toBe(3);
    const offset = type === 'PcTl' ? 0.5 : 0;
    expect(Array.from({ length: c.count }, (_, i) => c.data[i * stampStride])).toEqual([
      1 + offset,
      2 + offset,
      3 + offset
    ]);
    expect([...a.data, ...c.data]).toEqual([
      ...createAbrStrokeSampler(input, tip).add([point(0, 0), point(3.5, 0)]).data
    ]);
  }
);

function wetBlender() {
  const file = loadBrushLibrary(
    readFileSync(new URL('../../../abr-viewer/src/assets/examples/megapack.abr', import.meta.url))
  );
  const brush = file.brushes.find((brush) => brush.name === "Kyle's Paintbox - Wet Blender");
  if (!brush?.tipImage) throw new Error('The bundled Wet Blender preset or its sampled tip is missing.');
  return { values: brushToFormValues(brush), tip: brush.tipImage };
}

function point(x: number, y: number, pressure = 1): PreviewPoint {
  return { x, y, pressure, tiltX: 0, tiltY: 0, rotation: 0, time: Math.hypot(x, y) };
}
