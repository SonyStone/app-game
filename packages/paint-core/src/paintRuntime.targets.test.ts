// @vitest-environment jsdom
import { createBrushResources } from '@app-game/abr-paint/resources';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble } from '../tests/fixtures/rendererDouble';
import { defaultCamera } from './camera';
import type { PaintModules } from './composition/contracts';
import { createMemoryStorage } from './composition/memoryStorage';
import { createDocument } from './document';
import { createPaintRuntime } from './paintRuntime';
import type { PaintEvent } from './protocol';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('presents the primary before a slow secondary finishes', async () => {
  const context = await start();
  const { runtime, renderer, waitFor } = context;
  const primary = renderer.render.mock.lastCall![5];
  const secondary = document.createElement('canvas');
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  renderer.render.mockClear();
  renderer.render.mockImplementation(async (...args: unknown[]) => {
    if (args[5] === secondary) {
      await pending;
    }
  });
  runtime.setTarget('secondary', {
    canvas: secondary,
    camera: defaultCamera(),
    size: { width: 100, height: 100 },
    dpr: 1
  });
  await waitFor(() => renderer.render.mock.calls.length === 2);
  expect(renderer.render.mock.calls.map((args) => args[5])).toEqual([primary, secondary]);
  finish();
  await stop(context);
});

it('reports and detaches a failing secondary while primary and other targets keep drawing', async () => {
  const context = await start();
  const { runtime, renderer, events, waitFor } = context;
  const primary = renderer.render.mock.lastCall![5];
  const broken = document.createElement('canvas');
  const healthy = document.createElement('canvas');
  renderer.render.mockClear();
  renderer.render.mockImplementation(async (...args: unknown[]) => {
    if (args[5] === broken) {
      throw new Error('secondary failed');
    }
  });
  const target = (canvas: HTMLCanvasElement) => ({
    canvas,
    camera: defaultCamera(),
    size: { width: 100, height: 100 },
    dpr: 1
  });
  runtime.setTarget('broken', target(broken));
  runtime.setTarget('healthy', target(healthy));
  await waitFor(() => renderer.render.mock.calls.some((args) => args[5] === healthy));
  expect(renderer.render.mock.calls.map((args) => args[5])).toEqual([primary, broken, healthy]);
  expect(renderer.releaseTarget).toHaveBeenCalledWith(broken);
  expect(events.filter((event) => event.type === 'error')).toEqual([
    expect.objectContaining({ message: 'secondary failed', background: true })
  ]);
  renderer.render.mockClear();
  runtime.setTarget('broken', { ...target(broken), camera: { ...defaultCamera(), zoom: 2 } });
  runtime.setTarget('reattached-with-new-id', { ...target(broken), size: { width: 200, height: 200 } });
  runtime.send({ type: 'view', camera: { ...defaultCamera(), x: 20 }, size: { width: 256, height: 256 }, dpr: 1 });
  await waitFor(() => renderer.render.mock.calls.some((args) => args[5] === healthy));
  expect(renderer.render.mock.calls.map((args) => args[5])).toEqual([primary, healthy]);
  expect(events.filter((event) => event.type === 'error')).toHaveLength(1);
  const replacement = document.createElement('canvas');
  runtime.setTarget('broken', target(replacement));
  await waitFor(() => renderer.render.mock.calls.some((args) => args[5] === replacement));
  expect(events.filter((event) => event.type === 'error')).toHaveLength(1);
  await stop(context);
});

it('reports primary debug pages from status after a secondary render', async () => {
  const context = await start();
  const { runtime, renderer, waitFor } = context;
  const primary = renderer.render.mock.lastCall![5];
  const secondary = document.createElement('canvas');
  runtime.setTarget('secondary', {
    canvas: secondary,
    camera: defaultCamera(),
    size: { width: 100, height: 100 },
    dpr: 1
  });
  await waitFor(() => renderer.render.mock.lastCall?.[5] === secondary);
  const pages = vi.spyOn(renderer, 'debugPages');
  runtime.send({ type: 'debug', enabled: true });
  await waitFor(() => pages.mock.calls.length > 0);
  expect(pages).toHaveBeenLastCalledWith(primary);
  await stop(context);
});

/** Starts an empty runtime so target failures can be tested independently of tile codecs and WebGPU. */
async function start() {
  const events: PaintEvent[] = [];
  const renderer = createRendererDouble();
  const modules: PaintModules = {
    document: () => createDocument(),
    resources: () => createBrushResources(),
    storage: createMemoryStorage(),
    renderer: async () => renderer,
    processors: {},
    engines: {},
    selectEngine: () => 'none',
    selectProcessor: () => 'none',
    features: [],
    edits: []
  };
  const runtime = createPaintRuntime(
    (event) => events.push(event),
    () => {},
    modules
  );
  const waitFor = async (condition: () => boolean) => {
    const deadline = vi.getRealSystemTime() + 2000;

    while (!condition() && vi.getRealSystemTime() < deadline) {
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(condition()).toBe(true);
  };
  runtime.send({ type: 'init', canvas: document.createElement('canvas'), size: { width: 256, height: 256 }, dpr: 1 });
  await waitFor(() => events.some((event) => event.type === 'ready'));

  return { runtime, renderer, events, waitFor };
}

/** Releases the runtime's renderer, resources and storage lock after target work completes. */
async function stop({ runtime, events, waitFor }: Awaited<ReturnType<typeof start>>) {
  runtime.send({ type: 'dispose' });
  await waitFor(() => events.some((event) => event.type === 'disposed'));
}
