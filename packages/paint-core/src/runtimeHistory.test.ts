import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble, createStorageDouble } from '../tests/fixtures/rendererDouble';
import { startStudioRuntime } from '../tests/fixtures/studioRuntime';
import { defaultBrush } from './brush';
import type { TileChange } from './document';
import { readPaintFile } from './paintFile';
import type { PaintEvent } from './protocol';
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
