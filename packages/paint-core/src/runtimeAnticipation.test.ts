import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble, createStorageDouble } from '../tests/fixtures/rendererDouble';
import { startStudioRuntime, untilMicrotasks } from '../tests/fixtures/studioRuntime';
import { defaultBrush, type Dab } from './brush';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('shows predicted pen points ahead of the stroke without ever painting them', async () => {
  const renderer = createRendererDouble();
  const { send, init } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();
  const brush = defaultBrush();
  brush.stroke.mode = 'none';
  const sample = (x: number, time: number) => ({ x, y: 0, pressure: 0.5, time });
  const furthest = (calls: readonly (readonly Dab[])[]) => Math.max(...calls.flat().map((dab) => dab.x));
  const previews = () => renderer.preview.mock.calls.map(([dabs]) => dabs as readonly Dab[]);
  const until = (condition: () => boolean) =>
    untilMicrotasks(condition, () => `${renderer.preview.mock.calls.length} previews`);

  send({ type: 'begin', brush, zoom: 1, samples: [sample(0, 1)] });
  send({ type: 'samples', samples: [sample(10, 2)], predicted: [sample(40, 10), sample(60, 18)] });
  await until(() => previews().length >= 2 && furthest([previews().at(-1)!]) > 55);

  // Real input without a prediction keeps the one that is still ahead of it.
  send({ type: 'samples', samples: [sample(20, 12)] });
  await until(() => furthest(renderer.paint.mock.calls.map(([dabs]) => dabs as Dab[])) > 15);
  expect(furthest([previews().at(-1)!])).toBeGreaterThan(55);

  // Points the pen has already passed in time are dropped; an empty prediction clears the rest.
  send({ type: 'samples', samples: [sample(25, 20)] });
  await until(() => furthest(renderer.paint.mock.calls.map(([dabs]) => dabs as Dab[])) > 22);
  await until(() => previews().at(-1)?.length === 0);
  send({ type: 'samples', samples: [], predicted: [sample(70, 30)] });
  await until(() => furthest([previews().at(-1)!]) > 65);
  send({ type: 'samples', samples: [], predicted: [] });
  await until(() => previews().at(-1)?.length === 0);

  send({ type: 'end' });
  await until(() => renderer.finish.mock.calls.length === 1);
  expect(furthest(renderer.paint.mock.calls.map(([dabs]) => dabs as Dab[]))).toBeLessThanOrEqual(25);
});

it('shows no prediction for the stabilizer, whose line trails the pen on purpose', async () => {
  const renderer = createRendererDouble();
  const { send, init } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();
  const brush = defaultBrush();
  brush.stroke.mode = 'stabilizer';
  send({ type: 'begin', brush, zoom: 1, samples: [{ x: 0, y: 0, pressure: 0.5, time: 1 }] });
  send({
    type: 'samples',
    samples: [{ x: 10, y: 0, pressure: 0.5, time: 2 }],
    predicted: [{ x: 60, y: 0, pressure: 0.5, time: 10 }]
  });
  send({ type: 'end' });
  await untilMicrotasks(
    () => renderer.finish.mock.calls.length === 1,
    () => 'stroke did not finish'
  );
  const shown = renderer.preview.mock.calls.flatMap(([dabs]) => dabs as Dab[]);
  expect(shown.every((dab) => dab.x <= 10)).toBe(true);
});

it('keeps redrawing whole frames while the pen hovers, and stops soon after it leaves', async () => {
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const renderer = createRendererDouble();
  const { send, init } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();
  const advance = async (ms: number) => {
    for (let step = 0; step < ms; step += 4) {
      elapsed += 4;
      await vi.advanceTimersByTimeAsync(4);
    }
  };
  await advance(100);
  renderer.render.mockClear();
  renderer.invalidateView.mockClear();

  send({ type: 'warm' });
  await advance(200);
  // Further reports while warming extend the window instead of starting another loop.
  send({ type: 'warm' });
  await advance(200);
  const frames = renderer.render.mock.calls.length;
  expect(frames).toBeGreaterThanOrEqual(15);
  expect(frames).toBeLessThanOrEqual(30);
  expect(renderer.invalidateView).toHaveBeenCalledTimes(frames);

  await advance(400);
  const stopped = renderer.render.mock.calls.length;
  await advance(400);
  expect(renderer.render.mock.calls.length).toBe(stopped);
  expect(stopped).toBeLessThanOrEqual(frames + 30);
});

it('does not warm over a stroke, which draws its own frames', async () => {
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const renderer = createRendererDouble();
  const { send, init } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();
  send({ type: 'begin', brush: defaultBrush(), zoom: 1, samples: [{ x: 0, y: 0, pressure: 0.5, time: 1 }] });
  await untilMicrotasks(
    () => renderer.render.mock.calls.length > 0,
    () => 'no contact frame'
  );
  renderer.invalidateView.mockClear();
  send({ type: 'warm' });
  for (let step = 0; step < 100; step += 4) {
    elapsed += 4;
    await vi.advanceTimersByTimeAsync(4);
  }
  expect(renderer.invalidateView).not.toHaveBeenCalled();
  send({ type: 'end' });
});
