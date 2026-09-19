import { TILE_SIZE } from '../brush';

/** Optional fixed drawing extent in integer document pixels. Omission keeps an infinite canvas. */
export type PaintBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

/** Captures and validates a renderer's immutable drawing extent before allocating GPU resources. */
export function capturePaintBounds(bounds: PaintBounds | undefined): PaintBounds | undefined {
  if (!bounds) return undefined;
  if (![bounds.x, bounds.y, bounds.width, bounds.height, bounds.x + bounds.width, bounds.y + bounds.height].every(Number.isSafeInteger) ||
      bounds.width <= 0 || bounds.height <= 0) throw new Error('Drawing bounds require integer coordinates and positive dimensions.');
  return Object.freeze({ ...bounds });
}

/** Clips a tile-local write rectangle to the fixed extent. Undefined means no pixels may be written. */
export function clipPaintBounds(bounds: PaintBounds | undefined, tx: number, ty: number,
  region: PaintBounds | undefined = { x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE }): PaintBounds | undefined {
  if (!bounds || !region) return region;
  const x = Math.max(region.x, bounds.x - tx * TILE_SIZE);
  const y = Math.max(region.y, bounds.y - ty * TILE_SIZE);
  const right = Math.min(region.x + region.width, bounds.x + bounds.width - tx * TILE_SIZE);
  const bottom = Math.min(region.y + region.height, bounds.y + bounds.height - ty * TILE_SIZE);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}
