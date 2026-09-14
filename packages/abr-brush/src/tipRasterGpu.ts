import { projectionBlockWords as block } from './tipProjectionBlocks';
import { d, tgpu, type TgpuRoot } from 'typegpu';
import type { createTipRasterPlan } from './tipRasterPlan';
import { writeSampledTip, type sampledTipTransform } from './sampledTipRaster';
import type { TipRasterSpan } from './tipRasterWriter';
import type { TipLevel } from './tipSampling';

/** Uploads the verified tip pyramid once, preserving its byte-valued levels.
 * Prepared batches own immutable command buffers, so recording later batches
 * cannot overwrite commands awaiting submission. Released batches reuse a bounded
 * pool of at most 16 uploads / 4 MiB of GPU storage plus equally sized CPU arrays.
 * Supply levels from createTipPyramid.
 * Submit recorded commands before destroying their batches or this owner.
 * No CPU pixel rasterization or GPU readback.
 */
export function createTipRasterGpu(root: TgpuRoot, levels: readonly TipLevel[]) {
  const descriptors: d.v4u[] = [];
  const byteCount = levels.reduce((sum, level) => sum + level.width * level.height, 0);
  const packed = new Uint32Array(Math.max(1, Math.ceil(byteCount / 4)));
  let offset = 0;
  for (const level of levels) {
    descriptors.push(d.vec4u(level.width, level.height, offset, 0));
    for (let i = 0; i < level.width * level.height; i++, offset++)
      packed[offset >> 2]! |= level.data[i]! << ((offset & 3) * 8);
  }
  const pixels = root.createBuffer(d.arrayOf(d.u32, packed.length), packed).$usage('storage');
  const sizes = root.createBuffer(d.arrayOf(d.vec4u, descriptors.length), descriptors).$usage('storage');
  const available: ReturnType<typeof makeUpload>[] = [];
  let availableBytes = 0;
  let disposed = false;
  return {
    /** Packs small affine tips directly into reusable row buffers. Returns undefined for
     * overlapping/split row writes or perspective tips, which require the general planner.
     * Exterior bytes are zero coverage; this path is for mask consumers only.
     */
    prepareAffine(tips: readonly ReturnType<typeof sampledTipTransform>[]) {
      if (disposed) throw new Error('The tip rasterizer is disposed.');
      if (tips.some(tip => tip.quad.some(vertex => vertex[4] !== undefined))) return undefined;
      const origins = tips.map(tip => ({ x: Math.floor(tip.bounds.left / 4) * 4, y: tip.bounds.top }));
      const rowCount = tips.reduce((sum, tip) => sum + tip.bounds.bottom - tip.bounds.top, 0);
      const upload = borrowUpload(rowCount, rowCount, tips.length, 1);
      const { rowWords, spanWords, destinationWords } = upload;
      rowWords.fill(0, 0, rowCount * rowWordStride);
      let baseRow = 0, length = 0, supported = true;
      const firstRows: number[] = [];
      for (let index = 0; index < tips.length; index++) {
        const tip = tips[index]!, origin = origins[index]!;
        const width = tip.bounds.right - origin.x, height = tip.bounds.bottom - origin.y;
        const stride = Math.ceil((width + 4) / 4) * 4;
        firstRows.push(baseRow);
        const at = index * destinationWordStride;
        destinationWords[at] = width; destinationWords[at + 1] = height;
        destinationWords[at + 2] = baseRow; destinationWords[at + 3] = length;
        length += width * height;
        const write = (offset: number, count: number, source?: TipRasterSpan) => {
          let consumed = 0;
          while (consumed < count) {
            const row = Math.floor((offset + consumed) / stride), start = (offset + consumed) % stride;
            const size = Math.min(count - consumed, stride - start), end = start + size;
            if (row >= 0 && row < height && size > 0) {
              const rowAt = (baseRow + row) * rowWordStride;
              const spanAt = (baseRow + row) * tipSpanWords;
              const o = tipSpanOffsets;
              if (source) {
                // A convex affine tip normally emits one source span per row. Keep
                // the general planner for any future writer that violates that contract.
                if (rowWords[rowAt + 1] || source.options?.perspective) { supported = false; return; }
                rowWords[rowAt] = baseRow + row; rowWords[rowAt + 1] = 1;
                packAffineSpan(spanWords, spanAt, start, size, source, consumed);
              } else if (rowWords[rowAt + 1]) {
                const oldStart = spanWords[spanAt + o.start]!, oldEnd = oldStart + spanWords[spanAt + o.count]!;
                if (start <= oldStart && end >= oldEnd) rowWords[rowAt + 1] = 0;
                else if (start <= oldStart && end > oldStart) {
                  const advance = end - oldStart;
                  spanWords[spanAt + o.start] = end;
                  spanWords[spanAt + o.count] = oldEnd - end;
                  spanWords[spanAt + o.x] = spanWords[spanAt + o.x]! + spanWords[spanAt + o.dx]! * advance;
                  spanWords[spanAt + o.y] = spanWords[spanAt + o.y]! + spanWords[spanAt + o.dy]! * advance;
                } else if (start > oldStart && start < oldEnd) {
                  if (end < oldEnd) { supported = false; return; }
                  spanWords[spanAt + o.count] = start - oldStart;
                }
              }
            }
            consumed += size;
          }
        };
        // Each tip starts in distinct, zeroed rows. Initial clears cannot remove
        // anything until the writer has emitted its first source span.
        let hasSource = false;
        writeSampledTip(levels, tip, { byteOffset: 0, clear: (start, end) => {
          if (hasSource) write(start, end - start);
        }, span: source => { hasSource = true; write(source.offset, source.count, source); } },
          { offset: 0, stride, width, height, originX: origin.x, originY: origin.y });
        baseRow += height;
        if (!supported) { recycleUpload(upload); return undefined; }
      }
      const queue = root.device.queue;
      if (rowCount) {
        queue.writeBuffer(root.unwrap(upload.rows), 0, rowWords.buffer, 0, rowCount * rowWordStride * 4);
        queue.writeBuffer(root.unwrap(upload.spans), 0, spanWords.buffer, 0, rowCount * tipSpanWords * 4);
      }
      if (tips.length) queue.writeBuffer(root.unwrap(upload.destinations), 0, destinationWords.buffer, 0, tips.length * destinationWordStride * 4);
      return { ...borrowedBatch(upload, firstRows, length), origins };
    },
    /** Compiles a batch of row plans into GPU buffers, with no shared mutable upload slots. */
    prepare(plans: readonly ReturnType<typeof createTipRasterPlan>[]) {
      if (disposed) throw new Error('The tip rasterizer is disposed.');
      const projection = collectProjectionBlocks(plans);
      const rowCount = plans.reduce((sum, plan) => sum + plan.rows.length, 0);
      let spanCount = 0;
      for (const plan of plans) {
        const first = plan.rowRange?.[0] ?? 0, end = plan.rowRange?.[1] ?? plan.rows.length;
        for (let row = first; row < end; row++) spanCount += plan.rows[row]!.length;
      }
      const upload = borrowUpload(rowCount, spanCount, plans.length, projection.length);
      const { rowWords, spanWords, destinationWords, blockWords } = upload;
      rowWords.fill(0);
      blockWords.fill(0);
      let spanIndex = 0;
      const firstRows: number[] = [];
      let rowIndex = 0, destinationIndex = 0;
      let length = 0;
      for (const plan of plans) {
        firstRows.push(rowIndex);
        const at = destinationIndex++ * destinationWordStride;
        destinationWords[at] = plan.width;
        destinationWords[at + 1] = plan.height;
        destinationWords[at + 2] = rowIndex;
        destinationWords[at + 3] = length;
        length += plan.width * plan.height;
        const first = plan.rowRange?.[0] ?? 0, end = plan.rowRange?.[1] ?? plan.rows.length;
        // Untouched rows already contain zero counts in the typed upload. Their offsets are immaterial.
        const baseRow = rowIndex;
        rowIndex += plan.rows.length;
        for (let index = first; index < end; index++) {
          const row = plan.rows[index]!;
          const rowAt = (baseRow + index) * rowWordStride;
          rowWords[rowAt] = spanIndex;
          rowWords[rowAt + 1] = row.length;
          for (const segment of row) {
            const source = segment.source;
            const sampling = source?.sampling;
            const perspective = source?.options?.perspective;
            const boundary = 65536 >> (sampling?.level ?? 0);
            const weight = sampling?.blend ? Math.max(0, Math.min(255, Math.trunc(
              (boundary - sampling.fixed) * (255 / (boundary - (boundary >> 1))) + 0.5))) + 1 : 0;
            const projectionRange = perspective ? projection.ranges.get(perspective.data)! : undefined;
            const at = spanIndex++ * tipSpanWords;
            spanWords[at + tipSpanOffsets.start] = segment.start;
            spanWords[at + tipSpanOffsets.count] = segment.count;
            spanWords[at + tipSpanOffsets.x] = perspective
              ? projectionRange!.base + ((perspective.offset >>> 3) - projectionRange!.first) * block.stride
              : source?.x ?? 0;
            spanWords[at + tipSpanOffsets.y] = perspective ? perspective.offset & 7 : source?.y ?? 0;
            spanWords[at + tipSpanOffsets.dx] = source?.dx ?? 0;
            spanWords[at + tipSpanOffsets.dy] = source?.dy ?? 0;
            spanWords[at + tipSpanOffsets.level] = sampling?.level ?? 0;
            spanWords[at + tipSpanOffsets.weight] = weight;
            spanWords[at + tipSpanOffsets.bias] = source?.options?.fractionBias ?? 1;
            spanWords[at + tipSpanOffsets.mode] = perspective ? 2 : Number(!!source && !!sampling &&
              source.options?.allowCopy !== false && !sampling.blend && sampling.level === 0 &&
              source.dx === 65536 && source.dy === 0 && ((source.x | source.y) & 65280) === 0);
            spanWords[at + tipSpanOffsets.clear] = Number(!source);
            spanWords[at + tipSpanOffsets.generalAffine] = Number(source?.options?.rowSpecialization === false);
          }
        }
      }
      for (const [data, range] of projection.ranges)
        blockWords.set(data.subarray(range.first * block.stride, range.end * block.stride), range.base);
      projection.ranges.clear();
      upload.blocks.write(blockWords.buffer);
      upload.rows.write(rowWords.buffer);
      upload.spans.write(spanWords.buffer);
      upload.destinations.write(destinationWords.buffer);
      return borrowedBatch(upload, firstRows, length);
    },
    /** Retained upload storage; borrowed active batches report their own bytes. */
    get pooledBytes() { return availableBytes; },
    destroy() {
      disposed = true;
      for (const upload of available) upload.destroy();
      available.length = 0;
      availableBytes = 0;
      pixels.destroy(); sizes.destroy();
    }
  };

  function borrowUpload(rowCount: number, spanCount: number, planCount: number, blockCount: number) {
    const index = available.findIndex(slot => slot.rowCount >= rowCount && slot.spanCount >= spanCount &&
      slot.planCount >= planCount && slot.blockCount >= blockCount);
    if (index < 0) return makeUpload(rowCount, spanCount, planCount, blockCount);
    const upload = available.splice(index, 1)[0]!;
    availableBytes -= upload.bytes;
    return upload;
  }

  function recycleUpload(upload: ReturnType<typeof makeUpload>) {
    if (!disposed && available.length < 16 && availableBytes + upload.bytes <= 4 * 1024 * 1024) {
      available.push(upload);
      availableBytes += upload.bytes;
    } else upload.destroy();
  }

  function borrowedBatch(upload: ReturnType<typeof makeUpload>, firstRows: number[], length: number) {
    let released = false;
    return {
      group: upload.group,
      destinations: upload.destinations,
      /** First uploaded row for each input plan, including mixed-height plans. */
      firstRows,
      length,
      /** Bytes borrowed until release or destroy. */
      bytes: upload.bytes,
      /** Submit all readers before releasing this batch back to its owner. */
      release() { if (!released) { released = true; recycleUpload(upload); } },
      destroy() { if (!released) { released = true; upload.destroy(); } }
    };
  }

  /** Power-of-two capacities amortize immutable batch uploads without growing with stroke length. */
  function makeUpload(rowCount: number, spanCount: number, planCount: number, blockCount: number) {
    const capacity = (size: number) => 2 ** Math.ceil(Math.log2(Math.max(1, size)));
    rowCount = capacity(rowCount); spanCount = capacity(spanCount);
    planCount = capacity(planCount); blockCount = capacity(blockCount);
    const rowWords = new Uint32Array(rowCount * rowWordStride);
    const spanWords = new Uint32Array(spanCount * tipSpanWords);
    const destinationWords = new Uint32Array(planCount * destinationWordStride);
    const blockWords = new Int32Array(blockCount);
    const rows = root.createBuffer(d.arrayOf(d.vec2u, rowCount)).$usage('storage');
    const spans = root.createBuffer(d.arrayOf(TipSpan, spanCount)).$usage('storage');
    const destinations = root.createBuffer(d.arrayOf(d.vec4u, planCount)).$usage('storage');
    const blocks = root.createBuffer(d.arrayOf(d.i32, blockCount)).$usage('storage');
    return { rowCount, spanCount, planCount, blockCount, rowWords, spanWords, destinationWords, blockWords,
      rows, spans, destinations, blocks,
      group: root.createBindGroup(tipRasterLayout, { pixels, sizes, rows, spans, blocks }),
      bytes: rowWords.byteLength + spanWords.byteLength + destinationWords.byteLength + blockWords.byteLength,
      destroy() { rows.destroy(); spans.destroy(); destinations.destroy(); blocks.destroy(); }
    };
  }
}

/** Integer parameters for a final, nonoverlapping row interval.
 * Mode 0 is affine filtering, 1 is a direct copy, 2 is perspective filtering.
 * Perspective mode uses x as its first block word and y as its pixel phase.
 */
const TipSpan = d.struct({
  start: d.u32, count: d.u32, x: d.i32, y: d.i32, dx: d.i32, dy: d.i32,
  level: d.u32, weight: d.i32, bias: d.i32, mode: d.u32, clear: d.u32, generalAffine: d.u32
});

const rowWordStride = d.sizeOf(d.vec2u) / Uint32Array.BYTES_PER_ELEMENT;
const destinationWordStride = d.sizeOf(d.vec4u) / Uint32Array.BYTES_PER_ELEMENT;
const tipSpanWords = d.sizeOf(TipSpan) / Uint32Array.BYTES_PER_ELEMENT;
const tipSpanOffsets = Object.fromEntries(Object.keys(TipSpan.propTypes).map(key => [key,
  d.memoryLayoutOf(TipSpan, span => span[key as keyof d.InferInput<typeof TipSpan>]).offset / Uint32Array.BYTES_PER_ELEMENT
])) as Record<keyof d.InferInput<typeof TipSpan>, number>;

/** Read-only source and row commands, usable from compute or fragment shaders. */
export const tipRasterLayout = tgpu.bindGroupLayout({
  pixels: { storage: d.arrayOf(d.u32), access: 'readonly' },
  sizes: { storage: d.arrayOf(d.vec4u), access: 'readonly' },
  rows: { storage: d.arrayOf(d.vec2u), access: 'readonly' },
  spans: { storage: d.arrayOf(TipSpan), access: 'readonly' },
  blocks: { storage: d.arrayOf(d.i32), access: 'readonly' }
});

/** Returns a byte, or -1 when Photoshop's polygon writer leaves this pixel untouched.
 * row is the batch-global row index; x is viewport-local. Uses no float filtering.
 */
export const sampleTipPlanByte = tgpu.fn([d.u32, d.u32], d.i32)((x, row) => {
  'use gpu';
  const range = tipRasterLayout.$.rows[row]!;
  // Find the disjoint interval without sampling unrelated clear/source ranges.
  let first = range.x;
  let end = range.x + range.y;
  while (first < end) {
    const middle = first + ((end - first) >> 1);
    const s = tipRasterLayout.$.spans[middle]!;
    if (x < s.start) { end = middle; continue; }
    if (x >= s.start + s.count) { first = middle + 1; continue; }
    if (s.clear !== 0) return d.i32(0);
    // Explicit unsigned arithmetic preserves the original signed 32-bit wrapping.
    const step = x - s.start;
    if (s.mode === 2) {
      const pixel = d.u32(s.y) + step;
      const phase = pixel & 7;
      const at = d.u32(s.x) + (pixel >> 3) * block.stride;
      const px = signedBits(unsignedBits(tipRasterLayout.$.blocks[at + block.x]!) + phase * unsignedBits(tipRasterLayout.$.blocks[at + block.dx]!));
      const py = signedBits(unsignedBits(tipRasterLayout.$.blocks[at + block.y]!) + phase * unsignedBits(tipRasterLayout.$.blocks[at + block.dy]!));
      const lod = unsignedBits(tipRasterLayout.$.blocks[at + block.level]!) + phase * unsignedBits(tipRasterLayout.$.blocks[at + block.levelStep]!);
      const level = lod >> 8;
      const fraction = d.i32(lod & 255);
      let value = tipLevel(level, px, py, 1);
      if (fraction !== 0) {
        const coarse = tipLevel(level + 1, px, py, 1);
        value += ((coarse - value) * (fraction + 1)) >> 8;
      }
      return value;
    }
    const px = signedBits(unsignedBits(s.x) + step * unsignedBits(s.dx));
    const py = signedBits(unsignedBits(s.y) + step * unsignedBits(s.dy));
    if (s.mode === 1) return tipPixel(s.level, px >> 16, py >> 16);
    let value = tipLevel(s.level, px, py, s.bias);
    if (s.weight !== 0) {
      const fineRow = py >> (s.level + 16);
      if (s.generalAffine === 0 && s.dy === 0 && (fineRow < -1 || fineRow >= d.i32(tipRasterLayout.$.sizes[s.level]!.y))) return d.i32(0);
      const coarse = tipLevel(s.level + 1, px, py, 1);
      value += ((coarse - value) * s.weight) >> 8;
    }
    return value;
  }
  return d.i32(-1);
});

/** Optional standalone batch destination. Each record is width, height, first row, output offset. */
export const tipRasterOutputLayout = tgpu.bindGroupLayout({
  destinations: { storage: d.arrayOf(d.vec4u), access: 'readonly' },
  output: { storage: d.arrayOf(d.u32), access: 'mutable' }
});

/** Dispatch ceil(maxWidth/8), ceil(maxHeight/8), planCount; preserves unwritten pixels. */
export const tipRasterKernel = tgpu.computeFn({ workgroupSize: [8, 8], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const target = tipRasterOutputLayout.$.destinations[id.z]!;
  if (id.x >= target.x || id.y >= target.y) return;
  const value = sampleTipPlanByte(id.x, target.z + id.y);
  if (value >= 0) tipRasterOutputLayout.$.output[target.w + id.y * target.x + id.x] = d.u32(value);
});

const tipLevel = tgpu.fn([d.u32, d.i32, d.i32, d.i32], d.i32)((level, x, y, bias) => {
  'use gpu';
  const size = tipRasterLayout.$.sizes[level]!;
  const ix = x >> (level + 16);
  const iy = y >> (level + 16);
  if (ix < -1 || iy < -1 || ix >= d.i32(size.x) || iy >= d.i32(size.y)) return d.i32(0);
  const fx = ((x >> (level + 8)) & 255) + bias;
  const fy = ((y >> (level + 8)) & 255) + bias;
  const a = tipPixel(level, ix, iy);
  const b = tipPixel(level, ix + 1, iy);
  const c = tipPixel(level, ix, iy + 1);
  const e = tipPixel(level, ix + 1, iy + 1);
  const top = a + (((b - a) * fx) >> 8);
  const bottom = c + (((e - c) * fx) >> 8);
  return top + (((bottom - top) * fy) >> 8);
});

const tipPixel = tgpu.fn([d.u32, d.i32, d.i32], d.i32)((level, x, y) => {
  'use gpu';
  const size = tipRasterLayout.$.sizes[level]!;
  if (x < 0 || y < 0 || x >= d.i32(size.x) || y >= d.i32(size.y)) return d.i32(0);
  const offset = size.z + d.u32(y) * size.x + d.u32(x);
  return d.i32((tipRasterLayout.$.pixels[offset >> 2]! >> ((offset & 3) * 8)) & 255);
});

// Keep the coordinate wrapping explicit at the signed/unsigned boundary.
const unsignedBits = tgpu.fn([d.i32], d.u32)`(value: i32) -> u32 { return bitcast<u32>(value); }`;
const signedBits = tgpu.fn([d.u32], d.i32)`(value: u32) -> i32 { return bitcast<i32>(value); }`;

/** Assigns upload offsets to referenced ranges, shared by all crops of a row. */
function collectProjectionBlocks(plans: readonly ReturnType<typeof createTipRasterPlan>[]) {
  const ranges = new Map<Int32Array, { first: number; end: number; base: number }>();
  for (const plan of plans) {
    const firstRow = plan.rowRange?.[0] ?? 0, endRow = plan.rowRange?.[1] ?? plan.rows.length;
    for (let row = firstRow; row < endRow; row++) for (const segment of plan.rows[row]!) {
      const perspective = segment.source?.options?.perspective;
      if (!perspective) continue;
      const first = perspective.offset >>> 3, end = Math.ceil((perspective.offset + segment.count) / 8);
      const range = ranges.get(perspective.data);
      if (range) { range.first = Math.min(first, range.first); range.end = Math.max(end, range.end); }
      else ranges.set(perspective.data, { first, end, base: 0 });
    }
  }
  let length = 0;
  for (const range of ranges.values()) { range.base = length; length += (range.end - range.first) * block.stride; }
  return { length: Math.max(1, length), ranges };
}

/** Packs the same fixed-point affine fields as the general span compiler. */
function packAffineSpan(words: Uint32Array, at: number, start: number, count: number, source: TipRasterSpan, advance: number) {
  const o = tipSpanOffsets, sampling = source.sampling;
  const boundary = 65536 >> sampling.level;
  words[at + o.start] = start; words[at + o.count] = count;
  words[at + o.x] = source.x + source.dx * advance; words[at + o.y] = source.y + source.dy * advance;
  words[at + o.dx] = source.dx; words[at + o.dy] = source.dy;
  words[at + o.level] = sampling.level;
  words[at + o.weight] = sampling.blend ? Math.max(0, Math.min(255, Math.trunc(
    (boundary - sampling.fixed) * (255 / (boundary - (boundary >> 1))) + .5))) + 1 : 0;
  words[at + o.bias] = source.options?.fractionBias ?? 1;
  words[at + o.mode] = Number(source.options?.allowCopy !== false && !sampling.blend && sampling.level === 0 &&
    source.dx === 65536 && source.dy === 0 && ((words[at + o.x]! | words[at + o.y]!) & 65280) === 0);
  words[at + o.clear] = 0;
  words[at + o.generalAffine] = Number(source.options?.rowSpecialization === false);
}
