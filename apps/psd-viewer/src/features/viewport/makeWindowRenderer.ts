import type { PsdRegionPixels, PsdRegionRect, PsdRenderSettings } from '@app-game/psd/viewer';
import type { DisplayTile } from '../gpu-viewport/displayTiles';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';
import { windowWorkPixels } from '../psd-worker/protocol';
import { viewerPerformance } from '../telemetry/performance';
import type { View } from './view';

/**
 * Retains transferred source tiles, never assembling a viewport-sized CPU image. Camera cancellation changes
 * interest only: an in-flight single tile is salvaged and shared by later demand for the same content snapshot.
 * Semantic changes abort old requests and invalidate the bounded 32 MiB LRU. Each completed tile is published.
 */
export function makeWindowRenderer(client: Pick<PsdClient, 'renderWindow'>) {
  const cache = new Map<string, DisplayTile>();
  const pending = new Map<string, Promise<PsdResultOf<DisplayTile>>>();
  let cacheBytes = 0;
  let previous: WindowSnapshot | undefined;
  let lifetime = new AbortController();
  let previewedDocument: number | undefined;
  let nextRender = 0;

  async function render(
    snapshot: WindowSnapshot,
    view: View,
    size: { width: number; height: number },
    signal: AbortSignal,
    publish: (image: RenderedPixels) => void
  ): Promise<PsdResultOf<RenderedPixels> | undefined> {
    if (previous !== snapshot) {
      clear();
      previous = snapshot;
    }

    const plan = planWindow(snapshot.opened.info, view, size);
    if (!plan || signal.aborted) {
      return undefined;
    }

    const start = performance.now();
    const { document, info } = snapshot.opened;
    const keys = plan.kind === 'overview' ? [`overview:${plan.step}`] : plan.tiles.map(tileKey);
    const frame = (tiles: DisplayTile[]): RenderedPixels => {
      const images = tiles.map((tile) => tile.image as PsdRegionPixels);
      const saved = images.some((image) => image.source === 'savedComposite');
      return {
        width: info.width,
        height: info.height,
        pixels: new Uint8Array(0),
        tiles,
        depth: info.depth as RenderedPixels['depth'],
        render: ++nextRender,
        milliseconds: performance.now() - start,
        window: {
          left: 0,
          top: 0,
          step: plan.step,
          source: saved ? 'savedComposite' : 'layers',
          strategy: images.some((image) => image.strategy === 'fullCanvas') ? 'fullCanvas' : 'window',
          exactToLayerRender: !saved && images.every((image) => image.exactToLayerRender)
        },
        approximations: [
          ...new Set(images.flatMap((image) => image.approximations)),
          ...(saved ? ['Temporary saved preview: may be stale; replacing with a fresh layer render.'] : []),
          ...(plan.kind === 'overview'
            ? ['Coarse preview uses integer point sampling; zoom in for strict source pixels.']
            : [])
        ]
      };
    };
    const available = () => {
      const overview =
        plan.kind === 'regions' ? [...cache.entries()].find(([key]) => key.startsWith('overview:'))?.[1] : undefined;
      return [
        ...(overview ? [overview] : []),
        ...keys.flatMap((key) => {
          const tile = get(key);
          return tile ? [tile] : [];
        })
      ];
    };
    const present = () => {
      const tiles = available();
      if (tiles.length && !signal.aborted && previous === snapshot) {
        publish(frame(tiles));
      }
    };
    present();

    if (plan.kind === 'overview' && previewedDocument !== document) {
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
      if (get(key)) {
        continue;
      }

      const core = plan.kind === 'regions' ? plan.tiles[index] : undefined;
      const result = await request(
        key,
        core ? { kind: 'regions', rectangles: [withBorder(core, info)] } : { kind: 'overview', step: plan.step },
        core
      );
      if (signal.aborted || previous !== snapshot) {
        viewerPerformance.record('cancellation.salvagedTiles', performance.now(), result.ok ? 1 : 0);
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
      const job = client
        .renderWindow(document, snapshot.settings, snapshot.visibility, window, controller.signal)
        .then((result) => {
          if (!result.ok) {
            return result;
          }

          const image = result.value.images[0];
          const tile: DisplayTile = {
            image,
            left: image.left,
            top: image.top,
            step: image.step,
            clip: core ?? {
              left: image.left,
              top: image.top,
              width: image.width * image.step,
              height: image.height * image.step
            }
          };
          if (!controller.signal.aborted && previous === snapshot && window.kind !== 'saved') {
            put(key, tile);
          }

          return { ok: true as const, value: tile };
        })
        .finally(() => {
          if (pending.get(key) === job) {
            pending.delete(key);
          }
        });
      pending.set(key, job);
      return job;
    }
  }

  function get(key: string) {
    const tile = cache.get(key);
    if (tile) {
      cache.delete(key);
      cache.set(key, tile);
    }

    return tile;
  }

  function put(key: string, tile: DisplayTile) {
    cacheBytes -= cache.get(key)?.image.pixels.byteLength ?? 0;
    cache.delete(key);
    cache.set(key, tile);
    cacheBytes += tile.image.pixels.byteLength;
    while (cacheBytes > cacheLimitBytes) {
      const oldest = cache.keys().next().value!;
      cacheBytes -= cache.get(oldest)!.image.pixels.byteLength;
      cache.delete(oldest);
    }

    viewerPerformance.record('tiles.cpu.bytes', performance.now(), cacheBytes);
  }

  function clear() {
    lifetime.abort();
    lifetime = new AbortController();
    cache.clear();
    pending.clear();
    cacheBytes = 0;
    previous = undefined;
  }

  return { render, clear, cacheBytes: () => cacheBytes };
}

/** Identity changes when any rendering input changes, including fonts; pan and zoom retain the same snapshot. */
export type WindowSnapshot = { opened: OpenedPsd; settings: PsdRenderSettings; visibility: [number, boolean][] };

/**
 * Uses an integer overview stride near one sample per CSS pixel when its total output fits two million pixels.
 * Otherwise requests 512-pixel source tiles covering the viewport plus 96 CSS pixels. Regions retain full-resolution
 * bytes with a one-texel filtering border; the display handles scaling without an assembled surface.
 */
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

  let sampling = Math.max(step, Math.ceil(Math.sqrt(((right - left) * (bottom - top)) / windowWorkPixels)));
  while (Math.ceil((right - left) / sampling) * Math.ceil((bottom - top) / sampling) > windowWorkPixels) {
    sampling++;
  }

  const tiles: PsdRegionRect[] = [];
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

/** Expands source support without overlapping the drawing rectangles. */
function withBorder(rectangle: PsdRegionRect, size: { width: number; height: number }): PsdRegionRect {
  const left = Math.max(0, rectangle.left - 1);
  const top = Math.max(0, rectangle.top - 1);
  return {
    left,
    top,
    width: Math.min(size.width, rectangle.left + rectangle.width + 1) - left,
    height: Math.min(size.height, rectangle.top + rectangle.height + 1) - top
  };
}

const tileEdge = 512;
const cacheLimitBytes = 32 * 1024 * 1024;
