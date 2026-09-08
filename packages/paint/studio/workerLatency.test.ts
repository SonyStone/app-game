import { afterEach, expect, it, vi } from 'vitest';
import { defaultBrush, type Dab } from './brush';
import type { PaintCommand, PaintEvent } from './protocol';

const dependencies = vi.hoisted(() => ({ renderer: vi.fn(), store: vi.fn() }));
vi.mock('./gpu/renderer', () => ({ createPaintRenderer: dependencies.renderer }));
vi.mock('./tileStore', () => ({ createTileStore: dependencies.store }));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('presents the first pen contact before a queued release can wait on readback', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const order: string[] = [];
  let release!: () => void;
  const readback = new Promise<void>((resolve) => {
    release = resolve;
  });
  const renderer = {
    preview: vi.fn(),
    setSelection: vi.fn(),
    begin: vi.fn(() => order.push('begin')),
    paint: vi.fn(async (_dabs: readonly Dab[]) => {
      order.push('paint');
    }),
    render: vi.fn(async () => {
      order.push('render');
    }),
    submitted: vi.fn(async () => {}),
    finish: vi.fn(async () => {
      order.push('finish');
      await readback;
      return [];
    }),
    prepareOverview: vi.fn(async () => {}),
    stats: () => ({ gpuBytes: 0, residentTiles: 0 }),
    debugTiles: () => [],
    debugPages: () => []
  };
  dependencies.renderer.mockResolvedValue(renderer);
  dependencies.store.mockResolvedValue({
    load: async () => undefined,
    capture: (pixels: unknown) => pixels,
    save: vi.fn(async () => {}),
    stats: () => undefined
  });
  const events: PaintEvent[] = [];
  const worker = {
    onmessage: undefined as ((event: MessageEvent<PaintCommand>) => void) | undefined,
    postMessage: (event: PaintEvent) => events.push(event)
  };
  vi.stubGlobal('self', worker);
  await import('./paint.worker');
  const send = (command: PaintCommand) => worker.onmessage!({ data: command } as MessageEvent<PaintCommand>);
  // Do not advance timers: a fast tap must be visible without a scheduled frame behind end().
  const until = async (condition: () => boolean) => {
    for (let i = 0; i < 200; i++) {
      if (condition()) return;
      await Promise.resolve();
    }
    throw new Error(`Worker did not reach the expected state: ${order.join(', ')}`);
  };
  try {
    send({ type: 'init', canvas: {} as OffscreenCanvas, size: { width: 256, height: 256 }, dpr: 1 });
    await until(() => events.some((event) => event.type === 'ready'));
    order.length = 0;
    send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 128, y: 128, pressure: 0.2, time: 1 }] });
    send({ type: 'end' });
    await until(() => order.includes('finish'));
    expect(order).toEqual(['begin', 'paint', 'render', 'paint', 'finish']);
    expect(renderer.paint.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ x: 128, y: 128 })]);
  } finally {
    release();
    send({ type: 'debug', enabled: true });
    await until(() => events.some((event) => event.type === 'state' && event.debugTiles !== undefined));
  }
});

it.each([false, true])(
  'preserves queued input and presents progress while processing a slow backlog: %s',
  async (slow) => {
    vi.resetModules();
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const { createSmoothStroke } = await import('./smoothStroke');
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
    const renderer = {
      preview: vi.fn(),
      setSelection: vi.fn(),
      begin: vi.fn(),
      paint: vi.fn(async (_dabs: readonly Dab[]) => {
        if (slow) elapsed += 10;
      }),
      render: vi.fn(async () => {}),
      submitted: vi.fn(async () => {}),
      finish: vi.fn(async () => []),
      prepareOverview: vi.fn(async () => {}),
      stats: () => ({ gpuBytes: 0, residentTiles: 0 })
    };
    dependencies.renderer.mockResolvedValue(renderer);
    dependencies.store.mockResolvedValue({
      load: async () => undefined,
      capture: (pixels: unknown) => pixels,
      save: async () => {},
      stats: () => undefined
    });
    const events: PaintEvent[] = [];
    const worker = {
      onmessage: undefined as ((event: MessageEvent<PaintCommand>) => void) | undefined,
      postMessage: (event: PaintEvent) => events.push(event)
    };
    vi.stubGlobal('self', worker);
    await import('./paint.worker');
    const send = (command: PaintCommand) => worker.onmessage!({ data: command } as MessageEvent<PaintCommand>);
    const until = async (condition: () => boolean) => {
      for (let i = 0; i < 500; i++) {
        if (condition()) return;
        await Promise.resolve();
      }
      throw new Error('Worker did not complete the queued input');
    };
    try {
      send({ type: 'init', canvas: {} as OffscreenCanvas, size: { width: 256, height: 256 }, dpr: 1 });
      await until(() => events.some((event) => event.type === 'ready'));
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
      for (let i = 0; i < 50; i++) await Promise.resolve();
      expect(renderer.paint).toHaveBeenCalledTimes(1);
      expect(renderer.render).toHaveBeenCalledTimes(1);
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
