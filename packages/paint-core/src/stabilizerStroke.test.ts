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

it('catches up on lift along the path the pen took, not straight across to where it lifted', () => {
  const processor = createStabilizerProcessor(brush(20));
  // A quarter circle of radius 200 drawn in 200 ms, lifted at once: the line still trails far behind.
  const arc = Array.from({ length: 201 }, (_, index) => {
    const angle = (index / 200) * (Math.PI / 2);
    return sample(200 * Math.sin(angle), 200 - 200 * Math.cos(angle), index);
  });
  const lifted = processor.add(arc).at(-1)!;
  const finish = processor.finish();
  expect(finish.at(-1)).toMatchObject({ x: 200, y: 200 });

  // Filling the window with the lifted pen cut straight across, about 39 px inside the arc, then hooked onto it at the
  // end. Narrowing the window stays within the line's own lag at lift, about 26 px, and meets the arc along it.
  const inside = (point: Sample) => 200 - Math.hypot(point.x, point.y - 200);
  expect(Math.max(...finish.map(inside))).toBeLessThan(inside(lifted) + 4);
  const [before, last] = finish.slice(-6, -5).concat(finish.slice(-1));
  const heading = (Math.atan2(last!.y - before!.y, last!.x - before!.x) * 180) / Math.PI;
  expect(Math.abs(heading - 90)).toBeLessThan(10);
});

it('ends where the pen was before lifting, not on the jerk aside as the pressure falls away', () => {
  const processor = createStabilizerProcessor(brush(12));
  // A straight line to the right at full pressure, then 30 ms in which the pressure falls and the pen jerks 20 px down.
  const line = Array.from({ length: 151 }, (_, index) => sample(index * 2, 0, index, 0.6));
  const hook = Array.from({ length: 30 }, (_, index) =>
    sample(300 + index * 0.3, (index + 1) * (20 / 30), 151 + index, 0.6 * (1 - (index + 1) / 30))
  );
  processor.add([...line, ...hook]);
  const finish = processor.finish();
  const end = finish.at(-1)!;
  expect(Math.abs(end.x - 300)).toBeLessThan(1);
  expect(Math.abs(end.y)).toBeLessThan(1);
  // No tick at the end: the caught-up line stays straight.
  expect(Math.max(...finish.map(({ y }) => Math.abs(y)))).toBeLessThan(1.5);
  // The falling pressure still tapers the end.
  expect(end.pressure).toBeLessThan(0.3);
});
