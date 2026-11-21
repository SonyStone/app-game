import type { BlendMode, Layer } from './document';
import { maskCoverage, maskPixels, type LayerMask } from './layerMask';
import { shownMask } from './layerTree';
import { TILE_BYTES, unpackTile, type TileData } from './tilePixels';

/**
 * Composites one tile of an upper layer onto the same tile of the layer below, as the display does
 * (`@app-game/abr-paint/gpu/layerComposite`): the upper layer's `blend` and `opacity` apply, the lower layer's pixels
 * are the base on their own. Tiles are premultiplied sRGB RGBA8, `undefined` when absent. Returns the merged tile, or
 * `undefined` when it is fully transparent. Keep the math in step with the shader; the `layer-merge` GPU verification
 * compares the display before and after a merge.
 *
 * The merged layer looks the same as the two layers wherever the lower layer is opaque, and everywhere when both are
 * Normal, apart from 8-bit rounding. Otherwise,
 * where the lower layer is translucent, the upper layer has been blended with it alone rather than with everything
 * below, so the result can differ; Photoshop's Merge Down has the same limitation.
 *
 * With `clip`, the upper layer is clipped: its alpha is multiplied by the alpha of `clip.base`, the clipping base
 * layer's own tile (`undefined` where the base is transparent), as the shader does with its `clip` texture. With
 * `linear`, the document's `linearBlending`, both colors are decoded from sRGB before blending and the result encoded
 * again, as the shader does for every mode.
 */
export function mergeTilePixels(
  lower: Uint8Array | undefined,
  upper: Uint8Array,
  blend: BlendMode,
  opacity: number,
  clip?: { base: Uint8Array | undefined },
  linear = false
): Uint8Array | undefined {
  const result = new Uint8Array(TILE_BYTES);
  const mode = blendModes.indexOf(blend);
  let covered = false;
  for (let index = 0; index < TILE_BYTES; index += 4) {
    const base = pixel(lower, index);
    const source = clip ? scale(pixel(upper, index), pixel(clip.base, index)[3]) : pixel(upper, index);
    const out = linear
      ? encodePremultiplied(composite(decodePremultiplied(base), decodePremultiplied(source), opacity, mode))
      : composite(base, source, opacity, mode);
    for (let channel = 0; channel < 4; channel++) {
      result[index + channel] = Math.round(Math.min(1, Math.max(0, out[channel]!)) * 255);
    }

    covered ||= result[index + 3]! > 0;
  }

  return covered ? result : undefined;
}

/**
 * The lower layer's new tiles when raster `upper` merges down into raster `lower`, for `mergeDown` of the document.
 * Each layer's enabled mask is baked into its pixels first (`maskPixels`), so the merged layer, which has no mask,
 * looks as the two did; a disabled mask had no effect and is dropped. The upper layer is then composited with
 * `mergeTilePixels`, clipped to the lower layer's masked pixels when `clipped`. Covers every tile of the upper layer
 * and, when the lower layer has an enabled mask, every tile of the lower layer; `undefined` removes a tile. `read`
 * loads a tile version that may be in storage.
 */
export async function mergeDownTiles(
  upper: Pick<Layer, 'tiles' | 'blend' | 'opacity' | 'mask'>,
  lower: Pick<Layer, 'tiles' | 'mask'>,
  options: { clipped: boolean; linear: boolean; read: (data: TileData) => Promise<Uint8Array> }
): Promise<Map<string, Uint8Array | undefined>> {
  const keys = new Set(upper.tiles.keys());
  if (shownMask(lower)) {
    for (const key of lower.tiles.keys()) {
      keys.add(key);
    }
  }

  const merged = new Map<string, Uint8Array | undefined>();
  for (const key of keys) {
    const base = await maskedTile(lower, key, options.read);
    const top = await maskedTile(upper, key, options.read);
    merged.set(
      key,
      top
        ? mergeTilePixels(base, top, upper.blend, upper.opacity, options.clipped ? { base } : undefined, options.linear)
        : base
    );
  }

  return merged;
}

/**
 * The tiles of raster `layer` that change when its mask, enabled or not, is multiplied into its pixels, for
 * `applyMask` of the document: each with the pixels `maskPixels` gives, `undefined` where nothing is left.
 */
export async function appliedMaskTiles(
  layer: Pick<Layer, 'tiles'> & { mask: LayerMask },
  read: (data: TileData) => Promise<Uint8Array>
): Promise<Map<string, Uint8Array | undefined>> {
  const result = new Map<string, Uint8Array | undefined>();
  for (const [key, data] of layer.tiles) {
    const pixels = unpackTile(await read(data));
    const masked = maskPixels(pixels, await coverageAt(layer.mask, key, read), layer.mask.inverted);
    if (masked.every((value, index) => value === pixels[index])) {
      continue;
    }

    result.set(key, hasAlpha(masked) ? masked : undefined);
  }

  return result;
}

/** The pixels of `layer` at `key` with its enabled mask baked in, `undefined` where it has none left. */
async function maskedTile(
  layer: Pick<Layer, 'tiles' | 'mask'>,
  key: string,
  read: (data: TileData) => Promise<Uint8Array>
): Promise<Uint8Array | undefined> {
  const data = layer.tiles.get(key);
  if (!data) {
    return undefined;
  }

  const pixels = unpackTile(await read(data));
  const mask = shownMask(layer);
  if (!mask) {
    return pixels;
  }

  const masked = maskPixels(pixels, await coverageAt(mask, key, read), mask.inverted);
  return hasAlpha(masked) ? masked : undefined;
}

/** The stored coverage of `mask` at tile `key`. */
async function coverageAt(mask: LayerMask, key: string, read: (data: TileData) => Promise<Uint8Array>) {
  const data = mask.tiles.get(key);
  return maskCoverage(data && (await read(data)), mask.outside);
}

function hasAlpha(pixels: Uint8Array) {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index]) {
      return true;
    }
  }

  return false;
}

/** Blend mode indices of the composite shader's `settings.y`; the renderer uploads the same indices. */
export const blendModes: readonly BlendMode[] = ['normal', 'multiply', 'screen', 'overlay'];

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

/** `decodePremultiplied` from `@app-game/abr-brush/effects`: premultiplied sRGB to premultiplied linear light. */
function decodePremultiplied([r, g, b, a]: Rgba): Rgba {
  if (a <= 0) {
    return [0, 0, 0, 0];
  }

  return [decodeChannel(clamp01(r / a)) * a, decodeChannel(clamp01(g / a)) * a, decodeChannel(clamp01(b / a)) * a, a];
}

/** `encodePremultiplied` from `@app-game/abr-brush/effects`: premultiplied linear light back to premultiplied sRGB. */
function encodePremultiplied([r, g, b, a]: Rgba): Rgba {
  if (a <= 0) {
    return [0, 0, 0, 0];
  }

  return [encodeChannel(clamp01(r / a)) * a, encodeChannel(clamp01(g / a)) * a, encodeChannel(clamp01(b / a)) * a, a];
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
