import { TILE_SIZE } from '../brush';
import { worldToScreen, type Camera, type ViewSize } from '../camera';

/** Integer framebuffer rectangle covering changed tiles, clipped to the viewport. */
export type DirtyRegion = { x: number; y: number; width: number; height: number };

/** Includes a two-pixel raster/filter margin and handles rotated/mirrored tiles. Offscreen changes return undefined. */
export function dirtyRegion(
  keys: Iterable<string>,
  camera: Camera,
  size: ViewSize,
  pixels: ViewSize
): DirtyRegion | undefined {
  let minX = pixels.width,
    minY = pixels.height,
    maxX = 0,
    maxY = 0;
  for (const key of keys) {
    const [tx, ty] = key.split(',').map(Number);
    for (const dx of [0, 1])
      for (const dy of [0, 1]) {
        const point = worldToScreen({ x: (tx! + dx) * TILE_SIZE, y: (ty! + dy) * TILE_SIZE }, camera, size);
        const x = (point.x * pixels.width) / size.width,
          y = (point.y * pixels.height) / size.height;
        minX = Math.min(minX, Math.floor(x) - 2);
        minY = Math.min(minY, Math.floor(y) - 2);
        maxX = Math.max(maxX, Math.ceil(x) + 2);
        maxY = Math.max(maxY, Math.ceil(y) + 2);
      }
  }
  const x = Math.max(0, minX),
    y = Math.max(0, minY);
  const width = Math.min(pixels.width, maxX) - x,
    height = Math.min(pixels.height, maxY) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}
