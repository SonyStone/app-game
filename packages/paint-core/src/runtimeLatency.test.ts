import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble, createStorageDouble } from '../tests/fixtures/rendererDouble';
import { createSmoothStroke } from '../tests/smoothStroke';
import { startStudioRuntime, untilMicrotasks } from '../tests/fixtures/studioRuntime';
import { defaultBrush, type Dab } from './brush';
import type { PaintRendererOptions } from './gpu/renderer';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('presents the first pen contact before a queued release can wait on readback', async () => {
  const order: string[] = [];
  let release!: () => void;
  const readback = new Promise<void>((resolve) => {
    release = resolve;
  });
  const renderer = createRendererDouble({
    brushLod: vi.fn(() => 5),
    begin: vi.fn(() => order.push('begin')),
    paint: vi.fn(async (_dabs: readonly Dab[]) => {
      order.push('paint');
    }),
    render: vi.fn(async () => {
      order.push('render');
    }),
    finish: vi.fn(async () => {
      order.push('finish');
      await readback;
      return [];
    })
  });
  const { send, init, next } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  // Do not advance timers: a fast tap must be visible without a scheduled frame behind end().
  const until = (condition: () => boolean) => untilMicrotasks(condition, () => order.join(', '));
  try {
    await init();
    order.length = 0;
    send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 128, y: 128, pressure: 0.2, time: 1 }] });
    send({ type: 'end' });
    await until(() => order.includes('finish'));
    expect(order).toEqual(['begin', 'paint', 'render', 'paint', 'finish']);
    expect(renderer.paint.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ x: 128, y: 128 })]);
    expect(renderer.brushLod).toHaveBeenCalledTimes(1);
    // The default-on runtime passes renderer LOD 5 even though this contact is at 100% zoom.
    expect(renderer.paint.mock.calls[0]![0][0]!.flow).toBeGreaterThan(defaultBrush().flow);
  } finally {
    release();
    send({ type: 'debug', enabled: true });
    await next((event) => event.type === 'state' && event.debugTiles !== undefined);
  }
});

it.each([false, true])(
  'preserves queued input and presents progress while processing a slow backlog: %s',
  async (slow) => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const brush = defaultBrush();
    const contact = { x: 0, y: 0, pressure: 0.2, time: 1 };
    const samples = Array.from({ length: 100 }, (_, i) => ({
      x: i + 1,
      y: i / 2,
      pressure: 0.2 + i / 200,
      time: i + 2
    }));
    let release!: () => void;
    const busy = new Promise<void>((resolve) => {
      release = resolve;
    });
    const renderer = createRendererDouble({
      paint: vi.fn(async (_dabs: readonly Dab[]) => {
        if (slow) elapsed += 20;
      })
    });
    const { send, init } = startStudioRuntime({ renderer, storage: createStorageDouble() });
    const until = (condition: () => boolean) =>
      untilMicrotasks(condition, () => `submitted ${renderer.submitted.mock.calls.length} frames`);
    try {
      await init();
      renderer.render.mockClear();
      renderer.submitted.mockClear();
      renderer.submitted.mockImplementationOnce(() => busy);
      send({ type: 'begin', brush, zoom: 1, samples: [contact] });
      await until(() => renderer.submitted.mock.calls.length === 1);
      for (const sample of samples) send({ type: 'samples', samples: [sample] });
      send({ type: 'end' });
      // A later stroke must not merge into the batch sealed by end().
      send({ type: 'begin', brush, zoom: 1, samples: [{ ...contact, x: 300 }] });
      send({ type: 'samples', samples: [{ ...contact, x: 320 }] });
      await until(() => renderer.submitted.mock.calls.length === 2);
      expect(renderer.paint).toHaveBeenCalledTimes(slow ? 2 : 8);
      expect(renderer.render).toHaveBeenCalledTimes(2);
      release();
      await until(() => renderer.submitted.mock.calls.length === (slow ? 10 : 4));
      expect(renderer.render).toHaveBeenCalledTimes(slow ? 10 : 4);
      expect(renderer.finish).toHaveBeenCalledOnce();
      expect(renderer.paint).toHaveBeenCalledTimes(11); // Contact, seven chunks, finish, next contact/movement.
      const reference = createSmoothStroke(brush, 1);
      reference.add([contact]);
      expect(renderer.paint.mock.calls.slice(1, 8).flatMap(([dabs]) => dabs)).toEqual(reference.add(samples));
      expect(renderer.paint.mock.calls[8]?.[0]).toEqual(reference.finish());
      expect(renderer.paint.mock.calls[9]?.[0][0]).toMatchObject({ x: 300 });
      if (slow) {
        expect(renderer.render.mock.invocationCallOrder[1]).toBeLessThan(renderer.paint.mock.invocationCallOrder[2]!);
        expect(renderer.render.mock.invocationCallOrder[6]).toBeLessThan(renderer.finish.mock.invocationCallOrder[0]!);
      }
    } finally {
      release();
    }
  }
);

it('presents progress inside one expensive pointer segment without letting release overtake its dabs', async () => {
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  let progress: PaintRendererOptions['onPaintProgress'];
  const order: string[] = [];
  const renderer = createRendererDouble({
    paint: vi.fn(async (dabs: readonly Dab[]) => {
      if (!dabs.length) return;
      // Model one sparse pointer segment expanding into six expensive GPU dabs.
      for (let i = 0; i < 6; i++) {
        order.push(`dab-${i}`);
        elapsed += 9;
        await progress?.();
      }
    }),
    render: vi.fn(async () => {
      order.push('render');
    }),
    finish: vi.fn(async () => {
      order.push('finish');
      return [];
    })
  });
  const { send, init } = startStudioRuntime({
    renderer: async (_canvas, _lost, options) => {
      progress = options?.onPaintProgress;
      return renderer;
    },
    storage: createStorageDouble()
  });
  const until = (condition: () => boolean) => untilMicrotasks(condition, () => `Expected progress: ${order.join(', ')}`);
  await init();
  order.length = 0;
  send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 128, y: 128, pressure: 1, time: 1 }] });
  send({ type: 'end' });
  await until(() => order.includes('finish'));
  expect(progress).toBeTypeOf('function');
  expect(order.slice(0, 9)).toEqual([
    'dab-0',
    'dab-1',
    'render',
    'dab-2',
    'dab-3',
    'render',
    'dab-4',
    'dab-5',
    'render'
  ]);
  expect(order.indexOf('finish')).toBeGreaterThan(order.lastIndexOf('dab-5'));
});

it('overlaps two drawing frames, bounds the backlog, and reports completed input rather than received input', async () => {
  const fences: (() => void)[] = [];
  let gate = false;
  const renderer = createRendererDouble({
    submitted: vi.fn(() => (gate ? new Promise<void>((resolve) => fences.push(resolve)) : Promise.resolve()))
  });
  const { send, init, events, next } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  const until = (condition: () => boolean) =>
    untilMicrotasks(condition, () => `Expected frame boundary; ${fences.length} pending GPU fences`);
  await init({ diagnostics: true });
  gate = true;
  const brush = defaultBrush();
  brush.stroke.mode = 'none';
  try {
    send({ type: 'begin', brush, samples: [{ x: 10, y: 10, pressure: 1, time: 10 }] });
    await until(() => fences.length === 1);
    send({ type: 'samples', samples: [{ x: 20, y: 10, pressure: 1, time: 20 }] });
    await until(() => fences.length === 2);
    // The second CPU frame is prepared before the first GPU fence completes.
    send({ type: 'samples', samples: [{ x: 30, y: 10, pressure: 1, time: 30 }] });
    // Proving that no third frame starts needs the runtime to be idle: wait out every queued microtask turn.
    await expect(untilMicrotasks(() => fences.length > 2, () => '', 100)).rejects.toThrow();
    expect(fences).toHaveLength(2);
    fences[0]!();
    await until(() => fences.length === 3);
    const completed = events.filter(event => event.type === 'frame' && event.processedInputTime !== undefined);
    expect(completed).toEqual([expect.objectContaining({ processedInputTime: 10, receivedInputTime: 10 })]);
    fences[1]!();
    fences[2]!();
    await next((event) => event.type === 'frame' && event.processedInputTime === 30);
  } finally {
    gate = false;
    fences.forEach(resolve => resolve());
    send({ type: 'end' });
    await until(() => renderer.finish.mock.calls.length > 0);
  }
});
