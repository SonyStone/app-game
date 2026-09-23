import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GpuContext } from '../../../../shared/gpu/context';
import { createGpuResources } from '../../../../shared/gpu/resources';
import type { SceneFrame } from '../createFrame';
import { prepareRasterImages } from './prepareRasterImages';
import type { RasterRequest } from './raster.worker';
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
      worker.reply(request);
    }

    expect((await prepared).isOk()).toBe(true);
    const groups = fixture.ranges.map((run) => fixture.cache.get(run.image));
    expect(groups.every(Boolean)).toBe(true);
    fixture.cache.update(fixture.instances, fixture.ranges.slice(0, 1), frame);
    fixture.cache.update(fixture.instances, fixture.ranges, frame);
    // The very first overview draws all fallbacks even though no detail request has completed.
    expect(fixture.ranges.map((run) => fixture.cache.get(run.image))).toEqual(groups);
    fixture.owner.destroy();
  });

  it('settles initial LOD preparation on cancellation and preserves decoder failures', async () => {
    const fixture = setup(2, 64, 64);
    const prepared = fixture.cache.prepareMipTails();
    fixture.owner.destroy();
    expect((await prepared)._unsafeUnwrapErr().code).toBe('destroyed');

    const failed = setup(2, 64, 64);
    const preparation = failed.cache.prepareMipTails();
    FakeWorker.all[0]!.onmessage?.({ data: { ok: false, error: 'Broken preview' } });
    expect((await preparation)._unsafeUnwrapErr().message).toContain('Broken preview');
    failed.owner.destroy();
  });

  it('keeps all shown images visible immediately through zoom in/out and offscreen eviction', async () => {
    const fixture = setup(16, 4096, 4096);
    fixture.cache.update(fixture.instances, fixture.ranges, frame);
    drain();
    await fixture.cache.settle();
    const groups = fixture.ranges.map((run) => fixture.cache.get(run.image));
    expect(groups.every(Boolean)).toBe(true);

    fixture.cache.update(fixture.instances, fixture.ranges.slice(0, 1), { ...frame, mul: [100, 100], add: [-50, -50] });
    expect(fixture.cache.get(0)).toBe(groups[0]);
    drain();
    await fixture.cache.settle();
    fixture.cache.update(fixture.instances, fixture.ranges, frame);
    expect(fixture.ranges.map((run) => fixture.cache.get(run.image))).toEqual(groups);
    expect(fixture.textures.every((texture) => texture.destroy.mock.calls.length === 0)).toBe(true);
    expect(fixture.cache.resourceBytes).toBeLessThan(96 * 1024 * 1024);
    drain();
    fixture.owner.destroy();
    expect(fixture.textures.every((texture) => texture.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('reuses slots under pressure while retaining every image fallback', () => {
    const fixture = setup(32, 4096, 4096);
    const large = { ...frame, width: 8000, height: 8000 };
    fixture.cache.update(fixture.instances, fixture.ranges, large);
    drain();
    const groups = fixture.ranges.map((run) => fixture.cache.get(run.image));
    const used = fixture.writeTexture.mock.calls.filter((call) => call[3][0] === tileExtent).length;
    expect(used).toBe(961);

    fixture.cache.update(fixture.instances, fixture.ranges.slice(0, 1), large);
    drain();
    const after = fixture.writeTexture.mock.calls.filter((call) => call[3][0] === tileExtent).length;
    expect(after).toBeGreaterThan(used);
    expect(fixture.ranges.map((run) => fixture.cache.get(run.image))).toEqual(groups);
    expect(fixture.cache.resourceBytes).toBeLessThan(96 * 1024 * 1024);
    fixture.owner.destroy();
  });

  it('reuses resident tiles without decoding when returning to an already loaded view', () => {
    const fixture = setup(1, 512, 512);
    fixture.cache.update(fixture.instances, fixture.ranges, frame);
    drain();
    const workers = FakeWorker.all.length;
    fixture.cache.update(fixture.instances, [], frame);
    fixture.cache.update(fixture.instances, fixture.ranges, frame);
    expect(FakeWorker.all).toHaveLength(workers);
    expect(fixture.cache.get(0)).toBeDefined();
    fixture.owner.destroy();
  });

  it('finishes requested tiles on the decoded image without repeatedly switching JPEG sources', async () => {
    const fixture = setup(3, 4096, 4096);
    const prepared = fixture.cache.prepareMipTails();
    drain();
    await prepared;
    fixture.cache.update(fixture.instances, fixture.ranges, { ...frame, width: 1600, height: 1600 });
    const worker = FakeWorker.all.at(-1)!;
    const sources: number[] = [];

    expect(fixture.cache.isSettled(0)).toBe(false);
    while (worker.requests.length) {
      const request = worker.requests.shift()!;
      if (sources.at(-1) !== request.id) {
        sources.push(request.id);
      }
      worker.reply(request);
    }

    expect(sources).toHaveLength(3);
    expect(new Set(sources).size).toBe(3);
    expect(fixture.cache.isSettled(0)).toBe(true);
    fixture.owner.destroy();
    expect(worker.terminated).toBe(true);
  });

  it('keeps useful mip tails from superseded requests and prevents uploads after disposal', async () => {
    const fixture = setup(2, 64, 64);
    fixture.cache.update(fixture.instances, fixture.ranges.slice(0, 1), frame);
    const worker = FakeWorker.all[0]!;
    const first = worker.requests.shift()!;
    fixture.cache.update(fixture.instances, fixture.ranges.slice(1), frame);
    worker.reply(first);
    expect(fixture.cache.get(0)).toBeDefined();
    const second = worker.requests.shift()!;
    const settled = fixture.cache.settle();
    fixture.owner.destroy();
    const uploads = fixture.writeTexture.mock.calls.length;
    await settled;
    worker.reply(second);
    expect(fixture.writeTexture).toHaveBeenCalledTimes(uploads);
    expect(worker.terminated).toBe(true);
    expect(fixture.cache.resourceBytes).toBe(0);
  });

  it('retains the decoder briefly, releases it after idle, and releases failures immediately', async () => {
    vi.useFakeTimers();
    const fixture = setup(1, 1, 8192);
    fixture.cache.update(fixture.instances, fixture.ranges, frame);
    drain();
    await fixture.cache.settle();
    expect(FakeWorker.all.at(-1)!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeWorker.all.at(-1)!.terminated).toBe(true);
    fixture.owner.destroy();

    const failed = setup(1, 256, 256);
    failed.cache.update(failed.instances, failed.ranges, frame);
    const settled = failed.cache.settle();
    FakeWorker.all[0]!.onmessage?.({ data: { ok: false, error: 'Broken image' } });
    await settled;
    expect(failed.cache.failure?.message).toContain('Broken image');
    expect(FakeWorker.all[0]!.terminated).toBe(true);
    failed.owner.destroy();
  });
});

function setup(count: number, width: number, height: number) {
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
  const owner = createGpuResources();
  const cache = prepareRasterImages(gpu, { table, pixels: new ArrayBuffer(0) }, owner.keep)._unsafeUnwrap();
  return { owner, cache, instances, ranges, textures, writeTexture };
}

function drain() {
  const worker = FakeWorker.all.at(-1)!;
  let count = 0;

  while (worker.requests.length) {
    expect(count++).toBeLessThan(10000);
    worker.reply(worker.requests.shift()!);
  }
}

class FakeWorker {
  static all: FakeWorker[] = [];
  static packed: ReturnType<typeof packMipTails>;
  requests: RasterRequest[] = [];
  terminated = false;
  onmessage?: (event: { data: unknown }) => void;

  constructor() {
    FakeWorker.all.push(this);
  }

  postMessage(request: RasterRequest) {
    this.requests.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  reply(request: RasterRequest) {
    const image = FakeWorker.packed.images[request.id]!;
    this.onmessage?.({
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
    });
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
