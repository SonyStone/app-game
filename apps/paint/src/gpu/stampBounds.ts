import { TILE_SIZE, type Dab } from '../brush';

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
  const x = Math.max(0, left),
    y = Math.max(0, top);
  const width = Math.min(TILE_SIZE, right) - x,
    height = Math.min(TILE_SIZE, bottom) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}
