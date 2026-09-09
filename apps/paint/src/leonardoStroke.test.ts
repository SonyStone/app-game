import { describe, expect, it } from 'vitest';
import { defaultBrush, type Sample } from './brush';
import { createStrokeFilter } from './leonardoStroke';
import { createSmoothStroke } from './smoothStroke';
import { defaultStrokeSettings, normalizeStrokeSettings } from './strokeSettings';

describe('recovered sample filter', () => {
  it('seeds all history with the first sample and averages raw pressure before calibration', () => {
    const filter = createStrokeFilter({ ...defaultStrokeSettings(), mode: 'normal', firmness: 2 });
    const output = filter.add([point(100, 0.05, 10), point(120, 0.8, 30)]);
    expect(output[0]).toEqual(point(100, 0, 10));
    expect(output[1]).toMatchObject({ x: 110, time: 20 });
    expect(output[1]!.pressure).toBeCloseTo(0.25, 12);
    expect(filter.finish().at(-1)).toEqual(point(120, 1, 30));
    expect(filter.finish()).toEqual([]);
    expect(filter.add([point(200)])).toEqual([]);
  });

  it.each(Array.from({ length: 50 }, (_, i) => i))('uses a window of strength + 1 at strength %i', (normal) => {
    const filter = createStrokeFilter({ ...defaultStrokeSettings(), mode: 'normal', normal });
    const output = filter.add([point(0), point(100)]);
    expect(output[1]!.x).toBeCloseTo(100 / (normal + 1), 10);
    expect(filter.finish().at(-1)!.x).toBe(100);
  });

  it('keeps independent mode strengths and disables catch-up only in smooth mode', () => {
    for (const mode of ['normal', 'smooth'] as const) {
      const filter = createStrokeFilter({ ...defaultStrokeSettings(), mode, catchUp: false });
      expect(filter.add([point(0), point(110)])[1]!.x).toBeCloseTo(mode === 'normal' ? 55 : 10);
      expect(filter.finish()).toHaveLength(mode === 'normal' ? 2 : 0);
    }
  });

  it('retains stationary pressure updates and rejects invalid samples without poisoning history', () => {
    const filter = createStrokeFilter({ ...defaultStrokeSettings(), mode: 'normal', minimum: 0, maximum: 1 });
    const output = filter.add([point(10, 0), point(NaN, 1), point(10, 1), point(20, Infinity)]);
    expect(output.map((sample) => sample.pressure)).toEqual([0, 0.5]);
    expect(filter.finish().at(-1)!.pressure).toBe(1);
  });

  it('bounds calibration to finite output with a positive range and exponent', () => {
    const settings = normalizeStrokeSettings({
      ...defaultStrokeSettings(),
      minimum: 1,
      maximum: 0,
      firmness: NaN,
      normal: 999,
      smooth: -10
    });
    expect(settings).toMatchObject({ minimum: 0.99, maximum: 1, firmness: 1, normal: 49, smooth: 0 });
    const filter = createStrokeFilter(settings);
    const output = filter.add([point(0, -1), point(10, 2)]);
    expect(
      output.every((sample) => Number.isFinite(sample.pressure) && sample.pressure >= 0 && sample.pressure <= 1)
    ).toBe(true);
  });
});

describe('Leonardo mode through the worker stroke factory', () => {
  it.each(['normal', 'smooth'] as const)('keeps %s dabs invariant across batches and snapshots settings', (mode) => {
    const brush = { ...defaultBrush(), size: 12, stroke: { ...defaultStrokeSettings(), mode } };
    const samples = Array.from({ length: 80 }, (_, i) => ({
      x: i * 3,
      y: Math.sin(i / 8) * 25,
      pressure: i / 80,
      time: i * 5
    }));
    const whole = createSmoothStroke(brush);
    const expected = [...whole.add(samples), ...whole.finish()];
    const split = createSmoothStroke(brush);
    brush.stroke.smooth = 49;
    brush.stroke.normal = 49;
    brush.stroke.maximum = 0.2;
    expect([...samples.flatMap((sample) => split.add([sample])), ...split.finish()]).toEqual(expected);
    expect(split.finish()).toEqual([]);
    expect(split.add(samples)).toEqual([]);
  });

  it.each(['normal', 'smooth'] as const)('draws a %s tap only once, including repeated pressure updates', (mode) => {
    const sampler = createSmoothStroke({ ...defaultBrush(), stroke: { ...defaultStrokeSettings(), mode } });
    expect([...sampler.add([point(10, 0.1), point(10, 0.8)]), ...sampler.finish()]).toHaveLength(1);
  });

  it('finishes at the filtered endpoint with catch-up off and near the real endpoint with it on', () => {
    for (const catchUp of [false, true]) {
      const sampler = createSmoothStroke({
        ...defaultBrush(),
        size: 2,
        pressureSize: false,
        stroke: { ...defaultStrokeSettings(), mode: 'smooth', catchUp }
      });
      const dabs = [...sampler.add([point(0), point(110)]), ...sampler.finish()];
      expect(dabs.at(-1)!.x).toBeCloseTo(catchUp ? 110 : 10, 0);
      expect(dabs.every((dab) => dab.x >= 0 && dab.x <= 110.000001 && dab.y === 0)).toBe(true);
    }
  });
});

function point(x: number, pressure = 1, time = 0): Sample {
  return { x, y: 0, pressure, time };
}
