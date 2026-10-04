import { TILE_SIZE } from '@app-game/paint-core/brush';
import type { Point } from '@app-game/paint-core/camera';
import { defineDocumentEdit, type DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { TileChange } from '@app-game/paint-core/document';
import { captureSelection } from '@app-game/paint-core/selection';
import { TILE_BYTES, type TileData } from '@app-game/paint-core/tilePixels';
import { z } from 'zod';
import { applyAffine, invertAffine, type Affine } from './affine';

/**
 * The engine half of the transform: moves, scales, rotates and flips the pixels of a lasso selection, or of the whole
 * active layer, as one undo step. `begin` captures the pixels and replies with their bounds; each `update` redraws
 * them with a new transform from the original pixels, amending the same undo step; `end` keeps the result and
 * `cancel` restores the original. Pixels are resampled bilinearly in premultiplied color, or take the nearest pixel
 * for pixel art. Runs in the engine's realm.
 */
export const transformEdit = defineDocumentEdit({
  id: 'transform',
  parse: (input: unknown) => transformCommandSchema.parse(input),
  async run(context, command) {
    const session = context.state.get() as TransformSession | undefined;
    if (command.phase === 'begin') {
      const started = await begin(context, command.points);
      context.state.set(started);
      return { changes: [], reply: { bounds: started.bounds } };
    }

    if (!session) {
      throw new Error('Start a transform first.');
    }

    if (command.phase === 'end') {
      context.state.set(undefined);
      return { changes: [] };
    }

    if (command.phase === 'cancel') {
      context.state.set(undefined);
      return { changes: [], amend: session.committed };
    }

    const changes = await transformed(context, session, command.matrix, command.interpolation);
    const amend = session.committed;
    session.committed = changes.length > 0;
    return { changes, amend };
  }
});

/** A transform command; see {@link transformEdit}. */
export type TransformCommand = z.infer<typeof transformCommandSchema>;

/** Bounds of the transformed pixels in document pixels, right and bottom exclusive. */
export type TransformBounds = { left: number; top: number; right: number; bottom: number };

/** Largest side, in document pixels, of the pixels a transform can move. */
export const maxTransformSide = 4096;

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const transformCommandSchema = z.discriminatedUnion('phase', [
  /** Captures the pixels inside `points`, a closed lasso, or the whole active layer without them. */
  z.object({ phase: z.literal('begin'), points: z.array(point).min(3).max(4096).optional() }),
  z.object({
    phase: z.literal('update'),
    /** `smooth` resamples bilinearly; `pixels` takes the nearest pixel, keeping hard edges for pixel art. */
    interpolation: z.enum(['smooth', 'pixels']).default('smooth'),
    matrix: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])
  }),
  z.object({ phase: z.literal('end') }),
  z.object({ phase: z.literal('cancel') })
]);

/** What a transform started from. */
type TransformSession = {
  layerId: string;
  /** The layer's tiles when the transform began; the source of every change's `before`. */
  original: ReadonlyMap<string, TileData>;
  bounds: TransformBounds;
  /** The transformed pixels within `bounds`, row by row, premultiplied RGBA8. */
  pixels: Uint8Array;
  /** Whether the latest update committed an undo step, which the next command amends. */
  committed: boolean;
};

/** Captures the pixels inside `points`, or the whole active layer, and their bounds. */
async function begin(context: DocumentEditContext, points: Point[] | undefined): Promise<TransformSession> {
  const layer = context.active;
  if (!layer.visible) {
    throw new Error('Show the active layer before transforming it.');
  }

  const source = points
    ? (await captureSelection(layer, points, { read: context.readTile, write: async (pixels) => pixels })).tiles
    : layer.tiles;
  const tiles = new Map<string, Uint8Array>();
  for (const [key, data] of source) {
    tiles.set(key, await context.readTile(data));
  }

  const bounds = contentBounds(tiles);
  if (!bounds) {
    throw new Error(points ? 'The selection contains no pixels on the active layer.' : 'The active layer is empty.');
  }

  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  if (width > maxTransformSide || height > maxTransformSide) {
    throw new Error(`Select a part of at most ${maxTransformSide} px per side to transform it.`);
  }

  const pixels = new Uint8Array(width * height * 4);
  for (const [key, tile] of tiles) {
    const [tx, ty] = origin(key);
    for (let y = Math.max(ty, bounds.top); y < Math.min(ty + TILE_SIZE, bounds.bottom); y++) {
      const from = ((y - ty) * TILE_SIZE + Math.max(tx, bounds.left) - tx) * 4;
      const to = ((y - bounds.top) * width + Math.max(tx, bounds.left) - bounds.left) * 4;
      const length = (Math.min(tx + TILE_SIZE, bounds.right) - Math.max(tx, bounds.left)) * 4;
      pixels.set(tile.subarray(from, from + length), to);
    }
  }

  return { layerId: layer.id, original: new Map(layer.tiles), bounds, pixels, committed: false };
}

/** Changes that erase the original pixels and draw them through `matrix`, from the layer as the transform began. */
async function transformed(
  context: DocumentEditContext,
  session: TransformSession,
  matrix: Affine,
  interpolation: 'smooth' | 'pixels'
) {
  const sampleAt = interpolation === 'pixels' ? nearest : bilinear;
  const layer = context.layers.find((candidate) => candidate.id === session.layerId);
  const inverse = invertAffine(matrix);
  if (!layer || !inverse) {
    throw new Error(layer ? 'The transform is too thin to draw.' : 'The transformed layer was deleted.');
  }

  const { bounds, pixels } = session;
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.left, y: bounds.bottom },
    { x: bounds.right, y: bounds.bottom }
  ].map((corner) => applyAffine(matrix, corner));
  const target = {
    left: Math.floor(Math.min(...corners.map(({ x }) => x))),
    top: Math.floor(Math.min(...corners.map(({ y }) => y))),
    right: Math.ceil(Math.max(...corners.map(({ x }) => x))),
    bottom: Math.ceil(Math.max(...corners.map(({ y }) => y)))
  };
  const keys = new Set([...tileKeys(bounds), ...tileKeys(target)]);
  const changes: TileChange[] = [];
  const sample = [0, 0, 0, 0];
  for (const key of keys) {
    const before = session.original.get(key);
    const result = before ? new Uint8Array(await context.readTile(before)) : new Uint8Array(TILE_BYTES);
    const [tx, ty] = origin(key);
    let touched = false;
    // Erase the pixels that move.
    for (let y = Math.max(ty, bounds.top); y < Math.min(ty + TILE_SIZE, bounds.bottom); y++) {
      for (let x = Math.max(tx, bounds.left); x < Math.min(tx + TILE_SIZE, bounds.right); x++) {
        if (pixels[((y - bounds.top) * width + x - bounds.left) * 4 + 3]) {
          result.fill(0, ((y - ty) * TILE_SIZE + x - tx) * 4, ((y - ty) * TILE_SIZE + x - tx) * 4 + 4);
          touched = true;
        }
      }
    }

    // Draw them where the transform puts them, sampling the original at each pixel center.
    const [ia, ib, ic, id, ie, iff] = inverse;
    const left = Math.max(tx, target.left);
    for (let y = Math.max(ty, target.top); y < Math.min(ty + TILE_SIZE, target.bottom); y++) {
      // Source position of the row's first pixel center, in raster pixels; it advances by (ia, ib) per pixel.
      let u = ia * (left + 0.5) + ic * (y + 0.5) + ie - bounds.left - 0.5;
      let v = ib * (left + 0.5) + id * (y + 0.5) + iff - bounds.top - 0.5;
      for (let x = left; x < Math.min(tx + TILE_SIZE, target.right); x++, u += ia, v += ib) {
        if (!sampleAt(pixels, width, height, u, v, sample)) {
          continue;
        }

        const index = ((y - ty) * TILE_SIZE + x - tx) * 4;
        const keep = 1 - sample[3]! / 255;
        for (let channel = 0; channel < 4; channel++) {
          result[index + channel] = Math.round(sample[channel]! + result[index + channel]! * keep);
        }

        touched = true;
      }
    }

    if (touched) {
      changes.push({ layerId: layer.id, key, before, after: result.some((byte) => byte !== 0) ? result : undefined });
    }
  }

  return changes;
}

/**
 * Samples premultiplied RGBA at a position in pixel units of a `width` × `height` raster, interpolating the four
 * nearest pixels; outside the raster is transparent. Writes `out` and returns whether the sample has any alpha.
 */
function bilinear(pixels: Uint8Array, width: number, height: number, x: number, y: number, out: number[]) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  if (x0 < -1 || y0 < -1 || x0 >= width || y0 >= height) {
    return false;
  }

  const fx = x - x0,
    fy = y - y0;
  out.fill(0);
  for (let dy = 0; dy < 2; dy++) {
    const row = y0 + dy;
    if (row < 0 || row >= height) {
      continue;
    }

    for (let dx = 0; dx < 2; dx++) {
      const column = x0 + dx;
      if (column < 0 || column >= width) {
        continue;
      }

      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      const index = (row * width + column) * 4;
      for (let channel = 0; channel < 4; channel++) {
        out[channel]! += pixels[index + channel]! * weight;
      }
    }
  }

  return out[3]! >= 0.5;
}

/** Takes the pixel nearest to a position, like `bilinear` but without blending, for hard pixel-art edges. */
function nearest(pixels: Uint8Array, width: number, height: number, x: number, y: number, out: number[]) {
  const column = Math.round(x),
    row = Math.round(y);
  if (column < 0 || row < 0 || column >= width || row >= height) {
    return false;
  }

  const index = (row * width + column) * 4;
  for (let channel = 0; channel < 4; channel++) {
    out[channel] = pixels[index + channel]!;
  }

  return out[3]! > 0;
}

/** Bounds of the non-transparent pixels of unpacked tiles, or `undefined` when all are transparent. */
function contentBounds(tiles: ReadonlyMap<string, Uint8Array>): TransformBounds | undefined {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [key, tile] of tiles) {
    const [tx, ty] = origin(key);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        if (tile[(y * TILE_SIZE + x) * 4 + 3]) {
          left = Math.min(left, tx + x);
          right = Math.max(right, tx + x + 1);
          top = Math.min(top, ty + y);
          bottom = Math.max(bottom, ty + y + 1);
        }
      }
    }
  }

  return left < right ? { left, top, right, bottom } : undefined;
}

/** Keys of the tiles overlapping `bounds`. */
function tileKeys(bounds: TransformBounds): string[] {
  const keys: string[] = [];
  for (let ty = Math.floor(bounds.top / TILE_SIZE); ty * TILE_SIZE < bounds.bottom; ty++) {
    for (let tx = Math.floor(bounds.left / TILE_SIZE); tx * TILE_SIZE < bounds.right; tx++) {
      keys.push(`${tx},${ty}`);
    }
  }

  return keys;
}

/** Document pixel of a tile's top-left corner. */
function origin(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number) as [number, number];
  return [x * TILE_SIZE, y * TILE_SIZE];
}
