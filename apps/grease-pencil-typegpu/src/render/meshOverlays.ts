import type { Vec3, Vec4 } from './math'
import { appendDisc } from './meshDiscPrimitive'
import type { StrokePointOverlay } from './meshTypes'

const POINT_HANDLE_COLOR: Vec4 = [1, 1, 1, 0.82]
const SELECTED_POINT_COLOR: Vec4 = [1, 0.48, 0.02, 0.95]

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
