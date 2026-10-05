import type { DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { Layer } from '@app-game/paint-core/document';
import { mergeTilePixels } from '@app-game/paint-core/layerMerge';
import { areaTiles, type FillArea } from './floodFill';

/**
 * The whole-pixel area that an edit at `point`, such as a fill or a magic wand, examines: `view` around `point`, at
 * most `maxSide` per side; `undefined` when `point` lies outside `view`. The canvas has no edges, so the view bounds
 * what similar colors may reach.
 */
export function areaAround(view: ViewArea, point: { x: number; y: number }, maxSide: number): FillArea | undefined {
  const left = Math.max(Math.floor(view.left), point.x - maxSide / 2);
  const top = Math.max(Math.floor(view.top), point.y - maxSide / 2);
  const right = Math.min(Math.ceil(view.left + view.width), left + maxSide);
  const bottom = Math.min(Math.ceil(view.top + view.height), top + maxSide);
  if (point.x < left || point.y < top || point.x >= right || point.y >= bottom) {
    return undefined;
  }

  return { left, top, width: right - left, height: bottom - top };
}

/** The view's bounds in document pixels. */
export type ViewArea = { left: number; top: number; width: number; height: number };

/**
 * Whether `mask`, made within `area`, touches a side where the side limit of {@link areaAround}, not the view, cut the
 * area, so the region would have continued past it.
 */
export function reachesLimit(mask: Uint8Array, area: FillArea, view: ViewArea): boolean {
  const { left, top, width, height } = area;
  const touches = (fromX: number, fromY: number, stepX: number, stepY: number, length: number) => {
    for (let i = 0; i < length; i++) {
      if (mask[(fromY + i * stepY) * width + fromX + i * stepX]) {
        return true;
      }
    }

    return false;
  };

  return (
    (left > Math.floor(view.left) && touches(0, 0, 0, 1, height)) ||
    (top > Math.floor(view.top) && touches(0, 0, 1, 0, width)) ||
    (left + width < Math.ceil(view.left + view.width) && touches(width - 1, 0, 0, 1, height)) ||
    (top + height < Math.ceil(view.top + view.height) && touches(0, height - 1, 1, 0, width))
  );
}

/**
 * Unpacked tiles of the area: the active layer's (`layer`), or the visible layers composited bottom to top as
 * displayed (`all`), with clipped layers clipped to their base, in linear light when the document blends so.
 */
export async function sampleArea(
  context: Pick<DocumentEditContext, 'layers' | 'active' | 'readTile' | 'linearBlending'>,
  area: FillArea,
  source: 'layer' | 'all'
): Promise<Map<string, Uint8Array>> {
  const tiles = new Map<string, Uint8Array>();
  const read = async (layer: Layer, key: string) => {
    const stored = layer.tiles.get(key);
    return stored && (await context.readTile(stored));
  };
  for (const key of areaTiles(area)) {
    if (source === 'layer') {
      const pixels = await read(context.active, key);
      if (pixels) {
        tiles.set(key, pixels);
      }

      continue;
    }

    let composite: Uint8Array | undefined;
    /** The clipping base of the layers that follow, as for the display; `hidden` hides them. */
    let base: { pixels: Uint8Array | undefined } | 'hidden' | undefined;
    for (const layer of context.layers) {
      const clipped = !!layer.clipping && base !== undefined;
      const shown = layer.visible && layer.opacity > 0;
      if (!clipped) {
        base = shown ? { pixels: await read(layer, key) } : 'hidden';
      }

      if (!shown || base === 'hidden') {
        continue;
      }

      const pixels = clipped ? await read(layer, key) : base!.pixels;
      if (pixels) {
        composite = mergeTilePixels(
          composite,
          pixels,
          layer.blend,
          layer.opacity,
          clipped ? { base: base!.pixels } : undefined,
          context.linearBlending
        );
      }
    }

    if (composite) {
      tiles.set(key, composite);
    }
  }

  return tiles;
}
