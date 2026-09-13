export {
  decodePremultiplied,
  encodePremultiplied,
  linearSourceOver,
  mixPremultiplied,
  sampleMixing,
  type ColorMixing
} from './colorMixing';
import { d, std } from 'typegpu';

export { planCanvasPickup } from './canvasPickup';
export {
  mixerComposite,
  mixerDose,
  mixerPaint,
  mixerPickup,
  mixerPickupChannel,
  mixerReservoir,
  mixerReservoirChannel
} from './mixer';
export {
  smudgeCarry,
  fingerPaintComposite,
  fingerPaintCompositeInSpace,
  retouchColor,
  retouchComposite,
  retouchCompositeInSpace
} from './retouch';

/** Stable shader IDs for the descriptor's texture and dual-tip blend modes. */
export function blendModeId(mode: string) {
  if (mode === 'blendSubtraction') return 1;
  return [
    'Mltp',
    'Sbtr',
    'Drkn',
    'Ovrl',
    'CDdg',
    'CBrn',
    'linearBurn',
    'hardMix',
    'linearHeight',
    'Hght',
    'linearDodge',
    'Dfrn'
  ].indexOf(mode);
}

/** Coverage-space blend shared by CPU and TypeGPU. Height modes approximate Photoshop's undocumented transfer. */
export function blendCoverage(a: number, b: number, mode: number): number {
  'use gpu';
  let result = a * b;
  if (mode === 1) result = a - b;
  else if (mode === 2) result = std.min(a, b);
  else if (mode === 3) {
    if (a < 0.5) result = 2 * a * b;
    else result = 1 - 2 * (1 - a) * (1 - b);
  } else if (mode === 4) result = a / std.max(0.00001, 1 - b);
  else if (mode === 5) result = 1 - (1 - a) / std.max(0.00001, b);
  else if (mode === 6) result = a + b - 1;
  else if (mode === 7) result = std.step(1, a + b);
  else if (mode === 8) result = a + b - 1;
  else if (mode === 9) result = a + (b - 0.5) * 2;
  else if (mode === 10) result = a + b;
  else if (mode === 11) result = std.abs(a - b);
  return std.clamp(result, 0, 1);
}

/**
 * Applies texture to normalized tip coverage. Height modes follow Photoshop 26.0's
 * 8-bit brush kernels, including byte depth and fixed-point rounding. See
 * the separate photoshop-analysis project for executable evidence and scope.
 */
export function textureCoverage(coverage: number, tone: number, mode: number, depth: number): number {
  'use gpu';
  if (mode === 8 || mode === 9) {
    return heightTextureCoverage(coverage, tone, depth, mode === 8);
  }
  return coverage * (1 - depth) + blendCoverage(coverage, tone, mode) * depth;
}

/** Photoshop's Height/Linear Height operate on byte masks before stamp flow. */
function heightTextureCoverage(coverage: number, tone: number, depth: number, linear: boolean): number {
  'use gpu';
  const mask = d.i32(std.floor(std.clamp(coverage, 0, 1) * 255 + 0.5));
  const texture = d.i32(std.floor(std.clamp(tone, 0, 1) * 255 + 0.5));
  const depthByte = std.floor(std.clamp(depth, 0, 1) * 255 + 0.5);
  const scale = d.i32(std.floor(depthByte * 12288 / 255 + 0.5));
  const height = (mask * scale + 511) >> 10;
  if (!linear) return d.f32(std.clamp(height - texture, 0, 255)) / 255;
  if (texture === 0) return d.f32(std.min(height, 255)) / 255;
  if (texture === 255) return d.f32(std.clamp(height - 255, 0, 255)) / 255;
  const weight = (texture * 257 + 1) >> 1;
  const upper = std.max(height - 255, 0);
  const result = (upper * weight + (32768 - weight) * height + 16384) >> 15;
  return d.f32(std.min(result, 255)) / 255;
}

/**
 * Dual Brush mask coverage for the exposed modes, following Photoshop 26.0's
 * byte kernels. Executable evidence is kept in the separate photoshop-analysis project.
 */
export function dualCoverage(primary: number, secondary: number, mode: number): number {
  'use gpu';
  const p = std.floor(std.clamp(primary, 0, 1) * 255 + 0.5);
  const s = std.floor(std.clamp(secondary, 0, 1) * 255 + 0.5);
  if (mode === 0) return d.f32(multiplyMaskBytes(p, s)) / 255;
  if (mode === 1) return std.max(p - s, 0) / 255;
  if (mode === 2) return std.min(p, s) / 255;
  if (mode === 3) {
    if (p < 128) return d.f32(multiplyMaskBytes(2 * p, s)) / 255;
    return (255 - d.f32(multiplyMaskBytes(2 * (255 - p), 255 - s))) / 255;
  }
  if (mode === 4) {
    const denominator = 255 - d.f32(multiplyMaskBytes(s, 248));
    return divideMaskBytes(p, denominator) / 255;
  }
  // Photoshop's Dual Brush descriptor remaps Height to Color Burn.
  if (mode === 5 || mode === 9) {
    const denominator = 255 - d.f32(multiplyMaskBytes(255 - s, 248));
    return (255 - divideMaskBytes(255 - p, denominator)) / 255;
  }
  if (mode === 7) {
    return std.clamp(4 * p + 3 * s - 765, 0, 255) / 255;
  }
  if (mode === 6) return std.max(p + s - 255, 0) / 255;
  if (mode === 8) {
    const lower = std.min(2 * p, 255);
    const upper = std.max(2 * p - 255, 0);
    const weighted = d.i32(lower * (255 - s) + upper * s + 128);
    return d.f32((weighted + (weighted >> 8)) >> 8) / 255;
  }
  if (mode === 10) return std.min(p + s, 255) / 255;
  if (mode === 11) return std.abs(p - s) / 255;
  return d.f32(multiplyMaskBytes(p, s)) / 255;
}

/** Rounded byte product used by Photoshop's mask dispatch. Inputs are bytes. */
function multiplyMaskBytes(a: number, b: number): number {
  'use gpu';
  const product = d.i32(a * b + 128);
  return (product + (product >> 8)) >> 8;
}

/** Photoshop's division LUT has an all-zero numerator row, then rounded ratios. */
export function divideMaskBytes(numerator: number, denominator: number): number {
  'use gpu';
  if (numerator === 0) return 0;
  if (numerator >= denominator) return 255;
  const divisor = d.u32(denominator);
  const dividend = d.u32(numerator) * 255 + (divisor >> 1);
  let quotient = d.u32(dividend / divisor);
  // GPU float division may round just below an integer. Correct against exact byte-range products.
  if (quotient * divisor > dividend) quotient--;
  else if ((quotient + 1) * divisor <= dividend) quotient++;
  return d.f32(quotient);
}

/** Photoshop's 8-bit texture tone table, with inversion applied after the adjustment. */
export function textureTone(sample: number, invert: number, brightness: number, contrast: number): number {
  'use gpu';
  const source = d.i32(std.floor(std.clamp(sample, 0, 1) * 255 + 0.5));
  const offset = d.i32(brightness);
  const contrastPercent = d.i32(contrast);
  let value = source;
  if (contrastPercent < 0) {
    const scale = 255 + d.i32(contrastPercent * 255 / 100);
    const distance = d.i32((std.abs(source - 127) * scale + 127) / 255);
    value = 127 + offset + distance;
    if (source < 127) value = 127 + offset - distance;
  } else if (contrastPercent >= 100) {
    value = d.i32(0);
    if (source >= 127 - offset) value = d.i32(255);
  } else {
    const scale = 255 - d.i32(contrastPercent * 255 / 100);
    const shifted = source - 127 + offset;
    const distance = d.i32((std.abs(shifted) * 255 + (scale >> 1)) / scale);
    value = 127 + distance;
    if (shifted < 0) value = 127 - distance;
  }
  value = std.clamp(value, 0, 255);
  if (invert > 0) value = 255 - value;
  return d.f32(value) / 255;
}

/** A deterministic integer-grid noise pattern avoids shimmering when settings change. */
export function grain(x: number, y: number, seed: number): number {
  'use gpu';
  return std.fract(std.sin(std.floor(x) * 12.9898 + std.floor(y) * 78.233 + seed) * 43758.5453);
}
