/** A world-space vector. Inputs are never mutated. */
export type Vec3 = readonly [x: number, y: number, z: number]

/** Camera orientation independent of position, orbit pivot and projection. */
export type ViewOrientation = {
  /** Unit vector from the orbit target toward the camera. */
  direction: Vec3
  /** Unit screen-up vector in world space, perpendicular to direction. */
  up: Vec3
}

/** Directions of the cube labels in the host's right-handed world. */
export type ViewReferenceFrame = {
  /** Top normal; defaults to +Z. */
  up: Vec3
  /** Front normal, pointing toward the viewer; defaults to −Y. */
  front: Vec3
}

/** A complete orientation request; the host owns camera updates and animation. */
export type ViewNavigation =
  | {
      source: 'preset' | 'adjacent' | 'roll' | 'snap'
      orientation: ViewOrientation
      transition: 'instant' | 'animated'
    }
  | {
      source: 'drag' | 'compass-drag' | 'roll-drag'
      phase: 'start' | 'move' | 'end' | 'cancel'
      orientation: ViewOrientation
      transition: 'instant'
    }

/** Interpolates the shortest rigid rotation, including roll, with progress clamped to [0, 1].
 * Throws RangeError for non-finite progress or degenerate orientations.
 * The host can use this in its animation loop and feed the result back to ViewCube.
 */
export function interpolateOrientation(
  from: ViewOrientation,
  to: ViewOrientation,
  progress: number
): ViewOrientation {
  if (!Number.isFinite(progress)) throw new RangeError('ViewCube: progress must be finite')
  const a = quaternion(normalizeOrientation(from))
  let b = quaternion(normalizeOrientation(to))
  let cosine = a.reduce((sum, value, i) => sum + value * b[i]!, 0)
  if (cosine < 0) {
    b = b.map((value) => -value) as Quaternion
    cosine = -cosine
  }
  const t = Math.max(0, Math.min(1, progress))
  const angle = Math.acos(Math.min(1, cosine))
  const sine = Math.sin(angle)
  const wa = sine < 1e-6 ? 1 - t : Math.sin((1 - t) * angle) / sine
  const wb = sine < 1e-6 ? t : Math.sin(t * angle) / sine
  const q = a.map((value, i) => wa * value + wb * b[i]!) as Quaternion
  const length = Math.hypot(...q)
  const [x, y, z, w] = q.map((value) => value / length) as Quaternion
  return normalizeOrientation({
    direction: [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
    up: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]
  })
}

/** Normalizes roundoff and removes the up component along direction; rejects degenerate input. */
export function normalizeOrientation(value: ViewOrientation): ViewOrientation {
  const direction = normalize(value.direction)
  return { direction, up: normalize(add(value.up, scale(direction, -dot(value.up, direction)))) }
}

export function referenceAxes(frame: ViewReferenceFrame = { up: [0, 0, 1], front: [0, -1, 0] }) {
  const normalized = normalizeOrientation({ direction: frame.up, up: frame.front })
  return {
    x: cross(normalized.direction, normalized.up),
    y: scale(normalized.up, -1),
    z: normalized.direction
  }
}

export function toWorld(vector: Vec3, frame?: ViewReferenceFrame): Vec3 {
  const axes = referenceAxes(frame)
  return add(add(scale(axes.x, vector[0]), scale(axes.y, vector[1])), scale(axes.z, vector[2]))
}

export function presetOrientation(
  localDirection: Vec3,
  frame?: ViewReferenceFrame
): ViewOrientation {
  const direction = normalize(toWorld(localDirection, frame))
  const axes = referenceAxes(frame)
  const up =
    Math.abs(dot(direction, axes.z)) > 0.999999
      ? scale(axes.y, Math.sign(dot(direction, axes.z)))
      : axes.z
  return normalizeOrientation({ direction, up })
}

/** Rotates the image clockwise for a positive angle, regardless of the host's camera representation. */
export function rollOrientation(value: ViewOrientation, clockwiseAngle: number): ViewOrientation {
  return rotateOrientation(value, value.direction, clockwiseAngle)
}

export type AdjacentSide = 'left' | 'right' | 'up' | 'down'

/** Moves toward the indicated screen side, preserving the complete rolled camera frame. */
export function adjacentOrientation(value: ViewOrientation, side: AdjacentSide): ViewOrientation {
  const right = cross(value.up, value.direction)
  return side === 'left' || side === 'right'
    ? rotateOrientation(value, value.up, ((side === 'right' ? 1 : -1) * Math.PI) / 2)
    : rotateOrientation(value, right, ((side === 'down' ? 1 : -1) * Math.PI) / 2)
}

/** Turns around world-up and changes elevation without accumulating roll.
 * Existing roll is preserved. At a pole, screen-up supplies the otherwise undefined heading.
 * Pointer deltas follow the rolled screen axes. Drag stops 0.5° short of either pole
 * to retain a defined heading between gestures; presets may still reach exact Top/Bottom.
 */
export function orbitOrientation(
  value: ViewOrientation,
  dx: number,
  dy: number,
  frame?: ViewReferenceFrame
): ViewOrientation {
  if (Math.hypot(dx, dy) < 1e-10) return value
  const worldUp = referenceAxes(frame).z
  const vertical = Math.max(-1, Math.min(1, dot(value.direction, worldUp)))
  const horizontal = add(value.direction, scale(worldUp, -vertical))
  const atPole = Math.hypot(...horizontal) < 1e-7
  const heading = atPole ? scale(value.up, -Math.sign(vertical)) : normalize(horizontal)
  const right = normalize(cross(worldUp, heading))
  const upright = normalize(cross(value.direction, right))
  const roll = atPole
    ? 0
    : Math.atan2(dot(cross(upright, value.up), value.direction), dot(upright, value.up))
  const horizontalMotion = dx * Math.cos(roll) + dy * Math.sin(roll)
  const verticalMotion = -dx * Math.sin(roll) + dy * Math.cos(roll)
  const poleLimit = Math.PI / 2 - Math.PI / 360
  const elevation = Math.max(
    -poleLimit,
    Math.min(poleLimit, Math.atan2(vertical, Math.hypot(...horizontal)) + verticalMotion)
  )
  const turnedHeading = rotate(heading, worldUp, -horizontalMotion)
  const direction = add(
    scale(turnedHeading, Math.cos(elevation)),
    scale(worldUp, Math.sin(elevation))
  )
  const up = add(scale(worldUp, Math.cos(elevation)), scale(turnedHeading, -Math.sin(elevation)))
  return rollOrientation({ direction, up }, roll)
}

/** Selects a compass heading without resetting elevation or the user's roll. */
export function compassOrientation(
  value: ViewOrientation,
  localDirection: Vec3,
  frame?: ViewReferenceFrame
): ViewOrientation {
  const axes = referenceAxes(frame)
  const vertical = dot(value.direction, axes.z)
  const horizontal = add(value.direction, scale(axes.z, -vertical))
  const heading =
    Math.hypot(...horizontal) < 1e-7 ? scale(value.up, -Math.sign(vertical)) : normalize(horizontal)
  const target = toWorld(localDirection, frame)
  const angle = Math.atan2(dot(cross(heading, target), axes.z), dot(heading, target))
  return rotateOrientation(value, axes.z, angle)
}

export function rotateOrientation(
  value: ViewOrientation,
  axis: Vec3,
  angle: number
): ViewOrientation {
  const unitAxis = normalize(axis)
  return normalizeOrientation({
    direction: rotate(value.direction, unitAxis, angle),
    up: rotate(value.up, unitAxis, angle)
  })
}

export function sameOrientation(a: ViewOrientation, b: ViewOrientation) {
  return dot(a.direction, b.direction) > 1 - 1e-7 && dot(a.up, b.up) > 1 - 1e-7
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function scale(v: Vec3, amount: number): Vec3 {
  return [v[0] * amount, v[1] * amount, v[2] * amount]
}

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(...v)
  if (!Number.isFinite(length) || length < 1e-8)
    throw new RangeError('ViewCube: expected finite, nonzero, nonparallel vectors')
  return scale(v, 1 / length)
}

function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  return add(
    add(scale(v, Math.cos(angle)), scale(cross(axis, v), Math.sin(angle))),
    scale(axis, dot(axis, v) * (1 - Math.cos(angle)))
  )
}

type Quaternion = [number, number, number, number]

/** Converts the orthonormal camera-to-world basis to a quaternion, including near 180° rotations. */
function quaternion(value: ViewOrientation): Quaternion {
  const r = cross(value.up, value.direction),
    u = value.up,
    d = value.direction
  const trace = r[0] + u[1] + d[2]
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    return [(u[2] - d[1]) / s, (d[0] - r[2]) / s, (r[1] - u[0]) / s, s / 4]
  }
  if (r[0] > u[1] && r[0] > d[2]) {
    const s = Math.sqrt(1 + r[0] - u[1] - d[2]) * 2
    return [s / 4, (u[0] + r[1]) / s, (d[0] + r[2]) / s, (u[2] - d[1]) / s]
  }
  if (u[1] > d[2]) {
    const s = Math.sqrt(1 + u[1] - r[0] - d[2]) * 2
    return [(u[0] + r[1]) / s, s / 4, (d[1] + u[2]) / s, (d[0] - r[2]) / s]
  }
  const s = Math.sqrt(1 + d[2] - r[0] - u[1]) * 2
  return [(d[0] + r[2]) / s, (d[1] + u[2]) / s, s / 4, (r[1] - u[0]) / s]
}
