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
) {
  return planTipRasterWrites(width, height, (writer, target) =>
    writeTipPolygon(levels, scale, quad, writer, { ...target, axisAligned }));
}

/** Resolves ordered span and clear writes into disjoint visible row commands.
 * The callback receives an aligned virtual destination with writable padding.
 * It must emit writes synchronously; no pixel destination is allocated.
 */
export function planTipRasterWrites(
  width: number, height: number,
  emit: (writer: TipRasterWriter, target: { offset: number; stride: number; width: number; height: number }) => void
) {
  const stride = Math.ceil((width + 4) / 4) * 4;
  const rows: TipRasterSegment[][] = Array.from({ length: height }, () => []);
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
      }
      consumed += length;
    }
  };
  emit({
    byteOffset: 0,
    clear: (start, end) => write(start, end - start),
    span: span => write(span.offset, span.count, span)
  }, { offset: 0, stride, width, height });
  return { width, height, rows };
}

/** Crops resolved writes without rerunning viewport-dependent scan conversion.
 * x/y locate the destination viewport in the original plan; out-of-range rows stay untouched.
 */
export function cropTipRasterPlan(plan: ReturnType<typeof createTipRasterPlan>, x: number, y: number, width: number, height: number) {
  const rows = Array.from({ length: height }, (_, row) => {
    const result: TipRasterSegment[] = [];
    for (const segment of plan.rows[y + row] ?? []) {
      const start = Math.max(x, segment.start), end = Math.min(x + width, segment.start + segment.count);
      if (start >= end) continue;
      result.push({ start: start - x, count: end - start,
        source: segment.source ? advanceSource(segment.source, start - segment.start) : undefined });
    }
    return result;
  });
  return { width, height, rows };
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
  let first = 0, upper = segments.length;
  while (first < upper) {
    const middle = (first + upper) >>> 1, segment = segments[middle]!;
    if (segment.start + segment.count <= next.start) first = middle + 1;
    else upper = middle;
  }
  let last = first;
  while (last < segments.length && segments[last]!.start < end) last++;
  const replacement: TipRasterSegment[] = [];
  const left = segments[first], right = segments[last - 1];
  if (last > first && left!.start < next.start) replacement.push({ ...left!, count: next.start - left!.start });
  replacement.push(next);
  if (last > first && right!.start + right!.count > end) replacement.push({
    start: end, count: right!.start + right!.count - end,
    source: right!.source ? advanceSource(right!.source, end - right!.start) : undefined
  });
  // Rows are private to the synchronous planner. Mutating the affected interval
  // avoids copying all earlier intervals for each subsequent write.
  segments.splice(first, last - first, ...replacement);
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
