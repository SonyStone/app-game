import { vec2f, vec3f } from 'typegpu/data';

/** A 2D point with x and y coordinates */
export interface Point2D {
  x: number;
  y: number;
}

/** Brush stroke point with additional metadata */
export interface StrokePoint {
  /** X position in canvas space */
  x: number;
  /** Y position in canvas space */
  y: number;
  /** Pressure from 0 to 1 */
  pressure: number;
  /** Size multiplier */
  size: number;
}

/** Blend modes for compositing */
export enum BlendMode {
  NORMAL = 0,
  MULTIPLY = 1,
  SCREEN = 2,
  OVERLAY = 3
}

/** Color space for blending operations */
export enum ColorBlendMode {
  GAMMA = 0,
  LINEAR = 1,
  HSV = 2
}

/** Canvas transform state */
export interface CanvasTransform {
  /** Pan X offset in pixels */
  panX: number;
  /** Pan Y offset in pixels */
  panY: number;
  /** Zoom level (1 = 100%) */
  zoom: number;
  /** Rotation in radians */
  rotation: number;
}

/** RGB color as normalized values (0-1) */
export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

/** RGBA color as normalized values (0-1) */
export interface ColorRGBA extends ColorRGB {
  a: number;
}

/** Convert hex color string to RGB */
export function hexToRgb(hex: string): ColorRGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
}

/** Convert RGB to hex color string */
export function rgbToHex(rgb: ColorRGB): string {
  const r = Math.round(rgb.r * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(rgb.g * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(rgb.b * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Create a TypeGPU vec2f from a Point2D */
export function toVec2f(point: Point2D) {
  return vec2f(point.x, point.y);
}

/** Create a TypeGPU vec3f from a ColorRGB */
export function toVec3f(color: ColorRGB) {
  return vec3f(color.r, color.g, color.b);
}
