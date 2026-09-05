/** A simultaneous screen-space pan, pinch ratio, and clockwise twist in radians. */
export type TouchViewTransform = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  scale: number;
  rotation: number;
};

/** Measures the first two touches in insertion order, keeping their angle stable. */
export function touchGestureSample(pointers: Iterable<Pick<PointerEvent, 'clientX' | 'clientY'>>) {
  const [first, second] = [...pointers];
  if (!first || !second) return undefined;
  const dx = second.clientX - first.clientX;
  const dy = second.clientY - first.clientY;
  return {
    center: { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 },
    distance: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx)
  };
}

/** Uses a ratio rather than pixel distance so pinch sensitivity is independent of finger spacing. */
export function touchGestureDelta(
  from: NonNullable<ReturnType<typeof touchGestureSample>>,
  to: NonNullable<ReturnType<typeof touchGestureSample>>
): TouchViewTransform {
  const stable = from.distance > 4 && to.distance > 4;
  const angle = to.angle - from.angle;
  return {
    from: from.center,
    to: to.center,
    scale: stable ? to.distance / from.distance : 1,
    rotation: stable ? Math.atan2(Math.sin(angle), Math.cos(angle)) : 0
  };
}
