import type { Stroke } from '../document'
import type { Vec4 } from './math'
import {
  createFillGradient,
  fillColorAtPoint,
} from './meshFillGradient'
import { pushVertex } from './meshVertex'
import { averagePointOpacity } from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'

export function appendFill(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
) {
  if (stroke.points.length < 3) return

  const first = stroke.points[0]
  if (!first) return

  const fillOpacity = averagePointOpacity(stroke, style)
  const fillGradient = createFillGradient(stroke, style)
  const zOffset = style.zOffset - 0.003
  for (let pointIndex = 1; pointIndex < stroke.points.length - 1; pointIndex += 1) {
    const current = stroke.points[pointIndex]
    const next = stroke.points[pointIndex + 1]
    if (!current || !next) continue
    const firstColor = fillColorAtPoint(color, first.position, fillOpacity, fillGradient)
    const currentColor = fillColorAtPoint(
      color,
      current.position,
      fillOpacity,
      fillGradient,
    )
    const nextColor = fillColorAtPoint(color, next.position, fillOpacity, fillGradient)

    pushVertex(
      vertices,
      first.position,
      firstColor,
      style.opacity,
      zOffset,
      style.offsetNormal,
    )
    pushVertex(
      vertices,
      current.position,
      currentColor,
      style.opacity,
      zOffset,
      style.offsetNormal,
    )
    pushVertex(
      vertices,
      next.position,
      nextColor,
      style.opacity,
      zOffset,
      style.offsetNormal,
    )
  }
}
