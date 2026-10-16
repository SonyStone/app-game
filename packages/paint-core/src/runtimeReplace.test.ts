import { createBrushResources } from '@app-game/abr-paint/resources';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble, createStorageDouble } from '../tests/fixtures/rendererDouble';
import { startStudioRuntime } from '../tests/fixtures/studioRuntime';
import { defaultBrush, type Dab, type Sample } from './brush';
import type { BrushEngine, PaintModules } from './composition/contracts';
import { createMemoryStorage } from './composition/memoryStorage';
import { symmetryFeature } from './composition/symmetryFeature';
import { createDocument, type TileChange } from './document';
import { createPaintRuntime } from './paintRuntime';
import type { PaintEvent, StateEvent } from './protocol';
import { studioProcessors } from './strokeProcessors';
import { defaultPaintSymmetry } from './symmetry';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('replaces a stroke in progress with new samples as one undo step, without the old dabs', async () => {
  const pixels = new Uint8Array(256 * 256 * 4).fill(255);
  const renderer = createRendererDouble({
    finish: vi.fn(async (): Promise<TileChange[]> => [{ layerId: 'layer-1', key: '0,0', before: undefined, after: pixels }])
  });
  const { send, init, next } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();

  send({ type: 'begin', brush: defaultBrush(), samples: [sample(10, 200)] });
  send({ type: 'samples', samples: [sample(40, 230), sample(80, 190), sample(120, 240)] });
  send({ type: 'replace-stroke', samples: [sample(10, 10), sample(120, 10)] });
  send({ type: 'end' });
  const state = await next<StateEvent>((event) => event.type === 'state' && event.document.canUndo);

  // The freehand stroke was discarded and the same brush began again on the same layer.
  expect(renderer.cancel).toHaveBeenCalledTimes(1);
  expect(renderer.begin).toHaveBeenCalledTimes(2);
  expect(renderer.begin.mock.calls[1]![0]).toBe(renderer.begin.mock.calls[0]![0]);
  const afterReplace = renderer.cancel.mock.invocationCallOrder[0]!;
  const replaced = renderer.paint.mock.calls
    .filter((_, index) => renderer.paint.mock.invocationCallOrder[index]! > afterReplace)
    .flatMap(([dabs]) => dabs as Dab[]);
  expect(replaced.length).toBeGreaterThan(0);
  // Only the straight replacement is painted, unsmoothed, along y = 10.
  expect(replaced.every((dab) => dab.y === 10 && dab.x >= 10 && dab.x <= 120)).toBe(true);
  expect(renderer.finish).toHaveBeenCalledTimes(1);
  expect(state.document.canUndo).toBe(true);

  send({ type: 'undo' });
  await next<StateEvent>((event) => event.type === 'state' && !event.document.canUndo && event.document.canRedo);
});

it('records nothing when the stroke is cancelled after a replacement, and ignores later replacements', async () => {
  const renderer = createRendererDouble();
  const { send, init, next, events } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();

  send({ type: 'begin', brush: defaultBrush(), samples: [sample(10, 10)] });
  send({ type: 'samples', samples: [sample(60, 40)] });
  send({ type: 'replace-stroke', samples: [sample(10, 10), sample(60, 10)] });
  send({ type: 'cancel' });
  send({ type: 'replace-stroke', samples: [sample(10, 10), sample(90, 10)] });
  send({ type: 'end' });
  send({ type: 'debug', enabled: true });
  const state = await next<StateEvent>((event) => event.type === 'state' && event.debugTiles !== undefined);

  expect(renderer.begin).toHaveBeenCalledTimes(2);
  expect(renderer.cancel).toHaveBeenCalledTimes(2);
  expect(renderer.finish).not.toHaveBeenCalled();
  expect(state.document.canUndo).toBe(false);
  expect(events.some((event) => event.type === 'error')).toBe(false);
});

it('paints a replacement through the stroke decorations, such as symmetry', async () => {
  const renderer = createRendererDouble();
  const { send, init, next } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();
  send(symmetryFeature.command({ ...defaultPaintSymmetry(), mode: 'vertical', x: 0 }));

  send({ type: 'begin', brush: defaultBrush(), samples: [sample(10, 10)] });
  send({ type: 'replace-stroke', samples: [sample(10, 10), sample(100, 10)] });
  send({ type: 'end' });
  await next((event) => event.type === 'state');
  await vi.advanceTimersByTimeAsync(50);

  const afterReplace = renderer.cancel.mock.invocationCallOrder[0]!;
  const replaced = renderer.paint.mock.calls
    .filter((_, index) => renderer.paint.mock.invocationCallOrder[index]! > afterReplace)
    .flatMap(([dabs]) => dabs as Dab[]);
  // Every dab of the shape has its mirror across x = 0.
  expect(replaced.some((dab) => dab.x > 0)).toBe(true);
  for (const dab of replaced.filter((dab) => dab.x > 0)) {
    expect(replaced.some((mirror) => Math.abs(mirror.x + dab.x) < 1e-9 && mirror.y === dab.y)).toBe(true);
  }
});

it('keeps the seed and context of the stroke, calibrates pressure without smoothing and paints only the latest of queued replacements', async () => {
  const contexts: Parameters<BrushEngine>[0][] = [];
  const added: Sample[][] = [];
  const engine: BrushEngine = (context) => {
    contexts.push(context);
    return {
      async add(samples) {
        added.push(context.processor.add(samples));
      },
      preview() {},
      finish: async () => [],
      cancel() {}
    };
  };
  const events: PaintEvent[] = [];
  const modules: PaintModules = {
    document: () => createDocument(),
    resources: () => createBrushResources(),
    storage: createMemoryStorage(),
    renderer: (async () => createRendererDouble()) as unknown as PaintModules['renderer'],
    processors: studioProcessors,
    engines: { custom: engine },
    selectEngine: () => 'custom',
    selectProcessor: (brush) => brush.stroke.mode,
    features: [],
    edits: []
  };
  const runtime = createPaintRuntime((event) => events.push(event), () => {}, modules);
  runtime.send({ type: 'init', canvas: {} as OffscreenCanvas, size: { width: 256, height: 256 }, dpr: 1 });
  while (!events.some((event) => event.type === 'ready')) {
    await vi.advanceTimersByTimeAsync(10);
  }

  // Leonardo smoothing with pressure from 0.2 (none) to 0.6 (full).
  const brush = { ...defaultBrush(), stroke: { ...defaultBrush().stroke, mode: 'normal' as const, minimum: 0.2, maximum: 0.6 } };
  runtime.send({ type: 'begin', brush, samples: [sample(0, 0)] });
  for (const end of [50, 70, 90]) {
    runtime.send({ type: 'replace-stroke', samples: [sample(0, 0, 0.4), sample(end, 0, 0.6), sample(end, end, 0.2)] });
  }
  runtime.send({ type: 'end' });
  while (contexts.length < 2 || events.at(-1)?.type !== 'state') {
    await vi.advanceTimersByTimeAsync(10);
  }

  expect(contexts).toHaveLength(2);
  expect(contexts[1]!.seed).toBe(contexts[0]!.seed);
  expect(contexts[0]!.seed).toEqual(expect.any(Number));
  expect(contexts[1]!.brush).toBe(contexts[0]!.brush);
  expect(contexts[1]!.layer).toBe(contexts[0]!.layer);
  expect(contexts[1]!.renderer).toBe(contexts[0]!.renderer);
  expect(added.at(-1)).toEqual([
    expect.objectContaining({ x: 0, y: 0, pressure: expect.closeTo(0.5) }),
    expect.objectContaining({ x: 90, y: 0, pressure: 1 }),
    expect.objectContaining({ x: 90, y: 90, pressure: 0 })
  ]);
});

function sample(x: number, y: number, pressure = 1): Sample {
  return { x, y, pressure, time: x + y };
}
