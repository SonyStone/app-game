import type { TipLevel } from './tipSampling';

/** Selects one of Photoshop's four pattern levels and its residual scale.
 * Scale is a positive, finite multiplier relative to the supplied source level.
 * Brush textures start at level zero. Higher input levels describe an already
 * reduced source and are folded back into the four available levels.
 * Throws RangeError for invalid scales or input levels outside integer 0..31.
 */
export function selectPatternLevel(scale: number, level = 0) {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('Pattern scale must be positive and finite');
  }
  if (!Number.isInteger(level) || level < 0 || level > 31) {
    throw new RangeError('Pattern source level must be an integer from 0 to 31');
  }
  if (level > 3) {
    while (level > 3) {
      scale *= 0.5;
      level--;
    }
  } else {
    while (scale <= 0.5 && level < 3) {
      scale *= 2;
      level++;
    }
  }
  while (scale >= 2 && level > 0) {
    scale *= 0.5;
    level--;
  }
  return { level, scale };
}

/** Prepares Photoshop's pattern coordinates using double precision on the host.
 * The source must be the already-selected pattern level. Scale is the residual
 * scale for that level, not necessarily the preset's scale. Output coordinates
 * are integer document pixels. Origins are document-space pattern offsets.
 * Packed axis entries contain a wrapped source index followed by a 0..255 weight.
 * This avoids recomputing large document coordinates in float32 GPU shaders.
 */
export function planPatternSampling(
  source: Pick<TipLevel, 'width' | 'height'>,
  scale: number,
  bounds: { x: number; y: number; width: number; height: number },
  origin = { x: 0, y: 0 }
) {
  return {
    width: bounds.width, height: bounds.height,
    x: patternAxis(bounds.x, bounds.width, origin.x, scale, source.width),
    y: patternAxis(bounds.y, bounds.height, origin.y, scale, source.height)
  };
}

/** Rasterizes one prepared 8-bit pattern level before tone adjustment or inversion.
 * Writes the requested rectangle only. Destination offset/stride are byte units.
 * Pattern level generation and selection are separate from this sampler.
 */
export function rasterizePattern(
  source: TipLevel,
  plan: ReturnType<typeof planPatternSampling>,
  destination: Uint8Array,
  offset = 0,
  stride = plan.width
): void {
  for (let y = 0; y < plan.height; y++) {
    const sy = plan.y[y * 2]!, fy = plan.y[y * 2 + 1]!;
    const row = sy * source.width, nextRow = ((sy + 1) % source.height) * source.width;
    for (let x = 0; x < plan.width; x++) {
      const sx = plan.x[x * 2]!, fx = plan.x[x * 2 + 1]!, nextX = (sx + 1) % source.width;
      const top = source.data[row + sx]! * 256 + (source.data[row + nextX]! - source.data[row + sx]!) * fx;
      const bottom = source.data[nextRow + sx]! * 256 + (source.data[nextRow + nextX]! - source.data[nextRow + sx]!) * fx;
      destination[offset + y * stride + x] = ((bottom - top) * fy + top * 256 + 32768) >> 16;
    }
  }
}

/** ARM64 FRINTM floors both the source coordinate and its 8-bit fraction. */
function patternAxis(start: number, count: number, origin: number, scale: number, size: number): Int32Array {
  const entries = new Int32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const coordinate = (start + i - origin) / scale;
    const integer = Math.max(-2147483648, Math.min(2147483647, Math.floor(coordinate)));
    entries[i * 2] = ((integer % size) + size) % size;
    entries[i * 2 + 1] = Math.max(0, Math.min(255, Math.floor((coordinate - integer) * 256)));
  }
  return entries;
}
