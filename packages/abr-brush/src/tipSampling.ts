import { projectionBlockWords as block, type TipProjectionBlocks } from './tipProjectionBlocks';

/** A Photoshop sampling level, with transparent one-pixel padding implicit here.
 * Mip generation is a separate stage; callers supply the original level pixels.
 */
export type TipLevel = { width: number; height: number; data: ArrayLike<number> };

/** Selects Photoshop's fixed-point source sampler for an affine tip scale.
 * maxLevel is the last available level index, not the number of levels.
 */
export function tipSamplingLevel(scale: number, maxLevel: number) {
  const fixed = Math.trunc(scale * 65536);
  if (fixed >= 65536) return { level: 0, fixed: 65536, blend: false };
  let level = 0, boundary = 65536;
  while (level < maxLevel) {
    boundary >>= 1;
    level++;
    if (boundary === fixed || fixed > boundary) break;
  }
  const blend = boundary !== fixed || level === 0;
  return { level: level - Number(boundary !== fixed && level !== 0), fixed, blend };
}

/** Samples a clipped span using Photoshop's 16.16 coordinates and byte arithmetic.
 * Writes every requested pixel, including zeros; leaves other destination bytes
 * untouched. Inputs must fit signed 32-bit fixed-point coordinates/advances.
 * Axis dispatch may disable the copy shortcut or select zero-biased fractional
 * weights; ordinary affine span sampling uses the defaults. Perspective blocks
 * provide packed coordinate/mip values and a crop offset, with copy disabled.
 * Their original 8.8 source positions are stored in the common 16.16 format.
 * Disable rowSpecialization for secondary tips: their mip callback checks both
 * source levels independently even when dy is zero.
 */
export function sampleTipSpan(
  levels: readonly TipLevel[],
  sampling: ReturnType<typeof tipSamplingLevel>,
  destination: Uint8Array,
  offset: number,
  count: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  options: { allowCopy?: boolean; fractionBias?: 0 | 1; rowSpecialization?: boolean; perspective?: TipProjectionBlocks } = {}
): void {
  const level = levels[sampling.level]!;
  const copy = options.allowCopy !== false && !sampling.blend && sampling.level === 0 && dx === 65536 && dy === 0 && ((x | y) & 65280) === 0;
  const boundary = 65536 >> sampling.level;
  const weight = sampling.blend
    ? Math.max(0, Math.min(255, Math.trunc((boundary - sampling.fixed) * (255 / (boundary - (32768 >> sampling.level))) + 0.5))) + 1
    : 0;
  for (let i = 0; i < count; i++) {
    if (options.perspective) {
      const pixel = options.perspective.offset + i, phase = pixel & 7;
      const at = (pixel >>> 3) * block.stride, data = options.perspective.data;
      const px = (data[at + block.x]! + Math.imul(data[at + block.dx]!, phase)) | 0;
      const py = (data[at + block.y]! + Math.imul(data[at + block.dy]!, phase)) | 0;
      const lod = data[at + block.level]! + Math.imul(data[at + block.levelStep]!, phase);
      const index = lod >> 8, fraction = lod & 255;
      const fine = sampleLevel(levels[index]!, index, px, py);
      const coarse = fraction ? sampleLevel(levels[index + 1]!, index + 1, px, py) : 0;
      destination[offset + i] = fine + (fraction ? ((coarse - fine) * (fraction + 1)) >> 8 : 0);
      continue;
    }
    let value = copy ? pixel(level, x >> 16, y >> 16) : sampleLevel(level, sampling.level, x, y, options.fractionBias ?? 1);
    if (sampling.blend) {
      // The row-specialized routine rejects the span if the fine row is outside
      // its padded image; its general affine branch checks both levels separately.
      const row = y >> (sampling.level + 16);
      if (options.rowSpecialization !== false && dy === 0 && (row < -1 || row >= level.height)) value = 0;
      else {
        const coarse = sampleLevel(levels[sampling.level + 1]!, sampling.level + 1, x, y);
        value += ((coarse - value) * weight) >> 8;
      }
    }
    destination[offset + i] = value;
    x = (x + dx) | 0;
    y = (y + dy) | 0;
  }
}

function sampleLevel(level: TipLevel, index: number, x: number, y: number, bias = 1): number {
  const ix = x >> (index + 16), iy = y >> (index + 16);
  if (ix < -1 || iy < -1 || ix >= level.width || iy >= level.height) return 0;
  const fx = ((x >> (index + 8)) & 255) + bias, fy = ((y >> (index + 8)) & 255) + bias;
  const a = pixel(level, ix, iy), b = pixel(level, ix + 1, iy);
  const c = pixel(level, ix, iy + 1), d = pixel(level, ix + 1, iy + 1);
  const top = a + (((b - a) * fx) >> 8), bottom = c + (((d - c) * fx) >> 8);
  return top + (((bottom - top) * fy) >> 8);
}

function pixel(level: TipLevel, x: number, y: number): number {
  return x < 0 || y < 0 || x >= level.width || y >= level.height ? 0 : level.data[y * level.width + x]!;
}
