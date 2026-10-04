import { expect, it } from 'vitest';
import { defaultBrush, type Sample } from './brush';
import { createStabilizerProcessor } from './stabilizerStroke';
import { defaultStrokeSettings, normalizeStrokeSettings } from './strokeSettings';

const brush = (stabilizer: number, catchUp = true) => ({
  ...defaultBrush(),
  stroke: { ...defaultStrokeSettings(), mode: 'stabilizer' as const, stabilizer, catchUp, minimum: 0, maximum: 1 }
});
const sample = (x: number, y: number, time: number, pressure = 0.5): Sample => ({ x, y, time, pressure });

it('starts at the pen, trails it while it moves and steadies a shaking hand', () => {
  const processor = createStabilizerProcessor(brush(6));
  expect(processor.add([sample(0, 0, 0)])).toEqual([expect.objectContaining({ x: 0, y: 0 })]);

  // 300 ms to the right at 1 px/ms, shaking up and down by 3 px at every event.
  const input = Array.from({ length: 300 }, (_, index) => sample(index + 1, index % 2 ? 3 : -3, index + 1));
  const output = processor.add(input);
  // Resampled at 120 Hz: about 36 points for 300 ms.
  expect(output.length).toBeGreaterThanOrEqual(35);
  expect(output.length).toBeLessThanOrEqual(37);
  expect(output.at(-1)!.x).toBeLessThan(300 - 50);
  expect(Math.max(...output.slice(10).map(({ y }) => Math.abs(y)))).toBeLessThan(0.5);
});

it('closes in on a pen held still, then rests, and draws the rest of the way when lifted', () => {
  const processor = createStabilizerProcessor(brush(6));
  processor.add([sample(0, 0, 0), sample(100, 0, 50)]);
  const first = processor.idle!(100);
  const second = processor.idle!(100);
  expect(first.length).toBe(12);
  expect(second.at(-1)!.x).toBeGreaterThan(first.at(-1)!.x);
  let rest: Sample[] = second;
  for (let index = 0; index < 20 && rest.length; index++) {
    rest = processor.idle!(100);
  }
  expect(rest).toEqual([]);

  processor.add([sample(150, 0, 2000)]);
  const finish = processor.finish();
  expect(finish.at(-1)).toMatchObject({ x: 150, y: 0 });
  expect(processor.finish()).toEqual([]);
});

it('can leave the end behind the pen, calibrates pressure and bounds its strength', () => {
  const processor = createStabilizerProcessor({
    ...brush(10, false),
    stroke: { ...brush(10, false).stroke, minimum: 0.2, maximum: 0.6 }
  });
  processor.add([sample(0, 0, 0, 0.4), sample(50, 0, 40, 0.4)]);
  expect(processor.finish()).toEqual([]);
  expect(processor.add([sample(0, 0, 0, 0.4)])).toEqual([]);

  const calibrated = createStabilizerProcessor({
    ...brush(1),
    stroke: { ...brush(1).stroke, minimum: 0.2, maximum: 0.6 }
  }).add([sample(0, 0, 0, 0.4)]);
  expect(calibrated[0]!.pressure).toBeCloseTo(0.5);
  expect(normalizeStrokeSettings({ ...defaultStrokeSettings(), stabilizer: 99 }).stabilizer).toBe(20);
  expect(normalizeStrokeSettings({ ...defaultStrokeSettings(), mode: 'stabilizer' }).mode).toBe('stabilizer');
});
