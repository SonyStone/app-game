import type { PsdLayerNode, PsdRegionPixels, PsdRegionRect, PsdRenderSettings } from '@app-game/psd/viewer';
import { displayTileLevels, type DisplayTile } from '../gpu-viewport/displayTiles';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';
import { viewerPerformance } from '../telemetry/performance';
import type { View } from './view';

/**
 * Owns a byte-accounted source/mip LRU independently of camera interest. One native tile runs at a time;
 * an obsolete camera can waste at most that tile, whose valid pixels are salvaged for later demand.
 * Visibility edits retain provably unaffected coverage. Settings, fonts and document changes invalidate all pixels.
 * The CPU budget defaults to 64 MiB and must be at least 16 MiB; pending transfers and every mip level count.
 */
export function makeWindowRenderer(client: Pick<PsdClient, 'renderWindow'>, budgetBytes = 64 * 1024 * 1024) {
  if (!Number.isFinite(budgetBytes) || budgetBytes < 16 * 1024 * 1024) {
    throw new RangeError('CPU tile residency requires at least 16 MiB, including pending transfers.');
  }

  // A display upload may still retain one source buffer after LRU eviction, until the next frame reconciles tiles.
  // Its 544-square RGBA source is below 2 MiB. Reserve that headroom rather than hiding it outside CPU accounting.
  const uploadReserveBytes = 2 * 1024 * 1024;
  const cacheLimitBytes = budgetBytes - uploadReserveBytes;
  const cache = new Map<string, DisplayTile[]>();
  const pending = new Map<string, Promise<PsdResultOf<DisplayTile>>>();
  let flight: Promise<unknown> | undefined;
  let cacheBytes = 0;
  let reservedBytes = 0;
  let previous: WindowSnapshot | undefined;
  let lifetime = new AbortController();
  let previewedDocument: number | undefined;
  let nextRender = 0;
  let lod = 1;
  let pinned = new Set<string>();
  let overviewKey: string | undefined;

  async function render(
    snapshot: WindowSnapshot,
    view: View,
    size: { width: number; height: number; dpr?: number },
    signal: AbortSignal,
    publish: (image: RenderedPixels) => void
  ): Promise<PsdResultOf<RenderedPixels> | undefined> {
    if (previous !== snapshot) {
      const affected = previous && visibilityDamage(previous, snapshot);
      lifetime.abort();
      lifetime = new AbortController();
      pending.clear();
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

    lod = chooseLod(view.scale * (size.dpr ?? 1), lod);
    const plan = planWindow(snapshot.opened.info, view, size);
    if (!plan || signal.aborted) {
      return undefined;
    }

    if (plan.kind === 'regions') {
      const minimum = Math.sqrt(
        (plan.tiles.length * (tileEdge + 32) ** 2 * 4 * 1.34) / Math.max(1, budgetBytes - 10 * 1024 * 1024)
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
          coarse: completed < keys.length || plan.kind === 'overview'
        },
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
              .every((tile) => (tile.image as PsdRegionPixels).exactToLayerRender)
        },
        approximations: [
          ...new Set(
            images
              .filter((image) => plan.kind === 'overview' || image.step <= step)
              .flatMap((image) => image.approximations)
          ),
          ...(saved ? ['Temporary saved preview: may be stale; replacing with a fresh layer render.'] : []),
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

    if (plan.kind === 'overview' && previewedDocument !== document && snapshot.visibility.length === 0) {
      previewedDocument = document;
      const saved = await request(`saved:${plan.step}`, { kind: 'saved', step: plan.step });
      if (signal.aborted || previous !== snapshot) {
        return undefined;
      }

      if (saved.ok) {
        publish(frame([saved.value]));
      }
    }

    previewedDocument = document;
    for (let index = 0; index < keys.length; index++) {
      if (signal.aborted || previous !== snapshot) {
        return undefined;
      }

      const key = keys[index];
      if (current(key, step)) {
        continue;
      }

      // Deduplicate shared demand first. Different camera requests wait outside the worker queue and recheck
      // interest before posting. Ordinary cancellation cannot interrupt a synchronous WASM region call.
      while (flight && !pending.has(key)) {
        await flight;
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
        viewerPerformance.record('cancellation.salvagedTiles', performance.now(), result.ok ? 1 : 0);
        viewerPerformance.record('cancellation.obsoleteBatchTiles', performance.now(), 1);
        return undefined;
      }

      if (!result.ok) {
        return result;
      }

      present();
    }

    viewerPerformance.record('coverage.tiles', start, keys.length);
    return { ok: true, value: frame(available()) };

    function request(key: string, window: Parameters<PsdClient['renderWindow']>[3], core?: PsdRegionRect) {
      const existing = pending.get(key);
      if (existing) {
        return existing;
      }

      const controller = lifetime;
      // Reserve transferred raw bytes plus their entire mip chain before admitting the request.
      const reservation =
        window.kind === 'regions'
          ? Math.ceil(window.rectangles[0].width * window.rectangles[0].height * 4 * 1.34)
          : Math.ceil(info.width / window.step) * Math.ceil(info.height / window.step) * 4;
      reservedBytes += reservation;
      trim();
      const job = client
        .renderWindow(document, snapshot.settings, snapshot.visibility, window, controller.signal)
        .then((result) => {
          if (!result.ok) {
            return result;
          }

          const { mips = [], ...image } = result.value.images[0];
          const clip = core ?? {
            left: image.left,
            top: image.top,
            width: Math.min(image.width * image.step, info.width - image.left),
            height: Math.min(image.height * image.step, info.height - image.top)
          };
          const levels = [image, ...mips]
            .map(
              (image): DisplayTile => ({
                image,
                left: image.left,
                top: image.top,
                step: image.step,
                clip
              })
            )
            .sort((a, b) => b.step - a.step);
          if (!controller.signal.aborted && previous === snapshot && window.kind !== 'saved') {
            remove(key);
            cache.set(key, levels);
            if (window.kind === 'overview') {
              overviewKey = key;
            }
            cacheBytes += levels.reduce((bytes, tile) => bytes + tile.image.pixels.byteLength, 0);
          }

          return { ok: true as const, value: levels.at(-1)! };
        })
        .finally(() => {
          reservedBytes -= reservation;
          if (pending.get(key) === job) {
            pending.delete(key);
          }

          if (flight === job) {
            flight = undefined;
          }

          trim();
        });
      pending.set(key, job);
      flight = job;
      return job;
    }
  }

  function current(key: string, step: number) {
    return cache.get(key)?.some((tile) => tile.step <= step);
  }

  function remove(key: string) {
    cacheBytes -= cache.get(key)?.reduce((bytes, tile) => bytes + tile.image.pixels.byteLength, 0) ?? 0;
    cache.delete(key);
  }

  function trim() {
    // Drop unneeded fine levels before coarse coverage. Visible requested levels and one overview are pinned.
    for (const [key, levels] of cache) {
      while (
        cacheBytes + reservedBytes > cacheLimitBytes &&
        levels.length > 1 &&
        (!pinned.has(key) || levels.at(-1)!.step < lod)
      ) {
        cacheBytes -= levels.pop()!.image.pixels.byteLength;
      }
    }

    for (const key of cache.keys()) {
      if (cacheBytes + reservedBytes <= cacheLimitBytes) {
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
    lifetime.abort();
    lifetime = new AbortController();
    cache.clear();
    pending.clear();
    cacheBytes = 0;
    previous = undefined;
    pinned.clear();
    lod = 1;
  }

  return { render, clear, cacheBytes: () => cacheBytes + reservedBytes };
}

/** Identity changes for content settings/fonts/visibility, while pan and zoom retain the same snapshot. */
export type WindowSnapshot = { opened: OpenedPsd; settings: PsdRenderSettings; visibility: [number, boolean][] };

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
  viewport: { width: number; height: number }
):
  | { kind: 'overview'; step: number }
  | { kind: 'regions'; step: number; rectangle: PsdRegionRect; tiles: PsdRegionRect[] }
  | undefined {
  if (!viewport.width || !viewport.height) {
    return undefined;
  }

  const step = Math.max(1, Math.floor(1 / view.scale));
  if (view.scale < 1 && Math.ceil(document.width / step) * Math.ceil(document.height / step) <= 2_097_152) {
    return { kind: 'overview', step };
  }

  const left = Math.max(0, Math.floor((-view.x - 96) / view.scale));
  const top = Math.max(0, Math.floor((-view.y - 96) / view.scale));
  const right = Math.min(document.width, Math.ceil((viewport.width - view.x + 96) / view.scale));
  const bottom = Math.min(document.height, Math.ceil((viewport.height - view.y + 96) / view.scale));
  if (right <= left || bottom <= top) {
    return undefined;
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
  if (before.opened !== after.opened || before.settings !== after.settings) {
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
