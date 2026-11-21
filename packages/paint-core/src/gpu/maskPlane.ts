import type { Layer } from '../document';
import { maskCoverage, maskRgba, type LayerMask } from '../layerMask';

/**
 * A mask as the renderer paints and composites it: a layer whose id is the mask's, so its tiles have their own ids in
 * the tile caches (`tileId`), and whose tiles are the mask's coverage tiles. They upload as opaque grey RGBA tiles
 * (`maskRgba`), `outside` where the mask has none, so residency, the display cache and the brush paint them as they
 * do a layer's pixels; the composite shaders read them through `maskFactor`.
 */
export type MaskPlane = Layer & { maskOf: Pick<LayerMask, 'outside' | 'inverted'> };

/**
 * The plane of `mask`, the same object for the same mask, so a frame and a stroke share it. A changed mask (its
 * properties are immutable values) gets a new plane over the same tiles map.
 */
export function maskPlane(mask: LayerMask): MaskPlane {
  let plane = planes.get(mask);
  if (!plane) {
    plane = {
      id: mask.id,
      name: '',
      visible: true,
      opacity: 1,
      blend: 'normal',
      tiles: mask.tiles,
      maskOf: { outside: mask.outside, inverted: mask.inverted }
    };
    planes.set(mask, plane);
  }

  return plane;
}

/** Whether `layer` is a mask's plane. */
export function isMaskPlane(layer: Layer): layer is MaskPlane {
  return 'maskOf' in layer;
}

/**
 * The pixels a tile of `layer` uploads, from its loaded tile data `data`: a raster's as they are, `undefined` for
 * none; a mask plane's expanded from coverage, `outside` where it has no tile.
 */
export function planePixels(layer: Layer, data: Uint8Array | undefined): Uint8Array | undefined {
  return isMaskPlane(layer) ? maskRgba(maskCoverage(data, layer.maskOf.outside)) : data;
}

const planes = new WeakMap<LayerMask, MaskPlane>();
