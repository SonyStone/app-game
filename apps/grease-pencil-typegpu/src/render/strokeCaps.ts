import type { Stroke } from '../document'
import type { Vec4 } from './math'
import { appendDisc } from './meshDiscPrimitive'
import {
  pointColor,
  strokeRadius,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'

export function appendRoundStrokeCaps(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
) {
  const first = stroke.points[0]
  const last = stroke.points[stroke.points.length - 1]
  if (first) {
    appendDisc(
      vertices,
      first.position,
      strokeRadius(stroke, first, style),
      pointColor(color, first, style),
      style.opacity,
      style.zOffset,
      style.offsetNormal,
    )
  }
  if (last) {
    appendDisc(
      vertices,
      last.position,
      strokeRadius(stroke, last, style),
      pointColor(color, last, style),
      style.opacity,
      style.zOffset,
      style.offsetNormal,
    )
  }
}
