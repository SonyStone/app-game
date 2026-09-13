import { multiplyAdd } from './tipMath';
import type { prepareTabletInput } from './tabletInput';

/**
 * Photoshop's generic float device control before jitter. Low/high are the
 * caller's range; minimum raises the low end by its integer percentage.
 * Fade counts spacing events. Direction and specialized Rotation control 7
 * are not evaluated by this routine and return high, as does Off.
 */
export function deviceControlValue(
  control: number, fade: number, minimum: number, step: number,
  tablet: ControlTablet, low = 0, high = 1
): number {
  low = Math.fround(low);
  high = Math.fround(high);
  if (minimum !== 0) {
    const fraction = Math.fround(Math.fround(minimum) * Math.fround(.01));
    low = Math.fround(Math.fround(high - low) * fraction + low);
  }
  if (control === 1) {
    if (step >= fade) return low;
    const elapsed = Math.fround(Math.fround(step) / Math.fround(fade));
    return Math.fround(Math.fround(low - high) * elapsed + high);
  }
  if (control !== 2 && control !== 3 && control !== 4 && control !== 8) return high;
  const value = Math.fround(deviceControlInput(control, tablet));
  return Math.fround(Math.fround(high - low) * value + low);
}

/** Device factor before the caller's float or byte quantization. Color/Texture
 * retain double inverse tilt until byte conversion. Float controls round it
 * before range interpolation; Size/Pen Tilt uses a separate magnitude entirely.
 * Fade is evaluated by the caller using its spacing-event counter.
 */
export function deviceControlInput(control: number, tablet: ControlTablet): number {
  if (control === 2) return Math.fround(tablet.pressure);
  if (control === 3) return 1 - Math.sqrt(multiplyAdd(tablet.tiltX, tablet.tiltX, tablet.tiltY * tablet.tiltY));
  if (control === 4) return Math.fround(tablet.tangentialPressure);
  if (control === 8) return Math.fround(Math.min(Math.fround(tablet.rotation), rotationMaximum) / rotationMaximum);
  return 1;
}

/** Normalized tracking values, after capability defaults and Brush Pose. */
export type ControlTablet = Pick<ReturnType<typeof prepareTabletInput>,
  'tiltX' | 'tiltY' | 'pressure' | 'rotation' | 'tangentialPressure'>;

// Original float constant at 0x105dca7b0; values above it clamp before division.
const rotationMaximum = 359.9999084472656;
