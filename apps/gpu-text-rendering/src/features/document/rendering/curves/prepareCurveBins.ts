import type { TextDocument } from '../../document';

/**
 * Adds GPU-only horizontal lookup rows for small outlines omitted by the file's large-path index.
 * Prioritizes repeated outlines within 32 MiB of additional storage; geometry and source bytes stay intact.
 */
export function prepareCurveBins(
  document: Pick<Extract<TextDocument, { kind: 'curves' }>, 'instances' | 'clips' | 'curves' | 'curveBins'>
) {
  const known = new Map<string, { first: number; count: number; uses: number; offset: number }>();

  for (const source of [document.instances, document.clips]) {
    const words = new Uint32Array(source);

    for (let i = 0; i < words.length; i += 20) {
      const first = words[i + 16]!;
      const count = words[i + 17]!;

      if (words[i + 7] !== 0 || words[i + 18]! > 1 || count <= 8) {
        continue;
      }

      const key = `${first}:${count}`;
      const entry = known.get(key);

      if (entry) {
        entry.uses++;
      } else {
        known.set(key, { first, count, uses: 1, offset: 0 });
      }
    }
  }

  if (known.size === 0) {
    return { instances: document.instances, clips: document.clips, bins: document.curveBins };
  }

  const source = new Uint32Array(document.curveBins);
  const data = new Uint32Array(Math.max(1, source.length) + (32 * 1024 * 1024) / 4);
  data.set(source);
  let used = Math.max(1, source.length);
  const curves = new Float32Array(document.curves);

  for (const entry of [...known.values()].sort((a, b) => b.uses - a.uses)) {
    const rows: number[][] = Array.from({ length: 128 }, () => []);

    for (let curve = entry.first; curve < entry.first + entry.count; curve++) {
      const y0 = curves[curve * 8 + 1]!;
      const y1 = curves[curve * 8 + 7]!;
      const low = Math.max(0, Math.min(127, Math.floor(Math.min(y0, y1) * 128)));
      const high = Math.max(0, Math.min(127, Math.floor(Math.max(y0, y1) * 128)));

      // Include horizontal boundaries and both endpoint rows for pixel-area integration.
      for (let row = low; row <= high; row++) {
        rows[row]!.push(curve);
      }
    }

    const size = 256 + rows.reduce((sum, row) => sum + row.length, 0);

    if (used + size > data.length) {
      continue;
    }

    entry.offset = used;
    used += 256;

    for (const [index, row] of rows.entries()) {
      data[entry.offset + index * 2] = used;
      data[entry.offset + index * 2 + 1] = row.length;
      data.set(row, used);
      used += row.length;
    }
  }

  return {
    instances: indexed(document.instances),
    clips: indexed(document.clips),
    bins: data.slice(0, used).buffer
  };

  function indexed(source: ArrayBuffer) {
    const copy = source.slice(0);
    const words = new Uint32Array(copy);

    for (let i = 0; i < words.length; i += 20) {
      if (words[i + 7] === 0 && words[i + 18]! <= 1) {
        words[i + 7] = known.get(`${words[i + 16]}:${words[i + 17]}`)?.offset ?? 0;
      }
    }

    return copy;
  }
}
