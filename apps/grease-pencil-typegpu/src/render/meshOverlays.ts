import {
  add3,
  scale3,
  type Vec3,
  type Vec4,
} from './math'
import { appendDisc } from './meshDiscPrimitive'
import { appendSegment } from './meshSegmentPrimitive'
import type { StrokePointOverlay } from './meshTypes'
import type {
  WorkplaneGizmoAxisName,
  WorkplaneGizmoHighlight,
} from './workplaneGizmoTypes'
import type { WorkplaneBasis } from './workplane'

const POINT_HANDLE_COLOR: Vec4 = [1, 1, 1, 0.82]
const SELECTED_POINT_COLOR: Vec4 = [1, 0.48, 0.02, 0.95]
const ORBIT_TARGET_COLOR: Vec4 = [0.05, 0.28, 0.92, 0.9]
const ORBIT_TARGET_CENTER_COLOR: Vec4 = [1, 1, 1, 0.95]
const GIZMO_X_COLOR: Vec4 = [0.92, 0.18, 0.16, 0.92]
const GIZMO_Y_COLOR: Vec4 = [0.12, 0.58, 0.24, 0.92]
const GIZMO_Z_COLOR: Vec4 = [0.16, 0.34, 0.95, 0.92]
const GIZMO_CENTER_COLOR: Vec4 = [0.08, 0.07, 0.06, 0.82]
const GIZMO_ROTATION_X_COLOR: Vec4 = [0.92, 0.18, 0.16, 0.58]
const GIZMO_ROTATION_Y_COLOR: Vec4 = [0.12, 0.58, 0.24, 0.58]
const GIZMO_ROTATION_Z_COLOR: Vec4 = [0.16, 0.34, 0.95, 0.58]
const ROTATION_RING_SEGMENTS = 48

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
  highlight?: WorkplaneGizmoHighlight,
) {
  const length = workplaneGizmoLength()
  const shaftRadius = 0.018
  const centerRadius = highlight?.kind === 'plane' ? 0.072 : 0.055

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
    highlight,
    'X',
  )
  appendGizmoAxis(
    vertices,
    basis.origin,
    basis.up,
    length,
    GIZMO_Y_COLOR,
    offsetNormal,
    highlight,
    'Y',
  )
  appendGizmoAxis(
    vertices,
    basis.origin,
    basis.normal,
    length,
    GIZMO_Z_COLOR,
    offsetNormal,
    highlight,
    'Z',
  )
  appendRotationRing(
    vertices,
    basis.origin,
    basis.up,
    basis.normal,
    GIZMO_ROTATION_X_COLOR,
    offsetNormal,
    highlight,
    'X',
  )
  appendRotationRing(
    vertices,
    basis.origin,
    basis.normal,
    basis.right,
    GIZMO_ROTATION_Y_COLOR,
    offsetNormal,
    highlight,
    'Y',
  )
  appendRotationRing(
    vertices,
    basis.origin,
    basis.right,
    basis.up,
    GIZMO_ROTATION_Z_COLOR,
    offsetNormal,
    highlight,
    'Z',
  )

  function appendGizmoAxis(
    target: number[],
    origin: Vec3,
    axis: Vec3,
    axisLength: number,
    color: Vec4,
    normal: Vec3,
    activeHighlight: WorkplaneGizmoHighlight | undefined,
    axisName: WorkplaneGizmoAxisName,
  ) {
    const highlighted =
      activeHighlight?.kind === 'axis' && activeHighlight.axisName === axisName
    const activeRadius = highlighted ? shaftRadius * 1.7 : shaftRadius
    const activeColor = highlighted ? highlightColor(color) : color
    const end = add3(origin, scale3(axis, axisLength))
    appendSegment(
      target,
      origin,
      end,
      activeRadius,
      activeColor,
      activeRadius,
      1,
      0.072,
      normal,
    )
    appendDisc(
      target,
      end,
      centerRadius * (highlighted ? 1.12 : 0.82),
      activeColor,
      1,
      0.076,
      normal,
    )
  }
}

export function workplaneGizmoLength() {
  return 0.72
}

export function workplaneRotationGizmoRadius() {
  return workplaneGizmoLength() * 0.78
}

function appendRotationRing(
  vertices: number[],
  origin: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  color: Vec4,
  offsetNormal: Vec3,
  highlight: WorkplaneGizmoHighlight | undefined,
  axisName: WorkplaneGizmoAxisName,
) {
  const radius = workplaneRotationGizmoRadius()
  const highlighted =
    highlight?.kind === 'rotation' && highlight.axisName === axisName
  const ringRadius = highlighted ? 0.014 : 0.008
  const ringColor = highlighted ? highlightColor(color) : color
  for (let index = 0; index < ROTATION_RING_SEGMENTS; index += 1) {
    const startAngle = (index / ROTATION_RING_SEGMENTS) * Math.PI * 2
    const endAngle = ((index + 1) / ROTATION_RING_SEGMENTS) * Math.PI * 2
    appendSegment(
      vertices,
      ringPoint(origin, axisA, axisB, radius, startAngle),
      ringPoint(origin, axisA, axisB, radius, endAngle),
      ringRadius,
      ringColor,
      ringRadius,
      1,
      0.078,
      offsetNormal,
    )
  }
}

function ringPoint(
  origin: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  radius: number,
  angle: number,
) {
  return add3(
    origin,
    add3(
      scale3(axisA, Math.cos(angle) * radius),
      scale3(axisB, Math.sin(angle) * radius),
    ),
  )
}

function highlightColor(color: Vec4): Vec4 {
  return [
    Math.min(1, color[0] * 1.18 + 0.08),
    Math.min(1, color[1] * 1.18 + 0.08),
    Math.min(1, color[2] * 1.18 + 0.08),
    1,
  ]
}
