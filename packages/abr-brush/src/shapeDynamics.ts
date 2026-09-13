import { transferValue } from './transferDynamics';
import { multiplyAdd } from './tipMath';
import { deviceControlValue, deviceControlInput, type ControlTablet } from './deviceControl';

/**
 * Photoshop's primary size-control value before minimum-diameter interpolation.
 * Device input is normalized to 0..1. For size's Pen Tilt control, supply pen
 * pressure: Photoshop applies the tilt geometry separately. `minimum` is the
 * control minimum, not Minimum Diameter. Random uses dedicated channel 0.
 */
export function primarySizeValue(
  control: number,
  fade: number,
  minimum: number,
  jitter: number,
  deviceValue: number,
  step: number,
  random: () => number
): number {
  // 0x103e3ae08 and Transfer share the float control/jitter/reflection helpers.
  return transferValue(1, control === 3 ? 2 : control, fade, control === 3 ? 0 : minimum,
    jitter, deviceValue, step, random);
}

/** Additive sampled-primary roundness change, before the rasterizer's reflection/clamp.
 * Uses independent channel 2. Minimum Roundness limits the jitter amplitude;
 * the control minimum is a separate float percentage. Disabled jitter consumes no draw.
 */
export function primaryRoundnessChange(base: number, minimum: number, control: number, controlMinimum: number,
  fade: number, jitter: number, step: number, tablet: ControlTablet, random: () => number): number {
  const low = minimum * .01 * base;
  const controlLow = controlMinimum === 0 ? low
    : multiplyAdd(base - low, Math.fround(Math.fround(controlMinimum) * Math.fround(.01)), low);
  let delta = 0;
  if (control === 1) delta = (step >= fade ? controlLow : multiplyAdd(controlLow - base, step / fade, base)) - base;
  else if ([2, 3, 4, 8].includes(control)) {
    const factor = control === 8 ? Math.fround(deviceControlInput(control, tablet)) : deviceControlInput(control, tablet);
    delta = multiplyAdd(base - controlLow, factor, controlLow) - base;
  }
  if (jitter !== 0) {
    const amplitude = jitter * .01 * (base - low);
    const offset = amplitude > 0 ? (amplitude + amplitude) * (random() - .5) : 0;
    delta += multiplyAdd(base * .01, -100, base) - offset;
  }
  return delta * .01;
}

/** Document-space vector; a zero vector represents contact before movement. */
type Direction = { x: number; y: number };

/**
 * Photoshop's primary-tip Initial Direction (5) and Direction (6) angle offset,
 * in degrees. The stored brush-tip angle and per-stamp jitter are added later.
 * `base` is the method's canvas-angle adjustment; document-space callers use 0.
 * `mirrored` selects the reflected symmetry branch, not a tip's Flip X setting.
 */
export function directionalTipAngle(
  control: 5 | 6,
  direction: Direction,
  initial: Direction,
  base = 0,
  mirrored = false
): number {
  const vector = control === 5 ? initial : direction;
  const heading = wrapDegrees(Math.atan2(vector.y, -vector.x) * 57.29577951308232);
  const offset = control === 5 ? Math.fround(Math.fround(base) + 180) : 180;
  return Math.fround(wrapDegrees(offset + (mirrored ? -heading : heading)));
}

/**
 * Photoshop's primary Pen Tilt angle contribution, before tip angle and jitter.
 * `tilt` is normalized physical X/Y, not browser tilt degrees. Photoshop's
 * TabletData stores these components in the reverse order, Y then X.
 * `base` is the canvas-angle adjustment. `mirrorAngle` is the reflected method's
 * angle adjustment, independent of the tip's Flip X/Y settings. Zero tilt keeps
 * atan2's signed-zero behavior and therefore produces 180 degrees by default.
 */
export function tiltTipAngle(
  tilt: Direction,
  base = 0,
  mirrored = false,
  mirrorAngle = 0
): number {
  const heading = Math.atan2(tilt.x * (mirrored ? -100 : 100), tilt.y * (mirrored ? 100 : -100));
  const angle = heading * 180 / Math.PI + Math.fround(base);
  return Math.fround(wrapDegrees(mirrored ? angle - (mirrorAngle - 180) : angle));
}

/** Float magnitude supplied to placement for Size Control = Pen Tilt. */
export function tabletTiltMagnitude(tilt: Direction): number {
  return Math.fround(Math.sqrt(multiplyAdd(tilt.x, tilt.x, tilt.y * tilt.y)));
}

/** Primary angle contribution for the generic control branch, in degrees.
 * Pen Tilt and Direction have their own evaluators. `mirrored` selects the
 * caller's reflected-control branch; stored tip flips do not select it.
 */
export function deviceTipAngle(control: number, fade: number, minimum: number, step: number,
  tablet: ControlTablet, base = 0, mirrored = false): number {
  let value = deviceControlValue(control, fade, minimum, step, tablet, 0, 360);
  if (mirrored) value = -value;
  if (value >= 360) value = 0;
  return Math.fround(wrapDegrees(Math.fround(Math.fround(base) + value)));
}

/** Preserve Photoshop's add/subtract wrapping, including its zero-vector result. */
function wrapDegrees(angle: number): number {
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}
