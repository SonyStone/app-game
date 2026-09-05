import { expect, it } from 'vitest';
import { defaultBrush, type Sample } from './brush';
import { createSmoothStroke } from './smoothStroke';

it('produces the same completed curve across arbitrary input batches', () => {
  const samples = Array.from({ length: 90 }, (_, i) => ({
    x: i * 10,
    y: Math.sin(i / 9) * 150,
    pressure: i / 90,
    time: i
  }));
  const whole = createSmoothStroke(defaultBrush(), 0.05);
  const expected = [...whole.add(samples), ...whole.finish()];
  const split = createSmoothStroke(defaultBrush(), 0.05);
  expect([...samples.flatMap((s) => split.add([s])), ...split.finish()]).toEqual(expected);
  expect(split.finish()).toEqual([]);
});

it('rounds a corner without overshoot and flushes the last real endpoint', () => {
  const sampler = createSmoothStroke({ ...defaultBrush(), size: 4, pressureSize: false });
  const dabs = [
    ...sampler.add([
      { x: 0, y: 0, pressure: 1, time: 0 },
      { x: 100, y: 0, pressure: 1, time: 1 },
      { x: 100, y: 100, pressure: 1, time: 2 }
    ]),
    ...sampler.finish()
  ];
  expect(dabs.some((p) => p.x > 70 && p.x < 95 && p.y > 5 && p.y < 30)).toBe(true);
  expect(dabs.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)).toBe(true);
  expect(Math.hypot(dabs.at(-1)!.x - 100, dabs.at(-1)!.y - 100)).toBeLessThan(0.5);
});

it('keeps quantized input smoothing consistent at 5% and 100%', () => {
  const screen: Sample[] = Array.from({ length: 80 }, (_, i) => ({
    x: i,
    y: Math.round(i * 0.3),
    pressure: 1,
    time: i
  }));
  const render = (zoom: number) => {
    const sampler = createSmoothStroke({ ...defaultBrush(), size: 10 / zoom, pressureSize: false }, zoom);
    return [...sampler.add(screen.map((s) => ({ ...s, x: s.x / zoom, y: s.y / zoom }))), ...sampler.finish()].map(
      (p) => ({ x: p.x * zoom, y: p.y * zoom })
    );
  };
  const near = render(1),
    far = render(0.05);
  expect(far.length).toBe(near.length);
  far.forEach((p, i) => {
    expect(p.x).toBeCloseTo(near[i]!.x, 7);
    expect(p.y).toBeCloseTo(near[i]!.y, 7);
  });
  const slopes = near.slice(1).map((p, i) => (p.y - near[i]!.y) / (p.x - near[i]!.x));
  // Original integer input alternates slopes 0 and 1; assess jitter across the full stroke.
  expect(Math.sqrt(slopes.reduce((sum, slope) => sum + (slope - 0.3) ** 2, 0) / slopes.length)).toBeLessThan(0.2);
});

it('draws a tap once and preserves a short stroke below the smoothing threshold', () => {
  const sampler = createSmoothStroke(defaultBrush(), 0.05);
  const point = { x: 0, y: 0, pressure: 1, time: 0 };
  expect([...sampler.add([point, point]), ...sampler.finish()]).toHaveLength(1);
  const short = createSmoothStroke(defaultBrush(), 0.05);
  const dabs = [...short.add([point, { ...point, x: 20 }]), ...short.finish()];
  expect(dabs.at(-1)!.x).toBeGreaterThan(16);
});
