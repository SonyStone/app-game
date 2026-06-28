import type {
  Stroke,
  StrokeCapStyle,
  StrokeJoinStyle,
} from '../document'
import type { Vec4 } from './math'
import { appendDisc } from './meshDiscPrimitive'
import {
  pointColor,
  strokeRadius,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'
import { appendRoundStrokeCaps } from './strokeCaps'
import {
  appendBevelJoin,
  appendMiterJoin,
} from './strokeJoinShapes'

export function appendStrokeJoins(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
  joinStyle: StrokeJoinStyle,
) {
  const pointCount = stroke.points.length
  if (pointCount < 2) return

  if (!stroke.closed && capStyle === 'round') {
    appendRoundStrokeCaps(vertices, stroke, color, style)
  }

  const firstJoinIndex = stroke.closed ? 0 : 1
  const lastJoinIndex = stroke.closed ? pointCount - 1 : pointCount - 2
  for (let pointIndex = firstJoinIndex; pointIndex <= lastJoinIndex; pointIndex += 1) {
    const previous = stroke.points[(pointIndex - 1 + pointCount) % pointCount]
    const point = stroke.points[pointIndex]
    const next = stroke.points[(pointIndex + 1) % pointCount]
    if (!previous || !point || !next) continue

    const radius = strokeRadius(stroke, point, style)
    const joinColor = pointColor(color, point, style)

    switch (joinStyle) {
      case 'round':
        appendDisc(
          vertices,
          point.position,
          radius,
          joinColor,
          style.opacity,
          style.zOffset,
          style.offsetNormal,
        )
        break
      case 'bevel':
        appendBevelJoin(
          vertices,
          previous.position,
          point.position,
          next.position,
          radius,
          joinColor,
          style.opacity,
          style.zOffset,
          style.offsetNormal,
        )
        break
      case 'miter':
        appendMiterJoin(
          vertices,
          previous.position,
          point.position,
          next.position,
          radius,
          joinColor,
          style.opacity,
          style.zOffset,
          style.offsetNormal,
        )
        break
      default:
        assertUnhandledJoinStyle(joinStyle)
    }
  }
}

function assertUnhandledJoinStyle(joinStyle: never): never {
  throw new Error(`Unhandled stroke join style: ${joinStyle}`)
}
