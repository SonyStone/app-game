import { TILE_SIZE } from '@app-game/paint-core/brush';
import type { BlendMode } from '@app-game/paint-core/document';
import { mergeTilePixels } from '@app-game/paint-core/layerMerge';

/**
 * A preview of a layer blend mode, as the canvas would show it: a blue circle with a soft edge on an upper layer over
 * an orange circle on the layer below, merged with `mergeTilePixels`, the CPU port of the display's composite, and
 * laid over the paper. The soft edge shows how Smooth color mixes without the dark fringe of Normal. Returns opaque
 * RGBA of `TILE_SIZE` × `TILE_SIZE` pixels; the circles are drawn once and kept.
 */
export function blendPreview(mode: BlendMode): Uint8ClampedArray<ArrayBuffer> {
  circles ??= {
    lower: circle({ x: 96, y: 128 }, 84, 8, [240, 150, 30]),
    upper: circle({ x: 160, y: 128 }, 84, 70, [30, 90, 230])
  };
  const merged = mergeTilePixels(circles.lower, circles.upper, mode, 1);
  const image = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
  for (let index = 0; index < image.length; index += 4) {
    const cover = 1 - (merged?.[index + 3] ?? 0) / 255;
    for (let channel = 0; channel < 3; channel++) {
      image[index + channel] = (merged?.[index + channel] ?? 0) + paper[channel]! * cover;
    }

    image[index + 3] = 255;
  }

  return image;
}

/** The two circles, made on first use. */
let circles: { lower: Uint8Array; upper: Uint8Array } | undefined;

/**
 * A premultiplied tile with a circle of `color`: opaque out to `radius - soft`, then fading to transparent at `radius`,
 * antialiased at its edge.
 */
function circle(center: { x: number; y: number }, radius: number, soft: number, color: readonly number[]) {
  const tile = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const distance = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y);
      const alpha = Math.min(1, Math.max(0, (radius - distance) / Math.max(1, soft)));
      const index = (y * TILE_SIZE + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        tile[index + channel] = Math.round(color[channel]! * alpha);
      }

      tile[index + 3] = Math.round(alpha * 255);
    }
  }

  return tile;
}

/** The paper under the canvas, in presented 8-bit channels; see paint-core's `paperColor`. */
const paper = [250, 248, 244];
