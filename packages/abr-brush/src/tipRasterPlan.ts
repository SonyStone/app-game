import { writeTipPolygon, type TipVertex } from './tipPolygon';
import type { TipRasterSpan, TipRasterWriter } from './tipRasterWriter';
import type { TipLevel } from './tipSampling';

/** Compiles ordered Photoshop writes into disjoint per-row segments for the GPU.
 * The virtual destination has four-byte-aligned rows with writable padding.
 * Padding writes participate in ordering but are excluded from visible segments.
 * No source pixels are sampled and no destination pixel storage is allocated.
 */
export function createTipRasterPlan(
  levels: readonly TipLevel[], scale: number, quad: readonly TipVertex[],
  width: number, height: number, axisAligned = false
): TipRasterPlan {
  return planTipRasterWrites(width, height, (writer, target) =>
    writeTipPolygon(levels, scale, quad, writer, { ...target, axisAligned }));
}

/** Immutable row commands. An optional half-open row range avoids visiting empty tile padding. */
export type TipRasterPlan = {
  width: number;
  height: number;
  rows: readonly (readonly TipRasterSegment[])[];
  /** Contains every nonempty row, including explicit clears; absent means scan all rows. */
  rowRange?: readonly [first: number, end: number];
};

/** Resolves ordered span and clear writes into disjoint visible row commands.
 * The callback receives an aligned virtual destination with writable padding.
 * It must emit writes synchronously; no pixel destination is allocated.
 */
export function planTipRasterWrites(
  width: number, height: number,
  emit: (writer: TipRasterWriter, target: { offset: number; stride: number; width: number; height: number }) => void
): TipRasterPlan {
  const stride = Math.ceil((width + 4) / 4) * 4;
  const rows: TipRasterSegment[][] = Array.from({ length: height }, () => []);
  let firstRow = height, endRow = 0;
  const write = (offset: number, count: number, source?: TipRasterSpan) => {
    let consumed = 0;
    while (consumed < count) {
      const at = offset + consumed, row = Math.floor(at / stride), start = at - row * stride;
      const length = Math.min(count - consumed, stride - start);
      if (row >= 0 && row < height && start < width) {
        const segment: TipRasterSegment = {
          start, count: Math.min(length, width - start),
          source: source ? advanceSource(source, consumed) : undefined
        };
        rows[row] = replaceInterval(rows[row]!, segment);
        firstRow = Math.min(firstRow, row);
        endRow = Math.max(endRow, row + 1);
      }
      consumed += length;
    }
  };
  emit({
    byteOffset: 0,
    clear: (start, end) => write(start, end - start),
    span: span => write(span.offset, span.count, span)
  }, { offset: 0, stride, width, height });
  return { width, height, rows, rowRange: [Math.min(firstRow, endRow), endRow] };
}

/** Crops resolved writes without rerunning viewport-dependent scan conversion.
 * x/y locate the destination viewport in the original plan; out-of-range rows stay untouched.
 * Returned rows are read-only and may share empty storage.
 */
export function cropTipRasterPlan(plan: ReturnType<typeof createTipRasterPlan>, x: number, y: number, width: number, height: number): TipRasterPlan {
  // Tiny stamps occupy only a few rows of a 256-row tile. Share immutable empty
  // rows and visit only the source overlap instead of allocating/scanning every tile row.
  const rows: (readonly TipRasterSegment[])[] = new Array(height).fill(emptyRasterRow);
  const first = Math.max(0, (plan.rowRange?.[0] ?? 0) - y);
  const endRow = Math.min(height, (plan.rowRange?.[1] ?? plan.rows.length) - y);
  let firstWritten = height, endWritten = 0;
  for (let row = first; row < endRow; row++) {
    const sourceRow = plan.rows[y + row]!;
    if (!sourceRow.length) continue;
    const result: TipRasterSegment[] = [];
    for (const segment of sourceRow) {
      const start = Math.max(x, segment.start), end = Math.min(x + width, segment.start + segment.count);
      if (start >= end) continue;
      result.push({ start: start - x, count: end - start,
        source: segment.source ? advanceSource(segment.source, start - segment.start) : undefined });
    }
    if (result.length) {
      rows[row] = result;
      firstWritten = Math.min(firstWritten, row);
      endWritten = row + 1;
    }
  }
  return { width, height, rows, rowRange: [Math.min(firstWritten, endWritten), endWritten] };
}

/** A visible interval. Missing source means an explicit clear, not an unwritten pixel. */
export type TipRasterSegment = {
  start: number;
  count: number;
  source: TipRasterSpan | undefined;
};

/** Later writes replace earlier coverage, splitting at most the two edge segments. */
function replaceInterval(segments: TipRasterSegment[], next: TipRasterSegment): TipRasterSegment[] {
  const end = next.start + next.count;
  // Polygon scans clear their margins after the sampled-tip rectangle was
  // already cleared. Keep that interval intact until actual source writes split it.
  if (!next.source && segments.length === 1 && !segments[0]!.source &&
      segments[0]!.start <= next.start && segments[0]!.start + segments[0]!.count >= end) return segments;
  if (!segments.length || segments[segments.length - 1]!.start + segments[segments.length - 1]!.count <= next.start) {
    segments.push(next);
    return segments;
  }
  if (next.start <= segments[0]!.start && end >= segments[segments.length - 1]!.start + segments[segments.length - 1]!.count) {
    segments[0] = next;
    segments.length = 1;
    return segments;
  }
  let first = 0, upper = segments.length;
  while (first < upper) {
    const middle = (first + upper) >>> 1, segment = segments[middle]!;
    if (segment.start + segment.count <= next.start) first = middle + 1;
    else upper = middle;
  }
  let last = first;
  while (last < segments.length && segments[last]!.start < end) last++;
  const left = segments[first], right = segments[last - 1];
  const keepLeft = last > first && left!.start < next.start;
  const keepRight = last > first && right!.start + right!.count > end;
  const tail = keepRight ? {
    start: end, count: right!.start + right!.count - end,
    source: right!.source ? advanceSource(right!.source, end - right!.start) : undefined
  } : undefined;
  // Keep the existing left segment in place. Neither it nor this array has
  // escaped the synchronous planner yet, so splitting needs no temporary list.
  if (keepLeft) { left!.count = next.start - left!.start; first++; }
  if (tail) segments.splice(first, last - first, next, tail);
  else segments.splice(first, last - first, next);
  return segments;
}

function advanceSource(source: TipRasterSpan, count: number): TipRasterSpan {
  if (count === 0) return source;
  return { ...source, offset: source.offset + count, count: source.count - count,
    x: (source.x + Math.imul(source.dx, count)) | 0,
    y: (source.y + Math.imul(source.dy, count)) | 0,
    options: source.options?.perspective ? { ...source.options, perspective: {
      ...source.options.perspective,
      offset: source.options.perspective.offset + count
    } } : source.options };
}

const emptyRasterRow: readonly TipRasterSegment[] = Object.freeze([]);
