import { d, std } from 'typegpu';

/** Stable IDs for supported paint-tool blend modes. Unknown modes must be reported by the host. */
export const paintModes = [
  'Nrml',
  'Dslv',
  'Mltp',
  'Scrn',
  'Ovrl',
  'Drkn',
  'Lghn',
  'CDdg',
  'CBrn',
  'linearDodge',
  'linearBurn',
  'HrdL',
  'SftL',
  'Dfrn',
  'Xclu',
  'Sbtr',
  'divide',
  'H   ',
  'Strt',
  'Clr ',
  'Lmns',
  'darkerColor',
  'lighterColor',
  'vividLight',
  'linearLight',
  'pinLight',
  'hardMix',
  'Bhnd',
  'Cler'
] as const;

/** Standard separable/nonseparable color blending; alpha compositing belongs to the caller.
 * Reference: https://www.w3.org/TR/compositing-1/#blending . This does not model Photoshop's legacy color settings.
 */
export function paintBlend(base: d.v3f, source: d.v3f, mode: number): d.v3f {
  'use gpu';
  if (mode === 17) return setLum(setSat(source, saturation(base)), luminance(base));
  if (mode === 18) return setLum(setSat(base, saturation(source)), luminance(base));
  if (mode === 19) return setLum(source, luminance(base));
  if (mode === 20) return setLum(base, luminance(source));
  if (mode === 21) return d.vec3f(std.select(source, base, luminance(base) <= luminance(source)));
  if (mode === 22) return d.vec3f(std.select(source, base, luminance(base) >= luminance(source)));
  return d.vec3f(channel(base.r, source.r, mode), channel(base.g, source.g, mode), channel(base.b, source.b, mode));
}
function channel(a: number, b: number, mode: number): number {
  'use gpu';
  if (mode === 2) return a * b;
  if (mode === 3) return a + b - a * b;
  if (mode === 4) return hardLight(b, a);
  if (mode === 5) return std.min(a, b);
  if (mode === 6) return std.max(a, b);
  if (mode === 7) return dodge(a, b);
  if (mode === 8) return burn(a, b);
  if (mode === 9) return std.min(1, a + b);
  if (mode === 10) return std.max(0, a + b - 1);
  if (mode === 11) return hardLight(a, b);
  if (mode === 12) {
    if (b <= 0.5) return a - (1 - 2 * b) * a * (1 - a);
    const curve = std.select(std.sqrt(a), ((16 * a - 12) * a + 4) * a, a <= 0.25);
    return a + (2 * b - 1) * (curve - a);
  }
  if (mode === 13) return std.abs(a - b);
  if (mode === 14) return a + b - 2 * a * b;
  if (mode === 15) return std.max(0, a - b);
  if (mode === 16) return std.min(1, a / std.max(0.00001, b));
  if (mode === 23) {
    if (b <= 0.5) return burn(a, b * 2);
    return dodge(a, b * 2 - 1);
  }
  if (mode === 24) return std.clamp(a + 2 * b - 1, 0, 1);
  if (mode === 25) {
    if (b <= 0.5) return std.min(a, b * 2);
    return std.max(a, b * 2 - 1);
  }
  if (mode === 26) return std.step(1, a + b);
  return b;
}
function hardLight(a: number, b: number): number {
  'use gpu';
  if (b <= 0.5) return 2 * a * b;
  return 1 - 2 * (1 - a) * (1 - b);
}
function dodge(a: number, b: number): number {
  'use gpu';
  if (a === 0) return 0;
  if (b === 1) return 1;
  return std.min(1, a / (1 - b));
}
function burn(a: number, b: number): number {
  'use gpu';
  if (a === 1) return 1;
  if (b === 0) return 0;
  return 1 - std.min(1, (1 - a) / b);
}
function luminance(color: d.v3f): number {
  'use gpu';
  return std.dot(color, d.vec3f(0.3, 0.59, 0.11));
}
function saturation(color: d.v3f): number {
  'use gpu';
  return std.max(color.r, std.max(color.g, color.b)) - std.min(color.r, std.min(color.g, color.b));
}
function setLum(color: d.v3f, value: number): d.v3f {
  'use gpu';
  let result = std.add(color, d.vec3f(value - luminance(color)));
  const low = std.min(result.r, std.min(result.g, result.b));
  const high = std.max(result.r, std.max(result.g, result.b));
  if (low < 0)
    result = std.add(d.vec3f(value), std.mul(std.sub(result, d.vec3f(value)), value / std.max(0.00001, value - low)));
  if (high > 1)
    result = std.add(
      d.vec3f(value),
      std.mul(std.sub(result, d.vec3f(value)), (1 - value) / std.max(0.00001, high - value))
    );
  return d.vec3f(result);
}
function setSat(color: d.v3f, value: number): d.v3f {
  'use gpu';
  const low = std.min(color.r, std.min(color.g, color.b));
  const range = saturation(color);
  return std.mul(std.sub(color, d.vec3f(low)), value / std.max(0.00001, range));
}
