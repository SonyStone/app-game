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
  // end. Averaging the rest of the path cuts the arc about as the line did, about 26 px inside at lift, and meets it.
  const inside = (point: Sample) => 200 - Math.hypot(point.x, point.y - 200);
  expect(Math.max(...finish.map(inside))).toBeLessThan(inside(lifted) + 6);
  const [before, last] = finish.slice(-6, -5).concat(finish.slice(-1));
  const heading = (Math.atan2(last!.y - before!.y, last!.x - before!.x) * 180) / Math.PI;
  expect(Math.abs(heading - 90)).toBeLessThan(10);
});

it('joins the catch-up onto the pen path without a step, on a quick flick at a high level', () => {
  // A 90 ms flick recorded on the tablet at S-15: the line still trails about 120 px behind when the pen lifts.
  const flick = [
    [-1211.9, -2586.4, 0.62],
    [-1203.7, -2584.3, 0.66],
    [-1191.7, -2579.6, 0.7],
    [-1178.4, -2571.9, 0.71],
    [-1164.0, -2560.9, 0.72],
    [-1149.0, -2546.8, 0.72],
    [-1134.0, -2530.1, 0.71],
    [-1119.3, -2511.6, 0.7],
    [-1105.4, -2491.8, 0.67],
    [-1092.7, -2471.6, 0.64],
    [-1081.4, -2451.4, 0.61],
    [-1071.8, -2431.4, 0.55],
    [-1064.0, -2412.7, 0.46],
    [-1058.2, -2396.4, 0.34],
    [-1056.0, -2389.4, 0.2]
  ].map(([x, y, pressure], index) => sample(x!, y!, index * 6.5, pressure));
  const processor = createStabilizerProcessor(brush(15));
  const line = [...processor.add(flick), ...processor.finish()];
  expect(line.at(-1)).toMatchObject({ x: -1056, y: -2389.4 });

  // Neither a step aside nor a step back: consecutive segments turn by less than 25°.
  let worst = 0;
  for (let index = 2; index < line.length; index++) {
    const [a, b, c] = [line[index - 2]!, line[index - 1]!, line[index]!];
    if (Math.hypot(c.x - b.x, c.y - b.y) < 0.5 || Math.hypot(b.x - a.x, b.y - a.y) < 0.5) {
      continue;
    }

    let turn = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    turn = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
    worst = Math.max(worst, turn);
  }

  expect((worst * 180) / Math.PI).toBeLessThan(25);
});

it('turns gently onto the rest of the way, on a fast curved stroke whose line heads elsewhere when the pen lifts', () => {
  // As recorded on the tablet at S-15: 300 ms along a bending arc, so the line trails far behind inside the curve and
  // heads toward the pen rather than along the path where the catch-up continues it.
  const stroke = Array.from({ length: 41 }, (_, index) => {
    const angle = (index / 40) ** 1.5 * (Math.PI / 2);
    return sample(300 * Math.sin(angle), 300 - 300 * Math.cos(angle), index * 7.5);
  });
  const processor = createStabilizerProcessor(brush(15));
  const line = [...processor.add(stroke), ...processor.finish()];
  expect(line.at(-1)).toMatchObject({ x: 300, y: 300 });

  // Headings 10 px apart along the line differ by a few degrees at most: no corner or quick hook where it lifted.
  const reach = [0];
  for (let index = 1; index < line.length; index++) {
    reach.push(
      reach[index - 1]! + Math.hypot(line[index]!.x - line[index - 1]!.x, line[index]!.y - line[index - 1]!.y)
    );
  }

  const headingAt = (distance: number) => {
    const index = Math.max(
      1,
      reach.findIndex((value) => value >= distance)
    );
    const [a, b] = [line[index - 1]!, line[index]!];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  let sharpest = 0;
  for (let distance = 10; distance < reach.at(-1)! - 10; distance += 2) {
    const turn = headingAt(distance + 5) - headingAt(distance - 5);
    sharpest = Math.max(sharpest, Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))));
  }

  expect((sharpest * 180) / Math.PI).toBeLessThan(8);
});
