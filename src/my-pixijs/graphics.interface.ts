import { BLEND_MODES, LINE_CAP, LINE_JOIN, SHAPES } from 'pixi.js';

export interface Polygon {
  points: number[];
  closeStroke: boolean;
  type: SHAPES.POLY;
}

export interface FillStyle {
  /** The hex color value used when coloring the Graphics object. */
  color: number;
  /** The alpha value used when filling the Graphics object. */
  alpha: number;
  /** The texture to be used for the fill. */
  texture?: number;
  /** The transform applied to the texture. */
  matrix?: any;
}

export interface LineStyle extends FillStyle {
  /** The width (thickness) of any lines drawn. */
  width: number;
  /** The alignment of any lines drawn (0.5 = middle, 1 = outer, 0 = inner). WebGL only. */
  alignment: number;
  /** If true the lines will be draw using LINES instead of TRIANGLE_STRIP. */
  native: boolean;
  /** Line cap style. */
  cap: LINE_CAP;
  /** Line join style. */
  join: LINE_JOIN;
  /** Miter limit. */
  miterLimit: number;
}

export interface GraphicsData {
  /** The shape object to draw. */
  shape: Polygon;
  /** The style of the line. */
  lineStyle: LineStyle;
  /** The style of the fill. */
  fillStyle: FillStyle;

  /** The collection of points. */
  points: number[];

  /** The collection of holes. */
  holes: Array<GraphicsData>;
}

export interface GraphicsGeometry {
  graphicsData: GraphicsData[];
  drawCalls: any[];
  tint: number;
  blendMode: BLEND_MODES;

  /** An array of points to draw, 2 numbers per point */
  points: number[];
  /** The indices of the vertices */
  indices: number[];

  /**
   * Minimal distance between points that are considered different.
   * Affects line tesselation.
   */
  closePointEps: number;
}

export interface Graphics {
  geometry: GraphicsGeometry;
}
