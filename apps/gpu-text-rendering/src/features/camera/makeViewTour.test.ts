import { describe, expect, it } from 'vitest';
import type { Camera } from './camera';
import { flyCamera, holdMs, makeViewTour, planFlight, settleMs } from './makeViewTour';

const a = { x: 0, y: 0, zoom: 0.1, rotation: 0 };
const b = { x: 1, y: 0, zoom: 0.1, rotation: 0.5 };
const c = { x: 1, y: 1, zoom: 0.02, rotation: -3 };

describe('planFlight', () => {
  it('starts and ends on the given cameras', () => {
    for (const [from, to] of [
      [a, b],
      [b, c],
      [a, { ...a, zoom: 0.5 }],
      [a, a]
    ] as const) {
      const flight = planFlight(from, to);
      expectCamera(flight.at(0), from);
      expectCamera(flight.at(1), to);
    }
  });

  it('pulls back mid-flight, but not far enough to fit both views', () => {
    const peak = planFlight(a, b).at(0.5);
    expect(peak.x).toBeCloseTo(0.5);
    expect(peak.zoom).toBeGreaterThan(1.5 * a.zoom);
    expect(peak.zoom).toBeLessThan(0.5);
  });

  it('stays accurate for long flights between close-up views', () => {
    const far = { x: 50, y: 0, zoom: 1 / 4096, rotation: 0 };
    const middle = planFlight({ ...far, x: 0 }, far).at(0.5);
    expect(Number.isFinite(middle.zoom)).toBe(true);
    expect(middle.x).toBeCloseTo(25);
  });

  it('gives longer journeys more time, within bounds', () => {
    const hop = planFlight(a, { ...a, x: 0.01 }).duration;
    const journey = planFlight(a, b).duration;
    expect(hop).toBeGreaterThanOrEqual(1100);
    expect(journey).toBeGreaterThan(hop);
    expect(planFlight(a, { ...a, x: 1e6 }).duration).toBe(4000);
  });

  it('turns the shorter way', () => {
    expect(flyCamera({ ...a, rotation: 3 }, { ...a, rotation: -3 }, 0.5).rotation).toBeCloseTo(Math.PI);
  });
});

describe('makeViewTour', () => {
  it('arrives at a single visit still drifting, then settles exactly on its stop', () => {
    const tour = makeViewTour({ start: 0, loop: false });
    const first = tour.update(100, [b], a);
    expectCamera(first.camera, a);
    expect(first).toMatchObject({ index: 0, done: false });

    const arrival = 100 + planFlight(a, b).duration;
    const arrived = tour.update(arrival, [b], a);
    expect(arrived.camera.x).toBeCloseTo(b.x);
    expect(arrived.camera.zoom).toBeGreaterThan(b.zoom);
    expect(tour.update(arrival + 100, [b], a).camera.zoom).toBeLessThan(arrived.camera.zoom);
    expect(arrived.done).toBe(false);

    const end = tour.update(arrival + settleMs, [b], a);
    expectCamera(end.camera, b);
    expect(end.done).toBe(true);
  });

  it('keeps pushing in at a steady rate through arrivals, passing each stop midway through its hold', () => {
    const tour = makeViewTour({ start: 2, loop: true });
    const stops = [a, b, c];
    const arrival = planFlight(a, c).duration;
    const zoomAt = (time: number) => Math.log(tour.update(time, stops, a).camera.zoom);

    expect(tour.update(0, stops, a).index).toBe(2);
    const before = zoomAt(arrival - 20) - zoomAt(arrival - 40);
    const after = zoomAt(arrival + 40) - zoomAt(arrival + 20);
    expect(after).toBeLessThan(0);
    expect(after).toBeCloseTo(before, 3);

    expectCamera(tour.update(arrival + holdMs / 2, stops, a).camera, c);
    const held = tour.update(arrival + holdMs - 1, stops, a);
    expect(held.camera.zoom).toBeLessThan(c.zoom);
    expect(held.done).toBe(false);

    const wrapped = tour.update(arrival + holdMs, stops, held.camera);
    expect(wrapped.index).toBe(0);
    expectCamera(wrapped.camera, held.camera);
  });

  it('wraps its index when stops are removed', () => {
    const tour = makeViewTour({ start: 2, loop: true });
    expect(tour.update(0, [a, b], a).index).toBe(0);
  });
});

/** Expects equal cameras up to rounding, treating rotations a whole turn apart as equal. */
function expectCamera(actual: Camera, expected: Camera) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.zoom).toBeCloseTo(expected.zoom);
  expect(Math.cos(actual.rotation - expected.rotation)).toBeCloseTo(1);
}
