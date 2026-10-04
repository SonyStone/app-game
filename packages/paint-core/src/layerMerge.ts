import type { BlendMode } from './document';
import { TILE_BYTES } from './tilePixels';

/**
 * Composites one tile of an upper layer onto the same tile of the layer below, as the display does
 * (`@app-game/abr-paint/gpu/layerComposite`): the upper layer's `blend` and `opacity` apply, the lower layer's pixels
 * are the base on their own. Tiles are premultiplied sRGB RGBA8, `undefined` when absent. Returns the merged tile, or
 * `undefined` when it is fully transparent. Keep the math in step with the shader; the `layer-merge` GPU verification
 * compares the display before and after a merge.
 *
 * The merged layer looks the same as the two layers wherever the lower layer is opaque, and everywhere when both use
 * the same source-over mode (Normal on Normal, Smooth color on Smooth color), apart from 8-bit rounding. Otherwise,
 * where the lower layer is translucent, the upper layer has been blended with it alone rather than with everything
 * below, so the result can differ; Photoshop's Merge Down has the same limitation.
 *
 * With `clip`, the upper layer is clipped: its alpha is multiplied by the alpha of `clip.base`, the clipping base
 * layer's own tile (`undefined` where the base is transparent), as the shader does with its `clip` texture.
 */
export function mergeTilePixels(
  lower: Uint8Array | undefined,
  upper: Uint8Array,
  blend: BlendMode,
  opacity: number,
  clip?: { base: Uint8Array | undefined }
): Uint8Array | undefined {
  const result = new Uint8Array(TILE_BYTES);
  const mode = blendModes.indexOf(blend);
  let covered = false;
  for (let index = 0; index < TILE_BYTES; index += 4) {
    const base = pixel(lower, index);
    const source = clip ? scale(pixel(upper, index), pixel(clip.base, index)[3]) : pixel(upper, index);
    const out =
      mode === linearMode ? linearSourceOver(base, scale(source, opacity)) : composite(base, source, opacity, mode);
    for (let channel = 0; channel < 4; channel++) {
      result[index + channel] = Math.round(Math.min(1, Math.max(0, out[channel]!)) * 255);
    }

    covered ||= result[index + 3]! > 0;
  }

  return covered ? result : undefined;
}

/** Blend mode indices of the composite shader's `settings.y`; the renderer uploads the same indices. */
export const blendModes: readonly BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'linear'];
const linearMode = blendModes.indexOf('linear');

type Rgba = [number, number, number, number];

function pixel(tile: Uint8Array | undefined, index: number): Rgba {
  if (!tile) {
    return [0, 0, 0, 0];
  }

  return [tile[index]! / 255, tile[index + 1]! / 255, tile[index + 2]! / 255, tile[index + 3]! / 255];
}

function scale([r, g, b, a]: Rgba, amount: number): Rgba {
  return [r * amount, g * amount, b * amount, a * amount];
}

/** `compositeFragment` for the separable modes: Normal (0), Multiply (1), Screen (2) and Overlay (3). */
function composite(base: Rgba, source: Rgba, opacity: number, mode: number): Rgba {
  const alpha = source[3] * opacity;
  const result: Rgba = [0, 0, 0, alpha + base[3] * (1 - alpha)];
  for (let channel = 0; channel < 3; channel++) {
    const cb = base[channel]! / Math.max(base[3], 0.000001);
    const cs = source[channel]! / Math.max(source[3], 0.000001);
    const blended = blendChannel(cb, cs, mode);
    result[channel] = base[channel]! * (1 - alpha) + (cs * (1 - base[3]) + blended * base[3]) * alpha;
  }

  return result;
}

function blendChannel(cb: number, cs: number, mode: number) {
  if (mode === 1) {
    return cb * cs;
  }

  if (mode === 2) {
    return 1 - (1 - cb) * (1 - cs);
  }

  if (mode === 3) {
    return cb > 0.5 ? 1 - 2 * (1 - cb) * (1 - cs) : 2 * cb * cs;
  }

  return cs;
}

/** `linearSourceOver` from `@app-game/abr-brush/effects`: source-over of premultiplied sRGB in linear light. */
function linearSourceOver(base: Rgba, source: Rgba): Rgba {
  if (source[3] <= 0) {
    return base;
  }

  if (base[3] <= 0 || source[3] >= 1) {
    return source;
  }

  const alpha = source[3] + base[3] * (1 - source[3]);
  const result: Rgba = [0, 0, 0, alpha];
  for (let channel = 0; channel < 3; channel++) {
    const b = decodeChannel(clamp01(base[channel]! / base[3]));
    const s = decodeChannel(clamp01(source[channel]! / source[3]));
    const color = (s * source[3] + b * base[3] * (1 - source[3])) / alpha;
    result[channel] = encodeChannel(color) * alpha;
  }

  return result;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** sRGB transfer function, as in `@app-game/abr-brush/effects`. */
function decodeChannel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encodeChannel(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}
