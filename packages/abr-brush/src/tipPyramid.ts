import type { TipLevel } from './tipSampling';

/** Builds the byte pyramid used by Photoshop's sampled-tip affine sampler.
 * The source is a tightly packed byte image with positive dimensions < 32768.
 * Levels own their storage. Destination storage starts at zero, including cells
 * that Photoshop's builder leaves untouched. The filtering rules preserve that padding.
 */
export function createTipPyramid(source: TipLevel): TipLevel[] {
  const levels: TipLevel[] = [{ ...source, data: Uint8Array.from(source.data) }];
  let extent = Math.max(source.width, source.height) * 65536;
  for (let index = 1; index < 16 && extent > 16384; index++) {
    const previous = levels[index - 1]!;
    const width = (previous.width >> 1) + 1;
    const height = (previous.height >> 1) + 1;
    const rows = new Uint8Array(width * previous.height);
    for (let y = 0; y < previous.height; y++) {
      reduceLine(previous.data, y * previous.width, 1, previous.width, rows, y * width, 1);
    }
    const data = new Uint8Array(width * height);
    // The vertical dispatcher processes ceil(previous.width / 2) columns.
    // For even widths the last interior column remains at its initial value.
    for (let x = 0; x < Math.ceil(previous.width / 2); x++) {
      reduceLine(rows, x, width, previous.height, data, x, width);
    }
    levels.push({ width, height, data });
    if (extent <= 32769) break;
    extent >>>= 1;
  }
  return levels;
}

/** Photoshop's separable reduction kernel, rounded and clamped after each axis. */
function reduceLine(
  source: ArrayLike<number>, offset: number, stride: number, length: number,
  destination: Uint8Array, targetOffset: number, targetStride: number
): void {
  const read = (index: number) => index < 0 || index >= length ? 0 : source[offset + index * stride]!;
  for (let i = 0; i <= (length >> 1); i++) {
    const center = i * 2;
    const sum = 16 * read(center) + 9 * (read(center - 1) + read(center + 1))
      - read(center - 3) - read(center + 3);
    destination[targetOffset + i * targetStride] = Math.max(0, Math.min(255, (sum + 16) >> 5));
  }
}
