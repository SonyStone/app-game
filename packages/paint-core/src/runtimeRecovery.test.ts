import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble, createStorageDouble } from '../tests/fixtures/rendererDouble';
import { startStudioRuntime } from '../tests/fixtures/studioRuntime';
import { defaultBrush } from './brush';
import type { RendererFactory } from './composition/contracts';
import type { TileChange } from './document';
import type { SavedDocument } from './storage';
import { unpackTile } from './tilePixels';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it.each(['paint', 'finish'] as const)(
  'recovers from final %s failure, preserving completed pixels and autosaving the next stroke',
  async (failureAt) => {
    let failure: Error | undefined;
    let changes: TileChange[] = [];
    let checkpoint: SavedDocument | undefined;
    const renderer = createRendererDouble({
      paint: vi.fn(async () => {
        if (failureAt === 'paint' && failure) throw failure;
      }),
      finish: vi.fn(async () => {
        if (failureAt === 'finish' && failure) throw failure;
        return changes;
      }),
      reset: vi.fn(() => {
        failure = undefined;
      })
    });
    const storage = createStorageDouble({
      save: vi.fn(async (snapshot: SavedDocument) => {
        checkpoint = snapshot;
      })
    });
    const { send, next: wait, init, events } = startStudioRuntime({ renderer, storage });
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

    await init();
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
    // Only the simulated failure was reported; the recovered stroke and autosave raised nothing.
    expect(events.filter((event) => event.type === 'error')).toEqual([expect.objectContaining({ message: 'Simulated readback failure' })]);

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

it('cancels a stroke after device loss only once its suspended paint has finished', async () => {
  let lose!: (message: string) => void;
  let releasePaint: (() => void) | undefined;
  const order: string[] = [];
  const renderer = createRendererDouble({
    cancel: vi.fn(() => order.push('cancel')),
    paint: vi.fn(async () => {
      if (!releasePaint) {
        return;
      }
      await new Promise<void>((resolve) => {
        const release = releasePaint!;
        releasePaint = () => {
          release();
          resolve();
        };
      });
      order.push('paint');
    })
  });
  const { send, init, next } = startStudioRuntime({
    renderer: async (_canvas, lost) => {
      // The runtime must also handle a loss reported without a typed GPU error.
      lose = lost as (message: string) => void;
      return renderer;
    },
    storage: createStorageDouble()
  });
  const settle = () => vi.waitFor(() => Promise.resolve());

  await init();
  send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 128, y: 128, pressure: 1, time: 0 }] });
  await vi.waitFor(() => expect(renderer.begin).toHaveBeenCalledOnce());

  releasePaint = () => {};
  send({ type: 'samples', samples: [{ x: 160, y: 128, pressure: 1, time: 16 }] });
  await vi.waitFor(() => expect(renderer.paint).toHaveBeenCalledTimes(2));
  lose('Simulated device loss.');
  await settle();
  expect(renderer.cancel).not.toHaveBeenCalled();

  releasePaint();
  await vi.waitFor(() => expect(order).toEqual(['paint', 'cancel']));
  await next((event) => event.type === 'error' && event.recoverable === true);
});

it('reports uncaptured validation errors as terminal validation failures, not device loss', async () => {
  let lose!: Parameters<RendererFactory>[1];
  const { init, events } = startStudioRuntime({
    renderer: async (_canvas, lost) => {
      lose = lost;
      return createRendererDouble();
    },
    storage: createStorageDouble()
  });
  await init();

  lose('Invalid bind group.', { kind: 'gpu', code: 'validation', message: 'Invalid bind group.' });
  lose('The graphics device was disconnected.', { kind: 'gpu', code: 'lost', message: 'lost' });

  const errors = events.filter((event) => event.type === 'error');
  expect(errors).toEqual([
    expect.objectContaining({ code: 'validation', recoverable: true, message: expect.stringContaining('validation error') })
  ]);
});
