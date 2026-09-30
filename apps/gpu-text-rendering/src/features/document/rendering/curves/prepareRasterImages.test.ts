import { gpuError } from '@app-game/solid-gpu/errors';
import { type GpuContext, makeGpuResources } from '@app-game/solid-gpu/gpu';
import { isWorkerShutdown, type workerShutdown } from '@app-game/solid-gpu/worker';
import { err } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountRendererWorkers } from '../../../../../tests/browser/workerHarness';
import type { SceneFrame } from '../createFrame';
import { prepareRasterImages } from './prepareRasterImages';
import type { RasterRequest } from './rasterWorkerTypes';
import { packMipTails, tileExtent } from './virtualTiles';

describe('virtual image residency', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('prepares LOD for unseen pages before exposing the renderer, without loading detail', async () => {
    const fixture = setup(16, 4096, 4096);
    const prepared = fixture.cache.prepareMipTails();
    const worker = FakeWorker.all[0]!;

    while (worker.requests.length) {
      const request = worker.requests.shift()!;
      expect(request.tiles).toEqual([]);
      await worker.reply(request);
    }

    expect((await prepared).isOk()).toBe(true);
    const groups = fixture.ranges.map((run) => fixture.cache.get(run.image));
    expect(groups.every(Boolean)).toBe(true);
    fixture.cache.update(fixture.ranges.slice(0, 1), frame);
    fixture.cache.update(fixture.ranges, frame);
    // The very first overview draws all fallbacks even though no detail request has completed.
    expect(fixture.ranges.map((run) => fixture.cache.get(run.image))).toEqual(groups);
    fixture.owner.destroy();
  });

  it('prepares only requested initial tails, then loads a newly visited page on demand', async () => {
    const fixture = setup(3, 64, 64);
    const prepared = fixture.cache.prepareMipTails([0, 0]);
    const worker = FakeWorker.all[0]!;
    expect(worker.requests.map(({ id }) => id)).toEqual([0]);
    await drain();
    expect((await prepared).isOk()).toBe(true);
    expect(fixture.cache.get(0)).toBeDefined();
    expect(fixture.cache.get(1)).toBeUndefined();
    expect(fixture.cache.get(2)).toBeUndefined();
    fixture.cache.update(fixture.ranges.slice(1, 2), frame);
    await drain();
    await fixture.cache.settle();
    expect(fixture.cache.get(1)).toBeDefined();
    expect(fixture.cache.get(2)).toBeUndefined();
    fixture.owner.destroy();
  });

  it('settles initial LOD preparation on cancellation and isolates decoder failures per image', async () => {
    const fixture = setup(2, 64, 64);
    const prepared = fixture.cache.prepareMipTails();
    fixture.owner.destroy();
    expect((await prepared)._unsafeUnwrapErr().code).toBe('destroyed');

    const failed = setup(2, 64, 64);
    const preparation = failed.cache.prepareMipTails();
    FakeWorker.all[0]!.dispatchEvent(new MessageEvent('message', { data: { ok: false, error: 'Broken preview' } }));
    await Promise.resolve();
    await drain();
    expect((await preparation).isOk()).toBe(true);
    expect(failed.cache.failure).toBeUndefined();
    expect(failed.cache.imageFailures.get(0)?.message).toContain('Broken preview');
    // A failed image without a tail draws nothing, but never blocks composition or refinement.
    expect(failed.cache.get(0)).toBeUndefined();
    expect(failed.cache.hasFallback(0)).toBe(true);
    expect(failed.cache.isSettled(0)).toBe(true);
    expect(failed.cache.get(1)).toBeDefined();
    failed.owner.destroy();
  });

  it('keeps streaming other images and never re-requests a failed image', async () => {
    const fixture = setup(2, 4096, 4096);
    const changes: unknown[] = [];
    fixture.cache.events.addEventListener('change', (event) => changes.push((event as CustomEvent).detail?.image));
    fixture.cache.update(fixture.ranges, frame);
    const worker = FakeWorker.all[0]!;
    const first = worker.requests.shift()!;
    worker.dispatchEvent(new MessageEvent('message', { data: { ok: false, error: 'Corrupt JPEG' } }));
    await Promise.resolve();
    expect(changes).toContain(first.id);
    await drain();
    await fixture.cache.settle();

    const other = 1 - first.id;
    expect(fixture.cache.get(other)).toBeDefined();
    expect(fixture.cache.isSettled(first.id)).toBe(true);
    fixture.cache.update(fixture.ranges, { ...frame, width: 1600, height: 1600 });
    await Promise.resolve();
    const requested = FakeWorker.all.at(-1)!.requests.map(({ id }) => id);
    expect(requested).not.toContain(first.id);
    await drain();
    await fixture.cache.settle();
    expect(fixture.cache.failure).toBeUndefined();
    fixture.owner.destroy();
  });

  it('keeps drawing an uploaded tail when later detail decoding fails', async () => {
    const fixture = setup(1, 4096, 4096);
    expect((await Promise.all([fixture.cache.prepareMipTails(), drain()]))[0].isOk()).toBe(true);
    const tail = fixture.cache.get(0);
    fixture.cache.update(fixture.ranges, frame);
    const worker = FakeWorker.all.at(-1)!;
    expect(worker.requests.at(-1)!.tiles.length).toBeGreaterThan(0);
    worker.dispatchEvent(new MessageEvent('message', { data: { ok: false, error: 'Truncated scan' } }));
    await fixture.cache.settle();
    expect(fixture.cache.get(0)).toBe(tail);
    expect(fixture.cache.isSettled(0)).toBe(true);
    fixture.owner.destroy();
  });

  it('stops streaming with a failure when the transport rejects, instead of stalling', async () => {
    const decode = vi.fn(() => Promise.reject(new Error('Transport exploded')));
    const fixture = setup(2, 64, 64, { decode, destroy: vi.fn() });
    const prepared = await fixture.cache.prepareMipTails();
    expect(prepared._unsafeUnwrapErr().message).toBe('Transport exploded');
    expect(fixture.cache.failure?.message).toBe('Transport exploded');
    await fixture.cache.settle();
    expect(decode).toHaveBeenCalledOnce();
    fixture.owner.destroy();
  });

  it('stops streaming when its decoder was shut down by the owner', async () => {
    const decode = vi.fn(async () => err(gpuError('destroyed', 'The image decoder has been destroyed')));
    const fixture = setup(2, 64, 64, { decode, destroy: vi.fn() });
    expect((await fixture.cache.prepareMipTails())._unsafeUnwrapErr().code).toBe('destroyed');
    expect(decode).toHaveBeenCalledOnce();
    fixture.owner.destroy();
  });

  it('never destroys the borrowed raster worker', async () => {
    const destroy = vi.fn();
    const decode = vi.fn(async () => err(gpuError('render', 'Broken image')));
    const fixture = setup(1, 64, 64, { decode, destroy });
    await fixture.cache.prepareMipTails();
    fixture.owner.destroy();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('keeps all shown images visible immediately through zoom in/out and offscreen eviction', async () => {
    const fixture = setup(16, 4096, 4096);
    fixture.cache.update(fixture.ranges, frame);
    await drain();
    await fixture.cache.settle();
    const groups = fixture.ranges.map((run) => fixture.cache.get(run.image));
    expect(groups.every(Boolean)).toBe(true);

    fixture.cache.update(fixture.ranges.slice(0, 1), { ...frame, mul: [100, 100], add: [-50, -50] });
    expect(fixture.cache.get(0)).toBe(groups[0]);
    await drain();
    await fixture.cache.settle();
    fixture.cache.update(fixture.ranges, frame);
    expect(fixture.ranges.map((run) => fixture.cache.get(run.image))).toEqual(groups);
    expect(fixture.textures.every((texture) => texture.destroy.mock.calls.length === 0)).toBe(true);
    expect(fixture.cache.resourceBytes).toBeLessThan(96 * 1024 * 1024);
    await drain();
    fixture.owner.destroy();
    expect(fixture.textures.every((texture) => texture.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('reuses slots under pressure while retaining every image fallback', async () => {
    const fixture = setup(32, 4096, 4096);
    const large = { ...frame, width: 8000, height: 8000 };
    fixture.cache.update(fixture.ranges, large);
    await drain();
    const groups = fixture.ranges.map((run) => fixture.cache.get(run.image));
    const used = fixture.writeTexture.mock.calls.filter((call) => call[3][0] === tileExtent).length;
    expect(used).toBe(961);

    fixture.cache.update(fixture.ranges.slice(0, 1), large);
    await drain();
    const after = fixture.writeTexture.mock.calls.filter((call) => call[3][0] === tileExtent).length;
    expect(after).toBeGreaterThan(used);
    expect(fixture.ranges.map((run) => fixture.cache.get(run.image))).toEqual(groups);
    expect(fixture.cache.resourceBytes).toBeLessThan(96 * 1024 * 1024);
    fixture.owner.destroy();
  });

  it('reuses resident tiles without decoding when returning to an already loaded view', async () => {
    const fixture = setup(1, 512, 512);
    fixture.cache.update(fixture.ranges, frame);
    await drain();
    const workers = FakeWorker.all.length;
    fixture.cache.update([], frame);
    fixture.cache.update(fixture.ranges, frame);
    expect(FakeWorker.all).toHaveLength(workers);
    expect(fixture.cache.get(0)).toBeDefined();
    fixture.owner.destroy();
  });

  it('streams the merged working set of several views and drops a forgotten view', async () => {
    const fixture = setup(2, 4096, 4096);
    const large = { ...frame, width: 8000, height: 8000 };
    const [first, second] = [{}, {}];
    fixture.cache.update(fixture.ranges.slice(0, 1), large, [], first);
    fixture.cache.update(fixture.ranges.slice(1, 2), large, [], second);
    const requested = await drainIds();

    // Each view's detail streams in several batches; a single replaced working set would stop after one.
    expect(requested.filter((id) => id === 0).length).toBeGreaterThan(1);
    expect(requested.filter((id) => id === 1).length).toBeGreaterThan(1);

    fixture.cache.forgetView(second);
    fixture.cache.update(fixture.ranges.slice(0, 1), { ...large, mul: [4, 4], add: [-1, -1] }, [], first);
    expect(await drainIds()).not.toContain(1);
    fixture.owner.destroy();
  });

  it('finishes requested tiles on the decoded image without repeatedly switching JPEG sources', async () => {
    const fixture = setup(3, 4096, 4096);
    const prepared = fixture.cache.prepareMipTails();
    await drain();
    await prepared;
    fixture.cache.update(fixture.ranges, { ...frame, width: 1600, height: 1600 });
    const worker = FakeWorker.all.at(-1)!;
    const sources: number[] = [];

    expect(fixture.cache.isSettled(0)).toBe(false);
    while (worker.requests.length) {
      const request = worker.requests.shift()!;
      if (sources.at(-1) !== request.id) {
        sources.push(request.id);
      }
      await worker.reply(request);
    }

    expect(sources).toHaveLength(3);
    expect(new Set(sources).size).toBe(3);
    expect(fixture.cache.isSettled(0)).toBe(true);
    fixture.owner.destroy();
    expect(worker.terminated).toBe(true);
  });

  it('keeps useful mip tails from superseded requests and prevents uploads after disposal', async () => {
    const fixture = setup(2, 64, 64);
    fixture.cache.update(fixture.ranges.slice(0, 1), frame);
    const worker = FakeWorker.all[0]!;
    const first = worker.requests.shift()!;
    fixture.cache.update(fixture.ranges.slice(1), frame);
    await worker.reply(first);
    expect(fixture.cache.get(0)).toBeDefined();
    const second = worker.requests.shift()!;
    const settled = fixture.cache.settle();
    fixture.owner.destroy();
    const uploads = fixture.writeTexture.mock.calls.length;
    await settled;
    await worker.reply(second);
    expect(fixture.writeTexture).toHaveBeenCalledTimes(uploads);
    expect(worker.terminated).toBe(true);
    expect(fixture.cache.resourceBytes).toBe(0);
  });

  it.each(['create', 'post'] as const)(
    'settles preparation and isolates the image when worker %s fails',
    async (stage) => {
      const fixture = setup(1, 64, 64);
      vi.stubGlobal(
        'Worker',
        class extends FakeWorker {
          constructor() {
            super();
            if (stage === 'create') throw new Error('Worker unavailable');
          }
          postMessage() {
            throw new Error('Cannot transfer pixels');
          }
        }
      );
      const prepared = await fixture.cache.prepareMipTails();
      if (stage === 'create') {
        // A decoder that cannot start is 'unavailable', which stops the pipeline rather than one image.
        expect(prepared._unsafeUnwrapErr()).toMatchObject({ code: 'unavailable' });
        expect(prepared._unsafeUnwrapErr().message).toContain('Worker unavailable');
      } else {
        // An unsendable request is a per-image `render` failure; its worker is shut down and recreated on demand.
        expect(prepared.isOk()).toBe(true);
        expect(fixture.cache.imageFailures.get(0)?.message).toContain('Cannot transfer pixels');
        expect(FakeWorker.all[0]!.terminated).toBe(true);
      }
      fixture.owner.destroy();
    }
  );

  it.each(['error', 'messageerror'])('releases the worker and stops preparation on %s', async (type) => {
    const fixture = setup(1, 64, 64);
    const prepared = fixture.cache.prepareMipTails();
    const worker = FakeWorker.all[0]!;
    worker.dispatchEvent(
      type === 'error'
        ? new ErrorEvent('error', { message: 'Decoder crashed', cancelable: true })
        : new MessageEvent('messageerror')
    );
    // A crashed or unreadable decoder is 'unavailable': a fatal stop rather than a per-image failure.
    expect((await prepared)._unsafeUnwrapErr()).toMatchObject({ code: 'unavailable' });
    expect(worker.terminated).toBe(true);
    fixture.owner.destroy();
  });

  it('retains the decoder briefly, releases it after idle, and releases failures immediately', async () => {
    vi.useFakeTimers();
    const fixture = setup(1, 1, 8192);
    fixture.cache.update(fixture.ranges, frame);
    await drain();
    await fixture.cache.settle();
    expect(FakeWorker.all.at(-1)!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeWorker.all.at(-1)!.terminated).toBe(true);
    fixture.owner.destroy();

    const failed = setup(1, 256, 256);
    failed.cache.update(failed.ranges, frame);
    const settled = failed.cache.settle();
    FakeWorker.all[0]!.dispatchEvent(new MessageEvent('message', { data: { ok: false, error: 'Broken image' } }));
    await settled;
    expect(failed.cache.failure).toBeUndefined();
    expect(failed.cache.imageFailures.get(0)?.message).toContain('Broken image');
    expect(FakeWorker.all[0]!.terminated).toBe(true);
    failed.owner.destroy();
  });
});

function setup(count: number, width: number, height: number, worker?: unknown) {
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
  const table = new ArrayBuffer(count * 24);
  const records = new DataView(table);
  const instances = new ArrayBuffer(count * 80);
  const transforms = new DataView(instances);
  const ranges = Array.from({ length: count }, (_, image) => {
    records.setUint32(image * 24, width, true);
    records.setUint32(image * 24 + 4, height, true);
    transforms.setFloat32(image * 80, 1, true);
    transforms.setFloat32(image * 80 + 12, 1, true);
    return { first: image, count: 1, image };
  });
  FakeWorker.packed = packMipTails(records);
  const textures: { width: number; destroy: ReturnType<typeof vi.fn> }[] = [];
  const writeTexture = vi.fn();
  const gpu = {
    device: { limits: { maxTextureDimension2D: 16384 }, queue: { writeTexture } },
    root: {
      createSampler: vi.fn(),
      createBindGroup: vi.fn(() => ({})),
      unwrap: vi.fn(),
      createBuffer: () => ({
        destroy: vi.fn(),
        write: vi.fn(),
        $usage() {
          return this;
        }
      }),
      createTexture: ({ size }: { size: number[] }) => {
        const texture = {
          width: size[0]!,
          destroy: vi.fn(),
          createView: vi.fn(),
          $usage() {
            return this;
          }
        };
        textures.push(texture);
        return texture;
      }
    }
  } as unknown as GpuContext;
  const owner = makeGpuResources();
  const fixture = mountRendererWorkers();
  owner.keep({ destroy: fixture.dispose });
  const cache = prepareRasterImages(
    gpu,
    { table, pixels: new ArrayBuffer(0) },
    instances,
    owner.keep,
    (worker as typeof fixture.workers.raster | undefined) ?? fixture.workers.raster
  );
  return { owner, cache, instances, ranges, textures, writeTexture };
}

/** Replies to every pending decode request and returns the requested image ids in order. */
async function drainIds() {
  const worker = FakeWorker.all.at(-1)!;
  const ids: number[] = [];

  while (worker.requests.length) {
    expect(ids.length).toBeLessThan(10000);
    const request = worker.requests.shift()!;
    ids.push(request.id);
    await worker.reply(request);
  }

  return ids;
}

async function drain() {
  const worker = FakeWorker.all.at(-1)!;
  let count = 0;

  while (worker.requests.length) {
    expect(count++).toBeLessThan(10000);
    await worker.reply(worker.requests.shift()!);
  }
}

class FakeWorker extends EventTarget {
  static all: FakeWorker[] = [];
  static packed: ReturnType<typeof packMipTails>;
  requests: RasterRequest[] = [];
  terminated = false;

  constructor() {
    super();
    FakeWorker.all.push(this);
  }

  postMessage(request: RasterRequest | typeof workerShutdown) {
    // Cooperative shutdown closes the worker before the terminate() fallback.
    if (isWorkerShutdown(request)) {
      this.terminated = true;
      return;
    }
    this.requests.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  async reply(request: RasterRequest) {
    const image = FakeWorker.packed.images[request.id]!;
    this.dispatchEvent(
      new MessageEvent('message', {
        data: {
          ok: true,
          value: {
            id: request.id,
            tail:
              request.tailLevel === undefined
                ? undefined
                : {
                    width: image.tailWidth,
                    height: image.tailHeight,
                    pixels: new ArrayBuffer(image.tailWidth * image.tailHeight * 4)
                  },
            tiles: request.tiles.map((tile) => ({ tile, pixels: new ArrayBuffer(tileExtent ** 2 * 4) }))
          }
        }
      })
    );
  }
}

const frame: SceneFrame = {
  width: 800,
  height: 800,
  mul: [2, 2],
  add: [-1, -1],
  rotation: [1, 0, 0, 1],
  visible: [],
  vectorOnly: false,
  grids: false
};
