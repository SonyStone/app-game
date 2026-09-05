import { gizmoPlanes, frontGizmoRing } from './gizmoGeometry'
import { pushVertex } from './meshVertex'
import { discBasis } from './workplane'
import {
  add3,
  scale3,
  type Vec3,
  type Vec4,
} from './math'
import { appendDisc } from './meshDiscPrimitive'
import { appendGuideLine, appendGuideDisc, worldUnitsPerPixel, type ScreenSpaceGuides } from './screenSpaceGuides'
import type { StrokePointOverlay } from './meshTypes'
import type {
  WorkplaneGizmoAxisName,
  WorkplaneGizmoMode,
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
const GIZMO_ROTATION_X_COLOR: Vec4 = [0.92, 0.18, 0.16, 0.58]
const GIZMO_ROTATION_Y_COLOR: Vec4 = [0.12, 0.58, 0.24, 0.58]
const GIZMO_ROTATION_Z_COLOR: Vec4 = [0.16, 0.34, 0.95, 0.58]

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

/** Small orbit pivot marker that does not grow into the manipulator when zooming. */
export function appendOrbitTarget(vertices: number[], position: Vec3, view: ScreenSpaceGuides) {
  appendGuideDisc(vertices, position, 4, ORBIT_TARGET_COLOR, view)
  appendGuideDisc(vertices, position, 1.5, ORBIT_TARGET_CENTER_COLOR, view)
}

/** A 90px workplane manipulator; line widths and handles stay constant while zooming. */
export function appendWorkplaneGizmo(
  vertices: number[],
  basis: WorkplaneBasis,
  view: ScreenSpaceGuides,
  highlight?: WorkplaneGizmoHighlight,
  mode: WorkplaneGizmoMode = 'translate',
) {
  const units = worldUnitsPerPixel(view.matrices, view.height, basis.origin)
  if (units <= 0) return
  const length = workplaneGizmoLength(units)
  if (mode === 'translate') {
    axis(basis.right, GIZMO_X_COLOR, 'X')
    axis(basis.up, GIZMO_Y_COLOR, 'Y')
    axis(basis.normal, GIZMO_Z_COLOR, 'Z')
    for (const plane of gizmoPlanes(basis, units)) {
      const color = plane.colorAxis === 'X' ? GIZMO_X_COLOR : plane.colorAxis === 'Y' ? GIZMO_Y_COLOR : GIZMO_Z_COLOR
      const active = highlight?.kind === 'plane' && highlight.plane === plane.name
      const tint = active ? highlightColor(color) : color
      const fill: Vec4 = [tint[0], tint[1], tint[2], active ? 0.42 : 0.16]
      const [a, b, c, d] = plane.corners
      for (const point of [a, b, c, a, c, d]) pushVertex(vertices, point, fill)
      for (let i = 0; i < 4; i++) appendGuideLine(vertices, plane.corners[i], plane.corners[(i + 1) % 4], active ? 2 : 1.25, tint, view)
    }
  } else {
    ring(basis.up, basis.normal, GIZMO_ROTATION_X_COLOR, 'X')
    ring(basis.normal, basis.right, GIZMO_ROTATION_Y_COLOR, 'Y')
    ring(basis.right, basis.up, GIZMO_ROTATION_Z_COLOR, 'Z')
  }

  function axis(direction: Vec3, color: Vec4, name: WorkplaneGizmoAxisName) {
    const active = highlight?.kind === 'axis' && highlight.axisName === name
    const tint = active ? highlightColor(color) : color
    const end = add3(basis.origin, scale3(direction, length))
    const base = add3(basis.origin, scale3(direction, length - 14 * units))
    appendGuideLine(vertices, add3(basis.origin, scale3(direction, 20 * units)), base, active ? 2 : 1.25, tint, view)
    const { right, up } = discBasis(direction)
    const radius = (active ? 5.5 : 4.5) * units
    const point = (angle: number) => add3(base, add3(scale3(right, Math.cos(angle) * radius), scale3(up, Math.sin(angle) * radius)))
    for (let i = 0; i < 12; i++) {
      const a = point(i / 12 * Math.PI * 2), b = point((i + 1) / 12 * Math.PI * 2)
      for (const p of [end, a, b, base, b, a]) pushVertex(vertices, p, tint)
    }
  }

  function ring(axisA: Vec3, axisB: Vec3, color: Vec4, name: WorkplaneGizmoAxisName) {
    const active = highlight?.kind === 'rotation' && highlight.axisName === name
    const radius = workplaneRotationGizmoRadius(units)
    for (const segment of frontGizmoRing(basis.origin, axisA, axisB, radius, view.matrices.position)) {
      appendGuideLine(vertices, segment.start, segment.end, active ? 2 : 1, active ? highlightColor(color) : color, view)
    }
  }
}

/** Shared by rendering and picking; input is measured at the gizmo origin in CSS pixels. */
export function workplaneGizmoLength(unitsPerPixel: number) {
  return 90 * unitsPerPixel
}

/** Rotation rings occupy 78% of the translation axes' length. */
export function workplaneRotationGizmoRadius(unitsPerPixel: number) {
  return workplaneGizmoLength(unitsPerPixel) * 0.78
}

function highlightColor(color: Vec4): Vec4 {
  return [
    Math.min(1, color[0] * 1.18 + 0.08),
    Math.min(1, color[1] * 1.18 + 0.08),
    Math.min(1, color[2] * 1.18 + 0.08),
    1,
  ]
}
