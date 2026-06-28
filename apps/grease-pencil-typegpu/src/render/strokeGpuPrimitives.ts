import type { Stroke } from '../document'
import {
  materialStrokeMode,
  strokeCapStyle,
  strokeJoinStyle,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'
import { appendLineStrokePrimitives } from './strokeGpuLinePrimitives'
import {
  createStrokeGpuPrimitives,
  STROKE_DISC_VERTEX_COUNT,
  STROKE_POINT_FLOATS,
  STROKE_SEGMENT_FLOATS,
  STROKE_SEGMENT_VERTEX_COUNT,
  STROKE_SQUARE_VERTEX_COUNT,
  type StrokeGpuPrimitiveRange,
  type StrokeGpuPrimitives,
} from './strokeGpuPrimitiveTypes'
import { appendStrokeSamplePrimitives } from './strokeGpuSamplePrimitives'

export {
  createStrokeGpuPrimitives,
  STROKE_DISC_VERTEX_COUNT,
  STROKE_POINT_FLOATS,
  STROKE_SEGMENT_FLOATS,
  STROKE_SEGMENT_VERTEX_COUNT,
  STROKE_SQUARE_VERTEX_COUNT,
  type StrokeGpuPrimitiveRange,
  type StrokeGpuPrimitives,
}

export function appendStrokeGpuPrimitives(
  primitives: StrokeGpuPrimitives,
  cpuVertices: number[],
  stroke: Stroke,
  style: StrokeRenderStyle,
) {
  if (stroke.points.length === 0) return
  const rangeStart = primitiveRangeEnd(primitives)
  const color = style.color ?? style.material?.strokeColor ?? stroke.color
  const useStroke = style.material?.useStroke ?? true
  if (!useStroke) return

  const strokeMode = materialStrokeMode(style)
  if (strokeMode !== 'line') {
    appendStrokeSamplePrimitives(primitives, stroke, color, style, strokeMode)
    appendPrimitiveRange(primitives, rangeStart)
    return
  }

  appendLineStrokePrimitives(
    primitives,
    cpuVertices,
    stroke,
    color,
    style,
    strokeCapStyle(style),
    strokeJoinStyle(style),
  )
  appendPrimitiveRange(primitives, rangeStart)
}

function primitiveRangeEnd(
  primitives: StrokeGpuPrimitives,
): StrokeGpuPrimitiveRange {
  return {
    segmentStart: primitives.segments.length / STROKE_SEGMENT_FLOATS,
    segmentCount: 0,
    discStart: primitives.discs.length / STROKE_POINT_FLOATS,
    discCount: 0,
    squareStart: primitives.squares.length / STROKE_POINT_FLOATS,
    squareCount: 0,
  }
}

function appendPrimitiveRange(
  primitives: StrokeGpuPrimitives,
  start: StrokeGpuPrimitiveRange,
) {
  const range = {
    segmentStart: start.segmentStart,
    segmentCount:
      primitives.segments.length / STROKE_SEGMENT_FLOATS - start.segmentStart,
    discStart: start.discStart,
    discCount: primitives.discs.length / STROKE_POINT_FLOATS - start.discStart,
    squareStart: start.squareStart,
    squareCount:
      primitives.squares.length / STROKE_POINT_FLOATS - start.squareStart,
  }
  if (range.segmentCount + range.discCount + range.squareCount > 0) {
    primitives.ranges.push(range)
  }
}
