/**
 * TypeGPU Drawing Framework - Blend Registry
 *
 * Manages blend mode definitions and color blend mode definitions.
 * Allows dynamic registration of custom blend modes.
 */

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { BlendModeDefinition, ColorBlendModeDefinition } from '../core/types';

// ============================================================================
// MARK: Built-in Blend Mode Functions
// ============================================================================

/** Normal blend mode: standard alpha compositing */
export const blendNormal = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = (src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / outAlpha;
  return vec4f(outRgb, outAlpha);
}`;

/** Multiply blend mode: darkens by multiplying colors */
export const blendMultiply = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let blended = src.rgb * dst.rgb;
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = mix(dst.rgb, blended, src.a);
  return vec4f(outRgb, outAlpha);
}`;

/** Screen blend mode: lightens by inverting, multiplying, and inverting */
export const blendScreen = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let blended = 1.0 - (1.0 - src.rgb) * (1.0 - dst.rgb);
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = mix(dst.rgb, blended, src.a);
  return vec4f(outRgb, outAlpha);
}`;

/** Overlay blend mode: combines multiply and screen */
export const blendOverlay = tgpu.fn([d.vec4f, d.vec4f], d.vec4f) /* wgsl */ `(src, dst) {
  let lum = dot(dst.rgb, vec3f(0.299, 0.587, 0.114));
  var blended: vec3f;
  if (lum < 0.5) {
    blended = 2.0 * src.rgb * dst.rgb;
  } else {
    blended = 1.0 - 2.0 * (1.0 - src.rgb) * (1.0 - dst.rgb);
  }
  let outAlpha = src.a + dst.a * (1.0 - src.a);
  if (outAlpha < 0.0001) {
    return vec4f(0.0);
  }
  let outRgb = mix(dst.rgb, blended, src.a);
  return vec4f(outRgb, outAlpha);
}`;

// ============================================================================
// MARK: Built-in Color Space Functions
// ============================================================================

/** Convert from gamma (sRGB) to linear color space */
export const gammaToLinear = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((color) => {
  'use gpu';
  return std.pow(color, d.vec3f(2.2, 2.2, 2.2));
});

/** Convert from linear to gamma (sRGB) color space */
export const linearToGamma = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((color) => {
  'use gpu';
  return std.pow(color, d.vec3f(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
});

/** Convert RGB to HSV color space */
export const rgbToHsv = tgpu.fn([d.vec3f], d.vec3f) /* wgsl */ `(rgb) {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(rgb.bg, K.wz), vec4f(rgb.gb, K.xy), step(rgb.b, rgb.g));
  let q = mix(vec4f(p.xyw, rgb.r), vec4f(rgb.r, p.yzx), step(p.x, rgb.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}`;

/** Convert HSV to RGB color space */
export const hsvToRgb = tgpu.fn([d.vec3f], d.vec3f) /* wgsl */ `(hsv) {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
  return hsv.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), hsv.y);
}`;

// ============================================================================
// MARK: Built-in Blend Modes
// ============================================================================

export const BUILTIN_BLEND_MODES: BlendModeDefinition[] = [
  {
    id: 'normal',
    name: 'Normal',
    description: 'Standard alpha compositing',
    blendFn: blendNormal
  },
  {
    id: 'multiply',
    name: 'Multiply',
    description: 'Darkens by multiplying colors',
    blendFn: blendMultiply
  },
  {
    id: 'screen',
    name: 'Screen',
    description: 'Lightens by inverting, multiplying, and inverting',
    blendFn: blendScreen
  },
  {
    id: 'overlay',
    name: 'Overlay',
    description: 'Combines multiply and screen based on luminance',
    blendFn: blendOverlay
  }
];

export const BUILTIN_COLOR_BLEND_MODES: ColorBlendModeDefinition[] = [
  {
    id: 'gamma',
    name: 'Gamma (sRGB)'
    // No conversion needed - already in gamma space
  },
  {
    id: 'linear',
    name: 'Linear',
    toColorSpace: gammaToLinear,
    fromColorSpace: linearToGamma
  },
  {
    id: 'hsv',
    name: 'HSV',
    toColorSpace: rgbToHsv,
    fromColorSpace: hsvToRgb
  }
];

// ============================================================================
// MARK: Blend Registry
// ============================================================================

/**
 * Blend Mode Registry - manages all available blend modes.
 */
export class BlendRegistry {
  private blendModes: Map<string, BlendModeDefinition> = new Map();
  private colorBlendModes: Map<string, ColorBlendModeDefinition> = new Map();

  constructor() {
    // Register built-in blend modes
    for (const mode of BUILTIN_BLEND_MODES) {
      this.registerBlendMode(mode);
    }

    // Register built-in color blend modes
    for (const mode of BUILTIN_COLOR_BLEND_MODES) {
      this.registerColorBlendMode(mode);
    }
  }

  // ---- Blend Modes ----

  registerBlendMode(mode: BlendModeDefinition): void {
    this.blendModes.set(mode.id, mode);
  }

  unregisterBlendMode(id: string): void {
    this.blendModes.delete(id);
  }

  getBlendMode(id: string): BlendModeDefinition | undefined {
    return this.blendModes.get(id);
  }

  getAllBlendModes(): BlendModeDefinition[] {
    return Array.from(this.blendModes.values());
  }

  getBlendModeIds(): string[] {
    return Array.from(this.blendModes.keys());
  }

  // ---- Color Blend Modes ----

  registerColorBlendMode(mode: ColorBlendModeDefinition): void {
    this.colorBlendModes.set(mode.id, mode);
  }

  unregisterColorBlendMode(id: string): void {
    this.colorBlendModes.delete(id);
  }

  getColorBlendMode(id: string): ColorBlendModeDefinition | undefined {
    return this.colorBlendModes.get(id);
  }

  getAllColorBlendModes(): ColorBlendModeDefinition[] {
    return Array.from(this.colorBlendModes.values());
  }

  getColorBlendModeIds(): string[] {
    return Array.from(this.colorBlendModes.keys());
  }
}

/**
 * Create a blend registry (includes built-in modes).
 */
export function createBlendRegistry(): BlendRegistry {
  return new BlendRegistry();
}
