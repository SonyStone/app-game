export {
  decodePremultiplied,
  encodePremultiplied,
  linearSourceOver,
  mixPremultiplied,
  sampleMixing,
  type ColorMixing
} from './colorMixing';
import { std } from 'typegpu';

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
  fingerPaintComposite,
  fingerPaintCompositeInSpace,
  retouchColor,
  retouchComposite,
  retouchCompositeInSpace
} from './retouch';

/** Stable shader IDs for the descriptor's texture and dual-tip blend modes. */
export function blendModeId(mode: string) {
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
 * Height modes use depth as paint height, not as opacity of a blend result.
 * The 10× depth response follows Krita's documented Photoshop-height approximation.
 * Pattern luminance is relief: dark recesses receive paint first as depth increases.
 */
export function textureCoverage(coverage: number, tone: number, mode: number, depth: number): number {
  'use gpu';
  if (mode === 8 || mode === 9) {
    const height = coverage * depth * 10;
    let result = height - tone;
    if (mode === 8) result = std.max(result, height * (1 - tone));
    return std.clamp(result, 0, coverage);
  }
  return coverage * (1 - depth) + blendCoverage(coverage, tone, mode) * depth;
}

/** Hard Mix creates binary coverage inside the primary tip; clamping it back to the soft tip erases its contrast. */
export function dualCoverage(primary: number, secondary: number, mode: number): number {
  'use gpu';
  if (primary <= 0) return 0;
  const mixed = blendCoverage(primary, secondary, mode);
  if (mode === 7) return mixed;
  return std.min(primary, mixed);
}

/** Texture tone controls are applied before coverage blending. */
export function textureTone(sample: number, invert: number, brightness: number, contrast: number): number {
  'use gpu';
  let value = sample;
  if (invert > 0) value = 1 - value;
  return std.clamp((value - 0.5) * (1 + contrast / 100) + 0.5 + brightness / 150, 0, 1);
}

/** A deterministic integer-grid noise pattern avoids shimmering when settings change. */
export function grain(x: number, y: number, seed: number): number {
  'use gpu';
  return std.fract(std.sin(std.floor(x) * 12.9898 + std.floor(y) * 78.233 + seed) * 43758.5453);
}
