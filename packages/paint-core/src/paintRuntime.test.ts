import { createBrushResources } from '@app-game/abr-paint/resources';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble } from '../tests/fixtures/rendererDouble';
import { defaultCamera } from './camera';
import type { PaintModules, PaintStorage } from './composition/contracts';
import { defineDocumentEdit, type DocumentEdit } from './composition/documentEdit';
import type { DocumentFeature } from './composition/documentFeature';
import { createMemoryStorage } from './composition/memoryStorage';
import { symmetryFeature } from './composition/symmetryFeature';
import { createDocument } from './document';
import { createPaintRuntime } from './paintRuntime';
import type { PaintEvent } from './protocol';
import { defaultPaintSymmetry } from './symmetry';
import { TILE_BYTES, unpackTile, type TileData } from './tilePixels';

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

it('merges a layer down from its pixels, reloading only the merged tiles, and refuses hidden layers', async () => {
  const { runtime, renderer, document, events, storage, waitFor } = await start();
  const lower = document.active.id;
  const red = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 4) red.set([255, 0, 0, 255], index);
  document.changeLayer({ type: 'add' });
  const upper = document.active.id;
  document.commit([{ layerId: upper, key: '2,3', before: undefined, after: red }]);
  document.changeLayer({ type: 'update', id: upper, patch: { blend: 'normal', opacity: 0.5 } });

  document.changeLayer({ type: 'update', id: lower, patch: { visible: false } });
  runtime.send({ type: 'layer', action: { type: 'merge-down', id: upper } });
  await waitFor(() => events.some((event) => event.type === 'error'));
  expect(events.find((event) => event.type === 'error')).toMatchObject({
    message: 'Show both layers before merging them.'
  });
  expect(document.layers).toHaveLength(2);

  document.changeLayer({ type: 'update', id: lower, patch: { visible: true } });
  runtime.send({ type: 'layer', action: { type: 'merge-down', id: upper } });
  await waitFor(() => document.layers.length === 1);
  // Autosave may already have moved the merged tile to storage.
  const merged = document.active.tiles.get('2,3')!;
  const pixels = unpackTile(merged instanceof Uint8Array ? merged : await storage.read(merged));
  expect([...pixels.subarray(0, 4)]).toEqual([128, 0, 0, 128]);
  expect(renderer.releaseLayer).toHaveBeenCalledWith(upper);
  expect(renderer.restore.mock.calls.at(-1)![0]).toEqual([
    { layerId: lower, key: '2,3', before: undefined, after: undefined }
  ]);
});

it('applies document feature commands and keeps the data of features it does not have', async () => {
  const openStorage = createMemoryStorage();
  const mandala = { ...defaultPaintSymmetry(), mode: 'mandala' as const, segments: 6, x: 40 };
  const reported = (events: PaintEvent[]) => events.findLast((event) => event.type === 'state')?.features;

  const first = await start({ features: [symmetryFeature], openStorage });
  expect(reported(first.events)).toEqual({ symmetry: defaultPaintSymmetry() });
  first.runtime.send(symmetryFeature.command(mandala));
  await first.waitFor(() => symmetryFeature.read(reported(first.events))?.mode === 'mandala');
  await stop(first);

  // A build without the feature neither reports nor changes the feature's data, and refuses its commands.
  const second = await start({ features: [], openStorage });
  expect(reported(second.events)).toEqual({});
  second.runtime.send({ type: 'feature', feature: 'symmetry', command: mandala });
  await second.waitFor(() => second.events.some((event) => event.type === 'error'));
  second.runtime.send({ type: 'save' });
  await second.waitFor(() => second.storage.save.mock.calls.length === 1);
  expect(second.storage.save.mock.calls[0]![0].features).toEqual({ symmetry: mandala });
  await stop(second);

  const third = await start({ features: [symmetryFeature], openStorage });
  expect(symmetryFeature.read(reported(third.events))).toEqual(mandala);
});

it('commits a module edit as one undo step and leaves the document unchanged when the edit fails', async () => {
  const paint = defineDocumentEdit({
    id: 'paint-tile',
    parse: (input: unknown) => {
      if (input !== 'ok' && input !== 'fail') throw new Error('Unknown payload.');
      return input;
    },
    async run({ active, readTile }, command) {
      if (command === 'fail') throw new Error('Nothing to fill here.');
      const before = active.tiles.get('0,0');
      expect(before === undefined || (await readTile(before)).length === TILE_BYTES).toBe(true);
      return { changes: [{ layerId: active.id, key: '0,0', before, after: new Uint8Array(TILE_BYTES).fill(255) }] };
    }
  });
  const { runtime, document, events, storage, waitFor } = await start({ edits: [paint] });
  runtime.send(paint.command('ok'));
  await waitFor(() => document.active.tiles.has('0,0'));
  const tile = document.active.tiles.get('0,0')!;
  expect(unpackTile(tile instanceof Uint8Array ? tile : await storage.read(tile))[3]).toBe(255);
  expect(document.state().canUndo).toBe(true);

  runtime.send({ type: 'undo' });
  await waitFor(() => !document.active.tiles.has('0,0'));

  const revision = document.revision;
  runtime.send(paint.command('fail'));
  runtime.send({ type: 'edit', edit: 'missing', command: undefined });
  await waitFor(() => events.filter((event) => event.type === 'error').length === 2);
  expect(
    events.filter((event) => event.type === 'error').map((event) => event.type === 'error' && event.message)
  ).toEqual(['Nothing to fill here.', 'Document edit "missing" is not installed.']);
  expect(document.revision).toBe(revision);
});

it('amends an interactive edit into one undo step, replies to requests and refuses stale amendments', async () => {
  // Fills tile 0,0 with the given alpha, replacing its own previous fill; 0 removes the fill.
  const shade = defineDocumentEdit({
    id: 'shade',
    parse: (input: unknown) => input as number,
    async run({ active, state }, alpha) {
      const session = state.get() as { before: TileData | undefined } | undefined;
      const before = session ? session.before : active.tiles.get('0,0');
      // A zero alpha ends the session: its step is removed.
      state.set(alpha ? { before } : undefined);
      const after = new Uint8Array(TILE_BYTES).fill(alpha);
      const changes = alpha ? [{ layerId: active.id, key: '0,0', before, after }] : [];
      return { changes, amend: session !== undefined, reply: { alpha } };
    }
  });
  const { runtime, document, events, storage, waitFor } = await start({ edits: [shade] });
  const alphaAt = async () => {
    const tile = document.active.tiles.get('0,0');
    return tile && unpackTile(tile instanceof Uint8Array ? tile : await storage.read(tile))[3];
  };
  const replies = () => events.filter((event) => event.type === 'edited');
  runtime.send(shade.command(10, 'a'));
  runtime.send(shade.command(20, 'b'));
  runtime.send(shade.command(30, 'c'));
  await waitFor(() => replies().length === 3);
  expect(replies()).toEqual([
    { type: 'edited', requestId: 'a', result: { ok: true, value: { alpha: 10 } } },
    { type: 'edited', requestId: 'b', result: { ok: true, value: { alpha: 20 } } },
    { type: 'edited', requestId: 'c', result: { ok: true, value: { alpha: 30 } } }
  ]);
  expect(await alphaAt()).toBe(30);
  expect(document.state().historyStates).toHaveLength(2);

  // Amending without changes removes the step, as cancelling the edit does.
  runtime.send(shade.command(0, 'd'));
  await waitFor(() => replies().length === 4);
  expect(await alphaAt()).toBeUndefined();
  expect(document.state().canUndo).toBe(false);

  // Another undo step in between makes the next amendment fail without changing the drawing.
  runtime.send(shade.command(40, 'e'));
  await waitFor(() => replies().length === 5);
  runtime.send({ type: 'layer', action: { type: 'add' } });
  runtime.send(shade.command(50, 'f'));
  await waitFor(() => replies().length === 6);
  expect(replies().at(-1)).toMatchObject({ requestId: 'f', result: { ok: false } });
  document.changeLayer({ type: 'select', id: document.layers[0]!.id });
  expect(await alphaAt()).toBe(40);
});

it('shows floating pixels of an edit and clears them after its result, keeping the frame until it has loaded', async () => {
  // `lift` shows a tile's worth of pixels, `move` moves them, `drop` commits a tile and `fail` throws after clearing.
  const float = defineDocumentEdit({
    id: 'float',
    parse: (input: unknown) => input as 'lift' | 'move' | 'drop' | 'fail' | 'cancel',
    async run({ active, floating }, command) {
      if (command === 'lift') {
        const bounds = { left: 0, top: 0, right: 2, bottom: 2 };
        floating.show({
          layerId: active.id,
          bounds,
          pixels: new Uint8Array(16),
          matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          interpolation: 'smooth'
        });
      } else if (command === 'move') {
        floating.move([1, 0, 5, 0, 1, 0, 0, 0, 1], 'pixels');
      } else {
        await floating.clear();
        if (command === 'fail') throw new Error('The transform is too thin to draw.');
        if (command === 'drop') {
          const after = new Uint8Array(TILE_BYTES).fill(255);
          return { changes: [{ layerId: active.id, key: '0,0', before: undefined, after }] };
        }
      }

      return { changes: [] };
    }
  });
  const { runtime, renderer, document, events, waitFor } = await start({ edits: [float] });
  const replies = () => events.filter((event) => event.type === 'edited').length;
  runtime.send(float.command('lift', 'a'));
  runtime.send(float.command('move', 'b'));
  await waitFor(() => replies() === 2);
  expect(renderer.setFloating).toHaveBeenLastCalledWith(expect.objectContaining({ layerId: document.active.id }));
  expect(renderer.moveFloating).toHaveBeenLastCalledWith([1, 0, 5, 0, 1, 0, 0, 0, 1], 'pixels');
  expect(document.state().canUndo).toBe(false);

  // The result replaces the floating pixels after it is committed and restored, holding the presented frame.
  runtime.send(float.command('drop', 'c'));
  await waitFor(() => replies() === 3);
  expect(document.state().canUndo).toBe(true);
  expect(renderer.setFloating).toHaveBeenLastCalledWith(undefined);
  expect(renderer.restore.mock.invocationCallOrder.at(-1)).toBeLessThan(
    renderer.setFloating.mock.invocationCallOrder.at(-1)!
  );
  expect(renderer.holdPresented).toHaveBeenCalledOnce();

  // Without changes nothing is held; a failed result still clears the floating pixels.
  runtime.send(float.command('lift', 'd'));
  runtime.send(float.command('cancel', 'e'));
  runtime.send(float.command('lift', 'f'));
  runtime.send(float.command('fail', 'g'));
  await waitFor(() => replies() === 7);
  expect(renderer.setFloating).toHaveBeenLastCalledWith(undefined);
  expect(renderer.setFloating).toHaveBeenCalledTimes(7);
  expect(renderer.holdPresented).toHaveBeenCalledOnce();
});

it('reports the layers with paint in the view and in watched regions', async () => {
  const paint = defineDocumentEdit({
    id: 'paint-tile',
    parse: (input: unknown) => input as string,
    async run({ active }, key) {
      return { changes: [{ layerId: active.id, key, before: undefined, after: new Uint8Array(TILE_BYTES).fill(255) }] };
    }
  });
  const { runtime, document, events, waitFor } = await start({ edits: [paint] });
  const latestState = () => events.filter((event) => event.type === 'state').at(-1);
  runtime.send(paint.command('40,0'));
  runtime.send({ type: 'watch-regions', regions: { far: { left: 40 * 256, top: 0, width: 100, height: 100 } } });
  await waitFor(() => document.active.tiles.has('40,0'));
  runtime.send({ type: 'undo' });
  runtime.send({ type: 'redo' });
  await waitFor(() => latestState()?.type === 'state' && latestState()!.document.canUndo);
  const state = latestState()!;
  expect(state.type === 'state' && state.layersInRegions).toEqual({ far: [document.active.id] });
  expect(state.type === 'state' && state.layersInView).toEqual([]);
  expect(state.type === 'state' && state.document.layers[0]!.tileCount).toBe(1);
});

/** Disposes a runtime gracefully, saving its document. */
async function stop({ runtime, events, waitFor }: Awaited<ReturnType<typeof start>>) {
  runtime.send({ type: 'dispose' });
  await waitFor(() => events.some((event) => event.type === 'disposed'));
}

/**
 * Starts a runtime with volatile storage and a renderer double, then waits until it is ready. Runtimes sharing
 * `openStorage` share their documents by storage name.
 */
async function start(
  options: {
    features?: readonly DocumentFeature[];
    edits?: readonly DocumentEdit[];
    openStorage?: ReturnType<typeof createMemoryStorage>;
  } = {}
) {
  const openStorage = options.openStorage ?? createMemoryStorage();
  const events: PaintEvent[] = [];
  const document = createDocument();
  const renderer = createRendererDouble();

  let storage!: PaintStorage & { save: ReturnType<typeof vi.fn>; saveView: ReturnType<typeof vi.fn> };
  const modules: PaintModules = {
    document: () => document,
    resources: () => createBrushResources(),
    storage: async (name) => {
      const inner = await openStorage(name);
      storage = { ...inner, save: vi.fn(inner.save), saveView: vi.fn(inner.saveView) };
      return storage;
    },
    renderer: (async () => renderer) as unknown as PaintModules['renderer'],
    processors: {},
    engines: {},
    selectEngine: () => 'none',
    selectProcessor: () => 'none',
    features: options.features ?? [],
    edits: options.edits ?? []
  };
  const runtime = createPaintRuntime(
    (event) => events.push(event),
    () => {},
    modules
  );
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

  return { runtime, renderer, storage, document, events, waitFor };
}
