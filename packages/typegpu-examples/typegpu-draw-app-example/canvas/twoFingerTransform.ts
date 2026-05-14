/**
 * Two-finger gesture transform utilities.
 *
 * Calculates pan/zoom/rotation transform from two-finger gestures,
 * keeping the midpoint between fingers as a fixed anchor point.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Transform2D {
  panX: number;
  panY: number;
  zoom: number;
  rotation: number;
}

export interface TwoFingerGestureInput {
  /** First finger position at gesture start */
  finger1Start: Point2D;
  /** Second finger position at gesture start */
  finger2Start: Point2D;
  /** First finger current position */
  finger1Current: Point2D;
  /** Second finger current position */
  finger2Current: Point2D;
  /** Transform state at gesture start */
  startTransform: Transform2D;
  /** Screen center position (typically canvas center) */
  screenCenter: Point2D;
  /** Min zoom level (default: 0.1) */
  minZoom?: number;
  /** Max zoom level (default: 10) */
  maxZoom?: number;
}

export interface TwoFingerGestureResult {
  /** New transform state */
  transform: Transform2D;
  /** Gesture midpoint (current position) */
  midpoint: Point2D;
  /** Total rotation angle from gesture start */
  rotationDelta: number;
  /** Zoom scale factor from gesture start */
  zoomScale: number;
}

/**
 * Calculate distance between two points
 */
export function getDistance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate midpoint between two points
 */
export function getMidpoint(p1: Point2D, p2: Point2D): Point2D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
}

/**
 * Calculate the rotation angle between two point pairs.
 * Returns the angle to rotate from start configuration to end configuration.
 *
 * @param p1Start - First point at start
 * @param p2Start - Second point at start
 * @param p1End - First point at end
 * @param p2End - Second point at end
 * @returns Rotation angle in radians
 */
export function getAngleBetweenPointPairs(p1Start: Point2D, p2Start: Point2D, p1End: Point2D, p2End: Point2D): number {
  const startAngle = Math.atan2(p2Start.y - p1Start.y, p2Start.x - p1Start.x);
  const endAngle = Math.atan2(p2End.y - p1End.y, p2End.x - p1End.x);
  return startAngle - endAngle;
}

/**
 * Calculate new transform from a two-finger gesture.
 *
 * This function computes the complete transform from the gesture start state
 * to the current finger positions, keeping the midpoint between fingers as
 * a fixed anchor point.
 *
 * The transform supports:
 * - Pan: moving both fingers together
 * - Zoom: pinching fingers together/apart
 * - Rotation: rotating fingers around the midpoint
 *
 * @param input - Gesture input data
 * @returns New transform state and gesture info
 *
 * @example
 * ```ts
 * const result = calculateTwoFingerTransform({
 *   finger1Start: gestureStart.finger1,
 *   finger2Start: gestureStart.finger2,
 *   finger1Current: { x: pointer1.x, y: pointer1.y },
 *   finger2Current: { x: pointer2.x, y: pointer2.y },
 *   startTransform: gestureStart.transform,
 *   screenCenter: { x: canvas.width / 2, y: canvas.height / 2 }
 * });
 *
 * setTransform(result.transform);
 * ```
 */
export function calculateTwoFingerTransform(input: TwoFingerGestureInput): TwoFingerGestureResult {
  const {
    finger1Start,
    finger2Start,
    finger1Current,
    finger2Current,
    startTransform,
    screenCenter,
    minZoom = 0.1,
    maxZoom = 10
  } = input;

  // Calculate midpoints
  const midpointStart = getMidpoint(finger1Start, finger2Start);
  const midpointCurrent = getMidpoint(finger1Current, finger2Current);

  // Calculate zoom scale from finger distance change
  const startDistance = getDistance(finger1Start, finger2Start);
  const currentDistance = getDistance(finger1Current, finger2Current);
  const zoomScale = currentDistance / startDistance;

  // Calculate rotation angle
  const rotationDelta = getAngleBetweenPointPairs(finger1Start, finger2Start, finger1Current, finger2Current);

  // Calculate new zoom and rotation
  const newZoom = Math.max(minZoom, Math.min(maxZoom, startTransform.zoom * zoomScale));
  const newRotation = startTransform.rotation + rotationDelta;

  // Calculate new pan position to keep the anchor point (midpoint) fixed
  //
  // The transform sequence (similar to getTransformMatrixBetweenPointPairs):
  // T(midCurrent) * R(-angle) * S(scale) * T(-midStart)
  //
  // We transform the canvas center position through this sequence.

  // Midpoint positions relative to screen center
  const midStartRel = {
    x: midpointStart.x - screenCenter.x,
    y: midpointStart.y - screenCenter.y
  };
  const midCurrentRel = {
    x: midpointCurrent.x - screenCenter.x,
    y: midpointCurrent.y - screenCenter.y
  };

  // Step 1: Vector from midStart to canvas center (at gesture start)
  const vecToCenter = {
    x: startTransform.panX - midStartRel.x,
    y: startTransform.panY - midStartRel.y
  };

  // Step 2: Rotate and scale this vector
  // Use NEGATIVE of rotationDelta for the pan offset!
  // The canvas rotates by +rotationDelta, but to keep the anchor fixed,
  // we rotate the offset vector by -rotationDelta (opposite direction)
  const cos_delta = Math.cos(-rotationDelta);
  const sin_delta = Math.sin(-rotationDelta);
  const rotatedScaledVec = {
    x: (vecToCenter.x * cos_delta - vecToCenter.y * sin_delta) * zoomScale,
    y: (vecToCenter.x * sin_delta + vecToCenter.y * cos_delta) * zoomScale
  };

  // Step 3: Add back the new midpoint position
  const newPanX = midCurrentRel.x + rotatedScaledVec.x;
  const newPanY = midCurrentRel.y + rotatedScaledVec.y;

  return {
    transform: {
      panX: newPanX,
      panY: newPanY,
      zoom: newZoom,
      rotation: newRotation
    },
    midpoint: midpointCurrent,
    rotationDelta,
    zoomScale
  };
}
