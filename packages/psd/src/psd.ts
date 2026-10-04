/**
 * A layered Photoshop document of 8-bit RGB raster layers, the part of the format that painting programs exchange:
 * layer pixels, names, opacity, visibility, blend modes, clipping and locked transparency. Pixels are straight
 * (not premultiplied) RGBA, row by row.
 */
export type PsdDocument = {
  width: number;
  height: number;
  /** Bottom to top, as Photoshop stores them. */
  layers: PsdLayer[];
};

/** One raster layer, placed at `left`, `top` on the canvas; it may reach past the canvas or be empty. */
export type PsdLayer = {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Straight RGBA, `width` × `height` pixels. */
  pixels: Uint8Array;
  /** From 0 to 1. */
  opacity: number;
  visible: boolean;
  blend: PsdBlend;
  /** Clipped to the layer below, Photoshop's clipping mask. */
  clipping: boolean;
  /** Photoshop's Lock transparent pixels. */
  transparencyLocked: boolean;
};

/** The blend modes kept on import and export; others read as `normal`. */
export type PsdBlend = 'normal' | 'multiply' | 'screen' | 'overlay';

/** Photoshop's blend mode keys by blend mode. */
export const blendKeys: Record<PsdBlend, string> = {
  normal: 'norm',
  multiply: 'mul ',
  screen: 'scrn',
  overlay: 'over'
};

/** Largest width and height of a PSD; larger documents need PSB. */
export const maxPsdSide = 30000;
