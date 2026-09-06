import type { BrushTipImage } from '../../lib/abr';
import type { PreviewResources } from './resources';
import type { PreviewInput } from './stroke';

/** Small resource swatches use original luminance or white tip coverage, without stroke effects. */
export function renderResourcePixels(input: PreviewInput, tip: BrushTipImage, resources: PreviewResources) {
  const pattern = input.resourcePreview === 'pattern';
  const source = pattern ? resources.pattern : input.resourcePreview === 'dual' ? resources.dualTip : tip;
  const pixels = new Uint8ClampedArray(input.width * input.height * 4);
  const scale = source ? Math.min(input.width / source.width, input.height / source.height) * (pattern ? 1 : 0.8) : 1;
  for (let y = 0; y < input.height; y++) {
    for (let x = 0; x < input.width; x++) {
      let gray = 40;
      if (source) {
        const sx = (x + 0.5 - input.width / 2) / scale + source.width / 2;
        const sy = (y + 0.5 - input.height / 2) / scale + source.height / 2;
        if (sx >= 0 && sy >= 0 && sx < source.width && sy < source.height) {
          // Box samples retain thin sampled tips and fine texture when reducing large resources.
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const px = Math.max(0, Math.min(source.width - 1, Math.floor(sx + dx / (3 * scale))));
              const py = Math.max(0, Math.min(source.height - 1, Math.floor(sy + dy / (3 * scale))));
              sum += source.data[py * source.width + px]!;
            }
          const value = sum / 9;
          gray = pattern ? value : 40 + value * (215 / 255);
        }
      }
      const offset = (y * input.width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = gray;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
