import { err, ok, Result } from 'neverthrow';
import { d, type TgpuBindGroup } from 'typegpu';
import { errorMessage, gpuError, type GpuError } from '../../../../shared/errors';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { DecodedDocument } from '../../format/types';
import type { SceneFrame } from '../createFrame';
import { RasterImage, rasterLayout } from './imageShader';
import type { RasterReply, RasterRequest } from './raster.worker';
import { selectImageTiles } from './selectImageTiles';
import {
  atlasColumns,
  createImageTileCache,
  lookupSize,
  mipSize,
  packMipTails,
  tileAddress,
  tileExtent,
  tileHash,
  tileKey,
  tileSize,
  visibleImage,
  type Tile
} from './virtualTiles';

/** Software virtual textures: pinned mip tails, bounded detail atlas and LRU eviction independent of visibility. */
export function prepareRasterImages(
  gpu: GpuContext,
  images: Extract<DecodedDocument, { kind: 'curves' }>['rasterImages'],
  keep: KeepGpuResource
) {
  const { root, device } = gpu;
  const table = new DataView(images.table);
  const packed = packMipTails(table);
  const events = new EventTarget();
  const tilesForPlacement = createImageTileCache();
  const groups = new Map<number, TgpuBindGroup>();
  const ready = new Set<number>();
  const visible = new Map<number, number>();
  const missingImages = new Set<number>();
  const resident = new Map<string, { tile: Tile; slot: number; used: number }>();
  const totalTiles = packed.images.reduce((sum, image) => {
    for (let level = 0; level < image.level; level++) {
      sum += Math.ceil(mipSize(image.width, level) / tileSize) * Math.ceil(mipSize(image.height, level) / tileSize);
    }

    return sum;
  }, 0);
  const columns = Math.min(atlasColumns, Math.ceil(Math.sqrt(totalTiles)));
  const capacity = columns ** 2;
  const free = Array.from({ length: capacity }, (_, index) => capacity - 1 - index);
  const waiters = new Set<() => void>();
  const atlasSide = Math.max(1, columns * tileExtent);
  const atlas = keep(root.createTexture({ size: [atlasSide, atlasSide], format: 'rgba8unorm' })).$usage('sampled');
  const tails = keep(root.createTexture({ size: [packed.width, packed.height], format: 'rgba8unorm' })).$usage(
    'sampled'
  );
  const lookup = keep(root.createBuffer(d.arrayOf(d.vec4u, lookupSize))).$usage('storage');
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const atlasView = atlas.createView();
  const tailsView = tails.createView();
  let wanted = new Map<string, Tile>();
  let worker: Worker | undefined;
  let workerImage: number | undefined;
  let pending = false;
  let nextTail: number | undefined;
  let initialImages: number[] = [];
  let destroyed = false;
  let failure: GpuError | undefined;
  let clock = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  keep({
    destroy() {
      destroyed = true;
      resident.clear();
      groups.clear();
      pending = false;
      finish();
      releaseWorker();
    }
  });

  return ok({
    events,
    get failure() {
      return failure;
    },
    get resourceBytes() {
      return destroyed ? 0 : (atlasSide ** 2 + packed.width * packed.height) * 4 + lookupSize * 16 + groups.size * 32;
    },
    /** Prepares requested image fallbacks before exposure; omitted means all images for offline callers. */
    async prepareMipTails(images: Iterable<number> = packed.images.map(({ id }) => id)) {
      if (destroyed) {
        return err(gpuError('destroyed', 'The image cache has been destroyed'));
      }

      initialImages = [...new Set(images)];
      nextTail = 0;
      pump();

      if (pending) {
        await new Promise<void>((resolve) => waiters.add(resolve));
      }

      if (failure) {
        return err(failure);
      }

      return destroyed ? err(gpuError('destroyed', 'The image cache has been destroyed')) : ok<void>(undefined);
    },
    /** Prepared images can draw immediately while detail is still loading; unvisited images return undefined. */
    get(index: number) {
      return ready.has(index) ? groups.get(index) : undefined;
    },
    /** True when all requested source texels for this image are resident, so composition can reuse them. */
    isSettled(image: number) {
      return ready.has(image) && !missingImages.has(image);
    },
    /** Waits for the current visible working set, including tails, or for cancellation/failure. */
    async settle() {
      if (!destroyed && !failure && (pending || nextImage() !== undefined)) {
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
    },
    update(
      instances: ArrayBuffer,
      ranges: { first: number; count: number; image: number | undefined }[],
      frame: SceneFrame,
      fallbackImages: Iterable<number> = []
    ) {
      if (destroyed || failure) {
        return;
      }

      clock++;
      visible.clear();
      const records = new DataView(instances);
      const pages = new Map(frame.visible.map(({ index, page }) => [index, page]));
      const candidates = new Map<string, Tile & { priority: number }>();

      for (const run of ranges) {
        if (run.image === undefined) {
          continue;
        }

        const image = packed.images[run.image]!;

        // All source levels of a small image are already pinned. Repeated 1x1
        // PDF color swatches need no per-placement projection or streaming work.
        if (image.level === 0 && ready.has(image.id)) {
          continue;
        }

        for (let i = run.first; i < run.first + run.count; i++) {
          const region = visibleImage(records, i, frame, pages.get(records.getUint32(i * 80 + 76, true)));

          if (!region) {
            continue;
          }

          visible.set(image.id, Math.min(visible.get(image.id) ?? Infinity, region.distance));

          for (const tile of tilesForPlacement(i, image, region)) {
            const key = tileKey(tile);

            if (!candidates.has(key) || candidates.get(key)!.priority > tile.priority) {
              candidates.set(key, tile);
            }
          }
        }
      }

      // A composed base covers the whole page, including source images outside
      // the current crop. Decode their tiny tails without requesting hidden detail.
      for (const image of fallbackImages) {
        if (!ready.has(image) && !visible.has(image)) visible.set(image, Number.MAX_VALUE);
      }

      // Coarse coverage wins before fine detail. Retained tiles win ties to avoid churn near equal priorities.
      wanted = selectImageTiles(candidates, capacity, resident);

      for (const key of wanted.keys()) {
        const entry = resident.get(key);

        if (entry) {
          entry.used = clock;
        }
      }

      refreshMissingImages();
      pump();
    }
  });

  function nextImage() {
    if (nextTail !== undefined) {
      while (nextTail < initialImages.length && ready.has(initialImages[nextTail]!)) {
        nextTail++;
      }

      if (nextTail < initialImages.length) {
        return initialImages[nextTail];
      }

      nextTail = undefined;
      initialImages = [];
    }

    let missingTail: number | undefined;
    let distance = Infinity;
    for (const [id, priority] of visible) {
      if (!ready.has(id) && priority < distance) {
        missingTail = id;
        distance = priority;
      }
    }
    if (missingTail !== undefined) return missingTail;

    // Finish visible work on the decoded source before switching images. Otherwise
    // interleaved mip priorities repeatedly decode the same large JPEG from scratch.
    if (workerImage !== undefined && missingImages.has(workerImage)) {
      return workerImage;
    }

    return [...wanted].find(([key]) => !resident.has(key))?.[1].image;
  }

  function pump() {
    if (pending || destroyed || failure) {
      return;
    }

    clearTimeout(idleTimer);
    const id = nextImage();

    if (id === undefined) {
      finish();
      return;
    }

    const scheduled = Result.fromThrowable(
      () => {
        if (!worker) {
          worker = new Worker(new URL('./raster.worker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = receive;
          worker.onerror = (event) => {
            event.preventDefault();
            stop(gpuError('render', event.message));
          };
          worker.onmessageerror = () => stop(gpuError('render', 'Unable to transfer image tiles'));
        }

        const image = packed.images[id]!;
        const offset = table.getUint32(id * 24 + 8, true);
        const bytes =
          workerImage === id ? undefined : images.pixels.slice(offset, offset + table.getUint32(id * 24 + 12, true));
        const request: RasterRequest = {
          id,
          bytes,
          width: image.width,
          height: image.height,
          codec: table.getUint32(id * 24 + 20, true),
          tailLevel: ready.has(id) ? undefined : image.level,
          decodeLevel:
            nextTail !== undefined
              ? undefined
              : Math.min(
                  image.level,
                  ...[...wanted.values()].filter((tile) => tile.image === id).map((tile) => tile.level)
                ),
          tiles:
            nextTail !== undefined
              ? []
              : [...wanted]
                  .filter(([key, tile]) => tile.image === id && !resident.has(key))
                  .slice(0, 16)
                  .map(([, tile]) => tile)
        };
        workerImage = id;
        pending = true;
        timer = setTimeout(() => stop(gpuError('render', 'Image decoding exceeded 60 seconds')), 60_000);
        worker.postMessage(request, bytes ? [bytes] : []);
      },
      (cause) => gpuError('render', errorMessage(cause))
    )();

    if (scheduled.isErr()) {
      stop(scheduled.error);
    }
  }

  function receive(event: MessageEvent<{ ok: true; value: RasterReply } | { ok: false; error: string }>) {
    pending = false;
    clearTimeout(timer);

    if (destroyed || failure) {
      return;
    }

    if (!event.data.ok) {
      stop(gpuError('render', event.data.error));
      return;
    }

    const { id, tail, tiles } = event.data.value;
    const uploaded = Result.fromThrowable(
      () => {
        const image = packed.images[id]!;

        // Even superseded jobs contribute their permanent fallback. No GPU texture is replaced or destroyed on zoom.
        if (tail) {
          device.queue.writeTexture(
            { texture: root.unwrap(tails), origin: [image.x, image.y] },
            tail.pixels,
            { bytesPerRow: tail.width * 4 },
            [tail.width, tail.height]
          );
          const metadata = keep(
            root.createBuffer(RasterImage, {
              size: [image.width, image.height],
              id,
              tailLevel: image.level,
              tailOrigin: [image.x, image.y],
              interpolate: table.getUint32(id * 24 + 16, true)
            })
          ).$usage('uniform');
          groups.set(
            id,
            root.createBindGroup(rasterLayout, { image: atlasView, tails: tailsView, sampler, lookup, metadata })
          );
          ready.add(id);
        }

        for (const { tile, pixels } of tiles) {
          const key = tileKey(tile);

          if (!wanted.has(key) || resident.has(key)) {
            continue;
          }

          let slot = free.pop();

          if (slot === undefined) {
            const oldest = [...resident].filter(([key]) => !wanted.has(key)).sort((a, b) => a[1].used - b[1].used)[0];

            if (!oldest) {
              continue;
            }

            slot = oldest[1].slot;
            resident.delete(oldest[0]);
          }

          device.queue.writeTexture(
            {
              texture: root.unwrap(atlas),
              origin: [(slot % columns) * tileExtent, Math.floor(slot / columns) * tileExtent]
            },
            pixels,
            { bytesPerRow: tileExtent * 4 },
            [tileExtent, tileExtent]
          );
          resident.set(key, { tile, slot, used: clock });
        }

        // Update indirection after uploads, before the next render submission. No stale address can sample a reused slot.
        const entries = new Uint32Array(lookupSize * 4);

        for (const { tile, slot } of resident.values()) {
          const address = tileAddress(tile);
          let hash = tileHash(tile.image, address);

          while (entries[hash * 4]) {
            hash = (hash + 1) & (lookupSize - 1);
          }

          entries.set([tile.image + 1, address, slot % columns, Math.floor(slot / columns)], hash * 4);
        }

        lookup.write(entries.buffer);
      },
      (cause) => gpuError('render', errorMessage(cause))
    )();

    if (uploaded.isErr()) {
      stop(uploaded.error);
      return;
    }

    refreshMissingImages();
    events.dispatchEvent(new CustomEvent('change', { detail: { image: id } }));
    pump();
  }

  function finish() {
    clearTimeout(timer);
    // Keep the module and last decoded source warm across nearby zoom steps.
    clearTimeout(idleTimer);
    if (!destroyed && !failure) {
      idleTimer = setTimeout(releaseWorker, 5_000);
    }

    waiters.forEach((resolve) => resolve());
    waiters.clear();
  }

  function refreshMissingImages() {
    missingImages.clear();
    for (const [key, tile] of wanted) {
      if (!resident.has(key)) {
        missingImages.add(tile.image);
      }
    }
  }

  function releaseWorker() {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = undefined;
    workerImage = undefined;
  }

  function stop(error: GpuError) {
    failure = error;
    pending = false;
    finish();
    releaseWorker();
    events.dispatchEvent(new Event('change'));
  }
}
