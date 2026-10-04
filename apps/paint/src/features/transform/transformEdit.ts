import { TILE_SIZE } from '@app-game/paint-core/brush';
import type { Point } from '@app-game/paint-core/camera';
import { defineDocumentEdit, type DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { TileChange } from '@app-game/paint-core/document';
import { captureSelection } from '@app-game/paint-core/selection';
import { TILE_BYTES, type TileData } from '@app-game/paint-core/tilePixels';
import { z } from 'zod';
import { applyProjective, invertProjective, type Projective } from './projective';
import { warpNumbers, warpSide, warpTriangles, type Warp } from './warp';

/**
 * The engine half of the transform: moves, scales, rotates, flips, distorts in perspective and warps the pixels of a lasso
 * selection, or of the whole active layer, as one undo step. `begin` captures the pixels, lifts them off the layer as floating pixels that the
 * renderer draws each frame, and replies with their bounds; each `update` only moves the floating pixels, so the
 * document stays unchanged until `end` draws the result into the layer, and `cancel` leaves it untouched. The result
 * is resampled bicubically in premultiplied color, or takes the nearest pixel for pixel art. Runs in the engine's realm.
 */
export const transformEdit = defineDocumentEdit({
  id: 'transform',
  parse: (input: unknown) => transformCommandSchema.parse(input),
  async run(context, command) {
    const session = context.state.get() as TransformSession | undefined;
    if (command.phase === 'begin') {
      const started = await begin(context, command.points);
      context.state.set(started);
      const { layerId, bounds, pixels } = started;
      context.floating.show({ layerId, bounds, pixels, matrix: identity, interpolation: started.interpolation });
      return { changes: [], reply: { bounds } };
    }

    if (!session) {
      throw new Error('Start a transform first.');
    }

    if (command.phase === 'update') {
      if (!invertProjective(command.matrix)) {
        throw new Error('The transform is too thin to draw.');
      }

      session.matrix = command.matrix;
      session.warp = command.warp;
      session.interpolation = command.interpolation;
      context.floating.move(command.matrix, command.interpolation, command.warp && warpNumbers(command.warp));
      return { changes: [] };
    }

    context.state.set(undefined);
    await context.floating.clear();
    const unchanged = !session.warp && session.matrix.every((value, index) => value === identity[index]);
    if (command.phase === 'cancel' || unchanged) {
      return { changes: [] };
    }

    return { changes: await transformed(context, session) };
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
    /** Where the pixels go, as a projective transform of document points; see `Projective`. */
    matrix: z.tuple([
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number()
    ]),
    /** A warp that bends the pixels instead of `matrix`; see `Warp`. */
    warp: z
      .array(point)
      .length(warpSide * warpSide)
      .optional()
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
  /** The latest transform and resampling, which `end` draws into the layer; a warp replaces the matrix. */
  matrix: Projective;
  warp?: Warp;
  interpolation: 'smooth' | 'pixels';
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

  return {
    layerId: layer.id,
    original: new Map(layer.tiles),
    bounds,
    pixels,
    matrix: identity,
    interpolation: 'smooth'
  };
}

/**
 * Changes that erase the original pixels and draw them through the session's matrix or warp, from the layer as the
 * transform began.
 */
async function transformed(context: DocumentEditContext, session: TransformSession) {
  const sampleAt = session.interpolation === 'pixels' ? nearest : bicubic;
  const layer = context.layers.find((candidate) => candidate.id === session.layerId);
  if (!layer) {
    throw new Error('The transformed layer was deleted.');
  }

  const { bounds, pixels } = session;
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  const source = { pixels, width, height, sampleAt };
  const placement = session.warp ? warpPlacement(session.warp, bounds) : projectivePlacement(session.matrix, bounds);
  const keys = new Set([...tileKeys(bounds), ...tileKeys(placement.target)]);
  const changes: TileChange[] = [];
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

    // Draw them where the transform puts them.
    touched = placement.draw(result, tx, ty, source) || touched;
    if (touched) {
      changes.push({ layerId: layer.id, key, before, after: result.some((byte) => byte !== 0) ? result : undefined });
    }
  }

  return changes;
}

/** The lifted pixels and how to sample them. */
type Source = { pixels: Uint8Array; width: number; height: number; sampleAt: typeof bicubic };

/**
 * Draws the source through `matrix`: each pixel center of the target is mapped back into the source and sampled
 * there. `draw` blends into one unpacked tile at `tx`, `ty` and returns whether it drew anything.
 */
function projectivePlacement(matrix: Projective, bounds: TransformBounds) {
  const inverse = invertProjective(matrix);
  if (!inverse) {
    throw new Error('The transform is too thin to draw.');
  }

  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.left, y: bounds.bottom },
    { x: bounds.right, y: bounds.bottom }
  ].map((corner) => applyProjective(matrix, corner));
  const target = boundsOf(corners);
  const [ia, ib, ic, id, ie, iff, ig, ih, ii] = inverse;
  return {
    target,
    draw(result: Uint8Array, tx: number, ty: number, source: Source) {
      const sample = [0, 0, 0, 0];
      let touched = false;
      const left = Math.max(tx, target.left);
      for (let y = Math.max(ty, target.top); y < Math.min(ty + TILE_SIZE, target.bottom); y++) {
        // The homogeneous source position of the row's first pixel center; along the row it advances by (ia, id, ig).
        let su = ia * (left + 0.5) + ib * (y + 0.5) + ic;
        let sv = id * (left + 0.5) + ie * (y + 0.5) + iff;
        let sw = ig * (left + 0.5) + ih * (y + 0.5) + ii;
        for (let x = left; x < Math.min(tx + TILE_SIZE, target.right); x++, su += ia, sv += id, sw += ig) {
          if (sw <= 0) {
            continue;
          }

          const u = su / sw - bounds.left - 0.5,
            v = sv / sw - bounds.top - 0.5;
          if (source.sampleAt(source.pixels, source.width, source.height, u, v, sample)) {
            blend(result, ((y - ty) * TILE_SIZE + x - tx) * 4, sample);
            touched = true;
          }
        }
      }

      return touched;
    }
  };
}

/**
 * Draws the source through a warp, as the preview does: the patch is cut into triangles of at most about 8 document
 * pixels a side, and each pixel center inside a triangle samples the source where the triangle's corners interpolate
 * to. Triangles draw in mesh order, so where the warp folds over itself the later part covers the earlier one. A pixel
 * on an edge shared by two triangles belongs to one of them.
 */
function warpPlacement(warp: Warp, bounds: TransformBounds) {
  const target = boundsOf(warp);
  const extent = Math.max(target.right - target.left, target.bottom - target.top, 1);
  const cells = Math.min(128, Math.max(8, Math.ceil(extent / 8)));
  const triangles = warpTriangles(warp, cells);
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  return {
    target,
    draw(result: Uint8Array, tx: number, ty: number, source: Source) {
      const sample = [0, 0, 0, 0];
      let touched = false;
      for (let offset = 0; offset < triangles.length; offset += 12) {
        const t = triangles.subarray(offset, offset + 12);
        const area = edge(t[0]!, t[1]!, t[4]!, t[5]!, t[8]!, t[9]!);
        if (Math.abs(area) < 1e-12) {
          continue;
        }

        // Order the vertices so that the triangle's signed area is positive; then all three edge values are positive
        // inside it.
        const [a, b, c] = area > 0 ? [0, 4, 8] : [0, 8, 4];
        const ax = t[a]!,
          ay = t[a + 1]!,
          bx = t[b]!,
          by = t[b + 1]!,
          cx = t[c]!,
          cy = t[c + 1]!;
        const x0 = Math.max(tx, Math.floor(Math.min(ax, bx, cx))),
          x1 = Math.min(tx + TILE_SIZE, Math.ceil(Math.max(ax, bx, cx)));
        const y0 = Math.max(ty, Math.floor(Math.min(ay, by, cy))),
          y1 = Math.min(ty + TILE_SIZE, Math.ceil(Math.max(ay, by, cy)));
        if (x0 >= x1 || y0 >= y1) {
          continue;
        }

        const total = Math.abs(area);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const px = x + 0.5,
              py = y + 0.5;
            const wa = edge(bx, by, cx, cy, px, py),
              wb = edge(cx, cy, ax, ay, px, py),
              wc = edge(ax, ay, bx, by, px, py);
            if (!inside(wa, cx - bx, cy - by) || !inside(wb, ax - cx, ay - cy) || !inside(wc, bx - ax, by - ay)) {
              continue;
            }

            const u = (wa * t[a + 2]! + wb * t[b + 2]! + wc * t[c + 2]!) / total;
            const v = (wa * t[a + 3]! + wb * t[b + 3]! + wc * t[c + 3]!) / total;
            if (
              source.sampleAt(source.pixels, source.width, source.height, u * width - 0.5, v * height - 0.5, sample)
            ) {
              blend(result, ((y - ty) * TILE_SIZE + x - tx) * 4, sample);
              touched = true;
            }
          }
        }
      }

      return touched;
    }
  };
}

/** Twice the signed area of the triangle `a`, `b`, `p`; its sign tells the side of `a` → `b` that `p` is on. */
function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/**
 * Whether a point with edge value `value` is inside that edge, running `dx`, `dy`. A point exactly on it counts for
 * one direction only, so of two triangles sharing the edge, which run it in opposite directions, exactly one draws it.
 */
function inside(value: number, dx: number, dy: number) {
  return value > 0 || (value === 0 && (dy > 0 || (dy === 0 && dx < 0)));
}

/** Blends a premultiplied sample over the pixel at `index`. */
function blend(result: Uint8Array, index: number, sample: number[]) {
  const keep = 1 - sample[3]! / 255;
  for (let channel = 0; channel < 4; channel++) {
    result[index + channel] = Math.round(sample[channel]! + result[index + channel]! * keep);
  }
}

/** Whole document pixels around `points`. */
function boundsOf(points: readonly Point[]): TransformBounds {
  return {
    left: Math.floor(Math.min(...points.map(({ x }) => x))),
    top: Math.floor(Math.min(...points.map(({ y }) => y))),
    right: Math.ceil(Math.max(...points.map(({ x }) => x))),
    bottom: Math.ceil(Math.max(...points.map(({ y }) => y)))
  };
}

/**
 * Samples premultiplied RGBA at a position in pixel units of a `width` × `height` raster from the 4 × 4 nearest
 * pixels with Catmull-Rom weights, as Photoshop's Bicubic does, sharper than bilinear when enlarging; outside the
 * raster is transparent. Writes `out` and returns whether the sample has any alpha. Overshoot is clamped, alpha to 0–255 and color to the alpha, so edges get no
 * halos.
 */
function bicubic(pixels: Uint8Array, width: number, height: number, x: number, y: number, out: number[]) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  if (x0 < -2 || y0 < -2 || x0 > width || y0 > height) {
    return false;
  }

  const wx = catmullRom(x - x0),
    wy = catmullRom(y - y0);
  out.fill(0);
  for (let dy = 0; dy < 4; dy++) {
    const row = y0 + dy - 1;
    if (row < 0 || row >= height) {
      continue;
    }

    for (let dx = 0; dx < 4; dx++) {
      const column = x0 + dx - 1;
      if (column < 0 || column >= width) {
        continue;
      }

      const weight = wx[dx]! * wy[dy]!;
      const index = (row * width + column) * 4;
      for (let channel = 0; channel < 4; channel++) {
        out[channel]! += pixels[index + channel]! * weight;
      }
    }
  }

  out[3] = Math.min(255, Math.max(0, out[3]!));
  for (let channel = 0; channel < 3; channel++) {
    out[channel] = Math.min(out[3], Math.max(0, out[channel]!));
  }

  return out[3] >= 0.5;
}

/** Catmull-Rom weights of the four pixels around a position `t` from 0 to 1 past the second one. */
function catmullRom(t: number): [number, number, number, number] {
  const t2 = t * t,
    t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/** Takes the pixel nearest to a position, like `bicubic` but without blending, for hard pixel-art edges. */
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

/** The transform that changes nothing. */
const identity: Projective = [1, 0, 0, 0, 1, 0, 0, 0, 1];

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
