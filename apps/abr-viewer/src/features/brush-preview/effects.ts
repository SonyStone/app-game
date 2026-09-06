import { std } from 'typegpu';

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
