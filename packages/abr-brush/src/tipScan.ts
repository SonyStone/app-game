import { multiplyAdd } from './tipMath';
import { tipByteWriter, type TipRasterWriter } from './tipRasterWriter';
import { tipSamplingLevel, type TipLevel } from './tipSampling';

/** Rasterizes affine rows using Photoshop's clipped byte-span path.
 * Edges are relative to the destination viewport; source positions are in level-0
 * pixels. Destination storage must cover every row and its stride. With `clear`,
 * pixels outside the span and the final sampled edge pixel are cleared, matching
 * Photoshop's primary scan path. Row padding and bytes outside the rows survive.
 */
export function rasterizeTipRows(
  levels: readonly TipLevel[], scale: number, destination: Uint8Array,
  target: { offset: number; stride: number; width: number; rows: number; clear: boolean },
  left: TipEdge, right: TipEdge, leftStep: TipEdge, rightStep: TipEdge
): void {
  writeTipRows(levels.length, scale, tipByteWriter(levels, destination), target, left, right, leftStep, rightStep);
}

/** Emits the same clipped operations for a byte destination or GPU command encoder. */
export function writeTipRows(
  levelCount: number, scale: number, writer: TipRasterWriter,
  target: Parameters<typeof rasterizeTipRows>[3], left: TipEdge, right: TipEdge, leftStep: TipEdge, rightStep: TipEdge
): void {
  const sampling = tipSamplingLevel(scale, levelCount - 1);
  const rows = tipScanRows(target.width, target.rows, left, right, leftStep, rightStep);
  for (const [index, row] of rows.entries()) {
    const offset = target.offset + index * target.stride;
    if (row.count === 0) {
      if (target.clear) writer.clear(offset, offset + target.width);
      continue;
    }
    if (target.clear) writer.clear(offset, offset + row.start);
    writer.span({ offset: offset + row.start, count: row.count, x: row.x, y: row.y, dx: row.dx, dy: row.dy, sampling });
    if (target.clear) writer.clear(offset + row.start + row.count - 1, offset + target.width);
  }
}

/** A scan edge's viewport x and source coordinates, or their row advances.
 * Perspective edges carry a fourth weight; affine scans use only the first three values. */
export type TipEdge = readonly [x: number, sourceX: number, sourceY: number, weight?: number];

/** Generates Photoshop's signed 16.16 source spans, including edge crossing.
 * Inputs must be finite. Empty clipped rows retain their place with count zero.
 * Original edge arrays are not modified. This is the general affine path;
 * axis-aligned optimized dispatch and polygon edge construction are separate.
 */
export function tipScanRows(
  width: number, count: number, left: TipEdge, right: TipEdge, leftStep: TipEdge, rightStep: TipEdge
) {
  const rows: { start: number; count: number; x: number; y: number; dx: number; dy: number }[] = [];
  let a = [left[0], left[1], left[2]], b = [right[0], right[1], right[2]], da = leftStep, db = rightStep;
  for (let row = 0; row < count; row++) {
    if (b[0]! < a[0]!) {
      [a, b] = [b, a];
      [da, db] = [db, da];
    }
    const start = Math.max(0, int32(Math.floor(a[0]!)));
    const end = Math.min(width - 1, int32(Math.ceil(b[0]!)));
    if (end < start) rows.push({ start: 0, count: 0, x: 0, y: 0, dx: 0, dy: 0 });
    else {
      const distance = b[0]! - a[0]!;
      const reciprocal = distance === 0 ? 1 : 1 / distance;
      const dx = (b[1]! - a[1]!) * reciprocal, dy = (b[2]! - a[2]!) * reciprocal;
      const advance = start - a[0]!;
      rows.push({
        start, count: end - start + 1,
        x: int32(multiplyAdd(dx, advance, a[1]!) * 65536),
        y: int32(multiplyAdd(dy, advance, a[2]!) * 65536),
        dx: int32(dx * 65536), dy: int32(dy * 65536)
      });
    }
    a = a.map((value, i) => value + da[i]!);
    b = b.map((value, i) => value + db[i]!);
  }
  return rows;
}

function int32(value: number): number {
  return Math.trunc(Math.max(-2147483648, Math.min(2147483647, value)));
}
