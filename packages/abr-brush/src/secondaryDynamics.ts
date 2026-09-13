/** Secondary-tip scatter in document coordinates, using a signed half-span.
 * A zero tangent scatters radially even with Both Axes off. The supplied RNG
 * consumes one sample for directional scatter, two for radial, and none at zero.
 * Aspect parameters describe document pixels, not the brush tip's roundness.
 */
export function secondaryScatterOffset(
  amplitude: number,
  direction: { x: number; y: number },
  radial: boolean,
  random: () => number,
  aspect = 1,
  aspectSquared = aspect * aspect
): [number, number] {
  if (amplitude <= 0) return [0, 0];
  const distance = (amplitude + amplitude) * (random() - 0.5);
  if (radial || (direction.x === 0 && direction.y === 0)) {
    // The original wraps a degree-valued number but passes it directly to sin/cos.
    let orientation = (random() - 0.5) * 720;
    while (orientation < 0) orientation += 360;
    while (orientation >= 360) orientation -= 360;
    return [Math.cos(orientation) * distance * aspect, Math.sin(orientation) * distance];
  }
  const reciprocal = 1 / Math.sqrt(direction.y * direction.y + aspectSquared * direction.x * direction.x);
  return [distance * (direction.y * reciprocal) * aspect, distance * -(direction.x * reciprocal)];
}
