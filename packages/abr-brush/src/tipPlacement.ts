/** Prepares the center and source rectangle passed by Photoshop's primary method.
 * point already includes scattering. sourceBounds is the method's prepared integer
 * rectangle, including its one-pixel expansion when fractional placement is enabled.
 * The two mode flags come from method state, not browser/device heuristics.
 */
export function placeSampledTip(
  point: { x: number; y: number },
  sourceBounds: { left: number; top: number; right: number; bottom: number },
  options: {
    fractional: boolean;
    /** Enables the method's guarded identity-transform snap. */
    snapIdentity: boolean;
    /** Applies the 1.5-pixel offset selected by the primary tip's virtual placement predicate. */
    tipOffset: boolean;
    scale: number;
    angle: number;
    tilt?: number;
    angleJitter?: number;
    roundnessChange?: number;
  }
) {
  let x = point.x, y = point.y;
  if (options.fractional) { x -= .5; y -= .5; }
  if (options.tipOffset) { x += 1.5; y += 1.5; }
  const integerCenter = { x: floorCoordinate(x), y: floorCoordinate(y) };
  const identity = options.scale === 1 && (options.tilt ?? 0) === 0 &&
    options.angle === 0 && (options.angleJitter ?? 0) === 0 && (options.roundnessChange ?? 0) === 0;
  if (!options.fractional || (options.snapIdentity && identity)) {
    x = integerCenter.x; y = integerCenter.y;
  }
  let { left, top, right, bottom } = sourceBounds;
  if (options.fractional) { left++; top++; right--; bottom--; }
  // The original rectangle translation preserves inverted rectangles unchanged.
  if (left <= right && top <= bottom) { left += x; right += x; top += y; bottom += y; }
  return { center: { x, y }, integerCenter, sourceBounds: { left, top, right, bottom } };
}

function floorCoordinate(value: number): number {
  return Math.max(-2147483648, Math.min(2147483647, Math.floor(value)));
}
