import { TILE_SIZE, type Dab } from '../input';

/** Integer tile-local damage bounds, including the stamp shader's one-pixel antialiasing fringe.
 * Outside these bounds the accumulated mask has not changed, so previous stroke output remains valid.
 */
export function stampBounds(dabs: readonly Dab[], tileX: number, tileY: number) {
  let left = TILE_SIZE,
    top = TILE_SIZE,
    right = 0,
    bottom = 0;
  for (const dab of dabs) {
    const x = dab.x - tileX * TILE_SIZE,
      y = dab.y - tileY * TILE_SIZE,
      radius = dab.radius + 1;
    left = Math.min(left, Math.floor(x - radius));
    top = Math.min(top, Math.floor(y - radius));
    right = Math.max(right, Math.ceil(x + radius));
    bottom = Math.max(bottom, Math.ceil(y + radius));
  }
  return clipBounds(left, top, right, bottom);
}

/** Damage for the direct ABR quad only; mask/dual/wet-edge paths must use conservative stampBounds.
 * Matches the vertex shader's rotated half extents, retaining a pixel for rasterization rounding.
 */
export function directStampBounds(dab: Dab, tileX: number, tileY: number) {
  if (!dab.abr) return stampBounds([dab], tileX, tileY);
  const data = dab.abr.data;
  const width = Math.abs(data[2]! * data[4]!) + Math.abs(data[3]! * data[5]!) + 1;
  const height = Math.abs(data[2]! * data[5]!) + Math.abs(data[3]! * data[4]!) + 1;
  const x = dab.x - tileX * TILE_SIZE, y = dab.y - tileY * TILE_SIZE;
  return clipBounds(Math.floor(x - width), Math.floor(y - height), Math.ceil(x + width), Math.ceil(y + height));
}

function clipBounds(left: number, top: number, right: number, bottom: number) {
  const x = Math.max(0, left),
    y = Math.max(0, top);
  const width = Math.min(TILE_SIZE, right) - x,
    height = Math.min(TILE_SIZE, bottom) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}
