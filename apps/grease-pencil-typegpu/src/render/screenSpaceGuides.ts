import { createCameraMatrices, type CameraMatrices, type CameraState } from './cameraMatrices'
import { transformMat4 } from './matrixTransform'
import { pushVertex } from './meshVertex'
import type { Vec3, Vec4 } from './vector'

/** Projects guide geometry in CSS pixels, independently of zoom and device pixel ratio. */
export function createScreenSpaceGuides(camera: CameraState, width: number, height: number) {
  const matrices = createCameraMatrices(camera, width / Math.max(1, height))
  return { matrices, width: Math.max(1, width), height: Math.max(1, height) }
}

export type ScreenSpaceGuides = ReturnType<typeof createScreenSpaceGuides>

/** World distance subtended by one vertical CSS pixel at the supplied world position. */
export function worldUnitsPerPixel(matrices: CameraMatrices, height: number, position: Vec3) {
  const clip = transformMat4(matrices.viewProjection, [...position, 1])
  if (clip[2] < 0 || clip[3] <= 0) return 0
  return (2 * clip[3]) / (matrices.projection[5] * Math.max(1, height))
}

/** Builds a thin, feathered screen-space ribbon, clipped before perspective division. */
export function appendGuideLine(
  vertices: number[],
  start: Vec3,
  end: Vec3,
  width: number,
  color: Vec4,
  view: ScreenSpaceGuides
) {
  const clipped = clipSegment(
    transformMat4(view.matrices.viewProjection, [...start, 1]),
    transformMat4(view.matrices.viewProjection, [...end, 1])
  )
  if (!clipped) return
  const [a, b] = clipped.map(toNdc) as [Vec3, Vec3]
  const dx = (b[0] - a[0]) * view.width
  const dy = (b[1] - a[1]) * view.height
  const length = Math.hypot(dx, dy)
  if (length < 1e-6) return
  const nx = ((-dy / length) * 2) / view.width
  const ny = ((dx / length) * 2) / view.height
  const half = width / 2
  const transparent: Vec4 = [color[0], color[1], color[2], 0]
  strip(-half - 0.6, -half, transparent, color)
  strip(-half, half, color, color)
  strip(half, half + 0.6, color, transparent)

  function strip(low: number, high: number, lowColor: Vec4, highColor: Vec4) {
    const p = offset(a, low),
      q = offset(a, high),
      r = offset(b, low),
      s = offset(b, high)
    pushVertex(vertices, p, lowColor)
    pushVertex(vertices, q, highColor)
    pushVertex(vertices, r, lowColor)
    pushVertex(vertices, r, lowColor)
    pushVertex(vertices, q, highColor)
    pushVertex(vertices, s, highColor)
  }
  function offset(point: Vec3, pixels: number): Vec3 {
    return unproject([point[0] + nx * pixels, point[1] + ny * pixels, point[2]], view)
  }
}

/** Billboard endpoint/center handle with a constant pixel radius. */
export function appendGuideDisc(
  vertices: number[],
  position: Vec3,
  radius: number,
  color: Vec4,
  view: ScreenSpaceGuides
) {
  const clip = transformMat4(view.matrices.viewProjection, [...position, 1])
  if (clip[2] < 0 || clip[2] > clip[3] || clip[3] <= 0) return
  const center = toNdc(clip)
  for (let i = 0; i < 24; i++) {
    pushVertex(vertices, position, color)
    for (const angle of [(i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2]) {
      pushVertex(
        vertices,
        unproject(
          [
            center[0] + (Math.cos(angle) * radius * 2) / view.width,
            center[1] + (Math.sin(angle) * radius * 2) / view.height,
            center[2]
          ],
          view
        ),
        color
      )
    }
  }
}

function unproject(point: Vec3, view: ScreenSpaceGuides): Vec3 {
  const world = transformMat4(view.matrices.inverseViewProjection, [...point, 1])
  return [world[0] / world[3], world[1] / world[3], world[2] / world[3]]
}

function toNdc(point: Vec4): Vec3 {
  return [point[0] / point[3], point[1] / point[3], point[2] / point[3]]
}

/** WebGPU's homogeneous frustum uses 0 <= z <= w, including lines crossing the camera. */
function clipSegment(a: Vec4, b: Vec4): [Vec4, Vec4] | undefined {
  let low = 0,
    high = 1
  const distances = (p: Vec4) => [p[3] + p[0], p[3] - p[0], p[3] + p[1], p[3] - p[1], p[2], p[3] - p[2]]
  const da = distances(a),
    db = distances(b)
  for (let i = 0; i < da.length; i++) {
    if (da[i] < 0 && db[i] < 0) return
    if (da[i] < 0) low = Math.max(low, da[i] / (da[i] - db[i]))
    if (db[i] < 0) high = Math.min(high, da[i] / (da[i] - db[i]))
  }
  if (low > high) return
  const at = (t: number): Vec4 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t
  ]
  return [at(low), at(high)]
}
