/** Validates work bounds and buckets allocation sizes to avoid reallocating on every pressure change. */
export function planCanvasPickup(
  region: { x: number; y: number; width: number; height: number },
  maxDimension: number,
  exact = false
) {
  if (
    ![region.x, region.y, region.width, region.height, region.x + region.width, region.y + region.height].every(
      Number.isFinite
    ) ||
    region.width <= 0 ||
    region.height <= 0
  )
    throw new Error('Canvas pickup requires a finite, positive region.');
  if (!Number.isInteger(maxDimension) || maxDimension < 32 || maxDimension > 2048)
    throw new Error('Canvas pickup maxDimension must be between 32 and 2048.');
  const minX = Math.floor(region.x / 256),
    minY = Math.floor(region.y / 256);
  const maxX = Math.ceil((region.x + region.width) / 256) - 1,
    maxY = Math.ceil((region.y + region.height) / 256) - 1;
  if (![minX, minY, maxX, maxY].every(Number.isSafeInteger) || (maxX - minX + 1) * (maxY - minY + 1) > 4096)
    throw new Error('Canvas pickup exceeds the 4096 source-tile budget.');
  const scale = Math.min(1, maxDimension / Math.max(region.width, region.height));
  if (exact && (!Object.values(region).every(Number.isInteger) || scale !== 1))
    throw new Error('Exact pickup requires an integer region within maxDimension.');
  const bucket = (size: number) => Math.min(maxDimension, Math.max(32, 2 ** Math.ceil(Math.log2(size * scale))));
  // A pixel pick must sample its center once. Upscaling it to the usual bucket would blend neighbours.
  const pixel = region.width === 1 && region.height === 1;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: exact ? region.width : pixel ? 1 : bucket(region.width),
    height: exact ? region.height : pixel ? 1 : bucket(region.height)
  };
}
