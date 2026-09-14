import type { Dab } from '../brush';

/** Bounds approximate stamp coverage between presentation opportunities. Tiny tips still batch up to 256 stamps. */
export function adaptivePaintBatchSize(dabs: readonly Dab[], rasterScale = 1): number {
  let largestArea = 1;
  for (const dab of dabs) {
    const diameter = Math.ceil((dab.radius + 1) * 2 / rasterScale);
    largestArea = Math.max(largestArea, diameter * diameter);
  }
  return Math.max(1, Math.min(256, Math.floor(1024 * 1024 / largestArea)));
}

/** Composite whole LOD pixels so input batch boundaries cannot clip a partially updated coarse pixel. */
export function expandToRasterGrid(
  bounds: { x: number; y: number; width: number; height: number } | undefined,
  scale: number
) {
  if (!bounds || scale <= 1) return bounds;
  const x = Math.floor(bounds.x / scale) * scale;
  const y = Math.floor(bounds.y / scale) * scale;
  return {
    x, y,
    width: Math.ceil((bounds.x + bounds.width) / scale) * scale - x,
    height: Math.ceil((bounds.y + bounds.height) / scale) * scale - y
  };
}
