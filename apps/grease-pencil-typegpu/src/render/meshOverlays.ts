import {
  add3,
  scale3,
  type Vec3,
  type Vec4,
} from './math'
import { appendDisc } from './meshDiscPrimitive'
import { appendSegment } from './meshSegmentPrimitive'
import type { StrokePointOverlay } from './meshTypes'
import type { WorkplaneBasis } from './workplane'

const POINT_HANDLE_COLOR: Vec4 = [1, 1, 1, 0.82]
const SELECTED_POINT_COLOR: Vec4 = [1, 0.48, 0.02, 0.95]
const ORBIT_TARGET_COLOR: Vec4 = [0.05, 0.28, 0.92, 0.9]
const ORBIT_TARGET_CENTER_COLOR: Vec4 = [1, 1, 1, 0.95]
const GIZMO_X_COLOR: Vec4 = [0.92, 0.18, 0.16, 0.92]
const GIZMO_Y_COLOR: Vec4 = [0.12, 0.58, 0.24, 0.92]
const GIZMO_Z_COLOR: Vec4 = [0.16, 0.34, 0.95, 0.92]
const GIZMO_CENTER_COLOR: Vec4 = [0.08, 0.07, 0.06, 0.82]

export function appendPointHandle(
  vertices: number[],
  pointOverlay: StrokePointOverlay,
  offsetNormal: Vec3,
) {
  const radius = pointOverlay.selected ? 0.062 : 0.038
  appendDisc(
    vertices,
    pointOverlay.position,
    radius,
    pointOverlay.selected ? SELECTED_POINT_COLOR : POINT_HANDLE_COLOR,
    1,
    0.048,
    offsetNormal,
  )
  if (!pointOverlay.selected) return

  appendDisc(
    vertices,
    pointOverlay.position,
    radius * 0.42,
    [0.08, 0.07, 0.06, 0.75],
    1,
    0.051,
    offsetNormal,
  )
}

export function appendOrbitTarget(
  vertices: number[],
  position: Vec3,
  offsetNormal: Vec3,
  cameraDistance: number,
) {
  const radius = Math.max(0.035, Math.min(0.14, cameraDistance * 0.012))
  appendDisc(
    vertices,
    position,
    radius,
    ORBIT_TARGET_COLOR,
    1,
    0.066,
    offsetNormal,
  )
  appendDisc(
    vertices,
    position,
    radius * 0.38,
    ORBIT_TARGET_CENTER_COLOR,
    1,
    0.069,
    offsetNormal,
  )
}

export function appendWorkplaneGizmo(
  vertices: number[],
  basis: WorkplaneBasis,
  offsetNormal: Vec3,
) {
  const length = workplaneGizmoLength()
  const shaftRadius = 0.018
  const centerRadius = 0.055

  appendDisc(
    vertices,
    basis.origin,
    centerRadius,
    GIZMO_CENTER_COLOR,
    1,
    0.074,
    offsetNormal,
  )
  appendGizmoAxis(
    vertices,
    basis.origin,
    basis.right,
    length,
    GIZMO_X_COLOR,
    offsetNormal,
  )
  appendGizmoAxis(
    vertices,
    basis.origin,
    basis.up,
    length,
    GIZMO_Y_COLOR,
    offsetNormal,
  )
  appendGizmoAxis(
    vertices,
    basis.origin,
    basis.normal,
    length,
    GIZMO_Z_COLOR,
    offsetNormal,
  )

  function appendGizmoAxis(
    target: number[],
    origin: Vec3,
    axis: Vec3,
    axisLength: number,
    color: Vec4,
    normal: Vec3,
  ) {
    const end = add3(origin, scale3(axis, axisLength))
    appendSegment(
      target,
      origin,
      end,
      shaftRadius,
      color,
      shaftRadius,
      1,
      0.072,
      normal,
    )
    appendDisc(target, end, centerRadius * 0.82, color, 1, 0.076, normal)
  }
}

export function workplaneGizmoLength() {
  return 0.72
}
