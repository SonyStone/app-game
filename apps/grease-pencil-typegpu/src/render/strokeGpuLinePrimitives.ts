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
import {
  appendPointPrimitive,
  appendSegmentPrimitive,
  STROKE_SELF_OVERLAP_DEPTH_STEP,
  type StrokeGpuPrimitives,
} from './strokeGpuPrimitiveTypes'

export function appendLineStrokePrimitives(
  primitives: StrokeGpuPrimitives,
  _cpuVertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
  joinStyle: StrokeJoinStyle,
) {
  if (stroke.points.length === 1) {
    appendSinglePointStrokePrimitive(primitives, stroke, color, style, capStyle)
    return
  }

  appendOpenSegmentPrimitives(
    primitives,
    stroke,
    color,
    style,
    capStyle,
    joinStyle,
  )
  appendClosingSegmentPrimitive(
    primitives,
    stroke,
    color,
    style,
    joinStyle,
  )
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
    strokePrimitiveDepth(style, 0),
  )
}

function appendOpenSegmentPrimitives(
  primitives: StrokeGpuPrimitives,
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
  joinStyle: StrokeJoinStyle,
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
    const startCapStyle = !stroke.closed && index === 0 ? capStyle : 'join'
    const endCapStyle =
      !stroke.closed && index === openSegmentCount - 1 ? capStyle : 'join'

    appendSegmentPrimitive(
      primitives.segments,
      previous?.position ?? current.position,
      current.position,
      next.position,
      afterNext?.position ?? next.position,
      strokePrimitiveDepth(style, index),
      startRadius,
      endRadius,
      pointColor(color, current, style),
      pointColor(color, next, style),
      style.opacity,
      style.zOffset,
      startCapStyle,
      endCapStyle,
      joinStyle,
    )
  }
}

function appendClosingSegmentPrimitive(
  primitives: StrokeGpuPrimitives,
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  joinStyle: StrokeJoinStyle,
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
    strokePrimitiveDepth(style, stroke.points.length - 1),
    strokeRadius(stroke, last, style),
    strokeRadius(stroke, first, style),
    pointColor(color, last, style),
    pointColor(color, first, style),
    style.opacity,
    style.zOffset,
    'join',
    'join',
    joinStyle,
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
    strokePrimitiveDepth(style, 0),
  )
  appendPointPrimitive(
    target,
    last.position,
    strokeRadius(stroke, last, style),
    pointColor(color, last, style),
    style.opacity,
    style.zOffset,
    strokePrimitiveDepth(style, Math.max(0, stroke.points.length - 2)),
  )
}

function strokePrimitiveDepth(style: StrokeRenderStyle, pointIndex: number) {
  return style.strokeDepth + pointIndex * STROKE_SELF_OVERLAP_DEPTH_STEP
}
