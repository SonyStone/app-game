import { projectionBlockWords as block } from './tipProjectionBlocks';
import { d, tgpu, type TgpuRoot } from 'typegpu';
import type { createTipRasterPlan } from './tipRasterPlan';
import type { TipLevel } from './tipSampling';

/** Uploads the verified tip pyramid once, preserving its byte-valued levels.
 * Prepared batches own immutable command buffers, so recording later batches
 * cannot overwrite commands awaiting submission. Supply levels from createTipPyramid.
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
  return {
    /** Compiles a batch of row plans into GPU buffers, with no shared mutable upload slots. */
    prepare(plans: readonly ReturnType<typeof createTipRasterPlan>[]) {
      const projection = collectProjectionBlocks(plans);
      const rows: d.v2u[] = [];
      const spanCount = plans.reduce((sum, plan) => sum + plan.rows.reduce((count, row) => count + row.length, 0), 0);
      const spanWords = new Uint32Array(Math.max(1, spanCount) * tipSpanWords);
      let spanIndex = 0;
      const destinations: d.v4u[] = [];
      let length = 0;
      for (const plan of plans) {
        destinations.push(d.vec4u(plan.width, plan.height, rows.length, length));
        length += plan.width * plan.height;
        for (const row of plan.rows) {
          rows.push(d.vec2u(spanIndex, row.length));
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
      // Copy row blocks straight into mapped GPU memory. A full intermediate
      // packed array would duplicate every block and add another large copy.
      const blockBuffer = root.createBuffer(d.arrayOf(d.i32, projection.length), buffer => {
        const words = new Int32Array(buffer.arrayBuffer);
        for (const [data, range] of projection.ranges)
          words.set(data.subarray(range.first * block.stride, range.end * block.stride), range.base);
        projection.ranges.clear();
      }).$usage('storage');
      // Snapshot now, retaining neither caller arrays nor mutable upload slots.
      root.unwrap(blockBuffer);
      const rowBuffer = root.createBuffer(d.arrayOf(d.vec2u, Math.max(1, rows.length)), rows.length ? rows : [d.vec2u()]).$usage('storage');
      // Pack directly into schema-derived offsets, avoiding one temporary object
      // per block and a second field-by-field serialization during upload.
      const spanBuffer = root.createBuffer(d.arrayOf(TipSpan, Math.max(1, spanCount)),
        buffer => buffer.write(spanWords.buffer)).$usage('storage');
      const destinationBuffer = root.createBuffer(d.arrayOf(d.vec4u, Math.max(1, destinations.length)), destinations.length ? destinations : [d.vec4u()]).$usage('storage');
      return {
        /** Bind once per batch; sampleTipPlanByte is shared by compute and fragment consumers. */
        group: root.createBindGroup(tipRasterLayout, { pixels, sizes, rows: rowBuffer, spans: spanBuffer, blocks: blockBuffer }),
        destinations: destinationBuffer,
        length,
        /** Bytes owned by this batch, excluding the shared source pyramid. */
        bytes: Math.max(1, rows.length) * 8 + spanWords.byteLength + projection.length * Int32Array.BYTES_PER_ELEMENT + Math.max(1, destinations.length) * 16,
        destroy() { blockBuffer.destroy(); rowBuffer.destroy(); spanBuffer.destroy(); destinationBuffer.destroy(); }
      };
    },
    destroy() { pixels.destroy(); sizes.destroy(); }
  };
}

/** Integer parameters for a final, nonoverlapping row interval.
 * Mode 0 is affine filtering, 1 is a direct copy, 2 is perspective filtering.
 * Perspective mode uses x as its first block word and y as its pixel phase.
 */
const TipSpan = d.struct({
  start: d.u32, count: d.u32, x: d.i32, y: d.i32, dx: d.i32, dy: d.i32,
  level: d.u32, weight: d.i32, bias: d.i32, mode: d.u32, clear: d.u32, generalAffine: d.u32
});

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
  for (const plan of plans) for (const row of plan.rows) for (const segment of row) {
    const perspective = segment.source?.options?.perspective;
    if (!perspective) continue;
    const first = perspective.offset >>> 3, end = Math.ceil((perspective.offset + segment.count) / 8);
    const range = ranges.get(perspective.data);
    if (range) { range.first = Math.min(first, range.first); range.end = Math.max(end, range.end); }
    else ranges.set(perspective.data, { first, end, base: 0 });
  }
  let length = 0;
  for (const range of ranges.values()) { range.base = length; length += (range.end - range.first) * block.stride; }
  return { length: Math.max(1, length), ranges };
}
