import { defineDocumentEdit, type DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { Layer, TileChange } from '@app-game/paint-core/document';
import { mergeTilePixels } from '@app-game/paint-core/layerMerge';
import { z } from 'zod';
import { areaTiles, expandMask, fillTile, floodMask, type FillArea } from './floodFill';

/**
 * The engine half of the bucket fill: fills the connected area around a point of similar color with a color, in the
 * active layer, as one undo step. Which pixels are similar is decided on the active layer or on all visible layers
 * composited, within the given area of the view, since the canvas has no edges. At most {@link maxFillSide} pixels
 * around the point on each side are examined: a fill that would continue past that limit inside the view is refused
 * rather than cut off. Runs in the drawing engine's realm.
 */
export const fillEdit = defineDocumentEdit({
  id: 'fill',
  parse: (input: unknown) => fillCommandSchema.parse(input),
  async run(context, command) {
    if (!context.active.visible) {
      throw new Error('Show the active layer before filling it.');
    }

    const point = { x: Math.floor(command.point.x), y: Math.floor(command.point.y) };
    const area = fillArea(command.area, point);
    if (!area) {
      return { changes: [] };
    }

    const sampled = await sampleTiles(context, area, command.source);
    const flooded = floodMask(area, sampled, point, command.tolerance);
    if (reachesLimit(flooded, area, command.area)) {
      throw new Error('This area is too large to fill at this zoom. Zoom in and try again.');
    }

    const mask = expandMask(flooded, area.width, area.height, command.expand);
    const color = parseColor(command.color);
    const changes: TileChange[] = [];
    for (const key of areaTiles(area)) {
      const before = context.active.tiles.get(key);
      const after = fillTile(
        key,
        before && (await context.readTile(before)),
        mask,
        area,
        color,
        command.opacity,
        context.active.alphaLock
      );
      if (after) {
        changes.push({ layerId: context.active.id, key, before, after });
      }
    }

    return { changes };
  }
});

/** A fill at `point` in document pixels within `area`, the view's bounds in document pixels. */
export type FillCommand = z.infer<typeof fillCommandSchema>;

/** Longest side of the area a fill examines around its point. */
export const maxFillSide = 4096;

const fillCommandSchema = z.object({
  point: z.object({ x: z.number().finite(), y: z.number().finite() }),
  area: z.object({
    left: z.number().finite(),
    top: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative()
  }),
  /** `#rrggbb` */
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  opacity: z.number().min(0).max(1),
  /** Largest per-channel difference from the clicked pixel that still counts as the same color, 0–255. */
  tolerance: z.number().int().min(0).max(255),
  /** Pixels the filled area grows by, to reach under antialiased line edges. */
  expand: z.number().int().min(0).max(32),
  /** Pixels compared: the active layer's, or all visible layers composited. */
  source: z.enum(['layer', 'all'])
});

/** The whole-pixel area to examine: `area` around `point`, at most `maxFillSide` per side; none outside `area`. */
function fillArea(area: FillCommand['area'], point: { x: number; y: number }): FillArea | undefined {
  const left = Math.max(Math.floor(area.left), point.x - maxFillSide / 2);
  const top = Math.max(Math.floor(area.top), point.y - maxFillSide / 2);
  const right = Math.min(Math.ceil(area.left + area.width), left + maxFillSide);
  const bottom = Math.min(Math.ceil(area.top + area.height), top + maxFillSide);
  if (point.x < left || point.y < top || point.x >= right || point.y >= bottom) {
    return undefined;
  }

  return { left, top, width: right - left, height: bottom - top };
}

/** Whether the filled mask touches a side where `maxFillSide`, not the view, cut the area. */
function reachesLimit(mask: Uint8Array, area: FillArea, view: FillCommand['area']): boolean {
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
 * Unpacked tiles of the area: the active layer's, or the visible layers composited bottom to top as displayed, with
 * clipped layers clipped to their base.
 */
async function sampleTiles(
  context: DocumentEditContext,
  area: FillArea,
  source: FillCommand['source']
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
          clipped ? { base: base!.pixels } : undefined
        );
      }
    }

    if (composite) {
      tiles.set(key, composite);
    }
  }

  return tiles;
}

function parseColor(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}
