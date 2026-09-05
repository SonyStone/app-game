import {
  add,
  cross,
  dot,
  normalize,
  presetOrientation,
  referenceAxes,
  rollOrientation,
  rotateOrientation,
  scale,
  toWorld,
  type Vec3,
  type ViewOrientation,
  type ViewReferenceFrame
} from './orientation'

/** Face-local U/V are the sole source for the rendered plane and all its hit targets. */
export const faces = [
  face('top', [1, 0, 0], [0, 1, 0]),
  face('bottom', [-1, 0, 0], [0, 1, 0]),
  face('front', [1, 0, 0], [0, 0, 1]),
  face('back', [1, 0, 0], [0, 0, -1]),
  face('right', [0, 0, -1], [0, 1, 0]),
  face('left', [0, 0, 1], [0, 1, 0])
]

/** Shared canonical targets: six faces, twelve edges and eight corners. */
export const targets = [
  ...new Map(faces.flatMap((f) => f.zones).map((zone) => [zone.id, zone])).values()
]

export function cubeMatrix(orientation: ViewOrientation, frame?: ViewReferenceFrame) {
  const right = cross(orientation.up, orientation.direction)
  const { x, y, z } = referenceAxes(frame)
  return matrix(
    [x, y, z]
      .flatMap((axis) => [
        dot(right, axis),
        -dot(orientation.up, axis),
        dot(orientation.direction, axis),
        0
      ])
      .concat([0, 0, 0, 1])
  )
}

/** Shared em-based dimensions for CSS projection, the visible ring and pointer hit testing. */
export const cubeLayout = {
  cube: 3.65,
  stage: 7.25,
  compass: 8.15,
  depth: (-3.65 / 2) * 1.16,
  perspective: 34
} as const

/** Projects the ring to the stage; its transparent hit stroke remains screen-sized. */
export function compassHitPath(orientation: ViewOrientation, frame?: ViewReferenceFrame) {
  const axes = referenceAxes(frame)
  const right = cross(orientation.up, orientation.direction)
  const basis = [axes.x, axes.y, axes.z]
  const points = Array.from({ length: 97 }, (_, index) => {
    const angle = (index * Math.PI) / 48
    const local = [
      cubeLayout.compass * 0.44 * Math.cos(angle),
      cubeLayout.compass * 0.44 * Math.sin(angle),
      cubeLayout.depth
    ]
    const project = (vector: Vec3) =>
      basis.reduce((sum, axis, i) => sum + dot(vector, axis) * local[i]!, 0)
    const perspective =
      cubeLayout.perspective / (cubeLayout.perspective - project(orientation.direction))
    return `${50 + ((project(right) * perspective) / cubeLayout.stage) * 100},${50 - ((project(orientation.up) * perspective) / cubeLayout.stage) * 100}`
  })
  return `M${points.join(' L')} Z`
}

/** Intersects a screen ray with the compass plane, undoing perspective before measuring rotation.
 * x/y are em offsets from stage center, with screen y increasing downward.
 */
export function compassAngle(
  orientation: ViewOrientation,
  x: number,
  y: number,
  frame?: ViewReferenceFrame
) {
  const axes = referenceAxes(frame)
  const eye = scale(orientation.direction, cubeLayout.perspective)
  const ray = add(
    add(scale(cross(orientation.up, orientation.direction), x), scale(orientation.up, -y)),
    scale(eye, -1)
  )
  const divisor = dot(ray, axes.z)
  // A pointer on the plane's vanishing line has no finite intersection.
  if (Math.abs(divisor) < 1e-8) return undefined
  const distance = (cubeLayout.depth - dot(eye, axes.z)) / divisor
  if (distance <= 0) return undefined
  const point = add(eye, scale(ray, distance))
  return -Math.atan2(dot(point, axes.y), dot(point, axes.x))
}

export function faceVisible(
  face: (typeof faces)[number],
  orientation: ViewOrientation,
  frame?: ViewReferenceFrame
) {
  return dot(toWorld(face.normal, frame), orientation.direction) > 0.001
}

/** Adjacent arrows require a complete face alignment, including quarter-turn roll. */
export function alignedFace(orientation: ViewOrientation, frame?: ViewReferenceFrame) {
  const tolerance = Math.cos(Math.PI / 1800)
  return faces.find((face) => {
    const preset = presetOrientation(face.normal, frame)
    return (
      dot(preset.direction, orientation.direction) > tolerance &&
      [0, 1, 2, 3].some(
        (turn) => dot(rollOrientation(preset, (turn * Math.PI) / 2).up, orientation.up) > tolerance
      )
    )
  })
}

/** Snap direction within eight degrees while transporting up without a roll discontinuity. */
export function snapOrientation(
  orientation: ViewOrientation,
  frame?: ViewReferenceFrame
): ViewOrientation | undefined {
  const nearest = targets
    .map((target) => presetOrientation(target.direction, frame))
    .sort(
      (a, b) => dot(b.direction, orientation.direction) - dot(a.direction, orientation.direction)
    )[0]!
  const cosine = dot(orientation.direction, nearest.direction)
  if (cosine < Math.cos((8 * Math.PI) / 180) || cosine > 1 - 1e-10) return
  return rotateOrientation(
    orientation,
    normalize(cross(orientation.direction, nearest.direction)),
    Math.acos(Math.min(1, cosine))
  )
}

function face(key: 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left', u: Vec3, v: Vec3) {
  const normal = cross(u, v)
  const zones = [-1, 0, 1].flatMap((row) =>
    [-1, 0, 1].map((col) => {
      const direction = add(normal, add(scale(u, col), scale(v, row)))
      return { id: direction.join(','), direction, label: label(direction) }
    })
  )
  return {
    key,
    normal,
    u,
    v,
    zones,
    label: label(normal),
    transform: `${matrix([...u, 0, ...v, 0, ...normal, 0, 0, 0, 0, 1])} translateZ(var(--view-cube-half))`
  }
}

function label([x, y, z]: Vec3) {
  return [
    z > 0 ? 'Top' : z < 0 ? 'Bottom' : '',
    y < 0 ? 'Front' : y > 0 ? 'Back' : '',
    x > 0 ? 'Right' : x < 0 ? 'Left' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

function matrix(values: number[]) {
  return `matrix3d(${values.map((value) => Number(value.toFixed(8))).join(',')})`
}
