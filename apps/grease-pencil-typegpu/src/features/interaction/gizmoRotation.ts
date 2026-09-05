import type { DrawingWorkplane } from '../../document'
import { createCameraMatrices, type CameraState } from '../../render/cameraMatrices'
import { transformMat4 } from '../../render/matrixTransform'
import { workplaneRotationGizmoRadius } from '../../render/meshOverlays'
import { worldUnitsPerPixel } from '../../render/screenSpaceGuides'
import { add3, cross3, dot3, normalize3, scale3, sub3, type Vec3 } from '../../render/vector'
import { getWorkplaneBasis } from '../../render/workplane'
import type { WorkplaneGizmoAxisName } from '../../render/workplaneGizmoTypes'

type Point = { x: number; y: number }
type Viewport = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

/** Tracks the pointer in the grabbed ring's plane, freezing the local axis for the whole drag. */
export function createGizmoRotationDrag(
  camera: CameraState,
  viewport: Viewport,
  workplane: DrawingWorkplane,
  axis: WorkplaneGizmoAxisName,
  pointer: Point,
  ringAngle: number
) {
  const basis = getWorkplaneBasis(workplane)
  const [a, b] =
    axis === 'X' ? [basis.up, basis.normal] : axis === 'Y' ? [basis.normal, basis.right] : [basis.right, basis.up]
  const normal = cross3(a, b)
  const matrices = createCameraMatrices(camera, viewport.width / viewport.height)
  const radius = workplaneRotationGizmoRadius(worldUnitsPerPixel(matrices, viewport.height, basis.origin))
  const facing = Math.abs(dot3(normalize3(sub3(basis.origin, matrices.position)), normal))
  const initialAngle = planeAngle(pointer)
  // A ring seen edge-on has no stable ray/plane intersection. Drag along its projected tangent instead.
  const useTangent = facing < 0.08 || initialAngle === undefined
  const before = project(ringAngle - 0.01),
    after = project(ringAngle + 0.01)
  const tangent = { x: (after.x - before.x) / 0.02, y: (after.y - before.y) / 0.02 }
  const tangentLengthSquared = tangent.x * tangent.x + tangent.y * tangent.y
  let previous = initialAngle
  let angle = 0

  return (next: Point): Vec3 => {
    if (useTangent) {
      if (tangentLengthSquared > 1)
        angle = ((next.x - pointer.x) * tangent.x + (next.y - pointer.y) * tangent.y) / tangentLengthSquared
    } else {
      const current = planeAngle(next)
      if (current !== undefined && previous !== undefined)
        angle += Math.atan2(Math.sin(current - previous), Math.cos(current - previous))
      previous = current
    }
    return rotateWorkplaneLocally(workplane, axis, angle)
  }

  function planeAngle(point: Point) {
    const x = ((point.x - viewport.left) / viewport.width) * 2 - 1
    const y = 1 - ((point.y - viewport.top) / viewport.height) * 2
    const near = transformMat4(matrices.inverseViewProjection, [x, y, 0, 1])
    const far = transformMat4(matrices.inverseViewProjection, [x, y, 1, 1])
    const start: Vec3 = [near[0] / near[3], near[1] / near[3], near[2] / near[3]]
    const ray: Vec3 = sub3([far[0] / far[3], far[1] / far[3], far[2] / far[3]], start)
    const denominator = dot3(ray, normal)
    if (Math.abs(denominator) < 1e-8) return
    const t = dot3(sub3(basis.origin, start), normal) / denominator
    if (t < 0) return
    const radial = sub3(add3(start, scale3(ray, t)), basis.origin)
    const u = dot3(radial, a),
      v = dot3(radial, b)
    if (Math.hypot(u, v) < radius * 0.05) return
    return Math.atan2(v, u)
  }

  function project(angle: number): Point {
    const point = add3(basis.origin, add3(scale3(a, radius * Math.cos(angle)), scale3(b, radius * Math.sin(angle))))
    const clip = transformMat4(matrices.viewProjection, [...point, 1])
    return {
      x: viewport.left + ((clip[0] / clip[3] + 1) * viewport.width) / 2,
      y: viewport.top + ((1 - clip[1] / clip[3]) * viewport.height) / 2
    }
  }
}

/** Composes a rotation about the displayed local axis, then converts back to the document's Rz·Ry·Rx convention. */
export function rotateWorkplaneLocally(workplane: DrawingWorkplane, axis: WorkplaneGizmoAxisName, angle: number): Vec3 {
  const basis = getWorkplaneBasis(workplane)
  let { right, up, normal } = basis
  const c = Math.cos(angle),
    s = Math.sin(angle)
  if (axis === 'X') {
    up = add3(scale3(basis.up, c), scale3(basis.normal, s))
    normal = add3(scale3(basis.normal, c), scale3(basis.up, -s))
  } else if (axis === 'Y') {
    right = add3(scale3(basis.right, c), scale3(basis.normal, -s))
    normal = add3(scale3(basis.normal, c), scale3(basis.right, s))
  } else {
    right = add3(scale3(basis.right, c), scale3(basis.up, s))
    up = add3(scale3(basis.up, c), scale3(basis.right, -s))
  }
  const y = Math.asin(Math.max(-1, Math.min(1, -right[2])))
  if (Math.abs(Math.cos(y)) < 1e-7) return [0, y, Math.atan2(-up[0], up[1])]
  return [Math.atan2(up[2], normal[2]), y, Math.atan2(right[1], right[0])]
}
