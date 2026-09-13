import type { BrushFormValues } from './form';

/**
 * Photoshop's per-tip depth in [0, 1]. The caller supplies a normalized device
 * control without minimum-depth remapping, and a dedicated channel-5 random stream.
 * Step is the zero-based spacing event, shared by copies emitted at that event.
 * Executable evidence is maintained in the separate photoshop-analysis project.
 */
export function textureDepth(
  texture: BrushFormValues['texture'],
  control: number,
  step: number,
  random: () => number
): number {
  const maximum = percentByte(texture.depth);
  const product = maximum * percentByte(texture.minimumDepth) + 128;
  const minimum = (product + (product >> 8)) >> 8;
  let depth = maximum;
  if (texture.depthControl !== 0) {
    let start = maximum, end = minimum;
    if (texture.mode === 'Hght' || texture.mode === 'linearHeight') {
      start = minimum;
      end = maximum;
    }
    const range = end - start;
    depth = end;
    if (texture.depthControl === 1) {
      const remaining = texture.depthFade - step;
      depth = start;
      if (remaining > 0) {
        const fixed = fixedDivide(remaining, texture.depthFade);
        depth += fixedMultiply(fixed, range);
      }
    } else if (texture.depthControl === 2) {
      depth = start + Math.trunc(Math.fround(Math.fround(control) * range + 0.5));
    } else if (texture.depthControl === 4) {
      depth = start + Math.trunc(Math.fround(Math.fround(control) * range) + 0.5);
    } else if (texture.depthControl === 3 || texture.depthControl === 8) {
      const delta = range * Math.trunc(control * 255);
      depth = start + (delta < -127 ? -Math.trunc((127 - delta) / 255) : Math.trunc((delta + 127) / 255));
    }
    depth = Math.max(0, Math.min(255, depth));
  }
  if (texture.depthJitter > 0) {
    const amplitude = (maximum - minimum) * Math.trunc(texture.depthJitter) * 0.01;
    const bound = Math.trunc(amplitude);
    let delta = 0;
    if (amplitude > 0) delta = Math.max(-bound, Math.min(bound, Math.floor((random() * 2 - 1) * amplitude + 0.5)));
    const candidate = depth + delta;
    depth = candidate;
    if (candidate > maximum) depth = maximum * 2 - candidate;
    if (candidate < minimum) depth = minimum * 2 - candidate;
    depth = Math.max(0, Math.min(255, depth));
  }
  return depth / 255;
}

function percentByte(percent: number) {
  return Math.max(0, Math.min(255, Math.trunc((Math.trunc(percent) * 255 + 50) / 100)));
}

/** Mirrors the system FixDiv used by Photoshop, for nonnegative Fade ratios. */
function fixedDivide(numerator: number, denominator: number) {
  return Math.floor(numerator * 65536 / denominator + 0.5);
}

/** Preserves FixMul's double-mantissa rounding, including negative depth ranges. */
function fixedMultiply(fixed: number, range: number) {
  if (fixed === 65536) return range;
  const product = fixed * range / 4294967296;
  if (product < 0) {
    const encoded = -34359738368 + product;
    return -Math.floor((-encoded - 34359738368) * 131072 / 2);
  }
  const encoded = 34359738368.00001 + product;
  return Math.floor((encoded - 34359738368) * 131072 / 2);
}
