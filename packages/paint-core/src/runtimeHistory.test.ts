import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble, createStorageDouble } from '../tests/fixtures/rendererDouble';
import { startStudioRuntime } from '../tests/fixtures/studioRuntime';
import { defaultBrush } from './brush';
import type { TileChange } from './document';
import { readPaintFile } from './paintFile';
import type { PaintEvent, StateEvent } from './protocol';
import { createMemoryStorage } from './composition/memoryStorage';
import { unpackTile } from './tilePixels';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('undoes and redoes committed strokes through the runtime, and a new stroke discards the redo branch', async () => {
  let changes: TileChange[] = [];
  const renderer = createRendererDouble({ finish: vi.fn(async () => changes) });
  const { send, init, next } = startStudioRuntime({ renderer, storage: createStorageDouble() });
  await init();
  const stroke = async (key: string, red: number, before?: Uint8Array) => {
    const pixels = new Uint8Array(256 * 256 * 4);
    pixels.set([red, 0, 0, 255]);
    changes = [{ layerId: 'layer-1', key, before, after: pixels }];
    send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 10, y: 10, pressure: 1, time: 0 }] });
    send({ type: 'end' });
    await next((event) => event.type === 'state' && event.document.canUndo && !event.document.canRedo);
    return pixels;
  };
  const document = async () => {
    send({ type: 'download' });
    const file = await next((event) => event.type === 'download');
    const tiles = (await readPaintFile((file as Extract<PaintEvent, { type: 'download' }>).blob)).layers[0]!.tiles;
    return Object.fromEntries([...tiles].map(([key, pixels]) => [key, unpackTile(pixels)[0]]));
  };
  const history = async (command: 'undo' | 'redo') => {
    const resets = renderer.reset.mock.calls.length;
    const restores = renderer.restore.mock.calls.length;
    send({ type: command });
    const state = await next((event) => event.type === 'state');
    // Undo and redo reload only the restored tiles; other GPU caches stay resident.
    expect(renderer.reset.mock.calls.length).toBe(resets);
    expect(renderer.restore.mock.calls.length).toBe(restores + 1);
    expect(renderer.restore.mock.calls.at(-1)![0]).toEqual([expect.objectContaining({ layerId: 'layer-1', key: '0,0' })]);
    return (state as Extract<PaintEvent, { type: 'state' }>).document;
  };

  const first = await stroke('0,0', 100);
  await stroke('0,0', 150, first);
  expect(await document()).toEqual({ '0,0': 150 });

  expect(await history('undo')).toMatchObject({ canUndo: true, canRedo: true });
  expect(await document()).toEqual({ '0,0': 100 });
  expect(await history('undo')).toMatchObject({ canUndo: false, canRedo: true, tileCount: 0 });
  expect(await document()).toEqual({});
  expect(await history('redo')).toMatchObject({ canUndo: true, canRedo: true });
  expect(await document()).toEqual({ '0,0': 100 });

  await stroke('1,0', 200);
  expect(await document()).toEqual({ '0,0': 100, '1,0': 200 });
  send({ type: 'redo' });
  send({ type: 'debug', enabled: true });
  const state = await next((event) => event.type === 'state' && event.debugTiles !== undefined);
  expect((state as Extract<PaintEvent, { type: 'state' }>).document).toMatchObject({ canRedo: false });
  expect(await document()).toEqual({ '0,0': 100, '1,0': 200 });
});

it('hands the undo history and tools over to the next engine of the drawing, and only to the next one', async () => {
  const storage = createMemoryStorage();
  let changes: TileChange[] = [];
  const firstRenderer = createRendererDouble({
    finish: vi.fn(async () => changes),
    snapshotTools: vi.fn(async () => ({ version: 1 as const, marker: 'tools' }))
  });
  const first = startStudioRuntime({ renderer: firstRenderer, storage: await storage('paint-studio') });
  await first.init();
  for (const [red, before] of [[100, undefined], [150, 100]] as const) {
    const pixels = new Uint8Array(256 * 256 * 4);
    pixels.set([red, 0, 0, 255]);
    const previous = before === undefined ? undefined : new Uint8Array(256 * 256 * 4).fill(0);
    changes = [{ layerId: 'layer-1', key: '0,0', before: previous, after: pixels }];
    first.send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 10, y: 10, pressure: 1, time: 0 }] });
    first.send({ type: 'end' });
    await first.next((event) => event.type === 'state' && event.document.canUndo);
  }
  first.send({ type: 'undo' });
  const handed = (await first.next((event) => event.type === 'state' && event.document.canRedo)) as StateEvent;
  first.send({ type: 'dispose', handoff: true });
  await first.next((event) => event.type === 'disposed');

  const secondRenderer = createRendererDouble();
  const second = startStudioRuntime({ renderer: secondRenderer, storage: await storage('paint-studio') });
  await second.init();
  expect(lastState(second.events).document).toMatchObject({
    canUndo: true,
    canRedo: true,
    historyCurrentId: handed.document.historyCurrentId,
    historyStates: handed.document.historyStates
  });
  expect(secondRenderer.restoreTools).toHaveBeenCalledWith({ version: 1, marker: 'tools' });
  second.send({ type: 'redo' });
  await second.next((event) => event.type === 'state' && !event.document.canRedo);
  second.send({ type: 'undo' });
  second.send({ type: 'undo' });
  const undone = (await second.next((event) => event.type === 'state' && !event.document.canUndo)) as StateEvent;
  expect(undone.document.tileCount).toBe(0);
  second.send({ type: 'dispose' });
  await second.next((event) => event.type === 'disposed');

  // A plain dispose hands nothing over.
  const third = startStudioRuntime({ renderer: createRendererDouble(), storage: await storage('paint-studio') });
  await third.init();
  expect(lastState(third.events).document).toMatchObject({
    canUndo: false,
    canRedo: false
  });
});

/** The latest `state` event among `events`. */
function lastState(events: readonly PaintEvent[]) {
  return events.filter((event): event is StateEvent => event.type === 'state').at(-1)!;
}
