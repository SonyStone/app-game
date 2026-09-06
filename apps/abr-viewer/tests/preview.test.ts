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
