import type { PsdRegionPixels, PsdRegionRect, PsdRenderSettings } from '@app-game/psd/viewer';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';
import { windowWorkPixels } from '../psd-worker/protocol';
import type { View } from './view';

/**
 * A byte-limited LRU of fresh tiles and overviews for one document/settings/visibility/font snapshot. Requests run
 * in small batches, checking cancellation between calls. A saved preview is offered only on the first request for a
 * document, never cached, and the caller must replace it with the returned fresh result, including on failure.
 */
export function makeWindowRenderer(client: Pick<PsdClient, 'renderWindow'>) {
  const cache = new Map<string, PsdRegionPixels>();
  let cacheBytes = 0;
  let previous: WindowSnapshot | undefined;
  let previewSnapshot: WindowSnapshot | undefined;
  let previewedDocument: number | undefined;
  let nextRender = 0;

  async function render(
    snapshot: WindowSnapshot,
    view: View,
    size: { width: number; height: number },
    signal: AbortSignal,
    preview: (image: RenderedPixels) => void
  ): Promise<PsdResultOf<RenderedPixels> | undefined> {
    if (previous !== snapshot) {
      const firstDocumentRequest = previous?.opened.document !== snapshot.opened.document;
      clear();
      previewSnapshot = firstDocumentRequest ? snapshot : undefined;
      previous = snapshot;
    }

    const plan = planWindow(snapshot.opened.info, view, size);
    if (!plan || signal.aborted) {
      return undefined;
    }

    const start = performance.now();
    const { document, info } = snapshot.opened;
    const request = (window: Parameters<PsdClient['renderWindow']>[3]) =>
      client.renderWindow(document, snapshot.settings, snapshot.visibility, window, signal);
    const frame = (image: PsdRegionPixels): RenderedPixels => ({
      ...image,
      depth: info.depth as RenderedPixels['depth'],
      render: ++nextRender,
      milliseconds: performance.now() - start,
      window: {
        left: image.left,
        top: image.top,
        step: image.step,
        source: image.source,
        strategy: image.strategy,
        exactToLayerRender: image.exactToLayerRender
      },
      approximations: image.exactToLayerRender
        ? image.approximations
        : [...image.approximations, 'Temporary saved preview: may be stale; replacing with a fresh layer render.']
    });

    if (plan.kind === 'overview') {
      const key = `overview:${plan.step}`;
      const cached = get(key);
      if (cached) {
        return { ok: true, value: frame(cached) };
      }

      if (previewSnapshot === snapshot && previewedDocument !== document) {
        const saved = await request({ kind: 'saved', step: plan.step });
        if (signal.aborted) {
          return undefined;
        }

        previewedDocument = document;
        if (saved.ok) {
          preview(frame(saved.value.images[0]));
        }
      }

      const fresh = await request({ kind: 'overview', step: plan.step });
      if (signal.aborted) {
        return undefined;
      }

      if (!fresh.ok) {
        return fresh;
      }

      const image = fresh.value.images[0];
      put(key, image);
      return { ok: true, value: frame(image) };
    }

    previewedDocument = document;
    // Region calls return full-resolution pixels. Assemble only the visible sampled surface, releasing each batch
    // after copying it; even at intermediate zooms, neither the surface nor the LRU grows with document area.
    const image: PsdRegionPixels = {
      ...plan.rectangle,
      width: Math.ceil(plan.rectangle.width / plan.step),
      height: Math.ceil(plan.rectangle.height / plan.step),
      pixels: new Uint8Array(
        Math.ceil(plan.rectangle.width / plan.step) * Math.ceil(plan.rectangle.height / plan.step) * 4
      ),
      step: plan.step,
      strategy: 'window',
      source: 'layers',
      exactToLayerRender: true,
      approximations: []
    };
    const approximations = new Set<string>();
    const copy = (tile: PsdRegionPixels) => {
      copySamples(tile, image);
      tile.approximations.forEach((text) => approximations.add(text));
      if (tile.strategy === 'fullCanvas') {
        image.strategy = 'fullCanvas';
      }

      image.exactToLayerRender &&= tile.exactToLayerRender;
    };
    const missing: PsdRegionRect[] = [];
    for (const rectangle of plan.tiles) {
      const tile = get(tileKey(rectangle));
      if (tile) {
        copy(tile);
      } else {
        missing.push(rectangle);
      }
    }

    for (let index = 0; index < missing.length; index += 4) {
      if (signal.aborted) {
        return undefined;
      }

      const result = await request({ kind: 'regions', rectangles: missing.slice(index, index + 4) });
      if (signal.aborted) {
        return undefined;
      }

      if (!result.ok) {
        return result;
      }

      for (const tile of result.value.images) {
        copy(tile);
        put(tileKey(tile), tile);
      }
    }

    image.approximations = [...approximations];
    return { ok: true, value: frame(image) };
  }

  function get(key: string) {
    const image = cache.get(key);
    if (image) {
      cache.delete(key);
      cache.set(key, image);
    }

    return image;
  }

  function put(key: string, image: PsdRegionPixels) {
    cacheBytes -= cache.get(key)?.pixels.byteLength ?? 0;
    cache.delete(key);
    cache.set(key, image);
    cacheBytes += image.pixels.byteLength;
    while (cacheBytes > cacheLimitBytes) {
      const oldest = cache.keys().next().value!;
      cacheBytes -= cache.get(oldest)!.pixels.byteLength;
      cache.delete(oldest);
    }
  }

  function clear() {
    cache.clear();
    cacheBytes = 0;
    previous = undefined;
  }

  return { render, clear, cacheBytes: () => cacheBytes };
}

/** Identity changes when any rendering input changes, including fonts; pan and zoom retain the same snapshot. */
export type WindowSnapshot = { opened: OpenedPsd; settings: PsdRenderSettings; visibility: [number, boolean][] };

/**
 * Uses an integer overview stride near one sample per CSS pixel when its total output fits two million pixels.
 * Otherwise requests 512-pixel tiles covering the viewport plus 96 CSS pixels. The assembled surface is sampled at
 * that stride and limited to four million pixels, including on unusually large displays.
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

/** Copies exact document-space samples, including strides that do not divide tile edges. */
function copySamples(tile: PsdRegionPixels, output: PsdRegionPixels) {
  const x0 = Math.max(0, Math.ceil((tile.left - output.left) / output.step));
  const y0 = Math.max(0, Math.ceil((tile.top - output.top) / output.step));
  const x1 = Math.min(output.width, Math.ceil((tile.left + tile.width - output.left) / output.step));
  const y1 = Math.min(output.height, Math.ceil((tile.top + tile.height - output.top) / output.step));
  for (let y = y0; y < y1; y++) {
    if (output.step === 1) {
      const source = ((output.top + y - tile.top) * tile.width + output.left + x0 - tile.left) * 4;
      output.pixels.set(tile.pixels.subarray(source, source + (x1 - x0) * 4), (y * output.width + x0) * 4);
      continue;
    }

    for (let x = x0; x < x1; x++) {
      const source =
        ((output.top + y * output.step - tile.top) * tile.width + output.left + x * output.step - tile.left) * 4;
      const target = (y * output.width + x) * 4;
      output.pixels.set(tile.pixels.subarray(source, source + 4), target);
    }
  }
}

function tileKey(rectangle: Pick<PsdRegionRect, 'left' | 'top'>): string {
  return `${rectangle.left}:${rectangle.top}`;
}

const tileEdge = 512;
const cacheLimitBytes = 32 * 1024 * 1024;
