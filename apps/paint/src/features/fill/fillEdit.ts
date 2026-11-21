import { TILE_SIZE } from '@app-game/paint-core/brush';
import {
  defineDocumentEdit,
  editedLayer,
  type DocumentEditContext
} from '@app-game/paint-core/composition/documentEdit';
import type { LayerMask, TileChange } from '@app-game/paint-core/document';
import { effectiveCoverage, maskGoal, maskRgba, storedGoal } from '@app-game/paint-core/layerMask';
import { areaCoverage, isSelected } from '@app-game/paint-core/selectionMask';
import { z } from 'zod';
import { areaTiles, expandMask, fillTile, floodMask, smoothMask } from '../../shared/floodFill';
import { areaAround, reachesLimit, sampleArea } from '../../shared/sampleArea';

/**
 * The engine half of the bucket fill: fills the connected area around a point of similar color with a color, in the
 * active layer, as one undo step. Which pixels are similar is decided on the active layer or on all visible layers
 * composited, within the given area of the view, since the canvas has no edges, and within the selection, if any, in
 * proportion to its coverage. At most {@link maxFillSide} pixels
 * around the point on each side are examined: a fill that would continue past that limit inside the view is refused
 * rather than cut off. Runs in the drawing engine's realm.
 *
 * While a mask is the paint target, the fill writes the grey of its colour into the mask (see `maskGoal`), moving each
 * pixel's coverage by the fill's coverage times its opacity; `layer` decides similar pixels on the mask's own coverage.
 */
export const fillEdit = defineDocumentEdit({
  id: 'fill',
  parse: (input: unknown) => fillCommandSchema.parse(input),
  async run(context, command) {
    const layer = context.mask ? undefined : editedLayer(context);
    if (context.active?.visible === false || layer?.visible === false) {
      throw new Error('Show the active layer before filling it.');
    }

    const point = { x: Math.floor(command.point.x), y: Math.floor(command.point.y) };
    const area = areaAround(command.area, point, maxFillSide);
    if (!area) {
      return { changes: [] };
    }

    const sampled =
      context.mask && command.source === 'layer'
        ? await coverageArea(context, context.mask, area)
        : await sampleArea(context, area, command.source);
    const allowed = isSelected(context.selection) ? areaCoverage(context.selection, area) : undefined;
    const flooded = floodMask(area, sampled, point, command.tolerance, allowed, command.gap);
    if (reachesLimit(flooded, area, command.area)) {
      throw new Error('This area is too large to fill at this zoom. Zoom in and try again.');
    }

    const grown = expandMask(flooded, area.width, area.height, command.expand);
    const mask = command.antialias ? smoothMask(grown, area.width, area.height) : grown;
    // Growing under line edges and smoothing stop at the selection too, and fade across its soft edges.
    if (allowed) {
      mask.forEach((value, index) => {
        if (value) {
          mask[index] = withCoverage(value, allowed[index]!);
        }
      });
    }
    if (context.mask) {
      return { changes: await fillCoverage(context, context.mask, area, mask, command) };
    }

    const color = parseColor(command.color);
    const changes: TileChange[] = [];
    for (const key of areaTiles(area)) {
      const before = layer!.tiles.get(key);
      const after = fillTile(
        key,
        before && (await context.readTile(before)),
        mask,
        area,
        color,
        command.opacity,
        layer!.alphaLock
      );
      if (after) {
        changes.push({ layerId: layer!.id, key, before, after });
      }
    }

    return { changes };
  }
});

/** The effective coverage of `mask` in the tiles of `area` as opaque grey pixels, for deciding similar pixels. */
async function coverageArea(context: DocumentEditContext, mask: LayerMask, area: Parameters<typeof areaTiles>[0]) {
  const tiles = new Map<string, Uint8Array>();
  for (const key of areaTiles(area)) {
    const stored = await context.readCoverage(mask, key);
    tiles.set(key, maskRgba(mask.inverted ? stored.map((value) => effectiveCoverage(value, true)) : stored));
  }

  return tiles;
}

/**
 * The changes of `mask`'s coverage tiles that fill `area` where `fill` is set (1 full, 2–255 partial, as `fillTile`
 * reads it): each pixel moves by the fill's coverage times `opacity` towards the grey of `color`, stored reversed for
 * an inverted mask.
 */
async function fillCoverage(
  context: DocumentEditContext,
  mask: LayerMask,
  area: Parameters<typeof areaTiles>[0],
  fill: Uint8Array,
  command: Pick<FillCommand, 'color' | 'opacity'>
): Promise<TileChange[]> {
  const goal = storedGoal(maskGoal(command.color), mask.inverted);
  const changes: TileChange[] = [];
  for (const key of areaTiles(area)) {
    const [tx, ty] = key.split(',').map(Number) as [number, number];
    const coverage = new Uint8Array(await context.readCoverage(mask, key));
    let touched = false;
    const top = ty * TILE_SIZE,
      left = tx * TILE_SIZE;
    for (let y = Math.max(area.top, top); y < Math.min(area.top + area.height, top + TILE_SIZE); y++) {
      for (let x = Math.max(area.left, left); x < Math.min(area.left + area.width, left + TILE_SIZE); x++) {
        const value = fill[(y - area.top) * area.width + (x - area.left)]!;
        if (!value) {
          continue;
        }

        const amount = value === 1 ? command.opacity : (command.opacity * value) / 255;
        const index = (y - top) * TILE_SIZE + (x - left);
        const old = coverage[index]!;
        const next = Math.round(old + (goal - old) * amount);
        touched ||= next !== old;
        coverage[index] = next;
      }
    }

    if (touched) {
      changes.push({ layerId: mask.id, key, before: mask.tiles.get(key), after: coverage });
    }
  }

  return changes;
}

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
  /** Openings in the outline up to about twice this many pixels wide are closed; see `floodMask`. */
  gap: z.number().int().min(0).max(16).default(0),
  /** Softens the fill's edge by a pixel, as Photoshop's Anti-alias does; see `smoothMask`. */
  antialias: z.boolean().default(false),
  /** Pixels compared: the active layer's, or all visible layers composited. */
  source: z.enum(['layer', 'all'])
});

/**
 * A fill mask value (1 full, 2–255 partial; see `fillTile`) scaled by a selection coverage from 0 to 255, in the same
 * encoding; 0 where nothing is left.
 */
function withCoverage(value: number, coverage: number) {
  const amount = ((value === 1 ? 255 : value) * coverage) / 255;
  if (amount >= 254.5) {
    return 1;
  }

  return amount < 1.5 ? 0 : Math.round(amount);
}

function parseColor(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}
