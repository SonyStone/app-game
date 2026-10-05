/**
 * A Photoshop document as a flat list of raster layers, the part of the format that painting programs exchange:
 * layer pixels, names, opacity, fill, visibility, blend modes, clipping and locked transparency. Pixels are straight
 * (not premultiplied) 8-bit RGBA, row by row.
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
  /** Layer opacity, from 0 to 1; read layers include the opacity of the groups around them. */
  opacity: number;
  /** Photoshop's Fill opacity, from 0 to 1, which leaves layer effects untouched; 1 when omitted on writing. */
  fill?: number;
  /** Read layers are visible only if every group around them is. */
  visible: boolean;
  blend: PsdBlend;
  /** Clipped to the layer below, Photoshop's clipping mask. */
  clipping: boolean;
  /** Photoshop's Lock transparent pixels. */
  transparencyLocked: boolean;
};

/** Photoshop's blend modes. `passThrough` belongs to groups and never appears on a flattened layer. */
export type PsdBlend =
  | 'passThrough'
  | 'normal'
  | 'dissolve'
  | 'darken'
  | 'multiply'
  | 'colorBurn'
  | 'linearBurn'
  | 'darkerColor'
  | 'lighten'
  | 'screen'
  | 'colorDodge'
  | 'linearDodge'
  | 'lighterColor'
  | 'overlay'
  | 'softLight'
  | 'hardLight'
  | 'vividLight'
  | 'linearLight'
  | 'pinLight'
  | 'hardMix'
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** Largest width and height of a PSD; `writePsd` writes larger canvases as PSB. */
export const maxPsdSide = 30000;

/** Largest width and height of a PSB. */
export const maxPsbSide = 300000;
