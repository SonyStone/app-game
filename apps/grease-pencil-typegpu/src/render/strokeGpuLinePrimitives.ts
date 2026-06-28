import type {
  Stroke,
  StrokeCapStyle,
  StrokeJoinStyle,
} from '../document'
import {
  type Vec4,
} from './math'
import {
  pointColor,
  strokeRadius,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'
import {
  appendPointPrimitive,
  appendSegmentPrimitive,
  type StrokeGpuPrimitives,
} from './strokeGpuPrimitiveTypes'

export function appendLineStrokePrimitives(
  primitives: StrokeGpuPrimitives,
  _cpuVertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
  _joinStyle: StrokeJoinStyle,
) {
  if (stroke.points.length === 1) {
    appendSinglePointStrokePrimitive(primitives, stroke, color, style, capStyle)
    return
  }

  appendOpenSegmentPrimitives(primitives, stroke, color, style, capStyle)
  appendClosingSegmentPrimitive(primitives, stroke, color, style)
  appendEndpointCapPrimitives(primitives, stroke, color, style, capStyle)
}

function appendSinglePointStrokePrimitive(
  primitives: StrokeGpuPrimitives,
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
) {
  const point = stroke.points[0]
  if (!point || capStyle === 'flat') return

  appendPointPrimitive(
    capStyle === 'square' ? primitives.squares : primitives.discs,
    point.position,
    strokeRadius(stroke, point, style),
    pointColor(color, point, style),
    style.opacity,
    style.zOffset,
  )
}

function appendOpenSegmentPrimitives(
  primitives: StrokeGpuPrimitives,
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
) {
  const openSegmentCount = stroke.points.length - 1
  for (let index = 0; index < openSegmentCount; index += 1) {
    const current = stroke.points[index]
    const next = stroke.points[index + 1]
    if (!current || !next) continue

    const startRadius = strokeRadius(stroke, current, style)
    const endRadius = strokeRadius(stroke, next, style)
    const previous = stroke.points[index - 1]
    const afterNext = stroke.points[index + 2]
    const extendStart = !stroke.closed && capStyle === 'square' && index === 0
    const extendEnd =
      !stroke.closed && capStyle === 'square' && index === openSegmentCount - 1

    appendSegmentPrimitive(
      primitives.segments,
      previous?.position ?? current.position,
      current.position,
      next.position,
      afterNext?.position ?? next.position,
      startRadius,
      endRadius,
      pointColor(color, current, style),
      pointColor(color, next, style),
      style.opacity,
      style.zOffset,
      extendStart,
      extendEnd,
    )
  }
}

function appendClosingSegmentPrimitive(
  primitives: StrokeGpuPrimitives,
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
) {
  if (!stroke.closed) return

  const first = stroke.points[0]
  const last = stroke.points[stroke.points.length - 1]
  const beforeLast = stroke.points[stroke.points.length - 2]
  const second = stroke.points[1]
  if (!first || !last || !beforeLast || !second) return

  appendSegmentPrimitive(
    primitives.segments,
    beforeLast.position,
    last.position,
    first.position,
    second.position,
    strokeRadius(stroke, last, style),
    strokeRadius(stroke, first, style),
    pointColor(color, last, style),
    pointColor(color, first, style),
    style.opacity,
    style.zOffset,
    false,
    false,
  )
}

function appendEndpointCapPrimitives(
  primitives: StrokeGpuPrimitives,
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
) {
  if (stroke.closed || capStyle === 'flat') return

  const first = stroke.points[0]
  const last = stroke.points[stroke.points.length - 1]
  if (!first || !last) return

  const target = capStyle === 'square' ? primitives.squares : primitives.discs
  appendPointPrimitive(
    target,
    first.position,
    strokeRadius(stroke, first, style),
    pointColor(color, first, style),
    style.opacity,
    style.zOffset,
  )
  appendPointPrimitive(
    target,
    last.position,
    strokeRadius(stroke, last, style),
    pointColor(color, last, style),
    style.opacity,
    style.zOffset,
  )
}
