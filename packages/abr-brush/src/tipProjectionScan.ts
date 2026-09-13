import { projectionBlockWords as block } from './tipProjectionBlocks';
import { multiplyAdd as fma } from './tipMath';
import type { writeTipRows } from './tipScan';
import type { TipRasterWriter } from './tipRasterWriter';

/** Emits Photoshop's perspective rows, including its final-edge clear.
 * Weighted UVs and weight advance linearly along each edge. Span endpoints use floor/ceil.
 * Filtering uses the next scanline's
 * vertical derivative and an eight-pixel approximation along the current row.
 */
export const writeProjectedTipRows: typeof writeTipRows = (
  levelCount, _scale, writer, target, left, right, leftStep, rightStep
) => {
  let a = [...left], b = [...right], da = leftStep, db = rightStep;
  for (let row = 0; row < target.rows; row++) {
    if (b[0]! < a[0]!) { [a, b] = [b, a]; [da, db] = [db, da]; }
    const nextA = a.map((value, i) => value! + da[i]!);
    const nextB = b.map((value, i) => value! + db[i]!);
    const start = Math.max(0, Math.floor(a[0]!)), end = Math.min(target.width - 1, Math.ceil(b[0]!));
    const offset = target.offset + row * target.stride;
    if (end < start) {
      if (target.clear) writer.clear(offset, offset + target.width);
    } else {
      if (target.clear) writer.clear(offset, offset + start);
      const reciprocal = b[0] === a[0] ? 1 : 1 / (b[0]! - a[0]!);
      const du = (b[1]! - a[1]!) * reciprocal, dv = (b[2]! - a[2]!) * reciprocal;
      const dq = (b[3]! - a[3]!) * reciprocal, advance = start - a[0]!;
      const t = (a[0]! - nextA[0]!) / (nextB[0]! - nextA[0]!);
      const weight = 1 / fma(t, nextB[3]! - nextA[3]!, nextA[3]!);
      const dyU = fma(weight, fma(t, nextB[1]! - nextA[1]!, nextA[1]!), 1 / a[3]! * -a[1]!);
      const dyV = fma(weight, fma(t, nextB[2]! - nextA[2]!, nextA[2]!), 1 / a[3]! * -a[2]!);
      writeProjectedSpan(writer, offset + start, end - start + 1,
        [fma(advance, du, a[1]!), fma(advance, dv, a[2]!), fma(advance, dq, a[3]!)],
        [du, dv, dq], fma(dyU, dyU, dyV * dyV), levelCount - 1);
      if (target.clear) writer.clear(offset + end, offset + target.width);
    }
    a = nextA; b = nextB;
  }
};

/** Divides at eight-pixel boundaries, then packs integer source/LOD advances.
 * Source positions use the original 8.8 quantization, stored as 16.16 for the
 * shared byte sampler. Retaining block boundaries is required when cropping.
 */
function writeProjectedSpan(
  writer: TipRasterWriter, offset: number, count: number,
  from: readonly number[], step: readonly number[], vertical: number, maxLevel: number
): void {
  const pixelCount = count;
  const data = new Int32Array(Math.ceil(count / 8) * block.stride);
  let at = 0;
  let u = from[0]!, v = from[1]!, q = from[2]!;
  let x = 256 / q * u, y = 256 / q * v;
  u += step[0]! * 8; v += step[1]! * 8; q += step[2]! * 8;
  let nextX = u * (256 / q), nextY = v * (256 / q);
  let dx = (nextX - x) * .125, dy = (nextY - y) * .125;
  let lod = projectedMipLevel(dx, dy, vertical, maxLevel);
  while (count > 0) {
    u += step[0]! * 8; v += step[1]! * 8; q += step[2]! * 8;
    const endX = 256 / q * u, endY = 256 / q * v;
    const nextDx = (endX - nextX) * .125, nextDy = (endY - nextY) * .125;
    const nextLod = projectedMipLevel(nextDx, nextDy, vertical, maxLevel);
    const length = Math.min(8, count);
    data[at + block.x] = Math.trunc(x) * 256;
    data[at + block.y] = Math.trunc(y) * 256;
    data[at + block.dx] = Math.trunc(dx) * 256;
    data[at + block.dy] = Math.trunc(dy) * 256;
    data[at + block.level] = Math.trunc(lod);
    data[at + block.levelStep] = Math.trunc((nextLod - lod) * .125);
    at += block.stride; count -= length;
    x = nextX; y = nextY; nextX = endX; nextY = endY;
    dx = nextDx; dy = nextDy; lod = nextLod;
  }
  writer.span({ offset, count: pixelCount, x: 0, y: 0, dx: 0, dy: 0,
    sampling: { level: 0, fixed: 65536, blend: false },
    options: { allowCopy: false, perspective: { data, offset: 0 } } });
}

/** Photoshop's float log2 approximation, returned as a clamped 8.8 mip value. */
function projectedMipLevel(dx: number, dy: number, vertical: number, maxLevel: number): number {
  const value = Math.fround((vertical * 65536 + fma(dx, dx, dy * dy)) * 7.62939453125e-6);
  // Magnified tips never need a coarser level. The original approximation
  // clamps this entire range to zero, so skip its bit conversion/polynomial.
  if (value <= 1) return 0;
  floatBits[0] = value;
  const bits = integerBits[0]!;
  integerBits[0] = ((bits & 0x807fffff) | 0x3f800000) >>> 0;
  const mantissa = floatBits[0]!;
  const curve = Math.fround(fma(Math.fround(-1 / 3), mantissa, 2));
  const log = Math.fround(Math.fround(fma(mantissa, curve, Math.fround(-2 / 3))) + ((bits >>> 23 & 255) - 128));
  return Math.max(0, Math.min(maxLevel * 256, log * 128));
}

// Synchronous scalar conversion scratch, never retained by a writer callback.
const floatBits = new Float32Array(1);
const integerBits = new Uint32Array(floatBits.buffer);
