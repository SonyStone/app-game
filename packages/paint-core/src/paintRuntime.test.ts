import { createBrushResources } from '@app-game/abr-paint/resources';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultCamera } from './camera';
import { createMemoryStorage } from './composition/memoryStorage';
import type { PaintModules, PaintRenderer, PaintStorage } from './composition/contracts';
import { createDocument } from './document';
import { createPaintRuntime } from './paintRuntime';
import type { PaintEvent } from './protocol';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('persists navigation in the view record without a full checkpoint', async () => {
  const { runtime, storage, waitFor } = await start();
  const camera = { ...defaultCamera(), x: 120, zoom: 2 };

  runtime.send({ type: 'view', camera, size: { width: 256, height: 256 }, dpr: 1 });
  await vi.advanceTimersByTimeAsync(400);

  await waitFor(() => storage.saveView.mock.calls.length === 1);
  expect(storage.saveView).toHaveBeenCalledWith(camera);
  expect(storage.save).not.toHaveBeenCalled();
});

it('keeps GPU tile caches for layer selection and property changes, releasing only deleted layers', async () => {
  const { runtime, renderer, document, waitFor } = await start();
  const layer = document.layers[0]!;
  runtime.send({ type: 'layer', action: { type: 'add' } });
  await waitFor(() => renderer.recomposite.mock.calls.length === 1);
  const added = document.active;

  runtime.send({ type: 'layer', action: { type: 'select', id: layer.id } });
  runtime.send({ type: 'layer', action: { type: 'update', id: layer.id, patch: { opacity: 0.5 } } });
  runtime.send({ type: 'layer', action: { type: 'move', id: layer.id, direction: 1 } });
  runtime.send({ type: 'layer', action: { type: 'delete', id: added.id } });
  await waitFor(() => renderer.recomposite.mock.calls.length === 4);

  expect(renderer.reset).not.toHaveBeenCalled();
  expect(renderer.releaseLayer.mock.calls).toEqual([[added.id]]);
  // Selection prepares nothing; every other action refreshes coverage once. The first call is renderer start.
  expect(renderer.prepareOverview).toHaveBeenCalledTimes(5);
});

/** Starts a runtime with volatile storage and a renderer double, then waits until it is ready. */
async function start() {
  const events: PaintEvent[] = [];
  const document = createDocument();
  const renderer = {
    setSelection: vi.fn(),
    prepareOverview: vi.fn(async () => {}),
    render: vi.fn(async () => {}),
    submitted: vi.fn(async () => {}),
    reset: vi.fn(),
    recomposite: vi.fn(),
    releaseLayer: vi.fn(),
    destroy: vi.fn(),
    stats: () => ({ gpuBytes: 0, residentTiles: 0 }),
    debugTiles: () => [],
    debugPages: () => []
  };
  let storage!: PaintStorage & { save: ReturnType<typeof vi.fn>; saveView: ReturnType<typeof vi.fn> };
  const modules: PaintModules = {
    document: () => document,
    resources: () => createBrushResources(),
    storage: async (name) => {
      const inner = await createMemoryStorage()(name);
      storage = { ...inner, save: vi.fn(inner.save), saveView: vi.fn(inner.saveView) };
      return storage;
    },
    renderer: (async () => renderer) as unknown as PaintModules['renderer'],
    processors: {},
    engines: {},
    selectEngine: () => 'none',
    selectProcessor: () => 'none'
  };
  const runtime = createPaintRuntime((event) => events.push(event), () => {}, modules);
  const waitFor = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i++) {
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(condition()).toBe(true);
  };
  runtime.send({ type: 'init', canvas: {} as OffscreenCanvas, size: { width: 256, height: 256 }, dpr: 1 });
  await waitFor(() => events.some((event) => event.type === 'ready'));
  // Renderer start writes one full checkpoint; tests measure what happens afterwards.
  storage.save.mockClear();

  return { runtime, renderer: renderer as typeof renderer & Partial<PaintRenderer>, storage, document, events, waitFor };
}
