import { projectTipQuad } from './tipProjection';
import { multiplyAdd } from './tipMath';
import { rasterizeTipPolygon, writeTipPolygon, tipRasterBounds, transformTipQuad, type TipVertex } from './tipPolygon';
import type { TipLevel } from './tipSampling';
import { tipByteWriter, type TipRasterWriter } from './tipRasterWriter';
import { cropTipRasterPlan, planTipRasterWrites } from './tipRasterPlan';

/** Prepares a sampled secondary tip for fixed-point rasterization.
 * Source dimensions are positive integers. Scale is the nominal sampled size;
 * angle includes secondary rotation and uses Photoshop's clockwise convention.
 * Sampled secondary sources retain their aspect ratio and integer-centered bounds.
 */
export function secondaryTipTransform(
  source: { width: number; height: number }, center: { x: number; y: number },
  scale: number, angle: number, flipX = false, flipY = false
): ReturnType<typeof sampledTipTransform> {
  const { width, height } = source;
  const left = center.x - Math.floor(width / 2), right = center.x + Math.ceil(width / 2);
  const top = center.y - Math.floor(height / 2), bottom = center.y + Math.ceil(height / 2);
  const u0 = flipX ? width : 0, u1 = flipX ? 0 : width;
  const v0 = flipY ? height : 0, v1 = flipY ? 0 : height;
  const rotation = wrapTipAngle(angle);
  const quad = transformTipQuad([[left, top, u0, v0], [right, top, u1, v0],
    [right, bottom, u1, v1], [left, bottom, u0, v1]], center, scale, rotation);
  const axisAligned = rotation === 0;
  const bounds = tipRasterBounds(quad);
  // Secondary axis scans may write one additional column beyond the ordinary bound.
  if (axisAligned) bounds.right++;
  return { quad, scale, axisAligned, bounds };
}

/** Photoshop's primary sampled-tip transform, including optional brush projection.
 * sourceBounds and center must already include the brush method's placement.
 * Roundness is the stored integer percentage; roundnessChange is an additive
 * fraction from dynamics. Flip inputs are already combined with stored flips.
 * With tilt, angle contains the stored tip angle and jitter; tilt.direction is
 * the separately evaluated angle control. The returned scale selects filtering.
 */
export function sampledTipTransform(
  sourceBounds: { left: number; top: number; right: number; bottom: number },
  center: { x: number; y: number }, scale: number, angle: number,
  roundness: number, roundnessChange = 0, flipX = false, flipY = false,
  tilt?: {
    /** Photoshop method input, clamped above 1; not browser tilt degrees. */
    magnitude: number;
    /** Stored Tilt Scale percentage. Zero disables stretching. */
    amount: number;
    /** Separately evaluated angle-control contribution in degrees. */
    direction: number;
    /** Selects the original method's stretch-before-rotation branch. */
    beforeRotation: boolean;
  },
  projection?: {
    /** Original stored tip angle, before adding jitter or angle control. */
    stored: number;
    /** Per-dab angle jitter in degrees. */
    jitter: number;
    /** Evaluated angle control in degrees. */
    control: number;
    /** Normalized device values; omission selects Photoshop's null-device path. */
    tablet?: Parameters<typeof projectTipQuad>[4];
  }
) {
  let ratio = roundness * .01 + roundnessChange;
  // The original reflects an out-of-range value once, then clamps it.
  if (ratio < .05) ratio = (.05 - ratio) + .05;
  else if (ratio > 1) ratio = 1 - (ratio - 1);
  ratio = Math.max(.05, Math.min(1, ratio));
  const { left, right } = sourceBounds;
  let { top, bottom } = sourceBounds;
  if (ratio !== 1) {
    top = multiplyAdd(-(center.y - top), ratio, center.y);
    bottom = multiplyAdd(bottom - center.y, ratio, center.y);
  }
  const width = sourceBounds.right - sourceBounds.left, height = sourceBounds.bottom - sourceBounds.top;
  const u0 = flipX ? width : 0, u1 = flipX ? 0 : width;
  const v0 = flipY ? height : 0, v1 = flipY ? 0 : height;
  const vertices: TipVertex[] = [[left, top, u0, v0], [right, top, u1, v0],
    [right, bottom, u1, v1], [left, bottom, u0, v1]];
  if (projection) {
    const quad = projectTipQuad(vertices, center, scale, projection, projection.tablet);
    return { quad, scale: 1, axisAligned: false, bounds: tipRasterBounds(quad) };
  }
  const magnitude = Math.min(1, tilt?.magnitude ?? 0);
  if (tilt && magnitude !== 0 && tilt.amount !== 0) {
    const stretch = multiplyAdd(tilt.amount * .01, magnitude, 1);
    if (!tilt.beforeRotation) {
      const tipAngle = wrapTipAngle(angle);
      const stretched = stretchTipVertically(transformTipQuad(vertices, center, scale, tipAngle), center.y, stretch);
      const quad = transformTipQuad(stretched, center, 1, tilt.direction);
      return { quad, scale: scale * stretch,
        axisAligned: tipAngle === 0 && tilt.direction === 0, bounds: tipRasterBounds(quad) };
    }
    const combinedAngle = wrapTipAngle(tilt.direction + angle);
    const quad = transformTipQuad(stretchTipVertically(vertices, center.y, stretch), center, scale, combinedAngle);
    return { quad, scale, axisAligned: combinedAngle === 0, bounds: tipRasterBounds(quad) };
  }
  const combinedAngle = wrapTipAngle((tilt?.direction ?? 0) + angle);
  const quad = transformTipQuad(vertices, center, scale, combinedAngle);
  return { quad, scale, axisAligned: combinedAngle === 0, bounds: tipRasterBounds(quad) };
}

/** Tilt's stretch uses separate multiply/add instructions, unlike roundness. */
function stretchTipVertically(vertices: readonly TipVertex[], centerY: number, stretch: number): TipVertex[] {
  if (stretch === 1) return [...vertices];
  return vertices.map(([x, y, u, v]) => [x, centerY + (y - centerY) * stretch, u, v]);
}

function wrapTipAngle(angle: number): number {
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

/** Photoshop's sampled-tip size getter for finite, nonnegative requested sizes.
 * Quantizes the nominal size before dynamics and divides by the largest source dimension.
 * The sampled-tip class bounds its nominal diameter to 1..5000 document pixels.
 * Dynamics interpolate the prepared minimum and maximum scales using the original FMA.
 */
export function sampledTipScale(size: number, sourceSize: number,
  dynamics?: { minimumDiameter: number; value: number }
): number {
  const nominal = Math.max(1, Math.min(5000, Math.trunc(size + .5)));
  const maximum = nominal / sourceSize;
  if (!dynamics) return maximum;
  const minimum = Math.min(nominal, nominal * dynamics.minimumDiameter * .01) / sourceSize;
  return multiplyAdd(maximum - minimum, dynamics.value, minimum);
}

/** Applies Photoshop's render-only diameter floor after placement dynamics.
 * A positive tip covers at least 0.25 document pixels in the fractional brush
 * path, or 1 pixel otherwise. Zero scale still deposits nothing. Scatter and
 * spacing retain the unfloored scale returned by sampledTipScale.
 */
export function sampledTipRenderScale(scale: number, sourceSize: number, fractional = true): number {
  return scale <= 0 ? 0 : Math.max(scale, (fractional ? .25 : 1) / sourceSize);
}

/** Applies a document symmetry transform while preserving source UVs and scan direction.
 * The matrix must be a rigid rotation/reflection/translation; scale stays unchanged.
 */
export function transformSampledTip(
  tip: ReturnType<typeof sampledTipTransform>,
  matrix: { a: number; b: number; c: number; d: number; x: number; y: number }
): ReturnType<typeof sampledTipTransform> {
  let quad: TipVertex[] = tip.quad.map(([x, y, u, v, weight]) => {
    const point: TipVertex = [matrix.a * x + matrix.c * y + matrix.x, matrix.b * x + matrix.d * y + matrix.y, u, v];
    return weight === undefined ? point : [point[0], point[1], u, v, weight];
  });
  const axisAligned = tip.axisAligned && matrix.b === 0 && matrix.c === 0;
  if (axisAligned) {
    const left = Math.min(...quad.map(point => point[0])), top = Math.min(...quad.map(point => point[1]));
    const right = Math.max(...quad.map(point => point[0])), bottom = Math.max(...quad.map(point => point[1]));
    const corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
    quad = corners.map(([x, y]) => quad.find(point => point[0] === x && point[1] === y)!);
  } else if (matrix.a * matrix.d - matrix.b * matrix.c < 0) quad = [quad[0]!, quad[3]!, quad[2]!, quad[1]!];
  return { ...tip, quad, axisAligned, bounds: tipRasterBounds(quad) };
}

/** Clears and rasterizes a tip's clipped scratch rectangle.
 * The byte destination must include the same writable padding as rasterizeTipPolygon.
 * Primary supports affine/projected single-channel 8-bit entries, with noise off.
 * target.secondary selects affine secondary scan/sampling; the caller must
 * source-over the returned scratch coverage into its persistent secondary mask.
 */
export function rasterizeSampledTip(
  levels: readonly TipLevel[], transform: ReturnType<typeof sampledTipTransform>, destination: Uint8Array,
  target: Omit<Parameters<typeof rasterizeTipPolygon>[4], 'axisAligned'>
) {
  return writeSampledTip(levels, transform, tipByteWriter(levels, destination), target);
}

/** Builds clipped source coverage for GPU execution without CPU pixel work.
 * secondary selects affine secondary commands; destination accumulation remains the caller's responsibility.
 */
export function planSampledTip(
  levels: readonly TipLevel[], transform: ReturnType<typeof sampledTipTransform>, width: number, height: number, originX = 0, originY = 0, secondary = false
) {
  return planTipRasterWrites(width, height, (writer, target) => writeSampledTip(levels, transform, writer, { ...target, originX, originY, secondary }));
}

/** Plans complete stamps before tile cropping, preserving Photoshop's scan rounding.
 * Keeps at most 128 stamps, 65,536 rows and 64 MiB of projection blocks,
 * except one oversized stamp so its next tile can reuse the same plan.
 * Tip objects are immutable cache keys. The cache owns row commands only,
 * with no destination pixel arrays or GPU resources.
 * secondary caches affine secondary spans, including their extra axis column.
 */
export function createSampledTipTilePlanner(levels: readonly TipLevel[], secondary = false) {
  const cache = new Map<ReturnType<typeof sampledTipTransform>, {
    plan: ReturnType<typeof planSampledTip>; x: number; y: number; projectionBytes: number
  }>();
  let rows = 0;
  let projectionBytes = 0;
  const planner = {
    /** Returns the immutable full stamp plan and its document origin, shared across tiles. */
    get(tip: ReturnType<typeof sampledTipTransform>) {
      let entry = cache.get(tip);
      if (!entry) {
        const left = Math.floor(tip.bounds.left / 4) * 4;
        const plan = planSampledTip(levels, tip, tip.bounds.right - left + Number(secondary && tip.axisAligned), tip.bounds.bottom - tip.bounds.top, left, tip.bounds.top, secondary);
        entry = { x: left, y: tip.bounds.top, plan, projectionBytes: countProjectionBytes(plan) };
        rows += entry.plan.height;
        projectionBytes += entry.projectionBytes;
      }
      cache.delete(tip);
      cache.set(tip, entry);
      while (cache.size > 1 && (cache.size > 128 || rows > 65536 || projectionBytes > 64 * 1024 * 1024)) {
        const [old, value] = cache.entries().next().value!;
        rows -= value.plan.height;
        projectionBytes -= value.projectionBytes;
        cache.delete(old);
      }
      return entry;
    },
    /** Returns tile-local spans while retaining the original stamp sampling phase. */
    crop(tip: ReturnType<typeof sampledTipTransform>, x: number, y: number, width: number, height: number) {
      const entry = planner.get(tip);
      return cropTipRasterPlan(entry.plan, x - entry.x, y - entry.y, width, height);
    },
    /** Number of retained scan rows, useful for bounded-cache diagnostics. */
    get rows() { return rows; },
    /** Bytes retained in packed perspective blocks, excluding interval objects. */
    get projectionBytes() { return projectionBytes; }
  };
  return planner;
}

/** Cropped/split spans can share blocks; count their backing arrays once. */
function countProjectionBytes(plan: ReturnType<typeof planSampledTip>) {
  const seen = new Set<Int32Array>();
  let bytes = 0;
  for (const row of plan.rows) for (const segment of row) {
    const data = segment.source?.options?.perspective?.data;
    if (data && !seen.has(data)) { seen.add(data); bytes += data.byteLength; }
  }
  return bytes;
}

/** Emits clipped tip writes directly to a byte writer or GPU upload compiler. */
export function writeSampledTip(
  levels: readonly TipLevel[], transform: ReturnType<typeof sampledTipTransform>, writer: TipRasterWriter,
  target: Parameters<typeof rasterizeSampledTip>[3]
) {
  const x = target.originX ?? 0, y = target.originY ?? 0;
  const bounds = { left: Math.max(x, transform.bounds.left), top: Math.max(y, transform.bounds.top),
    right: Math.min(x + target.width, transform.bounds.right), bottom: Math.min(y + target.height, transform.bounds.bottom) };
  if (bounds.right < bounds.left || bounds.bottom < bounds.top) return { left: 0, top: 0, right: 0, bottom: 0 };
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
  const offset = target.offset + (bounds.top - y) * target.stride + bounds.left - x;
  for (let row = 0; row < height; row++) writer.clear(offset + row * target.stride, offset + row * target.stride + width);
  writeTipPolygon(levels, transform.scale, transform.quad, writer, {
    offset, stride: target.stride, width, height, originX: bounds.left, originY: bounds.top, axisAligned: transform.axisAligned,
    secondary: target.secondary
  });
  return bounds;
}
