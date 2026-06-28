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
  type StrokeGpuPrimitives,
}

export function appendStrokeGpuPrimitives(
  primitives: StrokeGpuPrimitives,
  cpuVertices: number[],
  stroke: Stroke,
  style: StrokeRenderStyle,
) {
  if (stroke.points.length === 0) return
  const color = style.color ?? style.material?.strokeColor ?? stroke.color
  const useStroke = style.material?.useStroke ?? true
  if (!useStroke) return

  const strokeMode = materialStrokeMode(style)
  if (strokeMode !== 'line') {
    appendStrokeSamplePrimitives(primitives, stroke, color, style, strokeMode)
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
}
