import { writeProjectedTipRows } from './tipProjectionScan';
import { multiplyAdd } from './tipMath';
import { writeTipRows, type TipEdge } from './tipScan';
import { tipByteWriter, type TipRasterWriter } from './tipRasterWriter';
import { tipSamplingLevel, type TipLevel } from './tipSampling';
import { affineSecondarySampling } from './secondaryMask';

/** Rasterizes a convex tip quad through Photoshop's affine or perspective paths.
 * Coordinates are in the same space as the destination viewport origin. Only polygon scan rows
 * are written; initialize destination pixels separately when a cleared mask is
 * required. Set axisAligned only for the zero-angle transform path. That path
 * requires four writable padding bytes after the viewport in each row because
 * Photoshop's packed filter can write one final word beyond its clipped span.
 * secondary selects accumulating-mask scan policy: no clears, and an extra
 * axis span column instead of the primary packed filter's extra row.
 */
export function rasterizeTipPolygon(
  levels: readonly TipLevel[], scale: number, quad: readonly TipVertex[], destination: Uint8Array,
  target: { offset: number; stride: number; width: number; height: number; axisAligned?: boolean; originX?: number; originY?: number; secondary?: boolean }
): void {
  writeTipPolygon(levels, scale, quad, tipByteWriter(levels, destination), target);
}

/** Emits the verified polygon raster operations without allocating pixel storage. */
export function writeTipPolygon(
  levels: readonly TipLevel[], scale: number, quad: readonly TipVertex[], writer: TipRasterWriter,
  target: Parameters<typeof rasterizeTipPolygon>[4]
): void {
  if (quad.length === 0) return;
  if (target.secondary) {
    const output = writer;
    writer = { ...output, span: span => output.span({ ...span, options: affineSecondarySampling }) };
  }
  const originX = target.originX ?? 0, originY = target.originY ?? 0;
  const bottom = originY + target.height;
  let top = 0, minimum = quad[0]![1], maximum = minimum;
  for (let i = 1; i < quad.length; i++) {
    const y = quad[i]![1];
    if (y < minimum) { minimum = y; top = i; }
    maximum = Math.max(maximum, y);
  }
  if (minimum === maximum) return;
  let row = Math.floor(minimum);
  if (row >= bottom) return;
  const thin = Math.floor(maximum + .5) === Math.floor(minimum);
  let remaining = quad.length, previous = top, next = top;
  let leftEnd = row - 1, rightEnd = row - 1;
  let leftY = row - 1, rightY = row - 1;
  let left = emptyEdge(), right = emptyEdge();
  do {
    if (leftEnd <= row) {
      do {
        const from = previous;
        previous = (previous + quad.length - 1) % quad.length;
        const toY = quad[previous]![1];
        if (toY <= quad[from]![1]) leftEnd--;
        else {
          left = polygonEdge(quad[from]!, quad[previous]!, row);
          leftEnd = thin ? Math.ceil(toY) : Math.floor(toY + .5);
          leftY = toY;
        }
        remaining--;
      } while (leftEnd <= row && remaining !== 0);
    }
    if (rightEnd <= row && remaining !== 0) {
      do {
        const from = next;
        next = (next + 1) % quad.length;
        const toY = quad[next]![1];
        if (toY <= quad[from]![1]) rightEnd--;
        else {
          right = polygonEdge(quad[from]!, quad[next]!, row);
          rightEnd = thin ? Math.ceil(toY) : Math.floor(toY + .5);
          rightY = toY;
        }
        remaining--;
      } while (rightEnd <= row && remaining !== 0);
    }
    let count = Math.min(leftEnd, rightEnd) - row;
    if (remaining === 0 && !thin) {
      const bottom = Math.min(leftY, rightY);
      if (Math.ceil(bottom) !== Math.floor(bottom + .5)) count = Math.max(count, 0) + 1;
    }
    count = Math.max(count, 0);
    if (count > 0) {
      const skip = Math.min(count, Math.max(0, originY - row));
      advanceEdge(left, skip);
      advanceEdge(right, skip);
      const first = row + skip;
      const visible = Math.min(count - skip, bottom - first);
      if (visible > 0 && target.axisAligned) rasterizeAxisRows(levels, scale, writer, target,
        first, visible, left, right);
      else if (visible > 0) {
        // Photoshop translates the already-advanced edge positions here, then
        // restores them before the polygon walker advances to its next edge.
        left.position[0] -= originX; right.position[0] -= originX;
        const writeRows = quad[0]![4] === undefined ? writeTipRows : writeProjectedTipRows;
        writeRows(levels.length, scale, writer, {
          offset: target.offset + (first - originY) * target.stride, stride: target.stride,
          width: target.width, rows: visible, clear: !target.secondary
        }, left.position, right.position, left.step, right.step);
        left.position[0] += originX; right.position[0] += originX;
      }
      advanceEdge(left, count - skip);
      advanceEdge(right, count - skip);
    }
    if (remaining === 0) return;
    row += count;
  } while (row < bottom);
}

/** A vertex's destination position and level-0 source coordinates.
 * With weight present, source coordinates are weighted and require perspective sampling. */
export type TipVertex = readonly [x: number, y: number, sourceX: number, sourceY: number, weight?: number];

/** Maps a rectangular source tip using Photoshop's scale/rotation operation.
 * Center is in destination pixels; angle is in degrees. This operation does not
 * include brush-method offsets, roundness, tilt or perspective transforms.
 */
export function transformedTipQuad(
  width: number, height: number, center: { x: number; y: number },
  scale: number, angle: number, flipX = false, flipY = false
): TipVertex[] {
  const left = center.x - width / 2, right = center.x + width / 2;
  const top = center.y - height / 2, bottom = center.y + height / 2;
  const u0 = flipX ? width : 0, u1 = flipX ? 0 : width;
  const v0 = flipY ? height : 0, v1 = flipY ? 0 : height;
  const vertices: TipVertex[] = [[left, top, u0, v0], [right, top, u1, v0],
    [right, bottom, u1, v1], [left, bottom, u0, v1]];
  return transformTipQuad(vertices, center, scale, angle);
}

/** Applies Photoshop's affine scale/rotation to mapped source vertices.
 * Angles are degrees; source coordinates remain unchanged. No angle wrapping.
 */
export function transformTipQuad(
  vertices: readonly TipVertex[], center: { x: number; y: number }, scale: number, angle: number
): TipVertex[] {
  const radians = angle * Math.PI / 180;
  const sin = Math.sin(radians), cos = Math.cos(radians);
  return vertices.map(([x, y, u, v, weight]) => {
    const sx = (x - center.x) * scale, sy = (y - center.y) * scale;
    const px = angle === 0 ? center.x + sx : center.x + multiplyAdd(sin, sy, cos * sx);
    const py = angle === 0 ? center.y + sy : center.y + multiplyAdd(cos, sy, sin * -sx);
    return weight === undefined ? [px, py, u, v] : [px, py, u, v, weight];
  });
}

/** Photoshop's allocation bounds for the mapped quad, including the extra
 * right column and two bottom rows used by its raster paths. Coordinates must
 * be finite and within signed 32-bit document bounds. Empty input has no bounds.
 */
export function tipRasterBounds(quad: readonly TipVertex[]) {
  if (quad.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  let left = quad[0]![0], right = left, top = quad[0]![1], bottom = top;
  for (const [x, y] of quad) {
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left: Math.floor(left), top: Math.floor(top),
    right: Math.ceil(right) + 1, bottom: Math.ceil(bottom) + 2 };
}

function polygonEdge(from: TipVertex, to: TipVertex, row: number) {
  const height = to[1] - from[1];
  const reciprocal = height === 0 ? 1 : 1 / height;
  const advance = row - from[1];
  const start: TipEdge = [from[0], from[2], from[3], from[4] ?? 1];
  const step: TipEdge = [(to[0] - from[0]) * reciprocal,
    (to[2] - from[2]) * reciprocal, (to[3] - from[3]) * reciprocal, ((to[4] ?? 1) - (from[4] ?? 1)) * reciprocal];
  const position: [number, number, number, number] = [multiplyAdd(step[0], advance, start[0]),
    multiplyAdd(step[1], advance, start[1]), multiplyAdd(step[2], advance, start[2]), multiplyAdd(step[3]!, advance, start[3]!)];
  return { position, step };
}

function emptyEdge(): ReturnType<typeof polygonEdge> {
  return { position: [0, 0, 0, 1], step: [0, 0, 0, 0] };
}

function advanceEdge(edge: ReturnType<typeof polygonEdge>, count: number): void {
  for (let i = 0; i < 4; i++) edge.position[i] = multiplyAdd(edge.step[i]!, count, edge.position[i]!);
}

/** The axis dispatcher rounds coordinates and can extend its filtered row batch. */
function rasterizeAxisRows(
  levels: readonly TipLevel[], scale: number, writer: TipRasterWriter,
  target: Parameters<typeof rasterizeTipPolygon>[4], first: number, rows: number,
  left: ReturnType<typeof polygonEdge>, right: ReturnType<typeof polygonEdge>
): void {
  const a = left.position, b = right.position;
  const originX = target.originX ?? 0, originY = target.originY ?? 0;
  const start = Math.max(originX, Math.floor(a[0]));
  const end = Math.min(originX + target.width - 1, Math.ceil(b[0]));
  if (end < start) return;
  const reciprocal = b[0] === a[0] ? 1 : 1 / (b[0] - a[0]);
  const dx = (b[1] - a[1]) * reciprocal, advance = start - a[0];
  const x = roundFixed(multiplyAdd(dx, advance, a[1]));
  let y = roundFixed(a[2]);
  const stepX = roundFixed(dx), stepY = roundFixed(left.step[2]);
  const sampling = tipSamplingLevel(scale, levels.length - 1);
  const nativeScale = !sampling.blend && sampling.level === 0 && stepX === 65536 && stepY === 65536;
  const copy = nativeScale && ((x | y) & 65280) === 0;
  const fractionBias = nativeScale && !copy ? 0 : 1;
  const count = end - start + 1;
  if (target.secondary) {
    // The secondary axis callback extends each span, not the row batch. It
    // always filters and accumulates, bypassing the primary packed/copy paths.
    const written = count + Number(first + rows < originY + target.height);
    for (let i = 0; i < rows; i++) {
      writer.span({ offset: target.offset + (first + i - originY) * target.stride + start - originX,
        count: written, x, y, dx: stepX, dy: 0, sampling, options: affineSecondarySampling });
      y = (y + stepY) | 0;
    }
    return;
  }
  const rowCount = rows + Number(!copy && first + rows < originY + target.height);
  for (let i = 0; i < rowCount; i++) {
    const offset = target.offset + (first + i - originY) * target.stride + start - originX;
    let written = count;
    if (fractionBias === 0 && (y >> 16) >= -1 && (y >> 16) < levels[0]!.height) {
      const leading = Math.max(0, Math.min(count, -1 - (x >> 16)));
      const sampled = Math.min(count, levels[0]!.width - ((x >> 16) + leading));
      // The packed routine's full-word count includes a final word when its
      // tail mask is zero. That word can extend into physical row padding.
      if (sampled > 0 && ((writer.byteOffset + offset + leading + sampled) & 3) === 0) {
        written = Math.max(count, leading + sampled + 4);
      }
    }
    writer.span({ offset, count: written, x, y, dx: stepX, dy: 0, sampling,
      options: { allowCopy: copy, fractionBias } });
    y = (y + stepY) | 0;
  }
}

function roundFixed(value: number): number {
  return Math.max(-2147483648, Math.min(2147483647, Math.floor(value * 65536 + .5)));
}
