import { d } from 'typegpu';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { TextDocument } from '../../document';
import { outlineGrid } from './coverageGrid';
import { coverageTableLayout } from './coverageTable';

/** Prepares area integrals once; source cubics remain authoritative at magnification. */
export function prepareCoverageTables(
  gpu: GpuContext,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource
) {
  const words = new Uint32Array(document.instances);
  const uses = new Map<number, { count: number; rule: number; uses: number }>();

  for (let i = 0; i < words.length; i += 20) {
    const start = words[i + 16]!;
    const count = words[i + 17]!;
    const rule = words[i + 18]!;

    if (rule > 1 || count > 512) {
      continue;
    }

    const entry = uses.get(start);

    if (entry) {
      entry.uses++;

      if (entry.rule !== rule || entry.count !== count) {
        entry.rule = -1;
      }
    } else {
      uses.set(start, { count, rule, uses: 1 });
    }
  }

  // PDF font subsets can contain byte-identical outlines at different CURV offsets.
  // Share their tables as well as their geometry-independent usage priority.
  const curveWords = new Uint32Array(document.curves);
  const buckets = new Map<number, { start: number; count: number; rule: number; uses: number; aliases: number[] }[]>();

  for (const [start, entry] of uses) {
    if (entry.rule < 0) {
      continue;
    }

    let hash = entry.rule;

    for (let i = start * 8; i < (start + entry.count) * 8; i++) {
      hash = Math.imul(hash ^ curveWords[i]!, 16777619);
    }

    const bucket = buckets.get(hash) ?? [];
    const shared = bucket.find((candidate) => {
      if (candidate.count !== entry.count || candidate.rule !== entry.rule) {
        return false;
      }

      for (let i = 0; i < entry.count * 8; i++) {
        if (curveWords[candidate.start * 8 + i] !== curveWords[start * 8 + i]) {
          return false;
        }
      }

      return true;
    });

    if (shared) {
      shared.uses += entry.uses;
      shared.aliases.push(start);
    } else {
      bucket.push({ start, ...entry, aliases: [start] });
      buckets.set(hash, bucket);
    }
  }

  const selected = [...buckets.values()].flat().sort((a, b) => b.uses - a.uses);
  const offsets = new Uint32Array(Math.max(1, document.curves.byteLength / 32));
  const grids = new Uint32Array(offsets.length + selected.length * 64);
  let gridUsed = offsets.length;
  const canvas = new OffscreenCanvas(128, 128);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const areas = new Float32Array(
    Math.max(1, context ? Math.min((64 * 1024 * 1024) / 4, selected.length * 129 * 129) : 0)
  );
  let used = 0;
  const curves = new Float32Array(document.curves);

  if (context) {
    for (const [slot, entry] of selected.entries()) {
      const start = entry.start;
      const size = slot < 128 ? 128 : entry.uses >= 4 ? 64 : 32;
      const stride = size + 1;

      if (used + stride * stride > areas.length) {
        break;
      }
      canvas.width = canvas.height = size;
      context.fillStyle = 'white';
      const path = new Path2D();
      let endX = NaN;
      let endY = NaN;

      for (let curve = start; curve < start + entry.count; curve++) {
        const offset = curve * 8;
        const x = curves[offset]!;
        const y = curves[offset + 1]!;

        if (x !== endX || y !== endY) {
          path.closePath();
          path.moveTo(x * size, y * size);
        }

        path.bezierCurveTo(
          curves[offset + 2]! * size,
          curves[offset + 3]! * size,
          curves[offset + 4]! * size,
          curves[offset + 5]! * size,
          curves[offset + 6]! * size,
          curves[offset + 7]! * size
        );
        endX = curves[offset + 6]!;
        endY = curves[offset + 7]!;
      }

      path.closePath();
      context.clearRect(0, 0, size, size);
      context.fill(path, entry.rule === 1 ? 'evenodd' : 'nonzero');
      const pixels = context.getImageData(0, 0, size, size).data;
      const base = used;
      used += stride * stride;

      for (const alias of entry.aliases) {
        offsets[alias] = (base + 1) | (size === 64 ? 0x80000000 : size === 32 ? 0x40000000 : 0);
        grids[alias] = gridUsed;
      }

      grids.set(outlineGrid(curves, start, entry.count, entry.rule), gridUsed);
      gridUsed += 64;

      for (let y = 1; y <= size; y++) {
        let row = 0;

        for (let x = 1; x <= size; x++) {
          row += pixels[((y - 1) * size + x - 1) * 4 + 3]! / 255;
          areas[base + y * stride + x] = row + areas[base + (y - 1) * stride + x]!;
        }
      }
    }
  }

  const offsetBuffer = keep(
    gpu.root.createBuffer(d.arrayOf(d.u32, offsets.length), (buffer) => buffer.write(offsets.buffer))
  ).$usage('storage');
  const packed = areas.slice(0, Math.max(1, used));
  const areaBuffer = keep(
    gpu.root.createBuffer(d.arrayOf(d.f32, packed.length), (buffer) => buffer.write(packed.buffer))
  ).$usage('storage');
  const packedGrids = grids.slice(0, gridUsed);
  const gridBuffer = keep(
    gpu.root.createBuffer(d.arrayOf(d.u32, packedGrids.length), (buffer) => buffer.write(packedGrids.buffer))
  ).$usage('storage');

  return {
    offsets,
    group: gpu.root.createBindGroup(coverageTableLayout, {
      offsets: offsetBuffer,
      areas: areaBuffer,
      grids: gridBuffer
    }),
    resourceBytes: offsets.byteLength + packed.byteLength + packedGrids.byteLength
  };
}
