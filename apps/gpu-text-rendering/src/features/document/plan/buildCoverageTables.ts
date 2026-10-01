import { drawOffset, drawWords } from './drawRecord';
import { outlineGrid } from './outlineGrid';
import { writeOutlineTable } from './outlineTable';

/** CPU-only area integrals, computed in document workers before transferring geometry. */
export function buildCoverageTables(document: { instances: ArrayBuffer; curves: ArrayBuffer }) {
  const words = new Uint32Array(document.instances);
  const uses = new Map<number, { count: number; rule: number; uses: number }>();

  for (let i = 0; i < words.length; i += drawWords) {
    const start = words[i + drawOffset.first / 4]!;
    const count = words[i + drawOffset.count / 4]!;
    const rule = words[i + drawOffset.kind / 4]!;

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

      const base = used;
      used += stride * stride;

      for (const alias of entry.aliases) {
        offsets[alias] = (base + 1) | (size === 64 ? 0x80000000 : size === 32 ? 0x40000000 : 0);
        grids[alias] = gridUsed;
      }

      grids.set(outlineGrid(curves, start, entry.count, entry.rule), gridUsed);
      gridUsed += 64;
      writeOutlineTable(context, curves, { first: start, count: entry.count, rule: entry.rule }, size, areas, base);
    }
  }

  return { offsets, areas: areas.slice(0, Math.max(1, used)), grids: grids.slice(0, gridUsed) };
}

/** Transferable tables; original curves remain authoritative at magnification. */
export type CoverageTables = ReturnType<typeof buildCoverageTables>;
