import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { describe, expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import { createPreviewQueue } from '../src/features/brush-preview/queue';
import {
  createPreviewStroke,
  generateComputedBrushTip,
  stampStride,
  type PreviewInput
} from '../src/features/brush-preview/stroke';

function input(): PreviewInput {
  return {
    values: brushToFormValues({
      id: 'test',
      name: 'Test',
      type: 'computed',
      settings: {},
      spacing: 10,
      diameter: 40,
      hardness: 100
    }),
    width: 240,
    height: 64,
    dpr: 1,
    color: '#ffffff',
    background: '#000000',
    flow: 1,
    opacity: 1
  };
}
const tip = generateComputedBrushTip(32, 100);

test('Pencil has binary edges, ignores Flow, retains opacity and selects Auto Erase color at contact', () => {
  const job = input();
  job.values.tool.type = 'PcTl';
  job.flow = 0.01;
  job.opacity = 0.25;
  const faint = renderPreviewPixels(job, tip);
  const colors = new Set(Array.from(faint).filter((_, i) => i % 4 === 0));
  expect(colors).toEqual(new Set([0, 64]));
  job.opacity = 1;
  const opaque = renderPreviewPixels(job, tip);
  expect(new Set(Array.from(opaque).filter((_, i) => i % 4 === 0))).toEqual(new Set([0, 255]));
  job.values.tool.autoErase = true;
  job.color = '#000000';
  job.secondaryColor = '#ff0000';
  const erased = renderPreviewPixels(job, tip);
  expect(erased.some((value, i) => i % 4 === 0 && value === 255)).toBe(true);
  expect(erased.every((value, i) => i % 4 !== 1 || value === 0)).toBe(true);
});

test('Mixer pressure changes wetness and mix independently, with reversible preview state', () => {
  const job = { ...input(), size: 40 };
  Object.assign(job.values.tool, { type: 'MixB', wetness: 80, mix: 60 });
  job.values.useTransfer = true;
  Object.assign(job.values.transfer, { wetnessControl: 2, wetnessMinimum: 25, mixControl: 2, mixMinimum: 0 });
  const point = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, time: 0 };
  const sampler = createAbrStrokeSampler({ ...job, seed: 1 }, tip);
  const first = sampler.add([point]);
  expect(first.mixing?.[0]).toBeCloseTo(0.8 * 0.625);
  expect(first.mixing?.[1]).toBeCloseTo(0.6 * 0.5);
  // Mixer does not expose ordinary stroke opacity, even if a previous tool left this setting behind.
  expect(first.data[9]).toBe(1);
  Object.assign(job.values.transfer, { wetnessJitter: 30, mixJitter: 40, opacityControl: 2 });
  const a = createAbrStrokeSampler({ ...job, seed: 4, opacity: 0.1 }, tip);
  const b = createAbrStrokeSampler({ ...job, seed: 4, opacity: 0.1 }, tip);
  a.add([point]);
  b.add([point]);
  const next = { ...point, x: 80, time: 20, pressure: 0.8 };
  a.preview([{ ...next, x: 160 }]);
  expect(a.add([next])).toEqual(b.add([next]));
  const ordinary = createAbrStrokeSampler(
    { ...job, values: { ...job.values, tool: { ...job.values.tool, type: 'PbTl' } } },
    tip
  ).add([point]);
  expect(ordinary.mixing).toBeUndefined();
});

test('resource previews use pattern luminance and the secondary tip independently of stroke settings', () => {
  const job = { ...input(), width: 32, height: 32 };
  const black = { width: 8, height: 8, depth: 8 as const, data: new Uint8Array(64) };
  const white = { ...black, data: new Uint8Array(64).fill(255) };
  job.resourcePreview = 'pattern';
  const pixels = renderPreviewPixels(job, tip, undefined, { pattern: black });
  expect(pixels[0]).toBe(0);
  job.values.useNoise = true;
  job.values.texture.invert = true;
  expect(renderPreviewPixels(job, tip, undefined, { pattern: black })).toEqual(pixels);
  job.resourcePreview = 'dual';
  const center = (16 * 32 + 16) * 4;
  expect(renderPreviewPixels(job, white, undefined, { dualTip: black })[center]).toBe(40);
  expect(renderPreviewPixels(job, black, undefined, { dualTip: white })[center]).toBe(255);
});

describe('preview stroke', () => {
  test.each([false, true])('build-up is independent of pointer event frequency (moving: %s)', (moving) => {
    const job = input();
    job.values.useSmoothing = false;
    job.values.useBuildUp = true;
    job.values.spacing = 100;
    const path = (interval: number) =>
      Array.from({ length: 300 / interval + 1 }, (_, i) => ({
        x: moving ? (i * interval) / 300 : 0.5,
        y: 0.5,
        pressure: 1,
        tiltX: 0,
        tiltY: 0,
        rotation: 0,
        time: i * interval
      }));
    const coarse = createPreviewStroke({ ...job, path: path(300) }, tip);
    const frequent = createPreviewStroke({ ...job, path: path(5) }, tip);
    expect(coarse.count).toBe(moving ? 17 : 11);
    expect(frequent.count).toBe(coarse.count);
    frequent.data.forEach((value, index) => expect(value).toBeCloseTo(coarse.data[index]!, 4));
    job.values.useBuildUp = false;
    expect(createPreviewStroke({ ...job, path: path(5) }, tip).count).toBe(moving ? 7 : 1);
  });

  test('pressure tapers size and applies the configured minimum diameter', () => {
    const job = input();
    job.values.useShapeDynamics = true;
    job.values.shapeDynamics.sizeControl = 2;
    job.values.shapeDynamics.minimumDiameter = 20;
    const stroke = createPreviewStroke(job, tip);
    const radii = Array.from({ length: stroke.count }, (_, i) => stroke.data[i * stampStride + 2]!);
    expect(radii[0]).toBeCloseTo(Math.max(...radii) * 0.2, 2);
    expect(radii.at(-1)).toBeLessThan(Math.max(...radii) * 0.3);
    job.values.shapeDynamics.sizeControl = 0;
    const flat = createPreviewStroke(job, tip);
    expect(flat.data[2]).toBe(flat.data[(flat.count - 1) * stampStride + 2]);
  });
  test('spacing changes stamp density and non-square tips preserve aspect ratio', () => {
    const job = input();
    const wide = { width: 80, height: 20 };
    const dense = createPreviewStroke(job, wide);
    expect(dense.data[2]! / dense.data[3]!).toBe(4);
    job.values.spacing = 100;
    expect(createPreviewStroke(job, wide).count).toBeLessThan(dense.count / 5);
  });
  test('jitter is repeatable and unaffected by color or rename', () => {
    const job = input();
    job.values.useShapeDynamics = true;
    job.values.shapeDynamics.sizeJitter = 70;
    const first = createPreviewStroke(job, tip).data;
    job.color = '#fe3456';
    job.values.name = 'renamed';
    expect(createPreviewStroke(job, tip).data.filter((_, i) => i % stampStride < 12)).toEqual(
      first.filter((_, i) => i % stampStride < 12)
    );
  });
  test('transfer pressure affects flow and opacity independently', () => {
    const job = input();
    job.values.useTransfer = true;
    job.values.transfer.flowControl = 2;
    let stroke = createPreviewStroke(job, tip);
    expect(stroke.data[8]).toBeLessThan(0.1);
    expect(stroke.data[9]).toBe(1);
    job.values.transfer.flowControl = 0;
    job.values.transfer.opacityControl = 2;
    stroke = createPreviewStroke(job, tip);
    expect(stroke.data[8]).toBe(1);
    expect(stroke.data[9]).toBeLessThan(0.1);
  });
  test('extreme scatter and spacing never exceed the GPU stamp buffer', () => {
    const job = input();
    job.width = 2048;
    job.values.spacing = 1;
    job.values.useScattering = true;
    job.values.scattering.count = 16;
    job.values.scattering.scatter = 1000;
    expect(createPreviewStroke(job, tip).count).toBeLessThanOrEqual(16384);
  });
});

describe('coverage reference', () => {
  test('flow accumulates while stroke opacity remains a ceiling', () => {
    const job = input();
    job.width = 1;
    job.height = 1;
    const solidTip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
    const stamp = [0.5, 0.5, 1, 1, 1, 0, 1, 1, 0.2, 0.5, 0, 0, 1, 1, 1, 1];
    const render = (count: number) =>
      renderPreviewPixels(job, solidTip, {
        count,
        data: new Float32Array(Array.from({ length: count }, () => stamp).flat())
      })[0];
    expect(render(1)).toBe(51);
    expect(render(2)).toBe(92);
    expect(render(20)).toBe(128);
  });
  test('alpha remains coverage without gamma conversion', () => {
    const job = input();
    job.width = 1;
    job.height = 1;
    const pixels = renderPreviewPixels(
      job,
      { width: 1, height: 1, depth: 8, data: new Uint8Array([128]) },
      { count: 1, data: new Float32Array([0.5, 0.5, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1]) }
    );
    expect(pixels[0]).toBe(128);
  });
});

test('queue coalesces edits, prioritizes the active preview and cancels hidden targets', () => {
  const queue = createPreviewQueue<{ target: number; priority: number; revision: number }>();
  queue.put({ target: 1, priority: 0, revision: 1 });
  queue.put({ target: 1, priority: 0, revision: 2 });
  queue.put({ target: 2, priority: 10, revision: 1 });
  queue.put({ target: 3, priority: 0, revision: 1 });
  queue.remove(3);
  expect(queue.size).toBe(2);
  expect(queue.take()?.target).toBe(2);
  expect(queue.take()).toEqual({ target: 1, priority: 0, revision: 2 });
  expect(queue.take()).toBeUndefined();
});
