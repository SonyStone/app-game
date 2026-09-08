import { d, std } from 'typegpu';
import { linearSourceOver, mixPremultiplied } from './colorMixing';
import { paintBlend } from './paintBlend';

/** Finishes a premultiplied 3×3 Gaussian filter. Protect Detail limits unsharp ringing
 * to the neighbourhood's straight RGB range. Native Photoshop calibration remains pending.
 */
export function retouchColor(
  center: d.v4f,
  blurred: d.v4f,
  low: d.v3f,
  high: d.v3f,
  sharpen: boolean,
  protect: boolean
) {
  'use gpu';
  if (!sharpen) return d.vec4f(blurred);
  const original = std.div(center.rgb, std.max(0.00001, center.a));
  const average = std.div(blurred.rgb, std.max(0.00001, blurred.a));
  let color = std.clamp(std.sub(std.mul(original, 2), average), d.vec3f(0), d.vec3f(1));
  if (protect) color = std.clamp(color, low, high);
  return d.vec4f(std.mul(color, center.a), center.a);
}

/** Applies the paint mode, then interpolates replacement pixels by Strength/coverage in the chosen working space.
 * Alpha is interpolated too: transparent Smudge pickup must remove coverage, rather than act as source-over paint. */
export function retouchCompositeInSpace(base: d.v4f, picked: d.v4f, amount: number, mode: number, linear: boolean) {
  'use gpu';
  const cb = std.div(base.rgb, std.max(base.a, 0.00001));
  const cs = std.div(picked.rgb, std.max(picked.a, 0.00001));
  const mixed = paintBlend(cb, cs, mode);
  const sampled = d.vec4f(std.mul(std.add(std.mul(cs, 1 - base.a), std.mul(mixed, base.a)), picked.a), picked.a);
  return mixPremultiplied(base, sampled, amount, linear);
}

/** Deposits the foreground on first contact for Finger Painting, respecting source alpha and paint mode. */
export function fingerPaintCompositeInSpace(base: d.v4f, color: d.v3f, amount: number, mode: number, linear: boolean) {
  'use gpu';
  if (linear && mode === 0) return linearSourceOver(base, d.vec4f(std.mul(color, amount), amount));
  const cb = std.div(base.rgb, std.max(base.a, 0.00001));
  const mixed = paintBlend(cb, color, mode);
  const rgb = std.add(
    std.mul(base.rgb, 1 - amount),
    std.mul(std.add(std.mul(color, 1 - base.a), std.mul(mixed, base.a)), amount)
  );
  return d.vec4f(rgb, amount + base.a * (1 - amount));
}

/** Classic retouch compositing for callers without a working-space preference. */
export function retouchComposite(base: d.v4f, picked: d.v4f, amount: number, mode: number) {
  'use gpu';
  return retouchCompositeInSpace(base, picked, amount, mode, false);
}
/** Classic first-contact foreground deposition. */
export function fingerPaintComposite(base: d.v4f, color: d.v3f, amount: number, mode: number) {
  'use gpu';
  return fingerPaintCompositeInSpace(base, color, amount, mode, false);
}
