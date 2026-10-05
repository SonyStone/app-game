import { errorMessage, gpuError, type GpuError } from '@app-game/solid-gpu/errors';
import type { GpuDevice, KeepGpuResource } from '@app-game/solid-gpu/gpu';
import { err, ok, Result } from 'neverthrow';
import { d, type TgpuBindGroup } from 'typegpu';
import type { DecodedDocument } from '../../format/types';
import { drawPage } from '../../plan/drawRecord';
import { imageByteLength, imageCodec, imageInterpolation, imagePixelOffset } from '../../plan/imageRecord';
import type { SceneFrame } from '../createFrame';
import type { DocumentWorkers } from '../DocumentWorkers';
import { claimAtlasSlot, encodeTileLookup, type ResidentTile } from './atlasSlots';
import { RasterImage, rasterLayout } from './imageShader';
import type { RasterReply, RasterRequest } from './rasterWorkerTypes';
import { selectImageTiles } from './selectImageTiles';
import {
  atlasColumns,
  createImageTileCache,
  lookupSize,
  mipSize,
  packMipTails,
  tileExtent,
  tileKey,
  tileSize,
  visibleImage,
  type Tile
} from './virtualTiles';

/**
 * Software virtual textures: pinned mip tails, bounded detail atlas and LRU eviction independent of visibility.
 *
 * `worker` is borrowed from the renderer's owner; disposal stops using it but never destroys it.
 * Decoder failures are per image: a failed image keeps its tail if one was already uploaded (otherwise it
 * draws nothing), requests no further detail, and counts as settled so composition never waits on it.
 * Only upload/scheduling exceptions and non-decoder worker errors set `failure` and stop streaming.
 * `instances` are the document's DRAW records; image placements in `update` ranges index into them.
 */
export function prepareRasterImages(
  gpu: GpuDevice,
  images: Extract<DecodedDocument, { kind: 'curves' }>['rasterImages'],
  instances: ArrayBuffer,
  keep: KeepGpuResource,
  worker: DocumentWorkers['raster']
) {
  const { root, device } = gpu;
  const table = new DataView(images.table);
  const records = new DataView(instances);
  const packed = packMipTails(table);
  const events = new EventTarget();
  const tilesForPlacement = createImageTileCache();
  const groups = new Map<number, TgpuBindGroup>();
  const ready = new Set<number>();
  /** Merged visible images of every view, with their best priority. */
  const visible = new Map<number, number>();
  /** Each view's latest requests; views draw independently and their working sets are merged. */
  const viewRequests = new Map<object, ViewRequests>();
  const missingImages = new Set<number>();
  const failedImages = new Map<number, GpuError>();
  const resident = new Map<string, ResidentTile>();
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
  let lastImage: number | undefined;
  let pending = false;
  let nextTail: number | undefined;
  let initialImages: number[] = [];
  /** Fallbacks to decode once no visible, requested or preparing work remains; never awaited by `settle`. */
  let prefetchedTails: number[] = [];
  let destroyed = false;
  let failure: GpuError | undefined;
  let clock = 0;
  keep({
    destroy() {
      destroyed = true;
      resident.clear();
      groups.clear();
      pending = false;
      finish();
    }
  });

  return {
    events,
    /** A transport, GPU upload or scheduling failure that stopped all image streaming. */
    get failure() {
      return failure;
    },
    /** Images whose decoding failed, with their decoder errors. Other images continue streaming. */
    get imageFailures(): ReadonlyMap<number, GpuError> {
      return failedImages;
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
    /**
     * Decodes the fallbacks of `images`, in order, whenever no visible, requested or preparing work remains, so pages
     * can be composed before their first visit. Replaces any previous prefetch list; `settle` does not wait for it.
     */
    prefetchTails(images: Iterable<number>) {
      if (destroyed) {
        return;
      }

      prefetchedTails = [...new Set(images)];
      pump();
    },
    /** Whether any view currently draws `image`, so its uploads can change the screen. */
    isVisible(image: number) {
      return visible.has(image);
    },
    /** Prepared images can draw immediately while detail is still loading; unvisited images return undefined. */
    get(index: number) {
      return ready.has(index) ? groups.get(index) : undefined;
    },
    /** True when all requested source texels for this image are resident or its decoding failed, so composition can reuse them. */
    isSettled(image: number) {
      return failedImages.has(image) || (ready.has(image) && !missingImages.has(image));
    },
    /** True once the image's permanent fallback is resolved: its tail is drawable, or decoding failed and it draws nothing. */
    hasFallback(image: number) {
      return ready.has(image) || failedImages.has(image);
    },
    /** Waits for the current visible working set, including tails, or for cancellation/failure. */
    async settle() {
      if (!destroyed && !failure && (pending || nextImage() !== undefined)) {
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
    },
    /**
     * Replaces `view`'s visible working set with the frame's image `ranges` and schedules decoding for the merged
     * working set of every view. `fallbackImages` additionally request tails for composed pages, without hidden
     * detail. Callers drawing a single view may omit `view`.
     */
    update(
      ranges: { first: number; count: number; image: number | undefined }[],
      frame: SceneFrame,
      fallbackImages: Iterable<number> = [],
      view: object = defaultView
    ) {
      if (destroyed || failure) {
        return;
      }

      clock++;
      const visible = new Map<number, number>();
      const pages = new Map(frame.visible.map(({ index, page }) => [index, page]));
      const candidates = new Map<string, Tile & { priority: number }>();

      for (const run of ranges) {
        if (run.image === undefined) {
          continue;
        }

        const image = packed.images[run.image]!;

        if (failedImages.has(image.id)) {
          continue;
        }

        // All source levels of a small image are already pinned. Repeated 1x1
        // PDF color swatches need no per-placement projection or streaming work.
        if (image.level === 0 && ready.has(image.id)) {
          continue;
        }

        for (let i = run.first; i < run.first + run.count; i++) {
          const region = visibleImage(records, i, frame, pages.get(drawPage(records, i)));

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
        if (!ready.has(image) && !failedImages.has(image) && !visible.has(image)) {
          visible.set(image, Number.MAX_VALUE);
        }
      }

      viewRequests.set(view, { visible, candidates });
      select();
    },
    /** Drops `view`'s working set, for example when its canvas closes. */
    forgetView(view: object) {
      if (viewRequests.delete(view) && !destroyed && !failure) {
        select();
      }
    }
  };

  /** Merges every view's requests, keeping each image's and tile's best priority, then schedules decoding. */
  function select() {
    visible.clear();
    const candidates = new Map<string, Tile & { priority: number }>();

    for (const requests of viewRequests.values()) {
      for (const [image, priority] of requests.visible) {
        visible.set(image, Math.min(visible.get(image) ?? Infinity, priority));
      }

      for (const [key, tile] of requests.candidates) {
        if (!candidates.has(key) || candidates.get(key)!.priority > tile.priority) {
          candidates.set(key, tile);
        }
      }
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

  function nextImage() {
    if (nextTail !== undefined) {
      while (
        nextTail < initialImages.length &&
        (ready.has(initialImages[nextTail]!) || failedImages.has(initialImages[nextTail]!))
      ) {
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
      if (!ready.has(id) && !failedImages.has(id) && priority < distance) {
        missingTail = id;
        distance = priority;
      }
    }

    if (missingTail !== undefined) {
      return missingTail;
    }

    // Finish visible work on the decoded source before switching images. Otherwise
    // interleaved mip priorities repeatedly decode the same large JPEG from scratch.
    if (lastImage !== undefined && missingImages.has(lastImage)) {
      return lastImage;
    }

    return [...wanted].find(([key]) => !resident.has(key))?.[1].image;
  }

  function pump() {
    if (pending || destroyed || failure) {
      return;
    }

    let id = nextImage();

    if (id === undefined) {
      finish();
      id = prefetchedTails.find((image) => !ready.has(image) && !failedImages.has(image));
    }

    if (id === undefined) {
      prefetchedTails = [];
      return;
    }

    const scheduled = Result.fromThrowable(
      () => {
        const image = packed.images[id]!;
        const offset = imagePixelOffset(table, id);
        const request: Omit<RasterRequest, 'bytes'> = {
          id,
          width: image.width,
          height: image.height,
          codec: imageCodec(table, id),
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
        lastImage = id;
        pending = true;
        void worker
          .decode(request, () => images.pixels.slice(offset, offset + imageByteLength(table, id)))
          .then((result) => {
            if (destroyed || failure) {
              return;
            }

            if (result.isOk()) {
              receive(result.value);
            } else if (isImageFailure(result.error)) {
              markFailed(id, result.error);
            } else {
              stop(result.error);
            }
          })
          // Streaming must not stall silently when the transport or a change listener throws.
          .catch((cause: unknown) => {
            if (!destroyed && !failure) {
              stop(gpuError('render', errorMessage(cause), cause));
            }
          });
      },
      (cause) => gpuError('render', errorMessage(cause))
    )();

    if (scheduled.isErr()) {
      stop(scheduled.error);
    }
  }

  function receive({ id, tail, tiles }: RasterReply) {
    pending = false;
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
              interpolate: imageInterpolation(table, id)
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

          const slot = claimAtlasSlot(free, resident, wanted);

          if (slot === undefined) {
            continue;
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
        lookup.write(encodeTileLookup(resident.values(), columns).buffer);
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

  /** Records a per-image decoder failure and continues with the remaining images. */
  function markFailed(id: number, error: GpuError) {
    pending = false;
    failedImages.set(id, error);

    for (const [key, tile] of wanted) {
      if (tile.image === id) {
        wanted.delete(key);
      }
    }

    refreshMissingImages();
    events.dispatchEvent(new CustomEvent('change', { detail: { image: id } }));
    pump();
  }

  function finish() {
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

  function stop(error: GpuError) {
    failure = error;
    pending = false;
    finish();
    events.dispatchEvent(new Event('change'));
  }
}

/**
 * The raster worker reports decoder errors and failed sends as `render` errors, which only affect
 * one image. Worker start failures, crashes and unreadable replies are `unavailable`, and `destroyed`
 * means its owner has shut it down; both stop streaming.
 */
function isImageFailure(error: GpuError) {
  return error.code === 'render';
}

/** One view's visible images with their priority, and its candidate tiles. */
type ViewRequests = {
  visible: Map<number, number>;
  candidates: Map<string, Tile & { priority: number }>;
};

/** View key for callers that draw a single view. */
const defaultView = {};
