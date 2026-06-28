import type { Stroke } from '../document'
import { appendFill } from './meshFill'
import {
  materialStrokeMode,
  strokeCapStyle,
  strokeJoinStyle,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'
import { appendStrokeSamples } from './strokePointGlyphs'
import { appendLineStroke } from './strokeSegments'

export function appendStroke(
  vertices: number[],
  stroke: Stroke,
  style: StrokeRenderStyle,
) {
  if (stroke.points.length === 0) return
  const color = style.color ?? style.material?.strokeColor ?? stroke.color
  const fillColor = style.color ?? style.material?.fillColor
  const useStroke = style.material?.useStroke ?? true
  const useFill = style.material?.useFill ?? false
  const capStyle = strokeCapStyle(style)
  const joinStyle = strokeJoinStyle(style)
  const strokeMode = materialStrokeMode(style)

  if (stroke.closed && useFill && fillColor) {
    appendFill(vertices, stroke, fillColor, style)
  }

  if (!useStroke) return

  if (strokeMode !== 'line') {
    appendStrokeSamples(vertices, stroke, color, style, strokeMode)
    return
  }

  appendLineStroke(vertices, stroke, color, style, capStyle, joinStyle)
}
