import type { BrushFormValues } from './form';

/**
 * Photoshop's tracking-event to tablet conversion. Missing fields mean missing
 * device capabilities; tilt requires both components. Tilt inputs are normalized
 * driver components, not degrees. Pose percentages follow the original float
 * arithmetic. Reflection affects device X before any pose replacement.
 */
export function prepareTabletInput(input: TabletInput, pose?: BrushFormValues['brushPose'], reflected = false) {
  const hasTilt = input.tiltX !== undefined && input.tiltY !== undefined;
  let tiltX = hasTilt ? Math.fround(input.tiltX!) * (reflected ? -1 : 1) : 0;
  let tiltY = hasTilt ? Math.fround(input.tiltY!) : 0;
  let pressure = Math.fround(input.pressure ?? 1);
  let rotation = Math.fround(input.rotation ?? 360);
  const distance = Math.fround(input.distance ?? 0);
  const tangentialPressure = Math.abs(Math.fround(input.tangentialPressure ?? 1));
  let flags = (input.pressure !== undefined ? 1 : 0) | (input.distance !== undefined ? 4 : 0) |
    (hasTilt ? 8 : 0) | (input.rotation !== undefined ? 16 : 0) |
    (input.tangentialPressure !== undefined ? 32 : 0);
  if (pose) {
    if (pose.overrideTiltX || !hasTilt) { tiltX = poseFraction(pose.tiltX); flags |= 8; }
    if (pose.overrideTiltY || !hasTilt) { tiltY = poseFraction(pose.tiltY); flags |= 8; }
    if (pose.overrideRotation || input.rotation === undefined) { rotation = Math.fround(Math.trunc(pose.rotation)); flags |= 16; }
    if (pose.overridePressure || input.pressure === undefined) { pressure = poseFraction(pose.pressure); flags |= 1; }
  }
  return { tiltX, tiltY, pressure, rotation, distance, tangentialPressure, flags };
}

/** Optional values preserve device capability information before normalization. */
export type TabletInput = {
  /** Normalized driver components in [-1, 1], in physical X/Y order. */
  tiltX?: number;
  tiltY?: number;
  pressure?: number;
  rotation?: number;
  distance?: number;
  tangentialPressure?: number;
};

/** Converts browser degree samples once; mouse/touch do not supply pen axes.
 * An omitted pointerType denotes a recorded/synthetic sample with explicit axes.
 * Pointer Events cannot distinguish unsupported pen axes from measured zeroes.
 */
export function browserTabletInput(input: TabletInput & { pointerType?: string }): TabletInput {
  if (input.pointerType === 'mouse') return {};
  if (input.pointerType === 'touch') return { pressure: input.pressure };
  return { ...input, tiltX: input.tiltX === undefined ? undefined : input.tiltX / 90,
    tiltY: input.tiltY === undefined ? undefined : input.tiltY / 90 };
}

function poseFraction(value: number): number {
  return Math.fround(Math.fround(Math.trunc(value)) * Math.fround(.01));
}
