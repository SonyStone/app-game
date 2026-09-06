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
