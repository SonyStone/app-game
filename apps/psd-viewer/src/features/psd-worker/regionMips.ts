import type { PsdRegionPixels } from '@app-game/psd/viewer';

/**
 * Builds a box-filtered display-sRGB pyramid from final composited source pixels, weighting RGB by alpha.
 * The caller supplies a globally aligned neighbor halo at least as wide as the largest step. Filtering therefore
 * includes adjacent content rather than a transparent tile edge. Odd document edges extend the last source texel.
 * These are display products, not native Photoshop samples or point-sampled overview refinements.
 */
export function regionMips(source: PsdRegionPixels, maxStep: number): PsdRegionPixels[] {
  if (!Number.isInteger(maxStep) || maxStep < 1 || maxStep > 16 || (maxStep & (maxStep - 1)) !== 0) {
    throw new RangeError('Region mip step must be a power of two from 1 through 16.');
  }

  const levels: PsdRegionPixels[] = [];
  let previous = source;
  while (previous.step < maxStep) {
    const width = Math.ceil(previous.width / 2);
    const height = Math.ceil(previous.height / 2);
    const pixels = new Uint8Array(width * height * 4);
    const input = previous.pixels;
    for (let y = 0; y < height; y++) {
      const top = y * 2 * previous.width;
      const bottom = Math.min(y * 2 + 1, previous.height - 1) * previous.width;
      for (let x = 0; x < width; x++) {
        const left = x * 2;
        const right = Math.min(left + 1, previous.width - 1);
        const a = (top + left) * 4;
        const b = (top + right) * 4;
        const c = (bottom + left) * 4;
        const d = (bottom + right) * 4;
        const alpha = input[a + 3] + input[b + 3] + input[c + 3] + input[d + 3];
        const output = (y * width + x) * 4;
        if (alpha) {
          for (let channel = 0; channel < 3; channel++) {
            pixels[output + channel] = Math.round(
              (input[a + channel] * input[a + 3] +
                input[b + channel] * input[b + 3] +
                input[c + channel] * input[c + 3] +
                input[d + channel] * input[d + 3]) /
                alpha
            );
          }
        }

        pixels[output + 3] = Math.round(alpha / 4);
      }
    }

    previous = {
      ...source,
      width,
      height,
      step: previous.step * 2,
      pixels,
      exactToLayerRender: false,
      approximations: [...source.approximations, 'Area-filtered display-sRGB mip of the fresh layer composite.']
    };
    levels.push(previous);
  }

  return levels;
}
