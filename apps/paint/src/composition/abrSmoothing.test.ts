import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrSmoothing, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { expect, it } from 'vitest';

it('Pulled String paints only when taut and ignores dormant catch-up flags on movement and release', () => {
  const values = settings();
  values.smoothing.pulledString = true;
  values.smoothing.catchUpAtEnd = true;
  const smoother = createAbrSmoothing(values);
  expect(smoother.add([point(0), point(20)])).toEqual([]);
  expect(smoother.idle).toBeUndefined();
  expect(smoother.add([point(50)]).map((sample) => sample.x)).toEqual([0, 20]);
  expect(smoother.add([point(45)])).toEqual([]);
  expect(smoother.finish()).toEqual([]);
  expect(smoother.add([point(100)])).toEqual([]);
});

it('catch-up advances while paused, is elapsed-time based, and stops after converging or finishing', () => {
  const a = createAbrSmoothing(settings());
  const b = createAbrSmoothing(settings());
  for (const smoother of [a, b]) expect(smoother.add([point(0), point(100)]).at(-1)?.x).toBe(70);
  const once = a.idle!(32).at(-1)!;
  b.idle!(16);
  const twice = b.idle!(16).at(-1)!;
  expect(twice.x).toBeCloseTo(once.x, 10);
  expect(twice.pressure).toBe(0.35);
  expect(twice.tiltX).toBe(23);
  expect(twice.x).toBeGreaterThan(70);
  expect(twice.x).toBeLessThan(100);
  expect(a.idle!(10_000).at(-1)?.x).toBe(100);
  expect(a.idle!(16)).toEqual([]);
  b.finish();
  expect(b.idle!(16)).toEqual([]);
});

it('zoom compensation applies to normal and pulled-string smoothing without changing raw tablet axes', () => {
  for (const pulledString of [false, true]) {
    const values = settings();
    values.smoothing.pulledString = pulledString;
    const atZoom = (zoom: number) =>
      createAbrSmoothing(values, 1 / zoom)
        .add([point(0), point(100 / zoom)])
        .at(-1)!;
    expect(atZoom(0.5).x * 0.5).toBe(atZoom(2).x * 2);
    values.smoothing.adjustForZoom = false;
    expect(atZoom(0.5).x).toBe(170);
    expect(atZoom(2).x).toBe(20);
    expect(atZoom(2).tiltX).toBe(23);
  }
});

it('zero and disabled smoothing preserve input; catch-up-at-end is independent of paused catch-up', () => {
  const values = settings();
  values.smoothing.catchUp = false;
  values.smoothing.catchUpAtEnd = true;
  const smoother = createAbrSmoothing(values);
  expect(smoother.idle).toBeUndefined();
  smoother.add([point(0), point(10)]);
  expect(smoother.finish()).toEqual([point(10)]);
  expect(smoother.finish()).toEqual([]);
  for (const disabled of [true, false]) {
    values.useSmoothing = !disabled;
    values.smoothing.amount = disabled ? 100 : 0;
    const raw = createAbrSmoothing(values);
    const points = [point(0), point(100), point(101)];
    expect(raw.add(points)).toEqual(points);
    expect(raw.idle).toBeUndefined();
    expect(raw.finish()).toEqual([]);
  }
});

it('captures settings and rejects invalid scales and coordinates', () => {
  const values = settings();
  const smoother = createAbrSmoothing(values);
  values.smoothing.catchUpAtEnd = true;
  smoother.add([point(0), point(Infinity), point(100)]);
  expect(smoother.finish()).toEqual([]);
  for (const scale of [0, -1, Infinity, NaN]) expect(() => createAbrSmoothing(values, scale)).toThrow('scale');
});

function settings() {
  const values = brushToFormValues({ id: 'smooth', name: 'Smooth', type: 'computed', spacing: 25, settings: {} });
  values.useSmoothing = true;
  values.smoothing.amount = 100;
  return values;
}
function point(x: number): PreviewPoint {
  return { x, y: 0, pressure: 0.35, tiltX: 23, tiltY: 10, rotation: 35, time: 0 };
}
