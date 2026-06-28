import type {
  Stroke,
  StrokeCapStyle,
  StrokeJoinStyle,
} from '../document'
import type { Vec4 } from './math'
import {
  pointColor,
  strokeRadius,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'
import { appendStrokeJoins } from './strokeJoins'
import { appendSinglePointStroke } from './strokePointGlyphs'
import { appendStrokeSegment } from './strokeSegmentPrimitive'

export function appendLineStroke(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
  joinStyle: StrokeJoinStyle,
) {
  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    if (!point) return

    appendSinglePointStroke(
      vertices,
      point.position,
      strokeRadius(stroke, point, style),
      pointColor(color, point, style),
      style.opacity,
      style.zOffset,
      style.offsetNormal,
      capStyle,
    )
    return
  }

  appendOpenStrokeSegments(vertices, stroke, color, style, capStyle)
  appendClosingStrokeSegment(vertices, stroke, color, style)
  appendStrokeJoins(vertices, stroke, color, style, capStyle, joinStyle)
}

function appendOpenStrokeSegments(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
) {
  const openSegmentCount = stroke.points.length - 1
  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    const current = stroke.points[i]
    const next = stroke.points[i + 1]
    if (!current || !next) continue

    appendStrokeSegment(
      vertices,
      current.position,
      next.position,
      strokeRadius(stroke, current, style),
      strokeRadius(stroke, next, style),
      pointColor(color, current, style),
      pointColor(color, next, style),
      style.opacity,
      style.zOffset,
      style.offsetNormal,
      !stroke.closed && capStyle === 'square' && i === 0,
      !stroke.closed && capStyle === 'square' && i === openSegmentCount - 1,
    )
  }
}

function appendClosingStrokeSegment(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
) {
  if (!stroke.closed) return

  const first = stroke.points[0]
  const last = stroke.points[stroke.points.length - 1]
  if (!first || !last) return

  appendStrokeSegment(
    vertices,
    last.position,
    first.position,
    strokeRadius(stroke, last, style),
    strokeRadius(stroke, first, style),
    pointColor(color, last, style),
    pointColor(color, first, style),
    style.opacity,
    style.zOffset,
    style.offsetNormal,
    false,
    false,
  )
}
