import type { PsdLayerNode, PsdRegionPixels, PsdRegionRect, PsdRenderSettings } from '@app-game/psd/viewer';
import { makeCompositePreviews, type CompositeDiagnostics } from '../gpu-composite/makeCompositePreviews';
import { displayTileLevels, type DisplayTile } from '../gpu-viewport/displayTiles';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';
import type { WindowClient } from '../psd-worker/makePsdWorkerPool';
import { viewerPerformance } from '../telemetry/performance';
import type { View } from './view';

/**
 * Owns a byte-accounted source/mip LRU independently of camera interest. One native tile runs per admitted worker;
 * an obsolete camera can waste at most one tile per worker, whose valid pixels are salvaged for later demand.
 * Visibility edits retain provably unaffected coverage. Settings, fonts and document changes invalidate all pixels.
 * The CPU budget defaults to 64 MiB and must be at least 16 MiB; pending transfers and every mip level count.
 */
export function makeWindowRenderer(
  client: WindowClient,
  budgetBytes = 64 * 1024 * 1024,
  compositeChanged?: (state: CompositeDiagnostics) => void
) {
  if (!Number.isFinite(budgetBytes) || budgetBytes < 16 * 1024 * 1024) {
    throw new RangeError('CPU tile residency requires at least 16 MiB, including pending transfers.');
  }

  // A display upload may still retain one source buffer after LRU eviction, until the next frame reconciles tiles.
  // Its 544-square RGBA source is below 2 MiB. Reserve that headroom rather than hiding it outside CPU accounting.
  const uploadReserveBytes = 2 * 1024 * 1024;
  // Compositing reserves 16 MiB for operands, 24 MiB for preparation, and 4 MiB for verification/transfer.
  const cacheLimitBytes = () => budgetBytes - uploadReserveBytes - (previous?.gpuComposite ? 44 * 1024 * 1024 : 0);
  const cache = new Map<string, DisplayTile[]>();
  const compositor = makeCompositePreviews(client, compositeChanged);
  const pending = new Map<
    string,
    {
      result: Promise<PsdResultOf<DisplayTile>>;
      controller: AbortController;
      support: PsdRegionRect;
      saved: boolean;
    }
  >();
  const canceledResults = new WeakSet<PsdResultOf<DisplayTile>>();
  const admitted = new WeakSet<DisplayTile>();
  const arrivals = new Map<NonNullable<DisplayTile['arrival']>, PsdRegionRect>();
  const flights = new Set<Promise<unknown>>();
  let cacheBytes = 0;
  let reservedBytes = 0;
  let previous: WindowSnapshot | undefined;
  let previewedDocument: number | undefined;
  let nextRender = 0;
  let lod = 1;
  let pinned = new Set<string>();
  let overviewKey: string | undefined;
  let camera: { view: View; size: { width: number; height: number } } | undefined;

  async function render(
    snapshot: WindowSnapshot,
    view: View,
    size: { width: number; height: number; dpr?: number },
    signal: AbortSignal,
    publish: (image: RenderedPixels) => void
  ): Promise<PsdResultOf<RenderedPixels> | undefined> {
    camera = { view, size };
    for (const [arrival, clip] of arrivals) {
      if (arrival.presented || !visibleInCamera(clip, camera)) {
        if (!arrival.presented) {
          arrival.visible = false;
        }

        arrivals.delete(arrival);
      }
    }

    if (previous !== snapshot) {
      const affected = previous && visibilityDamage(previous, snapshot);
      for (const [key, job] of pending) {
        if (!affected || job.saved || affected.some((rect) => intersects(job.support, rect))) {
          job.controller.abort();
          pending.delete(key);
        }
      }
      for (const [key, levels] of cache) {
        if (
          !affected ||
          levels.some((tile) =>
            affected.some((rect) =>
              intersects(
                {
                  left: tile.left,
                  top: tile.top,
                  width: tile.image.width * tile.step,
                  height: tile.image.height * tile.step
                },
                rect
              )
            )
          )
        ) {
          remove(key);
        }
      }

      previous = snapshot;
    }

    const tileBudgetBytes = cacheLimitBytes() + uploadReserveBytes;
    lod = chooseLod(view.scale * (size.dpr ?? 1), lod);
    const plan = planWindow(
      snapshot.opened.info,
      view,
      size,
      tileBudgetBytes,
      snapshot.opened.windowed === true && snapshot.opened.info.width * snapshot.opened.info.height <= 16_777_216
    );
    if (!plan || signal.aborted) {
      return undefined;
    }

    if (plan.kind === 'regions') {
      const minimum = Math.sqrt(
        (plan.tiles.length * (tileEdge + 32) ** 2 * 4 * 1.34) / Math.max(1, tileBudgetBytes - 10 * 1024 * 1024)
      );
      lod = Math.min(maxMipStep, Math.max(lod, 2 ** Math.max(0, Math.ceil(Math.log2(minimum)))));
    }

    if (plan.kind === 'regions') {
      const priority = (tile: PsdRegionRect) => {
        const visible =
          tile.left * view.scale + view.x < size.width &&
          (tile.left + tile.width) * view.scale + view.x > 0 &&
          tile.top * view.scale + view.y < size.height &&
          (tile.top + tile.height) * view.scale + view.y > 0;
        return visible ? (cache.has(tileKey(tile)) || (overviewKey && cache.has(overviewKey)) ? 1 : 0) : 2;
      };
      plan.tiles.sort((a, b) => priority(a) - priority(b));
    }

    const start = performance.now();
    const { document, info } = snapshot.opened;
    const step = plan.kind === 'overview' ? plan.step : lod;
    const keys = plan.kind === 'overview' ? [`overview:${plan.step}`] : plan.tiles.map(tileKey);
    pinned = new Set(keys);
    const frame = (tiles: DisplayTile[]): RenderedPixels => {
      const images = displayTileLevels(tiles, step).map(({ requested }) => requested.image as PsdRegionPixels);
      const saved = images.some((image) => image.source === 'savedComposite');
      const completed = keys.filter((key) => current(key, step)).length;
      return {
        width: info.width,
        height: info.height,
        pixels: new Uint8Array(0),
        tiles,
        quality: {
          completed,
          required: keys.length,
          step,
          coarse: completed < keys.length || plan.kind === 'overview',
          kind: plan.kind === 'overview' ? 'pointPreview' : step === 1 ? 'source' : 'filtered'
        },
        compositing:
          snapshot.gpuComposite && !saved
            ? {
                preview: tiles.filter((tile) => !!tile.gpu).length
              }
            : undefined,
        depth: info.depth as RenderedPixels['depth'],
        render: ++nextRender,
        milliseconds: performance.now() - start,
        window: {
          left: 0,
          top: 0,
          step,
          source: saved ? 'savedComposite' : 'layers',
          strategy: images.some((image) => image.strategy === 'fullCanvas') ? 'fullCanvas' : 'window',
          exactToLayerRender:
            !saved &&
            tiles
              .filter((tile) => tile.step <= step)
              .every((tile) => !tile.gpu && (tile.image as PsdRegionPixels).exactToLayerRender)
        },
        approximations: [
          ...new Set(
            images
              .filter((image) => plan.kind === 'overview' || image.step <= step)
              .flatMap((image) => image.approximations)
          ),
          ...(saved
            ? [
                snapshot.opened.sourceBacked
                  ? 'Source-backed saved composite may be stale; settings and visibility do not change these pixels.'
                  : 'Temporary saved preview: may be stale; replacing with a fresh layer render.'
              ]
            : []),
          ...(plan.kind === 'overview'
            ? ['Coarse preview uses integer point sampling; zoom in for strict source pixels.']
            : [])
        ]
      };
    };
    const available = () => {
      const overview = [...cache.entries()].find(([key]) => key.startsWith('overview:'))?.[1][0];
      const tiles = keys.flatMap((key) => {
        const levels = cache.get(key);
        if (!levels) {
          return [];
        }

        cache.delete(key);
        cache.set(key, levels);
        // Alternate resolutions remain eligible as resident fallbacks; only the requested level and a coarse
        // ancestor are uploaded. A camera change can therefore reuse prior coverage in its very first frame.
        return levels;
      });
      return [...(overview && !keys[0].startsWith('overview:') ? [overview] : []), ...tiles];
    };
    const present = () => {
      const tiles = available();
      if (tiles.length && !signal.aborted && previous === snapshot) {
        publish(frame(tiles));
      }
    };
    present();

    let batchStart: number | undefined;
    let batchTiles = 0;
    let requestMilliseconds = 0;
    let populatedTiles = 0;

    if (
      !snapshot.opened.sourceBacked &&
      (plan.kind === 'overview' || (snapshot.opened.windowed === true && info.width * info.height <= 16_777_216)) &&
      previewedDocument !== document &&
      snapshot.visibility.length === 0
    ) {
      previewedDocument = document;
      const previewStep =
        plan.kind === 'overview'
          ? plan.step
          : Math.max(1, Math.ceil(Math.sqrt((info.width * info.height) / 1_048_576)));
      const saved = await request(`saved:${previewStep}`, { kind: 'saved', step: previewStep });
      if (signal.aborted || previous !== snapshot) {
        return undefined;
      }

      if (saved.ok) {
        publish(frame([saved.value]));
      }
    }

    previewedDocument = document;
    const concurrency =
      (!snapshot.gpuComposite || compositor.unavailable(snapshot)) && plan.kind === 'regions' && client.prepareWindows
        ? await client.prepareWindows(
            document,
            snapshot.settings,
            snapshot.visibility,
            keys.filter((key) => !current(key, step)).length
          )
        : 1;
    let nextIndex = 0;
    let failed: Extract<PsdResultOf<DisplayTile>, { ok: false }> | undefined;
    const run = async () => {
      while (nextIndex < keys.length && !failed) {
        const index = nextIndex++;
        if (signal.aborted || previous !== snapshot) {
          return undefined;
        }

        const key = keys[index];
        if (current(key, step)) {
          continue;
        }

        // Deduplicate shared demand first. Different camera requests wait outside the worker queue and recheck
        // interest before posting. Ordinary cancellation cannot interrupt a synchronous WASM region call.
        while (flights.size >= concurrency && !pending.has(key)) {
          await Promise.race(flights);
          if (signal.aborted || previous !== snapshot) {
            return undefined;
          }
        }

        if (current(key, step)) {
          continue;
        }

        const core = plan.kind === 'regions' ? plan.tiles[index] : undefined;
        const result = await request(
          key,
          core
            ? { kind: 'regions', rectangles: [withBorder(core, info)], mipStep: maxMipStep }
            : { kind: 'overview', step: plan.step },
          core
        );
        if (signal.aborted || previous !== snapshot) {
          if (!canceledResults.has(result)) {
            canceledResults.add(result);
            viewerPerformance.record(
              'cancellation.salvagedTiles',
              performance.now(),
              result.ok && admitted.has(result.value) ? 1 : 0
            );
            viewerPerformance.record('cancellation.obsoleteBatchTiles', performance.now(), 1);
          }
          return undefined;
        }

        if (!result.ok) {
          failed = result;
          return;
        }

        present();
      }
    };
    await Promise.all(Array.from({ length: concurrency }, run));
    if (signal.aborted || previous !== snapshot) {
      return undefined;
    }
    if (failed) {
      return failed;
    }

    if (batchStart !== undefined) {
      client.reportWindowBatch?.({
        workers: concurrency,
        tiles: batchTiles,
        milliseconds: performance.now() - batchStart,
        requestMilliseconds,
        populated: populatedTiles
      });
    }
    viewerPerformance.record('coverage.tiles', start, keys.length);
    return { ok: true, value: frame(available()) };

    function request(key: string, window: Parameters<PsdClient['renderWindow']>[3], core?: PsdRegionRect) {
      const existing = pending.get(key);
      if (existing) {
        return existing.result;
      }

      const controller = new AbortController();
      // Reserve transferred raw bytes plus their entire mip chain before admitting the request.
      const reservation =
        window.kind === 'regions'
          ? Math.ceil(window.rectangles[0].width * window.rectangles[0].height * 4 * 1.34)
          : Math.ceil(info.width / window.step) * Math.ceil(info.height / window.step) * 4;
      reservedBytes += reservation;
      trim();
      if (window.kind === 'regions') {
        batchStart ??= performance.now();
      }
      const requestedAt = performance.now();
      let candidate: Awaited<ReturnType<typeof compositor.prepare>>;
      const prepare = async () => {
        if (snapshot.gpuComposite && window.kind === 'regions' && core) {
          candidate = await compositor.prepare(snapshot, window.rectangles[0], core, () => {
            for (const [cachedKey, levels] of cache) {
              if (levels.some((tile) => tile.gpu)) {
                remove(cachedKey);
              }
            }
            present();
          });
          if (candidate && !controller.signal.aborted && previous === snapshot) {
            remove(key);
            cache.set(key, [candidate.tile]);
            present();
            if (camera && visibleInCamera(core, camera)) {
              // Give resident compute its first frame before starting the authoritative background task.
              // Missing/failed backends must still make progress without a submission callback.
              await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, 50);
                void candidate!.submitted.then(() => {
                  clearTimeout(timeout);
                  resolve();
                });
              });
            }
          }
        }
      };
      const rendered =
        snapshot.gpuComposite && window.kind === 'regions' && core
          ? prepare().then(() =>
              client.renderWindow(document, snapshot.settings, snapshot.visibility, window, controller.signal)
            )
          : client.renderWindow(document, snapshot.settings, snapshot.visibility, window, controller.signal);
      const job = rendered
        .then((result) => {
          if (!result.ok) {
            if (result.error.kind !== 'superseded' && result.error.kind !== 'stale') {
              candidate?.tile.gpu?.onFailure(`Strict verification refused: ${result.error.message}`);
            }
            return result;
          }

          if (window.kind === 'regions') {
            batchTiles++;
            requestMilliseconds += performance.now() - requestedAt;
            populatedTiles += result.value.images[0].populated ? 1 : 0;
          }
          const { mips = [], ...image } = result.value.images[0];
          candidate?.strict(image);
          const clip = core ?? {
            left: image.left,
            top: image.top,
            width: Math.min(image.width * image.step, info.width - image.left),
            height: Math.min(image.height * image.step, info.height - image.top)
          };
          const arrival = { receivedAt: performance.now(), visible: !!camera && visibleInCamera(clip, camera) };
          const levels = [image, ...mips]
            .map(
              (image): DisplayTile => ({
                image,
                textureIdentity: image.step === 1 && candidate?.matches() ? candidate.tile.textureIdentity : undefined,
                contentTile: window.kind === 'regions',
                arrival,
                left: image.left,
                top: image.top,
                step: image.step,
                clip
              })
            )
            .sort((a, b) => b.step - a.step);
          if (
            !controller.signal.aborted &&
            pending.get(key)?.result === job &&
            (window.kind !== 'saved' || snapshot.opened.sourceBacked)
          ) {
            remove(key);
            cache.set(key, levels);
            admitted.add(levels.at(-1)!);
            if (arrival.visible && window.kind === 'regions') {
              arrivals.set(arrival, clip);
            }

            if (window.kind === 'overview') {
              overviewKey = key;
            }
            cacheBytes += levels.reduce((bytes, tile) => bytes + tile.image.pixels.byteLength, 0);
          }

          return { ok: true as const, value: levels.at(-1)! };
        })
        .finally(() => {
          reservedBytes -= reservation;
          if (pending.get(key)?.result === job) {
            pending.delete(key);
          }

          flights.delete(job);

          trim();
        });
      pending.set(key, {
        result: job,
        controller,
        saved: window.kind === 'saved',
        support:
          window.kind === 'regions' ? window.rectangles[0] : { left: 0, top: 0, width: info.width, height: info.height }
      });
      flights.add(job);
      return job;
    }
  }

  function current(key: string, step: number) {
    return cache.get(key)?.some((tile) => !tile.gpu && tile.step <= step);
  }

  function remove(key: string) {
    const arrival = cache.get(key)?.[0]?.arrival;
    if (arrival) {
      arrival.visible = false;
      arrivals.delete(arrival);
    }

    cacheBytes -= cache.get(key)?.reduce((bytes, tile) => bytes + tile.image.pixels.byteLength, 0) ?? 0;
    cache.delete(key);
  }

  function trim() {
    // Drop unneeded fine levels before coarse coverage. Visible requested levels and one overview are pinned.
    for (const [key, levels] of cache) {
      while (
        cacheBytes + reservedBytes > cacheLimitBytes() &&
        levels.length > 1 &&
        (!pinned.has(key) || levels.at(-1)!.step < lod)
      ) {
        cacheBytes -= levels.pop()!.image.pixels.byteLength;
      }
    }

    for (const key of cache.keys()) {
      if (cacheBytes + reservedBytes <= cacheLimitBytes()) {
        break;
      }

      if (!pinned.has(key) && key !== overviewKey) {
        remove(key);
      }
    }

    viewerPerformance.record('tiles.cpu.bytes', performance.now(), cacheBytes + reservedBytes + uploadReserveBytes);
    viewerPerformance.record('tiles.cpu.upload.reserve.bytes', performance.now(), uploadReserveBytes);
    viewerPerformance.record('tiles.cpu.pending.bytes', performance.now(), reservedBytes);
  }

  function clear() {
    for (const job of pending.values()) {
      job.controller.abort();
    }
    cache.clear();
    compositor.clear();
    pending.clear();
    arrivals.clear();
    cacheBytes = 0;
    previous = undefined;
    pinned.clear();
    lod = 1;
  }

  return { render, clear, cacheBytes: () => cacheBytes + reservedBytes };
}

/** Identity changes for content settings/fonts/visibility, while pan and zoom retain the same snapshot. */
export type WindowSnapshot = {
  /** Supplied-font context revision, included in every operand and verification identity. */
  revision?: number;
  opened: OpenedPsd;
  settings: PsdRenderSettings;
  visibility: [number, boolean][];
  gpuComposite?: boolean;
};

/** Keeps the current power-of-two LOD within a 20% dead band; physical pixel scale includes DPR. */
export function chooseLod(scale: number, previous = 1): number {
  let step = previous;
  while (step < maxMipStep && scale * step < 0.4) {
    step *= 2;
  }

  while (step > 1 && scale * step > 1.2) {
    step /= 2;
  }

  return step;
}

/** Plans source coverage with visible holes first, then center refinement, then the small prefetch ring. */
export function planWindow(
  document: { width: number; height: number },
  view: View,
  viewport: { width: number; height: number },
  budgetBytes = 64 * 1024 * 1024,
  sourceTiles = false
):
  | { kind: 'overview'; step: number }
  | { kind: 'regions'; step: number; rectangle: PsdRegionRect; tiles: PsdRegionRect[] }
  | undefined {
  if (!viewport.width || !viewport.height) {
    return undefined;
  }

  const step = Math.max(1, Math.floor(1 / view.scale));
  if (
    !sourceTiles &&
    view.scale < 1 &&
    Math.ceil(document.width / step) * Math.ceil(document.height / step) <= 2_097_152
  ) {
    return { kind: 'overview', step };
  }

  const left = Math.max(0, Math.floor((-view.x - 96) / view.scale));
  const top = Math.max(0, Math.floor((-view.y - 96) / view.scale));
  const right = Math.min(document.width, Math.ceil((viewport.width - view.x + 96) / view.scale));
  const bottom = Math.min(document.height, Math.ceil((viewport.height - view.y + 96) / view.scale));
  if (right <= left || bottom <= top) {
    return undefined;
  }

  const count =
    (Math.ceil(right / tileEdge) - Math.floor(left / tileEdge)) *
    (Math.ceil(bottom / tileEdge) - Math.floor(top / tileEdge));
  const coarseBytes = (count * (tileEdge + 2 * maxMipStep) ** 2 * 4 * 1.34) / maxMipStep ** 2;
  if (coarseBytes > Math.max(1, budgetBytes - 10 * 1024 * 1024)) {
    // Never pin more source coverage than can coexist, even at the coarsest supported region LOD.
    // Keep the native point-sampling limitation explicit rather than allocating an unbounded pyramid.
    let step = Math.max(1, Math.ceil(Math.sqrt((document.width * document.height) / 2_097_152)));
    while (Math.ceil(document.width / step) * Math.ceil(document.height / step) > 2_097_152) {
      step++;
    }

    return { kind: 'overview', step };
  }

  const tiles: PsdRegionRect[] = [];
  const center = { x: (viewport.width / 2 - view.x) / view.scale, y: (viewport.height / 2 - view.y) / view.scale };
  const priority = (tile: PsdRegionRect) => {
    const visible =
      tile.left * view.scale + view.x < viewport.width &&
      (tile.left + tile.width) * view.scale + view.x > 0 &&
      tile.top * view.scale + view.y < viewport.height &&
      (tile.top + tile.height) * view.scale + view.y > 0;
    return (
      (visible ? 0 : 1e15) + (tile.left + tile.width / 2 - center.x) ** 2 + (tile.top + tile.height / 2 - center.y) ** 2
    );
  };
  for (let y = Math.floor(top / tileEdge) * tileEdge; y < bottom; y += tileEdge) {
    for (let x = Math.floor(left / tileEdge) * tileEdge; x < right; x += tileEdge) {
      tiles.push({
        left: x,
        top: y,
        width: Math.min(tileEdge, document.width - x),
        height: Math.min(tileEdge, document.height - y)
      });
    }
  }

  tiles.sort((a, b) => priority(a) - priority(b));
  const sampling = Math.max(step, Math.ceil(Math.sqrt(((right - left) * (bottom - top)) / 4_194_304)));
  return {
    kind: 'regions',
    step: sampling,
    rectangle: { left, top, width: right - left, height: bottom - top },
    tiles
  };
}

function tileKey(rectangle: Pick<PsdRegionRect, 'left' | 'top'>): string {
  return `${rectangle.left}:${rectangle.top}`;
}

/** A full filter footprint on each side keeps every mip aligned to the document's source grid. */
function withBorder(rectangle: PsdRegionRect, size: { width: number; height: number }): PsdRegionRect {
  const left = Math.max(0, rectangle.left - maxMipStep);
  const top = Math.max(0, rectangle.top - maxMipStep);
  return {
    left,
    top,
    width: Math.min(size.width, rectangle.left + rectangle.width + maxMipStep) - left,
    height: Math.min(size.height, rectangle.top + rectangle.height + maxMipStep) - top
  };
}

/** Visibility changes use compositing influence, including group children; unknown style extents invalidate globally. */
function visibilityDamage(before: WindowSnapshot, after: WindowSnapshot): PsdRegionRect[] | undefined {
  if (
    before.opened !== after.opened ||
    before.revision !== after.revision ||
    before.settings !== after.settings ||
    before.gpuComposite !== after.gpuComposite
  ) {
    return undefined;
  }

  const old = new Map(before.visibility);
  const next = new Map(after.visibility);
  const changed = new Set([...old.keys(), ...next.keys()].filter((index) => old.get(index) !== next.get(index)));
  const damage: PsdRegionRect[] = [];
  const whole = { left: 0, top: 0, width: after.opened.info.width, height: after.opened.info.height };
  const unbounded = (node: PsdLayerNode) =>
    node.kind === 'adjustment' ||
    node.kind === 'fill' ||
    node.kind === 'shape' ||
    !!node.vectorMask ||
    !!node.effects?.some((effect) => effect.enabled) ||
    (node.kind === 'text' && after.settings.typeLayers) ||
    (node.kind === 'smartObject' && after.settings.smartObjects !== null);
  const influence = (node: PsdLayerNode): PsdRegionRect[] => {
    if (unbounded(node)) {
      return [whole];
    }

    if (node.kind === 'group') {
      return (node.children ?? []).flatMap(influence);
    }

    const { left, top, right, bottom } = node.bounds;
    return [{ left, top, width: right - left, height: bottom - top }];
  };
  const visit = (nodes: readonly PsdLayerNode[], unsafe = false) => {
    for (const node of nodes) {
      if (changed.delete(node.index)) {
        damage.push(...(unsafe ? [whole] : influence(node)));
      }

      visit(node.children ?? [], unsafe || unbounded(node));
    }
  };
  visit(after.opened.layers ?? []);
  return changed.size ? undefined : damage;
}

function intersects(a: PsdRegionRect, b: PsdRegionRect) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

const tileEdge = 512;
const maxMipStep = 16;

/** Receipt interest ends when the camera leaves its drawing rectangle, before its first requested presentation. */
function visibleInCamera(clip: PsdRegionRect, camera: { view: View; size: { width: number; height: number } }) {
  const { view, size } = camera;
  return (
    clip.left * view.scale + view.x < size.width &&
    (clip.left + clip.width) * view.scale + view.x > 0 &&
    clip.top * view.scale + view.y < size.height &&
    (clip.top + clip.height) * view.scale + view.y > 0
  );
}
