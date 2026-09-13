import type { TipLevel } from './tipSampling';

/** Builds Photoshop's four 8-bit brush-pattern levels, each owning its pixels.
 * The source must contain tightly packed bytes and positive integer dimensions.
 * Even dimensions halve; odd dimensions remain unchanged. The reduction wraps
 * the source and averages 2×2 pixels with one final integer rounding operation.
 * This is distinct from sampled-tip mip generation.
 */
export function createPatternPyramid(source: TipLevel): TipLevel[] {
  const levels: TipLevel[] = [{ ...source, data: Uint8Array.from(source.data) }];
  for (let index = 1; index < 4; index++) {
    levels.push(reducePattern(levels[index - 1]!));
  }
  return levels;
}

/** Odd dimensions preserve the period by filtering a repeated source extent. */
function reducePattern(source: TipLevel): TipLevel {
  const width = source.width % 2 === 0 ? source.width / 2 : source.width;
  const height = source.height % 2 === 0 ? source.height / 2 : source.height;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = ((2 * y) % source.height) * source.width;
    const nextRow = ((2 * y + 1) % source.height) * source.width;
    for (let x = 0; x < width; x++) {
      const sx = (2 * x) % source.width;
      const nextX = (sx + 1) % source.width;
      data[y * width + x] = (source.data[row + sx]! + source.data[row + nextX]!
        + source.data[nextRow + sx]! + source.data[nextRow + nextX]! + 2) >> 2;
    }
  }
  return { width, height, data };
}
