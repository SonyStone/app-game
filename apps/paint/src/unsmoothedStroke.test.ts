import { expect, it } from 'vitest';
import { createStrokeSampler, defaultBrush, type Sample } from './brush';
import { createSmoothStroke } from './smoothStroke';
import { normalizeStrokeSettings } from './strokeSettings';

it.each([0.05, 1, 8])('None immediately preserves raw segments and pressure at zoom %s', (zoom) => {
  const brush = defaultBrush();
  brush.size = 2;
  brush.stroke = normalizeStrokeSettings({ ...brush.stroke, mode: 'none', smooth: 49, minimum: 0.7, firmness: 5 });
  expect(brush.stroke.mode).toBe('none');
  const stroke = createSmoothStroke(brush, zoom);
  const reference = createStrokeSampler(brush);
  const samples: Sample[] = [
    { x: 0, y: 0, pressure: 0.2, time: 0 },
    { x: 1, y: 0, pressure: 0.8, time: 1 },
    { x: 1, y: 1, pressure: 0.4, time: 2 },
    { x: 20, y: 1, pressure: 0.7, time: 3 }
  ];
  for (const sample of samples) {
    const dabs = stroke.add([sample]);
    // Each segment produces ink on arrival, even below Studio's two-screen-pixel threshold.
    expect(dabs.length).toBeGreaterThan(0);
    expect(dabs).toEqual(reference.add([sample]));
    expect(stroke.preview()).toEqual([]);
    expect(dabs.every((dab) => dab.y === 0 || dab.x === 1 || dab.y === 1)).toBe(true);
  }
  expect(stroke.finish()).toEqual([]);
  expect(stroke.finish()).toEqual([]);
  expect(stroke.add(samples)).toEqual([]);
});

it('None preserves arbitrary input batching and rejects malformed input without adding an endpoint stamp', () => {
  const brush = defaultBrush();
  brush.stroke.mode = 'none';
  const samples: Sample[] = Array.from({ length: 40 }, (_, i) => ({ x: i * 8, y: i % 2, pressure: i / 40, time: i }));
  samples.splice(3, 0, { x: NaN, y: 0, pressure: 1, time: 0 });
  const whole = createSmoothStroke(brush);
  const split = createSmoothStroke(brush);
  expect(samples.flatMap((sample) => split.add([sample]))).toEqual(whole.add(samples));
  expect(split.finish()).toEqual([]);
  const tap = createSmoothStroke(brush);
  expect(tap.add([samples[0]!, samples[0]!])).toHaveLength(1);
  expect(tap.finish()).toEqual([]);
});
