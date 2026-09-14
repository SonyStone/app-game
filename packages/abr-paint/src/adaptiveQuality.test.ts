import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { expect, it } from 'vitest';
import { adaptiveBrushQuality, brushQualityAtLod } from './adaptiveQuality';

const values = () => ({ ...brushToFormValues({ id: 'quality', name: 'Quality', type: 'sampled', settings: {}, spacing: 1, diameter: 16 }), tipKind: 'sampledBrush' as const });

it('uses integer LODs rather than zoom percentages for every brush family', () => {
  const v = values();
  expect(brushQualityAtLod(false, 3)).toBeUndefined();
  expect(brushQualityAtLod(true, 0)).toEqual({ lod: 0, minimumSpacing: 1, pickupScale: 1 });
  expect(brushQualityAtLod(true, 3)).toEqual({ lod: 3, minimumSpacing: 8, pickupScale: 0.125 });
  expect(brushQualityAtLod(true, 12)?.minimumSpacing).toBe(64);
  for (const invalid of [-1, 0.05, 1.5, 13, NaN, Infinity])
    expect(brushQualityAtLod(true, invalid)).toBeUndefined();
  for (const type of ['PbTl', 'PcTl', 'SmTl', 'BlTl', 'ShTl', 'MixB', 'ErTl']) {
    const brush = { ...v, tool: { ...v.tool, type } };
    expect(adaptiveBrushQuality(true, brush, 3, 'Nrml')?.minimumSpacing).toBe(8);
    expect(adaptiveBrushQuality(false, brush, 3, 'Nrml')).toBeUndefined();
  }
  for (const key of ['useDualBrush', 'useWetEdges', 'useBuildUp'] as const) {
    const quality = adaptiveBrushQuality(true, { ...v, [key]: true }, 3)!;
    expect(quality.minimumSpacing).toBe(8);
    expect(quality.lod).toBeUndefined(); // Preserve their specialized mask accumulation.
  }
  expect(adaptiveBrushQuality(true, v, 0)?.lod).toBe(0);
});

it('reduces stamp density without losing input batches or letting previews advance the stroke', () => {
  const v = values();
  const input = { values: v, size: 16, color: '#112233', flow: 0.2, opacity: 0.6, seed: 42 };
  const tip = { width: 16, height: 16 };
  const points: PreviewPoint[] = Array.from({ length: 200 }, (_, i) => ({
    x: -300 + i * 4, y: 8, pressure: 1, time: i * 4, tiltX: 0, tiltY: 0, rotation: 0
  }));
  const detailed = createAbrStrokeSampler(input, tip).add(points);
  const approximate = { ...input, minimumSpacing: 4 };
  const expected = createAbrStrokeSampler(approximate, tip).add(points);
  expect(expected.count).toBeLessThan(detailed.count / 2);
  const sampler = createAbrStrokeSampler(approximate, tip);
  const result: number[] = [];
  for (let at = 0; at < points.length; at += 7) {
    const batch = points.slice(at, at + 7);
    sampler.preview(batch);
    result.push(...sampler.add(batch).data);
  }
  expect(new Float32Array(result)).toEqual(expected.data);
  expect(expected.data[8]).toBe(detailed.data[8]);
  expect(expected.data[24]).toBeGreaterThan(detailed.data[24]!);
  expect(expected.data[9]).toBe(detailed.data[9]);
  expect(expected.data.at(-16)).toBeCloseTo(points.at(-1)!.x);
  for (const invalid of [0, -1, NaN, Infinity])
    expect(createAbrStrokeSampler({ ...input, minimumSpacing: invalid }, tip).add(points).data).toEqual(detailed.data);
});

it('carries density separately from Smudge/Blur strength and preserves batching', () => {
  const tip = { width: 36, height: 25 };
  const points: PreviewPoint[] = Array.from({length: 20}, (_, i) => ({
    x: i * 20, y: 0, pressure: 0.3 + (i % 3) * 0.3, time: i * 10, tiltX: 0, tiltY: 0, rotation: 0
  }));
  for (const type of ['SmTl', 'BlTl', 'ShTl', 'MixB']) {
    const v = values(); v.tool.type = type;
    const input = { values: v, size: 50, color: '#112233', flow: 0.5, opacity: 0.7, seed: 42 };
    const detailed = createAbrStrokeSampler(input, tip).add(points);
    const policy = adaptiveBrushQuality(true, v, 4)!;
    const adaptiveInput = { ...input, minimumSpacing: policy.minimumSpacing };
    const adaptive = createAbrStrokeSampler(adaptiveInput, tip).add(points);
    expect(adaptive.count).toBeLessThan(detailed.count);
    expect(adaptive.spacingRatios?.length).toBe(adaptive.count);
    expect(adaptive.spacingRatios?.some(r => r > 1)).toBe(true);
    expect(adaptive.data[8]).toBe(detailed.data[8]);
    expect(adaptive.data[9]).toBe(detailed.data[9]);
    const sampler = createAbrStrokeSampler(adaptiveInput, tip);
    const data: number[] = [], ratios: number[] = [];
    for (const point of points) {
      sampler.preview([point]);
      const chunk = sampler.add([point]);
      data.push(...chunk.data); ratios.push(...chunk.spacingRatios!);
    }
    expect(new Float32Array(data)).toEqual(adaptive.data);
    expect(new Float32Array(ratios)).toEqual(adaptive.spacingRatios);
  }
});

it('does not accelerate timed airbrush accumulation while stationary', () => {
  const v = values(); v.useBuildUp = true;
  const input = { values: v, size: 50, color: '#112233', flow: 0.1, opacity: 0.7, seed: 42 };
  const tip = { width: 16, height: 16 };
  const points = [0, 150].map(time => ({ x: 0, y: 0, pressure: 1, time, tiltX: 0, tiltY: 0, rotation: 0 }));
  const detailed = createAbrStrokeSampler(input, tip).add(points);
  const adaptive = createAbrStrokeSampler({ ...input, minimumSpacing: 8 }, tip).add(points);
  expect(adaptive.data).toEqual(detailed.data);
  expect(adaptive.spacingRatios).toBeUndefined();
});
