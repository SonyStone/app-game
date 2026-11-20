import type { BrushResource } from '@app-game/abr-paint/resources';

/** Paint sampled a clamped linear texture. At large zoom a single texel of transparent ABR border is visible. */
export function paintCoverageScale(width: number, height: number) {
  return Math.max(1, Math.floor(128 / Math.max(width, height)));
}

/** Keeps the runtime mask distinct from its editable source, which can also be used by a Photoshop preset. */
export const linearCoveragePrefix = 'paint-linear-r8:';

/** Bakes clamped bilinear sampling into a small working mask. Integer scaling preserves its native aspect ratio. */
export function paintSampledCoverage(source: BrushResource): BrushResource {
  const scale = paintCoverageScale(source.width, source.height);
  if (scale === 1) {
    return source;
  }
  const width = source.width * scale;
  const height = source.height * scale;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = Math.max(0, (y + 0.5) / scale - 0.5);
    const row = Math.floor(v);
    const next = Math.min(source.height - 1, row + 1);
    const firstRow = row * source.width;
    const secondRow = next * source.width;
    for (let x = 0; x < width; x++) {
      const u = Math.max(0, (x + 0.5) / scale - 0.5);
      const col = Math.floor(u);
      const right = Math.min(source.width - 1, col + 1);
      const topLeft = source.pixels[firstRow + col]!;
      const bottomLeft = source.pixels[secondRow + col]!;
      const top = topLeft + (source.pixels[firstRow + right]! - topLeft) * (u - col);
      const bottom = bottomLeft + (source.pixels[secondRow + right]! - bottomLeft) * (u - col);
      pixels[y * width + x] = Math.round(top + (bottom - top) * (v - row));
    }
  }
  return { id: linearCoveragePrefix + source.id, width, height, format: source.format, pixels };
}
