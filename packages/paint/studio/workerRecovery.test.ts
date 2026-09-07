import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultBrush } from './brush';
import type { TileChange } from './document';
import type { PaintCommand, PaintEvent } from './protocol';
import type { SavedDocument } from './storage';
import { unpackTile } from './tilePixels';

const dependencies = vi.hoisted(() => ({ renderer: vi.fn(), store: vi.fn() }));
vi.mock('./gpu/renderer', () => ({ createPaintRenderer: dependencies.renderer }));
vi.mock('./tileStore', () => ({ createTileStore: dependencies.store }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['paint', 'finish'] as const)(
  'recovers from final %s failure, preserving completed pixels and autosaving the next stroke',
  async (failureAt) => {
    let failure: Error | undefined;
    let changes: TileChange[] = [];
    let checkpoint: SavedDocument | undefined;
    const renderer = {
      preview: vi.fn(),
      setSelection: vi.fn(),
      begin: vi.fn(),
      cancel: vi.fn(),
      paint: vi.fn(async () => {
        if (failureAt === 'paint' && failure) throw failure;
      }),
      finish: vi.fn(async () => {
        if (failureAt === 'finish' && failure) throw failure;
        return changes;
      }),
      reset: vi.fn(() => {
        failure = undefined;
      }),
      prepareOverview: vi.fn(async () => {}),
      render: vi.fn(async () => {}),
      submitted: vi.fn(async () => {}),
      destroy: vi.fn(),
      stats: () => ({ gpuBytes: 0, residentTiles: 0 }),
      debugTiles: () => [],
      debugPages: () => []
    };
    dependencies.renderer.mockResolvedValue(renderer);
    const storage = {
      load: async () => undefined,
      capture: (pixels: unknown) => pixels,
      save: vi.fn(async (snapshot: SavedDocument) => {
        checkpoint = snapshot;
      }),
      stats: () => undefined
    };
    dependencies.store.mockResolvedValue(storage);

    const events: PaintEvent[] = [];
    const worker = {
      onmessage: undefined as ((event: MessageEvent<PaintCommand>) => void) | undefined,
      postMessage: (event: PaintEvent) => events.push(event)
    };
    vi.stubGlobal('self', worker);
    await import('./paint.worker');
    const send = (command: PaintCommand) => worker.onmessage!({ data: command } as MessageEvent<PaintCommand>);
    /** Wait only on the worker's Promise command queue; scheduled drawing/saving stays under fake time. */
    const wait = async (matches: (event: PaintEvent) => boolean) => {
      for (let i = 0; i < 200; i++) {
        const index = events.findIndex(matches);
        if (index >= 0) return events.splice(0, index + 1).at(-1)!;
        await Promise.resolve();
      }
      throw new Error(`Worker did not produce the expected event: ${JSON.stringify(events)}`);
    };
    const begin = async () => {
      send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 128, y: 128, pressure: 1, time: 0 }] });
      // The queued debug response confirms begin and initial painting have completed.
      send({ type: 'debug', enabled: true });
      await wait((event) => event.type === 'state' && event.debugTiles !== undefined);
      send({ type: 'debug', enabled: false });
      await wait((event) => event.type === 'state');
    };
    const tile = (key: string, red: number): TileChange => {
      const pixels = new Uint8Array(256 * 256 * 4);
      pixels.set([red, 0, 0, 255]);
      return { layerId: 'layer-1', key, before: undefined, after: pixels };
    };

    send({ type: 'init', canvas: {} as OffscreenCanvas, size: { width: 256, height: 256 }, dpr: 1 });
    await wait((event) => event.type === 'ready');
    await begin();
    changes = [tile('0,0', 100)];
    send({ type: 'end' });
    await wait((event) => event.type === 'state' && event.document.revision === 1);

    await begin();
    changes = [tile('1,0', 150)];
    failure = new Error('Simulated readback failure');
    send({ type: 'end' });
    await wait((event) => event.type === 'error' && event.message === 'Simulated readback failure');
    expect(renderer.reset).toHaveBeenCalledOnce();

    await begin();
    expect(renderer.begin).toHaveBeenCalledTimes(3);
    changes = [tile('2,0', 200)];
    send({ type: 'end' });
    await wait((event) => event.type === 'state' && event.document.revision === 2);
    // Let the ordinary 300ms autosave execute, without an explicit save command.
    await vi.advanceTimersByTimeAsync(301);
    await wait((event) => event.type === 'state' && event.saveState === 'saved');
    const tiles = checkpoint!.layers[0]!.tiles;
    expect(tiles.map((tile) => tile.key)).toEqual(['0,0', '2,0']);
    expect(tiles.map((tile) => unpackTile(tile.pixels)[0])).toEqual([100, 200]);
    expect(events.filter((event) => event.type === 'error')).toEqual([]);

    // Switching execution mode must wait for a durable checkpoint, and must not reload after failure.
    let rejectCheckpoint!: (error: Error) => void;
    const blockedCheckpoint = new Promise<void>((_resolve, reject) => {
      rejectCheckpoint = reject;
    });
    storage.save.mockImplementationOnce(() => blockedCheckpoint);
    send({ type: 'checkpoint' });
    await wait((event) => event.type === 'state' && event.saveState === 'saving');
    expect(events.some((event) => event.type === 'checkpointed')).toBe(false);
    rejectCheckpoint(new Error('Checkpoint write failed'));
    await wait((event) => event.type === 'error' && event.message === 'Checkpoint write failed');
    expect(events.some((event) => event.type === 'checkpointed')).toBe(false);
    send({ type: 'checkpoint' });
    await wait((event) => event.type === 'checkpointed');
  }
);
