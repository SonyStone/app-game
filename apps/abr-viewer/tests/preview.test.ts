import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { percent, pixels } from '@app-game/abr-parser';
import { describe, expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
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
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{},
        tip: { kind: 'computed', diameter: pixels(40), spacing: percent(10), hardness: percent(100) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
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
